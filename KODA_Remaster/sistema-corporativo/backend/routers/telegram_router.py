import os
import uuid
import logging
import secrets
import string
import json
import hmac
from datetime import datetime, timezone
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user, oauth2_scheme
from redis.asyncio import Redis
from services.bot_api_client import (
    get_stock as bot_get_stock,
    buscar_productos as bot_buscar_productos,
    registrar_venta,
    BotApiError,
)

# Almacenamiento temporal en memoria como fallback cuando Redis no esté disponible
_TELEGRAM_LINK_TOKENS: dict = {}

def generate_linking_code() -> str:
    chars = string.ascii_uppercase + string.digits
    code = ''.join(secrets.choice(chars) for _ in range(6))
    return f"KODA-{code}"

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/webhook", tags=["telegram"])

# Token del bot de Telegram obtenido desde las variables de entorno
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# Secreto para validar que las peticiones a /webhook/telegram realmente
# provienen de Telegram (parámetro `secret_token` de setWebhook, devuelto en
# cada request como header X-Telegram-Bot-Api-Secret-Token). Sin esto,
# cualquiera en internet puede forjar un update falso — con un chat_id de una
# víctima ya vinculada — y disparar /venta (factura real) o suplantar a un
# chofer de logística. Sin fallback hardcodeado. Si el bot está habilitado
# (TELEGRAM_BOT_TOKEN configurado), falla al importar cuando el secreto falta
# o es débil, igual que JWT_SECRET en auth/security.py.
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
if TELEGRAM_BOT_TOKEN and (not TELEGRAM_WEBHOOK_SECRET or len(TELEGRAM_WEBHOOK_SECRET) < 32):
    raise RuntimeError(
        "TELEGRAM_WEBHOOK_SECRET no configurado o inseguro: con TELEGRAM_BOT_TOKEN "
        "habilitado, debe definirse como variable de entorno con un valor de al "
        "menos 32 caracteres. No existe valor por defecto."
    )

# Clave compartida de servicio-a-servicio para autenticar el REENVÍO de
# updates de chofer hacia koda-frontend/backend
# (routers/logistica.py::telegram_webhook, vía LOGISTICS_WEBHOOK_URL más
# abajo). Ese backend NO registra su propio webhook con Telegram: confía
# exclusivamente en lo que ESTE backend le reenvía después de haber validado
# TELEGRAM_WEBHOOK_SECRET arriba. Sin esta clave, cualquiera podría saltarse
# esta validación llamando directamente al endpoint de logística y
# suplantar a un chofer/admin. Debe ser el MISMO valor que
# LOGISTICS_INTERNAL_FORWARD_KEY en koda-frontend/backend/core/security.py.
LOGISTICS_INTERNAL_FORWARD_KEY = os.getenv("LOGISTICS_INTERNAL_FORWARD_KEY", "")
if TELEGRAM_BOT_TOKEN and (not LOGISTICS_INTERNAL_FORWARD_KEY or len(LOGISTICS_INTERNAL_FORWARD_KEY) < 32):
    raise RuntimeError(
        "LOGISTICS_INTERNAL_FORWARD_KEY no configurado o inseguro: con TELEGRAM_BOT_TOKEN "
        "habilitado, debe definirse como variable de entorno con un valor de al menos 32 "
        "caracteres. No existe valor por defecto. Debe coincidir con el mismo valor "
        "configurado en koda-frontend/backend."
    )

# Clave compartida de servicio-a-servicio para autenticar la llamada ENTRANTE
# desde koda-frontend/backend (el ERP) hacia POST /webhook/telegram/generate-token
# de ESTE backend, cuando un usuario pide vincular su Telegram desde la
# pantalla "Vincular cuenta de Telegram" del ERP en vez de desde este mismo
# backend. Dirección INVERSA a BOT_INTERNAL_API_KEY (aquí este backend es el
# RECEPTOR, no el emisor) — mismo patrón ya usado para ORG_SYNC_API_KEY
# (routers/internal_router.py) — pero deliberadamente un secreto PROPIO,
# distinto de BOT_INTERNAL_API_KEY/ORG_SYNC_API_KEY/SSO_BRIDGE_INTERNAL_KEY/
# LOGISTICS_INTERNAL_FORWARD_KEY: en este backend, "una capacidad de servicio
# = una clave propia" es la convención ya establecida (ver comentarios de
# esas otras claves), y emitir un código real de vinculación no es lo mismo
# que sincronizar el nombre de una organización ni reenviar un webhook. Debe
# ser el MISMO valor que TELEGRAM_LINK_INTERNAL_API_KEY en
# koda-frontend/backend.
TELEGRAM_LINK_INTERNAL_API_KEY = os.getenv("TELEGRAM_LINK_INTERNAL_API_KEY", "").strip()
if TELEGRAM_BOT_TOKEN and (not TELEGRAM_LINK_INTERNAL_API_KEY or len(TELEGRAM_LINK_INTERNAL_API_KEY) < 32):
    raise RuntimeError(
        "TELEGRAM_LINK_INTERNAL_API_KEY no configurado o inseguro: con TELEGRAM_BOT_TOKEN "
        "habilitado, debe definirse como variable de entorno con un valor de al menos 32 "
        "caracteres. No existe valor por defecto. Debe coincidir con el mismo valor "
        "configurado en koda-frontend/backend."
    )


async def ensure_telegram_webhook() -> None:
    """
    Re-registra el webhook de Telegram apuntando a esta instancia desplegada.

    Telegram solo entrega updates a UNA URL de webhook por bot token: la
    última que haya llamado a setWebhook "gana". Si un desarrollador prueba
    el bot localmente (p. ej. vía ngrok) y llama setWebhook manualmente hacia
    su túnel local, la instancia de Render deja de recibir mensajes hasta que
    alguien vuelva a apuntar el webhook al dominio público — y ese fue
    exactamente el síntoma reportado ("el bot solo responde si mi máquina
    local está corriendo").

    Esta función se ejecuta en el evento startup del backend desplegado y
    reclama el webhook cada vez que el proceso arranca, así la instancia de
    Render siempre recupera el control sin intervención manual. Solo se activa
    si RENDER_SELF_URL está configurada (igual que el keep-alive de
    core/scheduler.py) para que el desarrollo local NUNCA le robe el webhook
    a producción sin querer.
    """
    self_url = os.getenv("RENDER_SELF_URL", "").strip().rstrip("/")
    if not self_url:
        logger.info(
            "[TELEGRAM] RENDER_SELF_URL no configurada — se omite el registro "
            "automático de webhook (entorno de desarrollo local)."
        )
        return

    if not TELEGRAM_BOT_TOKEN:
        logger.warning(
            "[TELEGRAM] TELEGRAM_BOT_TOKEN no configurado — no se puede registrar el webhook."
        )
        return

    webhook_url = f"{self_url}/webhook/telegram"
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                api_url,
                json={"url": webhook_url, "secret_token": TELEGRAM_WEBHOOK_SECRET},
            )
            data = response.json()
            if data.get("ok"):
                logger.info(f"[TELEGRAM] Webhook registrado correctamente hacia {webhook_url}")
            else:
                logger.error(f"[TELEGRAM] Telegram rechazó el registro del webhook: {data}")
    except Exception as e:
        logger.error(f"[TELEGRAM] Error al registrar el webhook en el arranque: {e}")

# =============================================================================
# MODELOS PYDANTIC PARA PAYLOAD DEL WEBHOOK DE TELEGRAM
# =============================================================================
class TelegramChat(BaseModel):
    id: int

class TelegramMessage(BaseModel):
    message_id: int
    chat: TelegramChat
    text: Optional[str] = None

class TelegramCallbackQuery(BaseModel):
    id: str
    data: Optional[str] = None
    message: Optional[TelegramMessage] = None

class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[TelegramMessage] = None
    callback_query: Optional[TelegramCallbackQuery] = None

# =============================================================================
# FUNCIÓN AUXILIAR PARA ENVIAR MENSAJES A TELEGRAM
# =============================================================================
async def send_telegram_message(chat_id: int, text: str, reply_markup: Optional[dict] = None) -> None:
    if not TELEGRAM_BOT_TOKEN:
        logger.warning(
            f"[TELEGRAM] TELEGRAM_BOT_TOKEN no está configurado. "
            f"Mensaje simulado para chat {chat_id}: {text}"
        )
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            logger.info(f"[TELEGRAM] Mensaje enviado exitosamente al chat {chat_id}")
    except httpx.HTTPStatusError as e:
        logger.error(
            f"[TELEGRAM] Error de estado HTTP al enviar mensaje al chat {chat_id}: "
            f"{e.response.status_code} - {e.response.text}"
        )
    except Exception as e:
        logger.error(f"[TELEGRAM] Error inesperado al enviar mensaje a Telegram: {e}")


async def answer_telegram_callback(callback_query_id: str, text: Optional[str] = None) -> None:
    """Responde a un callback_query (botón inline) para quitar el "loading" del botón."""
    if not TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
    payload = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except Exception as e:
        logger.error(f"[TELEGRAM] Error respondiendo callback_query: {e}")


async def edit_telegram_message(chat_id: int, message_id: int, text: str, reply_markup: Optional[dict] = None) -> None:
    """Edita un mensaje ya enviado (usado para refrescar el selector de
    cantidad sin llenar el chat de mensajes nuevos cada vez que se toca +/-)."""
    if not TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/editMessageText"
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except Exception as e:
        logger.error(f"[TELEGRAM] Error editando mensaje: {e}")

# Helper para guardar tokens de vinculación (Redis + Memoria)
async def _save_link_token(code: str, payload: dict):
    redis_key = f"telegram:link_token:{code}"
    _TELEGRAM_LINK_TOKENS[code] = {
        "payload": payload,
        "exp": datetime.now(timezone.utc).timestamp() + 600
    }
    try:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            from redis.asyncio import Redis
            r = Redis.from_url(redis_url)
            await r.set(redis_key, json.dumps(payload), ex=600)
            await r.close()
    except Exception as e:
        logger.warning(f"[TELEGRAM] Redis no disponible para guardar token: {e}")

# Helper para obtener token de vinculación (Redis + Memoria)
async def _get_link_token(code: str) -> Optional[dict]:
    redis_key = f"telegram:link_token:{code}"
    try:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            from redis.asyncio import Redis
            r = Redis.from_url(redis_url)
            val = await r.get(redis_key)
            await r.close()
            if val:
                return json.loads(val)
    except Exception as e:
        logger.warning(f"[TELEGRAM] Redis no disponible para leer token: {e}")

    # Fallback a memoria local
    if code in _TELEGRAM_LINK_TOKENS:
        entry = _TELEGRAM_LINK_TOKENS[code]
        if datetime.now(timezone.utc).timestamp() < entry["exp"]:
            return entry["payload"]
        else:
            del _TELEGRAM_LINK_TOKENS[code]

    return None

async def _delete_link_token(code: str):
    if code in _TELEGRAM_LINK_TOKENS:
        del _TELEGRAM_LINK_TOKENS[code]
    try:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            from redis.asyncio import Redis
            r = Redis.from_url(redis_url)
            await r.delete(f"telegram:link_token:{code}")
            await r.close()
    except Exception:
        pass

# =============================================================================
# ESTADO TEMPORAL PARA CONFIRMACIÓN DE VENTAS (/venta) — Redis + memoria local
# =============================================================================
_PENDING_VENTAS: dict = {}
_PENDING_VENTA_TTL_SECONDS = 300  # 5 minutos para confirmar/cancelar

async def _save_pending_venta(token: str, payload: dict) -> None:
    redis_key = f"telegram:pending_venta:{token}"
    _PENDING_VENTAS[token] = {
        "payload": payload,
        "exp": datetime.now(timezone.utc).timestamp() + _PENDING_VENTA_TTL_SECONDS,
    }
    try:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            r = Redis.from_url(redis_url)
            await r.set(redis_key, json.dumps(payload), ex=_PENDING_VENTA_TTL_SECONDS)
            await r.close()
    except Exception as e:
        logger.warning(f"[TELEGRAM] Redis no disponible para guardar venta pendiente: {e}")

async def _get_pending_venta(token: str) -> Optional[dict]:
    redis_key = f"telegram:pending_venta:{token}"
    try:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            r = Redis.from_url(redis_url)
            val = await r.get(redis_key)
            await r.close()
            if val:
                return json.loads(val)
    except Exception as e:
        logger.warning(f"[TELEGRAM] Redis no disponible para leer venta pendiente: {e}")

    if token in _PENDING_VENTAS:
        entry = _PENDING_VENTAS[token]
        if datetime.now(timezone.utc).timestamp() < entry["exp"]:
            return entry["payload"]
        else:
            del _PENDING_VENTAS[token]
    return None

async def _delete_pending_venta(token: str) -> None:
    if token in _PENDING_VENTAS:
        del _PENDING_VENTAS[token]
    try:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            r = Redis.from_url(redis_url)
            await r.delete(f"telegram:pending_venta:{token}")
            await r.close()
    except Exception:
        pass

# =============================================================================
# COMANDO /venta — VALIDACIÓN DE PERMISO DE VENDEDOR Y PARSEO
# =============================================================================
async def _get_vendedor_for_user(conn, tenant_id: str, user_id: str) -> Optional[dict]:
    """
    Verifica si el usuario/vendedor vinculado a la sesión de Telegram tiene un
    registro de Vendedor activo asociado. Soporta user_id como UUID de Profile
    o ID entero directo de Vendedor.
    """
    # 1. Si user_id es un entero (ID directo del vendedor en la tabla vendedores)
    if user_id and str(user_id).isdigit():
        try:
            row = await conn.fetchrow(
                """
                SELECT id, nombre, porcentaje_comision
                FROM vendedores
                WHERE id = $1
                  AND tenant_id = $2::uuid
                  AND activo = true
                """,
                int(user_id), uuid.UUID(tenant_id)
            )
            if row:
                return dict(row)
        except Exception as e:
            logger.error(f"[TELEGRAM] Error buscando vendedor por ID entero: {e}")

    # 2. Si user_id es un UUID (Profile del usuario logueado en el ERP)
    try:
        u_uuid = uuid.UUID(str(user_id))
        row = await conn.fetchrow(
            """
            SELECT id, nombre, porcentaje_comision
            FROM vendedores
            WHERE user_id = $1
              AND tenant_id = $2::uuid
              AND activo = true
            """,
            u_uuid, uuid.UUID(tenant_id)
        )
        if row:
            return dict(row)
    except Exception as e:
        logger.error(f"[TELEGRAM] Error verificando perfil de vendedor por UUID: {e}")

    # 3. Fallback SEGURO: solo si hay EXACTAMENTE un vendedor activo en el
    # tenant, no hay ambigüedad posible sobre a quién asignarle la venta.
    # Si hay 2 o más, NO se adivina — se exige vinculación explícita para
    # no atribuir mal la comisión a la persona equivocada.
    try:
        rows = await conn.fetch(
            """
            SELECT id, nombre, porcentaje_comision
            FROM vendedores
            WHERE tenant_id = $1::uuid
              AND activo = true
            """,
            uuid.UUID(tenant_id)
        )
        if len(rows) == 1:
            return dict(rows[0])
        return None
    except Exception as e:
        logger.error(f"[TELEGRAM] Fallback vendedor: {e}")
        return None


# =============================================================================
# DESPACHADORES DINÁMICOS PARA COMANDOS DEL BOT (DATOS REALES DEL ERP)
# =============================================================================

async def _dyn_query_rates(conn, tenant_id) -> str:
    row = await conn.fetchrow(
        """
        SELECT valor_ves, fecha FROM public.tasas_cambio
        WHERE tenant_id = $1 OR tenant_id IS NULL
        ORDER BY fecha DESC LIMIT 1
        """,
        uuid.UUID(str(tenant_id))
    )
    if not row or row["valor_ves"] is None:
        return "⚠️ No hay tasa de cambio registrada todavía en el sistema."
    fecha_str = row["fecha"].strftime("%d/%m/%Y %H:%M") if row["fecha"] else "N/D"
    return (
        f"💱 *TASA BCV — KODA ERP*\n"
        f"Bs. {float(row['valor_ves']):.2f} por USD\n"
        f"🕒 Actualizada: {fecha_str}"
    )


async def _dyn_query_sales(conn, tenant_id) -> str:
    row = await conn.fetchrow(
        """
        SELECT COUNT(*) AS cnt, COALESCE(SUM(total_usd), 0) AS total
        FROM public.ventas
        WHERE tenant_id = $1 AND estado != 'ANULADA' AND fecha >= CURRENT_DATE
        """,
        uuid.UUID(str(tenant_id))
    )
    return (
        f"🧾 *VENTAS DE HOY — KODA ERP*\n"
        f"Facturas emitidas: {row['cnt']}\n"
        f"Total facturado: ${float(row['total']):.2f}"
    )


async def _dyn_query_stock(conn, tenant_id) -> str:
    rows = await conn.fetch(
        """
        SELECT nombre, stock, stock_minimo FROM public.productos
        WHERE tenant_id = $1 AND stock <= stock_minimo
        ORDER BY stock ASC LIMIT 5
        """,
        uuid.UUID(str(tenant_id))
    )
    if not rows:
        return "📦 *INVENTARIO — KODA ERP*\n✅ No hay productos en stock crítico."
    lineas = "\n".join(
        f"• {r['nombre']}: {r['stock']} (mín. {r['stock_minimo']})" for r in rows
    )
    return f"📦 *STOCK CRÍTICO — KODA ERP*\n{lineas}"


async def _dyn_query_collections(conn, tenant_id) -> str:
    row = await conn.fetchrow(
        """
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(monto_total_usd - monto_pagado_usd), 0) AS saldo
        FROM public.cuentas_por_cobrar
        WHERE tenant_id = $1 AND estado != 'PAGADA'
        """,
        uuid.UUID(str(tenant_id))
    )
    return (
        f"💰 *CUENTAS POR COBRAR — KODA ERP*\n"
        f"Facturas pendientes: {row['cnt']}\n"
        f"Saldo total por cobrar: ${float(row['saldo']):.2f}"
    )


async def _dyn_query_alerts(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    row = await conn.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM public.productos
              WHERE tenant_id = $1 AND stock <= stock_minimo) AS stock_bajo,
            (SELECT COUNT(*) FROM public.cuentas_por_cobrar
              WHERE tenant_id = $1 AND estado != 'PAGADA'
                AND fecha_vencimiento < CURRENT_DATE) AS cxc_vencidas,
            (SELECT COUNT(*) FROM public.turnos_despacho
              WHERE tenant_id = $1 AND estado = 'PROGRAMADO'
                AND fecha_salida < CURRENT_DATE) AS turnos_atrasados
        """,
        tid
    )
    return (
        f"🚨 *CENTRO DE ALERTAS ACTIVAS — KODA ERP*\n"
        f"📦 Productos en stock crítico: {row['stock_bajo']}\n"
        f"💰 Cuentas por cobrar vencidas: {row['cxc_vencidas']}\n"
        f"🚚 Despachos programados atrasados: {row['turnos_atrasados']}"
    )


async def _dyn_query_invoices(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*) FILTER (WHERE estado != 'ANULADA') AS emitidas,
            COUNT(*) FILTER (WHERE estado = 'ANULADA') AS anuladas,
            COALESCE(SUM(total_usd) FILTER (WHERE estado != 'ANULADA'), 0) AS total,
            COALESCE(SUM(iva_usd) FILTER (WHERE estado != 'ANULADA'), 0) AS iva
        FROM public.ventas
        WHERE tenant_id = $1 AND fecha >= CURRENT_DATE
        """,
        tid
    )
    return (
        f"🧾 *RESUMEN DE FACTURACIÓN DE HOY — KODA ERP*\n"
        f"Facturas emitidas: {row['emitidas']}\n"
        f"Facturas anuladas: {row['anuladas']}\n"
        f"Total facturado: ${float(row['total']):.2f}\n"
        f"IVA débito fiscal: ${float(row['iva']):.2f}"
    )


async def _dyn_query_purchases(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    row = await conn.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM public.requisiciones_compra
              WHERE tenant_id = $1 AND estado = 'PENDIENTE') AS req_cnt,
            (SELECT COALESCE(SUM(monto_estimado_usd), 0) FROM public.requisiciones_compra
              WHERE tenant_id = $1 AND estado = 'PENDIENTE') AS req_usd,
            (SELECT COUNT(*) FROM public.compras
              WHERE tenant_id = $1 AND estado = 'PENDIENTE') AS compras_cnt,
            (SELECT COALESCE(SUM(total_usd), 0) FROM public.compras
              WHERE tenant_id = $1 AND estado = 'PENDIENTE') AS compras_usd
        """,
        tid
    )
    return (
        f"🛒 *COMPRAS Y REQUISICIONES — KODA ERP*\n"
        f"Requisiciones pendientes de aprobar: {row['req_cnt']} (${float(row['req_usd']):.2f})\n"
        f"Compras facturadas por recibir: {row['compras_cnt']} (${float(row['compras_usd']):.2f})"
    )


async def _dyn_query_logistics(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    counts = await conn.fetchrow(
        """
        SELECT
            COUNT(*) FILTER (WHERE estado = 'PROGRAMADO') AS programados,
            COUNT(*) FILTER (WHERE estado = 'EN_RUTA') AS en_ruta
        FROM public.turnos_despacho
        WHERE tenant_id = $1 AND fecha_salida >= CURRENT_DATE
          AND fecha_salida < CURRENT_DATE + 1
        """,
        tid
    )
    en_ruta_rows = await conn.fetch(
        """
        SELECT t.numero_turno, t.destino, ch.nombre AS chofer_nombre, v.placa
        FROM public.turnos_despacho t
        LEFT JOIN public.choferes ch ON ch.id = t.chofer_id
        LEFT JOIN public.vehiculos v ON v.id = t.vehiculo_id
        WHERE t.tenant_id = $1 AND t.estado = 'EN_RUTA'
        ORDER BY t.fecha_salida ASC
        LIMIT 3
        """,
        tid
    )
    lineas = "\n".join(
        f"• {r['numero_turno']} — {r['chofer_nombre'] or 'Sin chofer asignado'} "
        f"({r['placa'] or 'Sin vehículo'}) → {r['destino']}"
        for r in en_ruta_rows
    ) or "Ningún despacho en ruta en este momento."
    return (
        f"🚚 *ESTADO DE LA LOGÍSTICA — KODA ERP*\n"
        f"Turnos programados hoy: {counts['programados']}\n"
        f"Turnos en ruta: {counts['en_ruta']}\n\n"
        f"{lineas}"
    )


async def _dyn_query_payments(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    row = await conn.fetchrow(
        """
        SELECT
            (SELECT COALESCE(SUM(monto_total_usd - monto_pagado_usd), 0)
               FROM public.cuentas_por_pagar
               WHERE tenant_id = $1 AND estado != 'PAGADA') AS cxp_total,
            (SELECT COALESCE(SUM(monto_total_usd - monto_pagado_usd), 0)
               FROM public.cuentas_por_pagar
               WHERE tenant_id = $1 AND estado != 'PAGADA'
                 AND fecha_vencimiento < CURRENT_DATE + INTERVAL '7 days') AS cxp_semana,
            (SELECT COALESCE(SUM(monto_usd), 0) FROM public.movimientos_bancarios
               WHERE tenant_id = $1 AND tipo = 'EGRESO' AND estado = 'ACTIVO'
                 AND fecha >= CURRENT_DATE) AS egresos_hoy
        """,
        tid
    )
    return (
        f"💸 *CUENTAS POR PAGAR Y COMPROMISOS — KODA ERP*\n"
        f"Total CxP a proveedores: ${float(row['cxp_total']):.2f}\n"
        f"Vencen en los próximos 7 días: ${float(row['cxp_semana']):.2f}\n"
        f"Egresos ejecutados hoy: ${float(row['egresos_hoy']):.2f}"
    )


async def _dyn_query_treasury(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    cuentas = await conn.fetch(
        """
        SELECT banco, moneda, numero_cuenta, saldo_actual_usd
        FROM public.cuentas_bancarias
        WHERE tenant_id = $1 AND activa IS NOT FALSE
        ORDER BY moneda, banco
        """,
        tid
    )
    caja_chica = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(disponible_usd), 0) AS disponible
        FROM public.fondos_caja_chica
        WHERE tenant_id = $1 AND estado = 'ACTIVO'
        """,
        tid
    )
    if not cuentas:
        cuentas_txt = "Sin cuentas bancarias activas registradas."
    else:
        lineas = []
        for c in cuentas:
            numero = str(c["numero_cuenta"] or "")
            enmascarado = f"****{numero[-4:]}" if len(numero) >= 4 else "****"
            lineas.append(
                f"• {c['banco']} {enmascarado} ({c['moneda']}): "
                f"${float(c['saldo_actual_usd']):.2f}"
            )
        cuentas_txt = "\n".join(lineas)
    return (
        f"🏛️ *SALDOS DE TESORERÍA — KODA ERP*\n"
        f"{cuentas_txt}\n"
        f"💵 Caja chica disponible: ${float(caja_chica['disponible']):.2f}"
    )


async def _dyn_query_fiscal(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    ventas_mes = await conn.fetchrow(
        """
        SELECT
            COALESCE(SUM(iva_usd), 0) AS iva,
            COALESCE(SUM(igtf_usd), 0) AS igtf,
            COALESCE(SUM(total_usd), 0) AS total
        FROM public.ventas
        WHERE tenant_id = $1 AND estado != 'ANULADA'
          AND fecha >= date_trunc('month', CURRENT_DATE)
        """,
        tid
    )
    declaracion = await conn.fetchrow(
        """
        SELECT estado FROM public.declaraciones_iva
        WHERE tenant_id = $1 AND periodo = to_char(CURRENT_DATE, 'YYYY-MM')
        """,
        tid
    )
    estado_decl = declaracion["estado"] if declaracion else "sin declaración registrada"
    return (
        f"📊 *OBLIGACIONES FISCALES DEL MES — KODA ERP*\n"
        f"Débito fiscal IVA (ventas del mes): ${float(ventas_mes['iva']):.2f}\n"
        f"IGTF acumulado del mes: ${float(ventas_mes['igtf']):.2f}\n"
        f"Total facturado del mes: ${float(ventas_mes['total']):.2f}\n"
        f"Declaración del período {datetime.now(timezone.utc).strftime('%Y-%m')}: {estado_decl}"
    )


async def _dyn_query_accounting(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    row = await conn.fetchrow(
        """
        SELECT
            COALESCE(SUM(d.debe_usd), 0) AS debe,
            COALESCE(SUM(d.haber_usd), 0) AS haber,
            COUNT(DISTINCT d.asiento_id) AS asientos
        FROM public.asiento_detalles d
        JOIN public.asientos_contables a ON a.id = d.asiento_id
        WHERE d.tenant_id = $1 AND a.fecha >= date_trunc('month', CURRENT_DATE)
        """,
        tid
    )
    debe = float(row["debe"])
    haber = float(row["haber"])
    cuadrado = "✅ Cuadrado" if abs(debe - haber) < 0.01 else "⚠️ Descuadrado — revisar"
    if row["asientos"] == 0:
        return (
            f"📕 *LIBRO DIARIO DEL MES — KODA ERP*\n"
            f"No hay asientos contables registrados este mes para esta empresa."
        )
    return (
        f"📕 *LIBRO DIARIO DEL MES — KODA ERP*\n"
        f"Asientos generados: {row['asientos']}\n"
        f"Total Debe: ${debe:.2f}\n"
        f"Total Haber: ${haber:.2f}\n"
        f"Balance: {cuadrado}"
    )


async def _dyn_query_payroll(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    row = await conn.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM public.empleados
               WHERE tenant_id = $1 AND activo = 1) AS emp_cnt,
            (SELECT COALESCE(SUM(salario_base_usd + bono_alimentacion_usd), 0)
               FROM public.empleados WHERE tenant_id = $1 AND activo = 1) AS emp_costo,
            (SELECT COUNT(*) FROM public.rh_employees
               WHERE tenant_id = $1 AND status = 'activo') AS rh_cnt,
            (SELECT COALESCE(SUM(sueldo_base_mensual), 0)
               FROM public.rh_employees WHERE tenant_id = $1 AND status = 'activo') AS rh_costo
        """,
        tid
    )
    total_personal = row["emp_cnt"] + row["rh_cnt"]
    total_costo = float(row["emp_costo"]) + float(row["rh_costo"])
    return (
        f"👥 *NÓMINA Y PERSONAL — KODA ERP*\n"
        f"Personal activo: {total_personal} empleados\n"
        f"Costo base mensual estimado (sueldos + bono alimentación): ${total_costo:.2f}"
    )


async def _dyn_query_reports(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    rows = await conn.fetch(
        """
        SELECT d.cuenta_codigo,
               COALESCE(SUM(d.debe_usd), 0) AS debe,
               COALESCE(SUM(d.haber_usd), 0) AS haber
        FROM public.asiento_detalles d
        JOIN public.asientos_contables a ON a.id = d.asiento_id
        WHERE d.tenant_id = $1 AND (d.cuenta_codigo LIKE '4%' OR d.cuenta_codigo LIKE '5%')
          AND a.fecha >= date_trunc('month', CURRENT_DATE)
        GROUP BY d.cuenta_codigo
        """,
        tid
    )
    if not rows:
        return (
            f"📈 *INDICADORES DE NEGOCIO — KODA ERP*\n"
            f"No hay asientos contables registrados este mes; no es posible calcular "
            f"indicadores todavía."
        )
    ingresos = costos = gastos = 0.0
    for r in rows:
        debe = float(r["debe"])
        haber = float(r["haber"])
        codigo = r["cuenta_codigo"] or ""
        if codigo.startswith("4"):
            ingresos += (haber - debe)
        elif codigo.startswith("5.1"):
            costos += (debe - haber)
        elif codigo.startswith("5"):
            gastos += (debe - haber)
    utilidad_bruta = ingresos - costos
    utilidad_operativa = utilidad_bruta - gastos
    margen = (utilidad_bruta / ingresos * 100) if ingresos else 0.0
    return (
        f"📈 *INDICADORES DE NEGOCIO (BI) — KODA ERP*\n"
        f"Ingresos del mes: ${ingresos:.2f}\n"
        f"Costos del mes: ${costos:.2f}\n"
        f"Gastos operativos: ${gastos:.2f}\n"
        f"Margen bruto: {margen:.1f}%\n"
        f"Utilidad operativa estimada: ${utilidad_operativa:.2f}\n"
        f"_(Calculado sobre el Libro Diario del mes; no incluye depreciación/amortización)_"
    )


async def _dyn_query_branches(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    sucursales = await conn.fetch(
        """
        SELECT nombre, ciudad, estado FROM public.sucursales
        WHERE tenant_id = $1
        ORDER BY nombre
        """,
        tid
    )
    if sucursales:
        lineas = "\n".join(
            f"📍 {s['nombre']}"
            + (f" ({s['ciudad']})" if s["ciudad"] else "")
            + f" — {'Activa' if str(s['estado']).upper() == 'ACTIVO' else s['estado']}"
            for s in sucursales
        )
        return f"🏢 *SEDES Y PUNTOS DE VENTA — KODA ERP*\n{lineas}"
    almacenes = await conn.fetch(
        """
        SELECT nombre, tipo FROM public.almacenes
        WHERE tenant_id = $1 AND activo = TRUE
        ORDER BY nombre
        """,
        tid
    )
    if not almacenes:
        return "🏢 *SEDES Y PUNTOS DE VENTA — KODA ERP*\nNo hay sucursales ni almacenes registrados todavía."
    lineas = "\n".join(f"📍 {a['nombre']} ({a['tipo']})" for a in almacenes)
    return f"🏢 *ALMACENES ACTIVOS — KODA ERP*\n{lineas}"


async def _dyn_query_audit(conn, tenant_id) -> str:
    tid = uuid.UUID(str(tenant_id))
    rows = await conn.fetch(
        """
        SELECT usuario, accion, modulo, LEFT(detalle, 80) AS detalle, fecha
        FROM public.auditoria_logs
        WHERE tenant_id = $1
        ORDER BY fecha DESC
        LIMIT 5
        """,
        tid
    )
    if not rows:
        return "🛡️ *CONTROL DE AUDITORÍA — KODA ERP*\nNo hay eventos de auditoría registrados todavía."
    lineas = "\n".join(
        f"• {r['fecha'].strftime('%d/%m %H:%M')} — {r['usuario']}: {r['accion']} "
        f"({r['modulo']})" + (f" — {r['detalle']}" if r['detalle'] else "")
        for r in rows
    )
    return f"🛡️ *ÚLTIMOS EVENTOS DE AUDITORÍA — KODA ERP*\n{lineas}"


# Registro de despachadores: la clave debe coincidir EXACTAMENTE con el valor
# guardado en bot_commands.internal_action. Cualquier internal_action que no
# esté aquí simplemente usa el response_text estático de siempre (fallback
# seguro, no rompe los comandos que aún no tienen versión dinámica).
_DYNAMIC_COMMAND_HANDLERS = {
    "query_rates": _dyn_query_rates,
    "query_sales": _dyn_query_sales,
    "query_stock": _dyn_query_stock,
    "query_collections": _dyn_query_collections,
    "query_alerts": _dyn_query_alerts,
    "query_invoices": _dyn_query_invoices,
    "query_purchases": _dyn_query_purchases,
    "query_logistics": _dyn_query_logistics,
    "query_payments": _dyn_query_payments,
    "query_treasury": _dyn_query_treasury,
    "query_fiscal": _dyn_query_fiscal,
    "query_accounting": _dyn_query_accounting,
    "query_payroll": _dyn_query_payroll,
    "query_reports": _dyn_query_reports,
    "query_branches": _dyn_query_branches,
    "query_audit": _dyn_query_audit,
}


def _normalize_command_trigger(text: str) -> str:
    """Normaliza un comando quitando espacios, pasando a minúsculas y removiendo acentos."""
    t = text.strip().lower()
    accents = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u'
    }
    for orig, norm in accents.items():
        t = t.replace(orig, norm)
    return t


_HELP_TEXT = (
    "🤖 *ASISTENTE VIRTUAL KODA ERP - COMANDOS DISPONIBLES*\n\n"
    "💵 `/tasa` o `/bcv` - Tasas activas del BCV\n"
    "🛍️ `/ventas` - Ventas y órdenes de hoy\n"
    "🏛️ `/tesoreria` - Saldos bancarios y caja chica\n"
    "📦 `/stock <sku>` - Consultar inventario por producto\n"
    "🛒 `/comprar <producto>` - Búsqueda en catálogo y venta interactiva\n"
    "🧾 `/venta <sku> <cant>` - Registro directo de venta\n"
    "💰 `/cobranzas` - Cuentas por Cobrar (CxC)\n"
    "💸 `/pagos` - Cuentas por Pagar (CxP)\n"
    "🚨 `/alertas` - Centro de alertas operativas\n"
    "📄 `/facturas` - Resumen de facturación\n"
    "📦 `/inventario` - Stock crítico y almacenes\n"
    "🚚 `/logistica` - Estado de despachos y flota\n"
    "📊 `/fiscal` - Resumen de IVA e IGTF\n"
    "📕 `/contabilidad` - Libro Diario y asientos\n"
    "👥 `/nomina` - Personal activo y costos de nómina\n"
    "📈 `/reportes` - Indicadores BI y márgenes\n"
    "🏢 `/sucursales` - Sedes físicas\n"
    "🛡️ `/auditoria` - Registro de eventos de seguridad\n\n"
    "_Todos los comandos operan en tiempo real bajo aislamiento multi-tenant._"
)

# Catálogo integrado de respaldo: permite que los comandos del sistema funcionen
# de inmediato sin requerir configuración manual previa en public.bot_commands,
# respetando tolerancia a tildes y mayúsculas.
_BUILTIN_COMMANDS_FALLBACK = {
    "/ayuda": {"text": _HELP_TEXT, "action": None},
    "/help": {"text": _HELP_TEXT, "action": None},
    "/tesoreria": {"text": "🏛️ Consultando saldos de tesorería...", "action": "query_treasury"},
    "/tasa": {"text": "💱 Consultando tasa oficial BCV...", "action": "query_rates"},
    "/bcv": {"text": "💱 Consultando tasa oficial BCV...", "action": "query_rates"},
    "/ventas": {"text": "🛍️ Consultando ventas de hoy...", "action": "query_sales"},
    "/cobranzas": {"text": "💰 Consultando cuentas por cobrar...", "action": "query_collections"},
    "/pagos": {"text": "💸 Consultando cuentas por pagar...", "action": "query_payments"},
    "/alertas": {"text": "🚨 Consultando centro de alertas...", "action": "query_alerts"},
    "/facturas": {"text": "🧾 Consultando resumen de facturas...", "action": "query_invoices"},
    "/compras": {"text": "🛒 Consultando requisiciones y compras...", "action": "query_purchases"},
    "/inventario": {"text": "📦 Consultando inventario...", "action": "query_stock"},
    "/logistica": {"text": "🚚 Consultando estado de logística...", "action": "query_logistics"},
    "/fiscal": {"text": "📊 Consultando obligaciones fiscales...", "action": "query_fiscal"},
    "/contabilidad": {"text": "📕 Consultando libro diario...", "action": "query_accounting"},
    "/nomina": {"text": "👥 Consultando personal y nómina...", "action": "query_payroll"},
    "/reportes": {"text": "📈 Consultando indicadores de negocio...", "action": "query_reports"},
    "/sucursales": {"text": "🏢 Consultando sucursales...", "action": "query_branches"},
    "/auditoria": {"text": "🛡️ Consultando logs de auditoría...", "action": "query_audit"},
}


def _parse_venta_command(text: str):
    """
    Parsea "/venta <sku> <cantidad> [rif_cliente]".
    Retorna (sku, cantidad, rif_cliente) o levanta ValueError con un mensaje de uso.
    """
    parts = text.split()
    if len(parts) < 3:
        raise ValueError(
            "Uso: /venta <sku> <cantidad> [rif_cliente]\n"
            "Ejemplo: /venta PROD-001 5 J-12345678-9"
        )
    sku = parts[1].strip()
    try:
        cantidad = int(parts[2])
        if cantidad <= 0:
            raise ValueError()
    except ValueError:
        raise ValueError(
            "La cantidad debe ser un número entero positivo.\n"
            "Uso: /venta <sku> <cantidad> [rif_cliente]"
        )
    rif_cliente = parts[3].strip() if len(parts) > 3 else None
    return sku, cantidad, rif_cliente


async def _handle_venta_command(command_text: str, chat_id: int, session_row, conn) -> dict:
    user_id = str(session_row["user_id"])
    tenant_id = str(session_row["tenant_id"])

    vendedor = await _get_vendedor_for_user(conn, tenant_id, user_id)
    if not vendedor:
        await send_telegram_message(
            chat_id,
            "❌ Tu cuenta no tiene un perfil de vendedor vinculado. "
            "Pide a un administrador que te vincule en Vendedores antes de usar /venta."
        )
        return {"status": "not_a_vendedor"}

    try:
        sku, cantidad, rif_cliente = _parse_venta_command(command_text)
    except ValueError as e:
        await send_telegram_message(chat_id, str(e))
        return {"status": "invalid_command_format"}

    try:
        stock_info = await bot_get_stock(tenant_id, sku)
    except BotApiError as e:
        await send_telegram_message(chat_id, f"❌ No se pudo verificar el producto '{sku}': {e}")
        return {"status": "stock_lookup_failed", "detail": str(e)}

    stock_actual = stock_info.get("stock", stock_info.get("cantidad_disponible", "N/D"))
    minimo = stock_info.get("minimo", stock_info.get("stock_minimo", "N/D"))
    bajo_minimo = stock_info.get("below_minimum", stock_info.get("bajo_minimo", False))

    token = secrets.token_urlsafe(8)
    await _save_pending_venta(token, {
        "tenant_id": tenant_id,
        "vendedor_id": vendedor["id"],
        "sku": sku,
        "cantidad": cantidad,
        "rif_cliente": rif_cliente,
        "chat_id": chat_id,
        "idempotency_key": str(uuid.uuid4()),
    })

    alerta_stock = "\n⚠️ Este producto está por debajo del stock mínimo." if bajo_minimo else ""
    preview = (
        "🧾 Confirmar venta\n\n"
        f"SKU: {sku}\n"
        f"Cantidad: {cantidad}\n"
        f"Cliente: {rif_cliente or 'N/A'}\n"
        f"Stock actual: {stock_actual} (mínimo: {minimo}){alerta_stock}\n\n"
        "¿Confirmas esta venta?"
    )
    reply_markup = {
        "inline_keyboard": [[
            {"text": "✅ Confirmar", "callback_data": f"confirmar_venta:{token}"},
            {"text": "❌ Cancelar", "callback_data": f"cancelar_venta:{token}"},
        ]]
    }
    await send_telegram_message(chat_id, preview, reply_markup=reply_markup)
    return {"status": "confirmation_pending", "token": token}


async def _handle_comprar_command(command_text: str, chat_id: int, session_row, conn) -> dict:
    """/comprar <texto de búsqueda> — flujo conversacional: busca por nombre,
    el vendedor elige con botones, ajusta cantidad y confirma."""
    user_id = str(session_row["user_id"])
    tenant_id = str(session_row["tenant_id"])

    vendedor = await _get_vendedor_for_user(conn, tenant_id, user_id)
    if not vendedor:
        await send_telegram_message(
            chat_id,
            "❌ Tu cuenta no tiene un perfil de vendedor vinculado. "
            "Pide a un administrador que te vincule en Vendedores antes de usar /comprar."
        )
        return {"status": "not_a_vendedor"}

    query = command_text[len("/comprar"):].strip()
    if len(query) < 2:
        await send_telegram_message(chat_id, "Uso: /comprar <nombre del producto>\nEjemplo: /comprar forro")
        return {"status": "invalid_command_format"}

    try:
        candidatos = await bot_buscar_productos(tenant_id, query)
    except BotApiError as e:
        await send_telegram_message(chat_id, f"❌ No se pudo buscar el producto: {e}")
        return {"status": "search_failed", "detail": str(e)}

    candidatos = [c for c in candidatos if c.get("stock", 0) > 0]
    if not candidatos:
        await send_telegram_message(chat_id, f"No encontré productos con stock disponible que coincidan con '{query}'.")
        return {"status": "no_results"}

    token = secrets.token_urlsafe(8)
    await _save_pending_venta(token, {
        "stage": "select",
        "tenant_id": tenant_id,
        "vendedor_id": vendedor["id"],
        "chat_id": chat_id,
        "candidatos": candidatos,
    })

    botones = [
        [{
            "text": f"{c['nombre']} — ${c['precio_usd']:.2f} (stock: {c['stock']:g})",
            "callback_data": f"elegir_producto:{token}:{idx}",
        }]
        for idx, c in enumerate(candidatos)
    ]
    nota = "\n\n_Mostrando hasta 8 resultados — escribe algo más específico si no ves lo que buscas._" if len(candidatos) == 8 else ""
    await send_telegram_message(
        chat_id,
        f"🔍 Resultados para '{query}':{nota}",
        reply_markup={"inline_keyboard": botones},
    )
    return {"status": "selection_pending", "token": token}


async def _handle_stock_command(command_text: str, chat_id: int, session_row) -> dict:
    parts = command_text.split()
    if len(parts) < 2:
        await send_telegram_message(chat_id, "Uso: /stock <sku>\nEjemplo: /stock PROD-001")
        return {"status": "invalid_command_format"}

    sku = parts[1].strip()
    tenant_id = str(session_row["tenant_id"])
    try:
        stock_info = await bot_get_stock(tenant_id, sku)
    except BotApiError as e:
        await send_telegram_message(chat_id, f"❌ No se pudo consultar el stock de '{sku}': {e}")
        return {"status": "stock_lookup_failed", "detail": str(e)}

    stock_actual = stock_info.get("stock", stock_info.get("cantidad_disponible", "N/D"))
    minimo = stock_info.get("minimo", stock_info.get("stock_minimo", "N/D"))
    bajo_minimo = stock_info.get("below_minimum", stock_info.get("bajo_minimo", False))
    alerta = "\n⚠️ Por debajo del stock mínimo." if bajo_minimo else ""
    msg = f"📦 SKU: {sku}\nStock actual: {stock_actual}\nStock mínimo: {minimo}{alerta}"

    # Desglose por almacén: campo nuevo y opcional del lado del ERP
    # (bot_get_stock reenvía la respuesta tal cual). Sólo se agrega la
    # sección si viene con más de un almacén; si no viene (ERP viejo sin
    # actualizar) o trae uno solo, se conserva el mensaje de siempre.
    por_almacen = stock_info.get("por_almacen") or []
    if len(por_almacen) > 1:
        principal = next((a for a in por_almacen if a.get("es_principal")), None)
        otros = [a for a in por_almacen if a is not principal]
        lineas = ["📦 SKU: " + sku, f"Stock total: {stock_actual}", ""]
        if principal:
            lineas.append(f"🏢 Almacén principal ({principal.get('nombre')}): {principal.get('cantidad')}")
        if otros:
            lineas.append("📍 Otros almacenes:")
            for a in otros:
                lineas.append(f"• {a.get('nombre')}: {a.get('cantidad')}")
        lineas.append(f"Stock mínimo: {minimo}{alerta}")
        msg = "\n".join(lineas)

    await send_telegram_message(chat_id, msg)
    return {"status": "success"}


def _texto_confirmacion(pending: dict) -> str:
    cantidad = pending.get("cantidad", 1)
    precio = pending.get("precio_usd", 0)
    subtotal = cantidad * precio
    metodo = pending.get("metodo_pago", "DIVISA")
    metodo_label = {
        "DIVISA": "💵 Divisa (USD)",
        "PAGOMOVIL": "📱 Pago Móvil (Bs.)",
        "TRANSFERENCIA": "🏦 Transferencia",
        "EFECTIVO": "💵 Efectivo (Bs.)"
    }.get(metodo, metodo)

    return (
        "🧾 *Confirmar Venta*\n\n"
        f"📦 *Producto:* {pending.get('nombre')}\n"
        f"💲 *Precio unitario:* ${precio:.2f}\n"
        f"🔢 *Cantidad:* {cantidad}\n"
        f"💰 *Subtotal:* ${subtotal:.2f}\n"
        f"💳 *Forma de Pago:* {metodo_label}\n\n"
        "Selecciona el método de pago, ajusta cantidad y confirma:"
    )


def _botones_confirmacion(token: str, pending: Optional[dict] = None) -> dict:
    metodo = (pending or {}).get("metodo_pago", "DIVISA")
    
    return {
        "inline_keyboard": [
            [
                {"text": f"{'🔘' if metodo == 'DIVISA' else '⚪'} 💵 Divisa ($)", "callback_data": f"pay:DIVISA:{token}"},
                {"text": f"{'🔘' if metodo == 'PAGOMOVIL' else '⚪'} 📱 Pago Móvil", "callback_data": f"pay:PAGOMOVIL:{token}"},
            ],
            [
                {"text": f"{'🔘' if metodo == 'TRANSFERENCIA' else '⚪'} 🏦 Transferencia", "callback_data": f"pay:TRANSFERENCIA:{token}"},
                {"text": f"{'🔘' if metodo == 'EFECTIVO' else '⚪'} 💵 Efectivo (Bs)", "callback_data": f"pay:EFECTIVO:{token}"},
            ],
            [
                {"text": "➖ Menos", "callback_data": f"qty_menos:{token}"},
                {"text": "➕ Más", "callback_data": f"qty_mas:{token}"},
            ],
            [
                {"text": "✅ Confirmar Venta", "callback_data": f"confirmar_venta:{token}"},
                {"text": "❌ Cancelar", "callback_data": f"cancelar_venta:{token}"},
            ],
        ]
    }


async def _handle_callback_query(callback_query: TelegramCallbackQuery, conn) -> dict:
    """Procesa la respuesta del usuario a los botones inline Confirmar/Cancelar/Selección/Cantidad/Pago."""
    data = callback_query.data or ""
    chat_id = callback_query.message.chat.id if callback_query.message else None

    if ":" not in data:
        await answer_telegram_callback(callback_query.id)
        return {"status": "ignored", "detail": "malformed callback data"}

    parts = data.split(":")
    action = parts[0]
    
    # Manejo de pay:METODO:TOKEN
    if action == "pay":
        selected_method = parts[1] if len(parts) > 1 else "DIVISA"
        token = parts[2] if len(parts) > 2 else None
    else:
        token = parts[1] if len(parts) > 1 else None
        selected_method = None

    idx = None
    if action == "elegir_producto" and len(parts) > 2:
        try:
            idx = int(parts[2])
        except ValueError:
            idx = None

    allowed_actions = ("confirmar_venta", "cancelar_venta", "elegir_producto", "qty_mas", "qty_menos", "pay")
    if not token or action not in allowed_actions:
        await answer_telegram_callback(callback_query.id)
        return {"status": "ignored", "detail": "unknown action or malformed callback data"}

    pending = await _get_pending_venta(token)
    if not pending:
        await answer_telegram_callback(callback_query.id, "Esta operación ya expiró.")
        if chat_id:
            await send_telegram_message(
                chat_id,
                "⏱️ Esta confirmación expiró o ya fue procesada. Vuelve a iniciar con /comprar."
            )
        return {"status": "expired_or_missing"}

    target_chat_id = pending.get("chat_id", chat_id)
    message_id = callback_query.message.message_id if callback_query.message else None

    # --- Cambio interactivo de Método de Pago ---
    if action == "pay" and selected_method:
        await answer_telegram_callback(callback_query.id)
        pending["metodo_pago"] = selected_method
        await _save_pending_venta(token, pending)
        if message_id:
            await edit_telegram_message(
                target_chat_id, 
                message_id, 
                _texto_confirmacion(pending), 
                reply_markup=_botones_confirmacion(token, pending)
            )
        return {"status": "payment_method_updated", "method": selected_method}

    # --- Selección de producto desde /comprar (no borra el token: sigue en curso) ---
    if action == "elegir_producto":
        await answer_telegram_callback(callback_query.id)
        candidatos = pending.get("candidatos") or []
        if idx is None or idx < 0 or idx >= len(candidatos):
            await send_telegram_message(target_chat_id, "❌ Selección inválida, vuelve a intentar con /comprar.")
            await _delete_pending_venta(token)
            return {"status": "invalid_selection"}

        elegido = candidatos[idx]
        pending.update({
            "stage": "confirm",
            "sku": elegido["sku"],
            "nombre": elegido["nombre"],
            "precio_usd": elegido["precio_usd"],
            "cantidad": 1,
            "metodo_pago": "DIVISA",
            "rif_cliente": None,
            "idempotency_key": str(uuid.uuid4()),
        })
        await _save_pending_venta(token, pending)
        if message_id:
            await edit_telegram_message(
                target_chat_id, 
                message_id, 
                _texto_confirmacion(pending), 
                reply_markup=_botones_confirmacion(token, pending)
            )
        return {"status": "product_selected"}

    # --- Ajuste de cantidad (+/-) — sigue en curso, no borra el token ---
    if action in ("qty_mas", "qty_menos"):
        await answer_telegram_callback(callback_query.id)
        cantidad_actual = pending.get("cantidad", 1)
        nueva_cantidad = cantidad_actual + 1 if action == "qty_mas" else max(1, cantidad_actual - 1)
        pending["cantidad"] = nueva_cantidad
        await _save_pending_venta(token, pending)
        if message_id:
            await edit_telegram_message(
                target_chat_id, 
                message_id, 
                _texto_confirmacion(pending), 
                reply_markup=_botones_confirmacion(token, pending)
            )
        return {"status": "quantity_updated", "cantidad": nueva_cantidad}

    # --- Confirmar / cancelar: aquí sí se borra el token (operación final) ---
    await _delete_pending_venta(token)
    await answer_telegram_callback(callback_query.id)

    if action == "cancelar_venta":
        await send_telegram_message(target_chat_id, "🚫 Venta cancelada. No se realizó ningún cambio.")
        return {"status": "cancelled"}

    # action == "confirmar_venta"
    try:
        result = await registrar_venta(
            tenant_id=pending["tenant_id"],
            vendedor_id=pending["vendedor_id"],
            cliente_rif=pending.get("rif_cliente"),
            lineas=[{"sku": pending["sku"], "cantidad": pending["cantidad"]}],
            metodo_pago=pending.get("metodo_pago", "DIVISA"),
            moneda_documento="USD",
            idempotency_key=pending.get("idempotency_key") or str(uuid.uuid4()),
        )
    except BotApiError as e:
        await send_telegram_message(target_chat_id, f"❌ No se pudo registrar la venta: {e}")
        return {"status": "venta_failed", "detail": str(e)}

    numero_factura = result.get("numero_factura", result.get("invoice_number", "N/D"))
    total_val = float(result.get("monto_total", result.get("total", 0)))
    comision_val = float(result.get("comision_usd", result.get("comision", 0)))
    tasa_val = float(result.get("tasa_bcv", 0))
    metodo = result.get("metodo_pago", pending.get("metodo_pago", "DIVISA"))
    metodo_display = {
        "DIVISA": "💵 Divisa (USD)",
        "PAGOMOVIL": "📱 Pago Móvil",
        "TRANSFERENCIA": "🏦 Transferencia",
        "EFECTIVO": "💵 Efectivo (Bs)"
    }.get(metodo.upper(), metodo)

    # Si por alguna razón la tasa devuelta es 0 o menor a 50, consultar tasas_cambio del tenant
    if tasa_val < 50:
        try:
            row_t = await conn.fetchrow(
                """
                SELECT valor_ves FROM public.tasas_cambio
                WHERE tenant_id = $1 OR tenant_id IS NULL
                ORDER BY fecha DESC LIMIT 1
                """,
                uuid.UUID(str(pending["tenant_id"]))
            )
            if row_t and row_t["valor_ves"]:
                tasa_val = float(row_t["valor_ves"])
        except Exception as tasa_err:
            logger.warning(f"[TELEGRAM] No se pudo obtener tasa BCV de respaldo: {tasa_err}")
        if tasa_val < 50:
            tasa_val = 784.6633

    total_bs = total_val * tasa_val if tasa_val > 0 else 0

    msg = (
        "✅ *Venta registrada exitosamente*\n\n"
        f"📄 *Factura:* `{numero_factura}`\n"
        f"💳 *Forma de Pago:* {metodo_display}\n"
        f"💵 *Total Divisas:* ${total_val:.2f}\n"
        f"🇻🇪 *Total Bolívares:* Bs. {total_bs:,.2f} (Tasa: {tasa_val:,.2f})\n"
        f"💼 *Comisión Vendedor:* ${comision_val:.2f}"
    )
    
    await send_telegram_message(target_chat_id, msg)
    return {"status": "success", "invoice": numero_factura}

# =============================================================================
# ENDPOINT: POST /webhook/telegram/generate-token
# =============================================================================
class GenerateTelegramTokenRequest(BaseModel):
    """
    Body opcional. Solo se usa (y solo entonces es obligatorio) en el modo
    server-to-server: cuando la petición trae el header de servicio
    `X-Telegram-Link-Key` válido (ver TELEGRAM_LINK_INTERNAL_API_KEY), no hay
    sesión JWT de ESTE backend de la cual inferir tenant_id/user_id —
    koda-frontend/backend (el ERP) los envía explícitos aquí, tomados de SU
    propio current_user ya autenticado del otro lado.
    """
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None


@router.post("/telegram/generate-token")
async def generate_telegram_token(
    request: Request,
    body: GenerateTelegramTokenRequest = GenerateTelegramTokenRequest(),
    bearer_token: Optional[str] = Depends(oauth2_scheme),
):
    """
    Genera el token real de 6 caracteres (formato KODA-XXXXXX) para vincular
    un chat de Telegram, y lo guarda en _TELEGRAM_LINK_TOKENS/Redis vía
    _save_link_token — la ÚNICA fuente de verdad que valida el bot real en
    POST /webhook/telegram (flujo /start <code>).

    Dos formas válidas de invocarlo:

    1. Modo normal (SIN CAMBIOS de comportamiento): un usuario autenticado en
       ESTE backend pide su propio código vía JWT de sesión
       (cookie httpOnly o header Authorization), resuelto igual que siempre
       por `get_current_user`.
    2. Modo server-to-server: koda-frontend/backend (el ERP) pide el código
       en nombre de SU usuario ya autenticado de ese lado. Se identifica
       exclusivamente por el header `X-Telegram-Link-Key` con el valor de
       TELEGRAM_LINK_INTERNAL_API_KEY; en ese modo tenant_id/user_id vienen
       explícitos en el body (no hay JWT de este backend que decodificar).
    """
    service_key = request.headers.get("X-Telegram-Link-Key", "")
    if (
        service_key
        and TELEGRAM_LINK_INTERNAL_API_KEY
        and hmac.compare_digest(service_key, TELEGRAM_LINK_INTERNAL_API_KEY)
    ):
        if not body.tenant_id or not body.user_id:
            raise HTTPException(
                status_code=400,
                detail="Modo server-to-server: tenant_id y user_id son obligatorios en el body."
            )
        user_id = body.user_id
        tenant_id = body.tenant_id
    else:
        current_user = await get_current_user(request, bearer_token)
        user_id = current_user.get("sub")
        tenant_id = current_user.get("tenant_id")

    if not user_id or not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Información de sesión inválida: falta user_id o tenant_id."
        )

    code = generate_linking_code()
    payload = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id)
    }

    await _save_link_token(code, payload)
    logger.info(f"[TELEGRAM] Token de vinculación generado: {code} para user_id {user_id}")
    return {"code": code}

class VerifyTelegramTokenRequest(BaseModel):
    code: str

@router.post("/telegram/verify-token")
async def verify_telegram_token(
    request: Request,
    body: VerifyTelegramTokenRequest,
    conn = Depends(get_db_connection)
):
    """
    Verifica y consume un token de vinculación de Telegram server-to-server.
    Permite a koda-frontend/backend validar códigos de vinculación para choferes
    o usuarios contra la misma fuente de verdad (_TELEGRAM_LINK_TOKENS / Redis).
    """
    service_key = request.headers.get("X-Telegram-Link-Key", "")
    if not (
        service_key
        and TELEGRAM_LINK_INTERNAL_API_KEY
        and hmac.compare_digest(service_key, TELEGRAM_LINK_INTERNAL_API_KEY)
    ):
        raise HTTPException(status_code=401, detail="No autorizado.")

    link_info = await _get_link_token(body.code.strip())
    if not link_info:
        raise HTTPException(status_code=404, detail="Token no encontrado o expirado.")

    # Consumir el token
    await _delete_link_token(body.code.strip())

    return {
        "valid": True,
        "user_id": link_info.get("user_id"),
        "tenant_id": link_info.get("tenant_id")
    }

@router.post("/telegram")
async def telegram_webhook(
    update: TelegramUpdate,
    request: Request,
    conn = Depends(get_db_connection)
):
    # Verificación obligatoria del secret_token de Telegram (ver ensure_telegram_webhook).
    # hmac.compare_digest evita timing attacks frente a un simple `==`. Si el
    # secreto no está configurado (bot deshabilitado en este entorno) se
    # rechaza también: fail closed, nunca se procesa sin validar.
    incoming_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not TELEGRAM_WEBHOOK_SECRET or not hmac.compare_digest(incoming_secret, TELEGRAM_WEBHOOK_SECRET):
        logger.warning("[TELEGRAM] Webhook rechazado: X-Telegram-Bot-Api-Secret-Token ausente o inválido.")
        raise HTTPException(status_code=401, detail="Invalid webhook secret token")

    if update.callback_query:
        return await _handle_callback_query(update.callback_query, conn)

    if not update.message:
        return {"status": "ignored", "detail": "No message in update"}

    chat_id = update.message.chat.id

    # Verificar si el chat_id corresponde a un Chofer de logística
    driver_row = await conn.fetchrow(
        "SELECT id, nombre FROM public.choferes WHERE telegram_chat_id = $1 AND activo = true",
        str(chat_id)
    )
    if driver_row:
        logistics_url = os.getenv("LOGISTICS_WEBHOOK_URL", "http://localhost:8000/api/logistica/telegram-webhook")
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    logistics_url,
                    json=update.dict(),
                    headers={"X-Internal-Forward-Key": LOGISTICS_INTERNAL_FORWARD_KEY},
                    timeout=8.0
                )
                return res.json()
        except Exception as e:
            logger.error(f"[TELEGRAM] Error forwarding webhook to logistics: {e}")
            await send_telegram_message(chat_id, "⚠️ Error de comunicación temporal con el sistema de logística.")
            return {"status": "logistics_forward_error", "detail": str(e)}

    # Flujo de administrador corporativo
    if not update.message.text:
        return {"status": "ignored", "detail": "No text message in update"}

    command_text = update.message.text.strip()
    logger.info(f"[TELEGRAM] Recibido mensaje del chat {chat_id}: {command_text}")

    # --- PROCESAMIENTO DE VINCULACIÓN (/start [CODE]) ---
    if command_text.startswith("/start"):
        parts = command_text.split()
        if len(parts) < 2:
            response_msg = (
                f"📱 Tu Telegram Chat ID es: {chat_id}\n\n"
                "Para vincular tu cuenta como ADMINISTRADOR, por favor introduce el comando de la siguiente forma:\n"
                "/start [CÓDIGO_DE_VINCULACIÓN]\n\n"
                "Ejemplo: /start KODA-A1B2C3"
            )
            await send_telegram_message(chat_id, response_msg)
            return {"status": "invalid_command_format"}
            
        code = parts[1].strip()
        link_info = await _get_link_token(code)
            
        if not link_info:
            await send_telegram_message(
                chat_id,
                "El código de vinculación provisto es inválido o ha expirado. "
                "Por favor, genera un nuevo código desde el panel web de KODA."
            )
            return {"status": "token_expired_or_invalid"}
            
        try:
            user_id = link_info.get("user_id")
            tenant_id = link_info.get("tenant_id")
            
            if not user_id or not tenant_id:
                raise ValueError("Cached link data is incomplete")
                
            # Establecer RLS context localmente dentro de una transacción antes de insertar/actualizar
            async with conn.transaction():
                await conn.execute(
                    "SELECT set_config('app.current_tenant_id', $1, true)",
                    str(tenant_id)
                )
                
                # Upsert en la tabla telegram_sessions
                await conn.execute(
                    """
                    INSERT INTO public.telegram_sessions (telegram_chat_id, user_id, tenant_id)
                    VALUES ($1, $2::uuid, $3::uuid)
                    ON CONFLICT (telegram_chat_id) 
                    DO UPDATE SET user_id = EXCLUDED.user_id, tenant_id = EXCLUDED.tenant_id
                    """,
                    chat_id, uuid.UUID(user_id), uuid.UUID(tenant_id)
                )
            
            # Limpiar token usado de la caché
            await _delete_link_token(code)
            
            # Confirmar vinculación exitosa al usuario en Telegram
            await send_telegram_message(
                chat_id,
                "¡Vinculación exitosa! Tu cuenta ha sido enlazada de forma segura a tu organización."
            )
            
            logger.info(f"[TELEGRAM] Chat {chat_id} vinculado con éxito a tenant {tenant_id} y user {user_id}")
            return {"status": "linked_successfully"}
            
        except Exception as e:
            logger.error(f"[TELEGRAM] Error al realizar inserción de sesión: {e}")
            await send_telegram_message(
                chat_id,
                "Ocurrió un error interno al intentar vincular tu cuenta con la base de datos."
            )
            return {"status": "db_error", "detail": str(e)}

    # --- PROCESAMIENTO DE COMANDOS REGULARES ---
    try:
        # 1. Consultar si existe una sesión vinculada para el chat_id
        session_row = await conn.fetchrow(
            """
            SELECT id, user_id, tenant_id 
            FROM public.telegram_sessions 
            WHERE telegram_chat_id = $1
            """,
            chat_id
        )

        # 2. Si no está vinculada, responder solicitando la vinculación
        if not session_row:
            response_msg = (
                "Tu cuenta no está vinculada. Por favor, genera un código "
                "de vinculación en la plataforma web de KODA y envíalo aquí "
                "con el formato: /start [CÓDIGO]"
            )
            await send_telegram_message(chat_id, response_msg)
            return {"status": "not_linked"}

        user_id = session_row["user_id"]
        tenant_id = session_row["tenant_id"]

        # 3. Inyectar el tenant_id y user_id en el contexto de sesión de la DB.
        # Esto activará las políticas RLS de PostgreSQL para las consultas subsiguientes.
        await conn.execute(
            "SELECT set_config('app.current_tenant', $1, true)", 
            str(tenant_id)
        )
        await conn.execute(
            "SELECT set_config('app.current_tenant_id', $1, true)", 
            str(tenant_id)
        )
        if user_id:
            await conn.execute(
                "SELECT set_config('app.current_user_id', $1, true)", 
                str(user_id)
            )

        # 3.1 Comandos de negocio propios del bot (/venta, /stock, /comprar), evaluados
        #     antes que el catálogo genérico de bot_commands.
        primer_token = command_text.split()[0].strip() if command_text.split() else ""
        norm_token = _normalize_command_trigger(primer_token)

        if norm_token == "/venta":
            return await _handle_venta_command(command_text, chat_id, session_row, conn)

        if norm_token == "/stock":
            return await _handle_stock_command(command_text, chat_id, session_row)

        if norm_token == "/comprar":
            return await _handle_comprar_command(command_text, chat_id, session_row, conn)

        # 4. Buscar si el comando coincide con algún trigger_command personalizado del tenant.
        # Buscamos en la BD tolerando diferencias de mayúsculas y acentos
        cmd_rows = await conn.fetch(
            """
            SELECT trigger_command, response_text, internal_action
            FROM public.bot_commands
            WHERE (tenant_id = $1::uuid OR tenant_id IS NULL)
              AND is_active = TRUE
            """,
            uuid.UUID(str(tenant_id))
        )
        cmd_row = None
        for r in cmd_rows:
            db_trig = (r["trigger_command"] or "").strip()
            if db_trig.lower() == primer_token.lower() or _normalize_command_trigger(db_trig) == norm_token:
                cmd_row = dict(r)
                break

        # 5. Si no está registrado en la BD para el tenant, consultar catálogo base del sistema (fallback)
        if not cmd_row:
            for b_cmd, b_meta in _BUILTIN_COMMANDS_FALLBACK.items():
                if b_cmd == primer_token.lower() or _normalize_command_trigger(b_cmd) == norm_token:
                    cmd_row = {
                        "response_text": b_meta["text"],
                        "internal_action": b_meta["action"]
                    }
                    break

        # 6. Responder a Telegram con el resultado correspondiente
        if cmd_row:
            reply_text = cmd_row["response_text"]
            action = cmd_row.get("internal_action")
            if action:
                handler = _DYNAMIC_COMMAND_HANDLERS.get(action)
                if handler:
                    try:
                        reply_text = await handler(conn, tenant_id)
                    except Exception as dyn_err:
                        logger.error(
                            f"[TELEGRAM] Error en despachador dinámico "
                            f"'{action}' para {command_text}: {dyn_err}"
                        )
                        # Si falla la consulta dinámica, cae de vuelta al texto
                        # estático guardado en vez de dejar al usuario sin respuesta.
            await send_telegram_message(chat_id, reply_text)
            return {"status": "success", "response": reply_text}
        else:
            # Comando no coincide o no existe para el tenant
            reply_text = f"El comando '{command_text}' no está registrado o no se encuentra activo para tu organización."
            await send_telegram_message(chat_id, reply_text)
            return {"status": "command_not_found"}

    except Exception as e:
        logger.error(f"[TELEGRAM] Error procesando el webhook de Telegram: {e}")
        # Retornamos 200 para que Telegram no reintente indefinidamente el webhook en caso de error
        return {"status": "error", "detail": str(e)}


# =============================================================================
# ENDPOINTS CRUD PARA GESTIÓN DE COMANDOS DEL BOT
# =============================================================================

class BotCommandCreate(BaseModel):
    trigger_command: str
    response_text: str
    internal_action: Optional[str] = None
    is_active: bool = True
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None

@router.get("/telegram/commands")
async def list_bot_commands(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    conn = Depends(get_db_connection)
):
    service_key = request.headers.get("X-Telegram-Link-Key", "")
    tenant_id = None
    if (
        service_key
        and TELEGRAM_LINK_INTERNAL_API_KEY
        and hmac.compare_digest(service_key, TELEGRAM_LINK_INTERNAL_API_KEY)
    ):
        tenant_id = request.headers.get("X-Tenant-Id")
        if not tenant_id:
            raise HTTPException(status_code=400, detail="Falta header X-Tenant-Id en llamada de servicio.")
    else:
        current_user = await get_current_user(request, bearer_token)
        tenant_id = current_user.get("tenant_id")

    if not tenant_id:
        raise HTTPException(status_code=400, detail="Falta tenant_id en la sesión.")
        
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.current_tenant', $1, true)", str(tenant_id))
        
        rows = await conn.fetch(
            """
            SELECT id, trigger_command, response_text, internal_action, is_active
            FROM public.bot_commands
            WHERE tenant_id = $1::uuid
            ORDER BY trigger_command ASC
            """,
            uuid.UUID(tenant_id)
        )
    
    return [dict(r) for r in rows]

@router.post("/telegram/commands")
async def create_bot_command(
    request: Request,
    payload: BotCommandCreate,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    conn = Depends(get_db_connection)
):
    service_key = request.headers.get("X-Telegram-Link-Key", "")
    tenant_id = None
    user_id = None
    if (
        service_key
        and TELEGRAM_LINK_INTERNAL_API_KEY
        and hmac.compare_digest(service_key, TELEGRAM_LINK_INTERNAL_API_KEY)
    ):
        tenant_id = payload.tenant_id or request.headers.get("X-Tenant-Id")
        user_id = payload.user_id or str(uuid.uuid4())
    else:
        current_user = await get_current_user(request, bearer_token)
        role = current_user.get("role")
        if role not in ("Administrador", "Administrator", "CEO", "Desarrollador", "Administrative Master"):
            raise HTTPException(status_code=403, detail="No tienes permisos para crear comandos.")
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")

    if not tenant_id or not user_id:
        raise HTTPException(status_code=400, detail="Falta información de sesión.")
        
    trigger_command = payload.trigger_command.strip()
    if not trigger_command.startswith("/"):
        raise HTTPException(status_code=400, detail="El comando de activación debe comenzar con '/'.")
        
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.current_tenant', $1, true)", str(tenant_id))
        await conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(user_id))
        
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO public.bot_commands (tenant_id, trigger_command, response_text, internal_action, is_active)
                VALUES ($1::uuid, $2, $3, $4, $5)
                ON CONFLICT (tenant_id, trigger_command)
                DO UPDATE SET response_text = EXCLUDED.response_text, internal_action = EXCLUDED.internal_action, is_active = EXCLUDED.is_active
                RETURNING id, trigger_command, response_text, internal_action, is_active
                """,
                uuid.UUID(tenant_id),
                trigger_command,
                payload.response_text.strip(),
                payload.internal_action.strip() if payload.internal_action else None,
                payload.is_active
            )
            return dict(row)
        except Exception as e:
            logger.error(f"[TELEGRAM] Error al guardar comando: {e}")
            raise HTTPException(status_code=500, detail=f"Error al guardar el comando: {e}")

@router.delete("/telegram/commands/{command_identifier}")
async def delete_bot_command(
    command_identifier: str,
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    conn = Depends(get_db_connection)
):
    service_key = request.headers.get("X-Telegram-Link-Key", "")
    tenant_id = None
    user_id = None
    if (
        service_key
        and TELEGRAM_LINK_INTERNAL_API_KEY
        and hmac.compare_digest(service_key, TELEGRAM_LINK_INTERNAL_API_KEY)
    ):
        tenant_id = request.headers.get("X-Tenant-Id")
        user_id = str(uuid.uuid4())
    else:
        current_user = await get_current_user(request, bearer_token)
        role = current_user.get("role")
        if role not in ("Administrador", "Administrator", "CEO", "Desarrollador", "Administrative Master"):
            raise HTTPException(status_code=403, detail="No tienes permisos para eliminar comandos.")
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")

    if not tenant_id or not user_id:
        raise HTTPException(status_code=400, detail="Falta información de sesión.")
        
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.current_tenant', $1, true)", str(tenant_id))
        await conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(user_id))
        
        # Permitir eliminar por UUID o por trigger_command (ej. /horario o /info)
        is_uuid = False
        try:
            cmd_uuid = uuid.UUID(command_identifier)
            is_uuid = True
        except ValueError:
            is_uuid = False

        if is_uuid:
            result = await conn.execute(
                """
                DELETE FROM public.bot_commands
                WHERE id = $1::uuid AND tenant_id = $2::uuid
                """,
                cmd_uuid,
                uuid.UUID(tenant_id)
            )
        else:
            result = await conn.execute(
                """
                DELETE FROM public.bot_commands
                WHERE trigger_command = $1 AND tenant_id = $2::uuid
                """,
                command_identifier,
                uuid.UUID(tenant_id)
            )
        
        if "DELETE 0" in result:
            raise HTTPException(status_code=404, detail="Comando no encontrado o no pertenece a tu organización.")
            
    return {"status": "deleted", "id": command_identifier}
