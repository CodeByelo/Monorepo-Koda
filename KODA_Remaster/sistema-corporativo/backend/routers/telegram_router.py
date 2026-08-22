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
from services.bot_api_client import get_stock as bot_get_stock, registrar_venta, BotApiError

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
    Verifica si el usuario vinculado a la sesión de Telegram tiene un perfil de
    Vendedor activo asociado (vendedores.user_id -> profiles.id).

    Esta tabla `vendedores` ya existe EN ESTE MISMO backend (ver
    routers/vendedores_router.py — GET /vendedores/me usa exactamente este
    vínculo), así que la verificación se hace con una consulta SQL local: NO
    hace falta llamar a koda-frontend/backend para saber si alguien es
    vendedor.
    """
    try:
        row = await conn.fetchrow(
            """
            SELECT id, nombre, porcentaje_comision
            FROM vendedores
            WHERE user_id = $1::uuid
              AND (tenant_id = $2::uuid OR tenant_id IS NULL)
              AND activo = true
            """,
            uuid.UUID(user_id), uuid.UUID(tenant_id)
        )
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[TELEGRAM] Error verificando perfil de vendedor: {e}")
        return None


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
            "❌ Tu cuenta no tiene un perfil de Vendedor activo asociado. "
            "El comando /venta solo está disponible para vendedores registrados. "
            "Contacta a un administrador si crees que esto es un error."
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
    await send_telegram_message(chat_id, msg)
    return {"status": "success"}


async def _handle_callback_query(callback_query: TelegramCallbackQuery) -> dict:
    """Procesa la respuesta del usuario a los botones inline Confirmar/Cancelar de /venta."""
    data = callback_query.data or ""
    chat_id = callback_query.message.chat.id if callback_query.message else None

    if ":" not in data:
        await answer_telegram_callback(callback_query.id)
        return {"status": "ignored", "detail": "malformed callback data"}

    action, token = data.split(":", 1)
    if action not in ("confirmar_venta", "cancelar_venta"):
        await answer_telegram_callback(callback_query.id)
        return {"status": "ignored", "detail": "unknown action"}

    pending = await _get_pending_venta(token)
    if not pending:
        await answer_telegram_callback(callback_query.id, "Esta operación ya expiró.")
        if chat_id:
            await send_telegram_message(
                chat_id,
                "⏱️ Esta confirmación expiró o ya fue procesada. Vuelve a iniciar la venta con /venta."
            )
        return {"status": "expired_or_missing"}

    # Se borra inmediatamente para que el botón no pueda re-ejecutarse dos veces (doble tap).
    await _delete_pending_venta(token)
    await answer_telegram_callback(callback_query.id)

    target_chat_id = pending.get("chat_id", chat_id)

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
            # metodo_pago/moneda_documento no se capturan en el comando /venta
            # (solo <sku> <cantidad> [rif_cliente] por especificación); se usan
            # valores por defecto razonables. Ver reporte para el detalle de
            # esta decisión de diseño.
            metodo_pago="EFECTIVO",
            moneda_documento="USD",
        )
    except BotApiError as e:
        await send_telegram_message(target_chat_id, f"❌ No se pudo registrar la venta: {e}")
        return {"status": "venta_failed", "detail": str(e)}

    numero_factura = result.get("numero_factura", result.get("invoice_number", "N/D"))
    total = result.get("total", result.get("monto_total", "N/D"))
    comision = result.get("comision", result.get("commission", "N/D"))
    msg = (
        "✅ Venta registrada exitosamente.\n\n"
        f"Factura: {numero_factura}\n"
        f"Total: {total}\n"
        f"Comisión: {comision}"
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
        return await _handle_callback_query(update.callback_query)

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

        tenant_id = session_row["tenant_id"]

        # 3. Inyectar el tenant_id en el contexto de sesión de la DB.
        # Esto activará las políticas RLS de PostgreSQL para las consultas subsiguientes.
        await conn.execute(
            "SELECT set_config('app.current_tenant', $1, true)", 
            str(tenant_id)
        )
        
        # Opcionalmente simulamos el rol de Administrador para RLS si es necesario para CRUD.
        # Dado que el bot ejecuta lecturas de consultas en nombre del tenant, 'app.current_tenant' es suficiente.
        # Sin embargo, si quisiéramos simular el rol de Administrator:
        # await conn.execute("SELECT set_config('app.current_user_role', 'Administrator', true)")

        # 3.1 Comandos de negocio propios del bot (/venta y /stock), evaluados
        #     antes que el catálogo genérico de bot_commands.
        if command_text.startswith("/venta"):
            return await _handle_venta_command(command_text, chat_id, session_row, conn)

        if command_text.startswith("/stock"):
            return await _handle_stock_command(command_text, chat_id, session_row)

        # 4. Buscar si el comando coincide con algún trigger_command del tenant.
        # Gracias a RLS, PostgreSQL filtrará automáticamente para buscar solo en el tenant correspondiente.
        cmd_row = await conn.fetchrow(
            """
            SELECT response_text 
            FROM public.bot_commands 
            WHERE trigger_command = $1 AND is_active = TRUE
            """,
            command_text
        )

        # 5. Responder a Telegram con el resultado correspondiente
        if cmd_row:
            reply_text = cmd_row["response_text"]
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
