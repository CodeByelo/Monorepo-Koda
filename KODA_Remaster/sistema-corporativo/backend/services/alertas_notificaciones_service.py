"""
services/alertas_notificaciones_service.py
───────────────────────────────────────────
Job programado (ver core/scheduler.py) que evalúa las reglas de la tabla
`notificaciones_reglas` — sembrada por koda-frontend/backend pero consultada
aquí vía SQL directo, ya que ambos backends comparten la misma base de datos
Postgres/Supabase (mismo patrón que database/async_db.py usa en el resto de
este backend) — y, cuando corresponde, notifica por Telegram a los usuarios
administradores de cada tenant vinculado.

Alcance actual: de las reglas sembradas ("Stock Crítico de Inventario",
"Facturas Vencidas por Cobrar", "Cierre de Turno de Despacho", "Diferencias en
Flujo de Caja"), solo la de inventario tiene un endpoint del bot que la
respalde hoy (GET /bot/alertas → stock crítico / baja rotación / en pérdida).
Este job filtra por esa regla; las demás quedan fuera hasta que koda-frontend
exponga endpoints equivalentes.
"""
import logging
import uuid as uuid_mod

from database.async_db import db_session
from services.bot_api_client import get_alertas, BotApiError

logger = logging.getLogger("sistema_corporativo")

# Roles considerados "administradores/dueños" del tenant — mismo set ya usado
# en routers/telegram_router.py para restringir la gestión de bot_commands.
# Decisión de diseño (ver reporte): las alertas de inventario son información
# gerencial/operativa, no algo que deba llegarle pasivamente a cada usuario o
# vendedor vinculado por Telegram, por lo que solo se notifica a estos roles.
ADMIN_ROLES = ("Administrador", "Administrator", "CEO", "Desarrollador", "Administrative Master")

# Palabras clave para identificar reglas relacionadas con alertas de
# inventario dentro de notificaciones_reglas.nombre (los datos seed reales
# usan "Stock Crítico de Inventario").
_RELEVANT_NAME_PATTERNS = ("%stock%", "%crítico%", "%critico%", "%inventario%")


async def _hay_regla_inventario_activa(conn) -> bool:
    """
    Verifica si existe al menos una regla activa de canal TELEGRAM relacionada
    con alertas de inventario.

    Las filas sembradas en notificaciones_reglas tienen tenant_id NULL (no se
    asigna por tenant en el seed de koda-frontend/backend), por lo que esta
    verificación actúa como un interruptor GLOBAL: si la regla está activa, se
    evalúa para TODOS los tenants con sesiones de Telegram vinculadas. Si en el
    futuro se empieza a poblar tenant_id por fila, esta función deberá
    filtrar también por tenant.
    """
    try:
        row = await conn.fetchrow(
            """
            SELECT id FROM public.notificaciones_reglas
            WHERE activa = true
              AND UPPER(canal) = 'TELEGRAM'
              AND LOWER(nombre) LIKE ANY($1::text[])
            LIMIT 1
            """,
            list(_RELEVANT_NAME_PATTERNS),
        )
        return row is not None
    except Exception as e:
        logger.warning(f"[ALERTAS] No se pudo leer notificaciones_reglas: {e}")
        return False


async def _tenants_con_telegram_vinculado(conn) -> list:
    rows = await conn.fetch(
        "SELECT DISTINCT tenant_id FROM public.telegram_sessions WHERE tenant_id IS NOT NULL"
    )
    return [str(r["tenant_id"]) for r in rows]


async def _destinatarios_admin(conn, tenant_id: str) -> list:
    """Chat IDs de Telegram de los usuarios con rol administrativo del tenant."""
    rows = await conn.fetch(
        """
        SELECT DISTINCT ts.telegram_chat_id
        FROM public.telegram_sessions ts
        JOIN public.profiles p ON p.id = ts.user_id
        LEFT JOIN public.roles r ON p.rol_id = r.id
        WHERE ts.tenant_id = $1::uuid
          AND r.nombre_rol = ANY($2::text[])
        """,
        uuid_mod.UUID(tenant_id),
        list(ADMIN_ROLES),
    )
    return [r["telegram_chat_id"] for r in rows]


def _formatear_mensaje(alerta: dict, plantilla: str = None) -> str:
    """
    Formatea un item de alerta usando la `plantilla` de la regla si contiene
    placeholders que la alerta pueda rellenar; de lo contrario cae a un
    formato genérico legible. La plantilla seed real es
    "Alerta: El producto {producto} ha bajado del stock mínimo." — solo cubre
    el caso de stock crítico, por lo que items de otras categorías (baja
    rotación, en pérdida) usan siempre el formato genérico.
    """
    categoria = str(alerta.get("categoria") or alerta.get("tipo") or "").strip().lower()
    producto = alerta.get("producto") or alerta.get("sku") or alerta.get("nombre") or "N/D"

    if plantilla and categoria in ("stock_critico", "stock_crítico", "critico", "crítico"):
        try:
            return "🔔 " + plantilla.format(producto=producto, **alerta)
        except Exception:
            pass  # Si la plantilla no calza con los campos disponibles, usar formato genérico.

    detalle = alerta.get("detalle") or alerta.get("mensaje") or ""
    return f"🔔 [{categoria or 'alerta'}] {producto}" + (f" — {detalle}" if detalle else "")


async def revisar_alertas_notificaciones() -> dict:
    """
    Job programado: evalúa reglas activas y, para cada tenant con sesiones de
    Telegram vinculadas, consulta GET /bot/alertas y notifica a los admins.
    """
    from routers.telegram_router import send_telegram_message  # import diferido: evita ciclo de imports

    resumen = {"tenants_evaluados": 0, "alertas_enviadas": 0, "errores": []}

    try:
        async with db_session() as conn:
            if not await _hay_regla_inventario_activa(conn):
                logger.info("[ALERTAS] No hay reglas activas de canal TELEGRAM para inventario. Job omitido.")
                return resumen

            tenants = await _tenants_con_telegram_vinculado(conn)
            plantilla_row = await conn.fetchrow(
                """
                SELECT plantilla FROM public.notificaciones_reglas
                WHERE activa = true AND UPPER(canal) = 'TELEGRAM'
                  AND LOWER(nombre) LIKE '%stock%'
                LIMIT 1
                """
            )
            plantilla = plantilla_row["plantilla"] if plantilla_row else None

            for tenant_id in tenants:
                resumen["tenants_evaluados"] += 1
                try:
                    alertas = await get_alertas(tenant_id)
                except BotApiError as e:
                    logger.warning(f"[ALERTAS] Error consultando /bot/alertas para tenant {tenant_id}: {e}")
                    resumen["errores"].append(f"{tenant_id}: {e}")
                    continue

                if not alertas:
                    continue

                destinatarios = await _destinatarios_admin(conn, tenant_id)
                if not destinatarios:
                    logger.info(f"[ALERTAS] Tenant {tenant_id} tiene alertas pero ningún admin vinculado a Telegram.")
                    continue

                mensaje = "\n".join(_formatear_mensaje(a, plantilla) for a in alertas)
                mensaje = f"📊 Alertas de inventario ({len(alertas)}):\n\n{mensaje}"

                for chat_id in destinatarios:
                    await send_telegram_message(chat_id, mensaje)
                    resumen["alertas_enviadas"] += 1

    except Exception as e:
        logger.error(f"[ALERTAS] Error inesperado en revisar_alertas_notificaciones: {e}")
        resumen["errores"].append(str(e))

    logger.info(f"[ALERTAS] Job de alertas completado: {resumen}")
    return resumen
