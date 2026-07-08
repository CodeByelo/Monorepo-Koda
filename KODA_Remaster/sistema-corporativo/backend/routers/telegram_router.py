import os
import uuid
import logging
import secrets
import string
import json
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user
from redis.asyncio import Redis

# Inicializar cliente Redis para almacenamiento temporal
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379").strip()
redis_client = Redis.from_url(REDIS_URL) if REDIS_URL else None

def generate_linking_code() -> str:
    chars = string.ascii_uppercase + string.digits
    code = ''.join(secrets.choice(chars) for _ in range(6))
    return f"KODA-{code}"

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/webhook", tags=["telegram"])

# Token del bot de Telegram obtenido desde las variables de entorno
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# =============================================================================
# MODELOS PYDANTIC PARA PAYLOAD DEL WEBHOOK DE TELEGRAM
# =============================================================================
class TelegramChat(BaseModel):
    id: int

class TelegramMessage(BaseModel):
    message_id: int
    chat: TelegramChat
    text: Optional[str] = None

class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[TelegramMessage] = None

# =============================================================================
# FUNCIÓN AUXILIAR PARA ENVIAR MENSAJES A TELEGRAM
# =============================================================================
async def send_telegram_message(chat_id: int, text: str) -> None:
    if not TELEGRAM_BOT_TOKEN:
        logger.warning(
            f"[TELEGRAM] TELEGRAM_BOT_TOKEN no está configurado. "
            f"Mensaje simulado para chat {chat_id}: {text}"
        )
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json={"chat_id": chat_id, "text": text})
            response.raise_for_status()
            logger.info(f"[TELEGRAM] Mensaje enviado exitosamente al chat {chat_id}")
    except httpx.HTTPStatusError as e:
        logger.error(
            f"[TELEGRAM] Error de estado HTTP al enviar mensaje al chat {chat_id}: "
            f"{e.response.status_code} - {e.response.text}"
        )
    except Exception as e:
        logger.error(f"[TELEGRAM] Error inesperado al enviar mensaje a Telegram: {e}")

# =============================================================================
# ENDPOINT: POST /webhook/telegram
# =============================================================================
@router.post("/telegram/generate-token")
async def generate_telegram_token(
    current_user: dict = Depends(get_current_user)
):
    if not redis_client:
        raise HTTPException(
            status_code=500,
            detail="Servicio de caché (Redis) no disponible para generar token de vinculación."
        )
    
    user_id = current_user.get("sub")
    tenant_id = current_user.get("tenant_id")
    
    if not user_id or not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Información de sesión inválida: falta user_id o tenant_id."
        )
        
    code = generate_linking_code()
    redis_key = f"telegram:link_token:{code}"
    
    payload = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id)
    }
    
    try:
        # Guardar en Redis con expiración de 10 minutos (600 segundos)
        await redis_client.set(redis_key, json.dumps(payload), ex=600)
        logger.info(f"[TELEGRAM] Token de vinculación generado: {code} para user_id {user_id}")
    except Exception as e:
        logger.error(f"[TELEGRAM] Error guardando token de vinculación en Redis: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error al almacenar el código de vinculación temporal."
        )
        
    return {"code": code}

@router.post("/telegram")
async def telegram_webhook(
    update: TelegramUpdate,
    conn = Depends(get_db_connection)
):
    if not update.message:
        return {"status": "ignored", "detail": "No message in update"}

    chat_id = update.message.chat.id

    # Verificar si el chat_id corresponde a un Chofer de logística
    driver_row = await conn.fetchrow(
        "SELECT id, nombre FROM public.choferes WHERE telegram_chat_id = $1 AND activo = true",
        str(chat_id)
    )
    if driver_row:
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "http://facturacion-backend:8000/api/logistica/telegram-webhook",
                    json=update.dict(),
                    timeout=15.0
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
            
        token = parts[1].strip()
        redis_key = f"telegram:link_token:{token}"
        
        try:
            if not redis_client:
                raise Exception("Redis client is not configured")
            cached_data = await redis_client.get(redis_key)
        except Exception as e:
            logger.error(f"[TELEGRAM] Error de Redis al recuperar token: {e}")
            await send_telegram_message(
                chat_id,
                "Lo sentimos, el servicio de vinculación temporal no está disponible en este momento."
            )
            return {"status": "redis_error"}
            
        if not cached_data:
            await send_telegram_message(
                chat_id,
                "El código de vinculación provisto es inválido o ha expirado. "
                "Por favor, genera un nuevo código desde el panel web de KODA."
            )
            return {"status": "token_expired_or_invalid"}
            
        try:
            link_info = json.loads(cached_data)
            user_id = link_info.get("user_id")
            tenant_id = link_info.get("tenant_id")
            
            if not user_id or not tenant_id:
                raise ValueError("Cached link data is incomplete")
                
            # Establecer RLS context localmente dentro de una transacción antes de insertar/actualizar
            async with conn.transaction():
                await conn.execute(
                    "SELECT set_config('app.current_tenant', $1, true)",
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
            await redis_client.delete(redis_key)
            
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

@router.get("/telegram/commands")
async def list_bot_commands(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
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
    payload: BotCommandCreate,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
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

@router.delete("/telegram/commands/{command_id}")
async def delete_bot_command(
    command_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
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
        
        result = await conn.execute(
            """
            DELETE FROM public.bot_commands
            WHERE id = $1::uuid AND tenant_id = $2::uuid
            """,
            command_id,
            uuid.UUID(tenant_id)
        )
        
        if "DELETE 0" in result:
            raise HTTPException(status_code=404, detail="Comando no encontrado o no pertenece a tu organización.")
            
    return {"status": "deleted", "id": str(command_id)}
