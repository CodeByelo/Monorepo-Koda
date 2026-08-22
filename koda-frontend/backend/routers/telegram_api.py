from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.core.security import get_current_user, require_role
from backend.models.core import Profile
from backend.models.erp_extended import TelegramCommand, AuditoriaLog
from pydantic import BaseModel
from typing import Optional, List
import os
import redis
import time
import httpx
from backend.utils.ip_utils import get_real_ip_str

router = APIRouter(prefix="/webhook/telegram", tags=["Telegram Integration"])

# Schema definitions
class TelegramCommandCreate(BaseModel):
    trigger_command: str
    response_text: str
    internal_action: Optional[str] = None
    is_active: bool = True

class TelegramCommandResponse(BaseModel):
    id: int
    trigger_command: str
    response_text: str
    internal_action: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True

# Redis Connection setup
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

# Fallback tokens dict
local_tokens = {}

# --- Vinculación REAL de Telegram (server-to-server hacia KODA_Remaster) ---
# El código KODA-XXXXXX que el bot valida realmente vive SOLO en
# KODA_Remaster/sistema-corporativo/backend/routers/telegram_router.py
# (_TELEGRAM_LINK_TOKENS/Redis, poblado por generate_telegram_token). Este
# backend (el ERP) ya NO genera un código propio: en vez de eso pide el
# código real a ESE backend, server-to-server, reutilizando el mismo patrón
# (header de clave compartida + httpx) que
# KODA_Remaster/.../services/bot_api_client.py, en la dirección inversa
# (aquí el ERP es el emisor, KODA_Remaster el receptor).
#
# KODA_REMASTER_API_URL ya existe en este backend (ver
# services/org_sync_client.py, sincronización de nombre de organización):
# se reutiliza la misma variable, apuntando al mismo backend institucional.
#
# TELEGRAM_LINK_INTERNAL_API_KEY es un secreto PROPIO (no BOT_INTERNAL_API_KEY):
# BOT_INTERNAL_API_KEY está reservado, a propósito, para la dirección inversa
# (KODA_Remaster como emisor hacia /bot/* de este backend, ver
# services/bot_api_client.py y routers/bot_api.py). Reutilizarlo aquí
# rompería ese límite de confianza direccional ya documentado en este mismo
# backend (ver ORG_SYNC_API_KEY/SSO_BRIDGE_INTERNAL_KEY: "una capacidad de
# servicio = una clave propia").
KODA_REMASTER_API_URL = os.getenv("KODA_REMASTER_API_URL", "").strip().rstrip("/")
TELEGRAM_LINK_INTERNAL_API_KEY = os.getenv("TELEGRAM_LINK_INTERNAL_API_KEY", "").strip()


class TelegramLinkError(Exception):
    """Error controlado al comunicarse con KODA_Remaster/sistema-corporativo/backend
    para pedir el código real de vinculación de Telegram."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


async def _request_real_linking_token(tenant_id: str, user_id: str) -> str:
    """
    POST {KODA_REMASTER_API_URL}/webhook/telegram/generate-token

    Pide, server-to-server, el código real KODA-XXXXXX al backend
    institucional — la única fuente de verdad que el bot de Telegram real
    valida (ver telegram_router.py::_TELEGRAM_LINK_TOKENS/Redis). Lanza
    TelegramLinkError ante cualquier problema (config faltante, red, timeout,
    respuesta >= 400) para que el llamador decida cómo traducirlo a un
    mensaje de usuario claro; nunca deja pasar un código que de todos modos
    no funcionaría.
    """
    if not KODA_REMASTER_API_URL:
        raise TelegramLinkError(
            "KODA_REMASTER_API_URL no está configurada en este backend (ver .env.template)."
        )
    if not TELEGRAM_LINK_INTERNAL_API_KEY:
        raise TelegramLinkError(
            "TELEGRAM_LINK_INTERNAL_API_KEY no está configurada en este backend (ver .env.template)."
        )

    url = f"{KODA_REMASTER_API_URL}/webhook/telegram/generate-token"
    headers = {"X-Telegram-Link-Key": TELEGRAM_LINK_INTERNAL_API_KEY}
    payload = {"tenant_id": tenant_id, "user_id": user_id}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise TelegramLinkError(
            f"No se pudo contactar al sistema institucional (KODA_Remaster): {e}"
        )

    if response.status_code >= 400:
        detail = response.text
        try:
            body = response.json()
            detail = body.get("detail", detail)
        except Exception:
            pass
        raise TelegramLinkError(str(detail), status_code=response.status_code)

    try:
        data = response.json()
    except Exception:
        raise TelegramLinkError(
            "Respuesta inválida del sistema institucional al generar el código de vinculación."
        )

    code = data.get("code")
    if not code:
        raise TelegramLinkError(
            "El sistema institucional no devolvió un código de vinculación válido."
        )
    return code


async def _verify_real_linking_token(code: str) -> Optional[dict]:
    """
    POST {KODA_REMASTER_API_URL}/webhook/telegram/verify-token

    Valida y consume, server-to-server, el código KODA-XXXXXX contra el
    backend institucional (_TELEGRAM_LINK_TOKENS / Redis).
    Devuelve dict con {"user_id": str, "tenant_id": str} o None si no es válido.
    """
    if not KODA_REMASTER_API_URL or not TELEGRAM_LINK_INTERNAL_API_KEY:
        return None

    url = f"{KODA_REMASTER_API_URL}/webhook/telegram/verify-token"
    headers = {"X-Telegram-Link-Key": TELEGRAM_LINK_INTERNAL_API_KEY}
    payload = {"code": code.strip()}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            if res.status_code == 200:
                return res.json()
    except Exception as e:
        print(f"[TELEGRAM_VERIFY] Error al verificar token server-to-server: {e}")
    return None


# NO USAR — código muerto, ver telegram_router.py del backend institucional
# (KODA_Remaster/sistema-corporativo/backend, función generate_telegram_token)
# que es la única fuente de verdad real validada por el bot. Este código
# local (formato KOD-XXXXXX) nunca llegaba a _TELEGRAM_LINK_TOKENS/Redis del
# otro backend, por eso la vinculación nunca funcionaba. Se deja la función y
# su almacenamiento (local_tokens / Redis "telegram_link:*") sin borrar,
# marcados en desuso: generate_linking_token ya NO la invoca.
def store_linking_token(code: str, user_id: str):
    if redis_client:
        try:
            redis_client.setex(f"telegram_link:{code}", 600, user_id)
            return
        except Exception:
            pass
    local_tokens[code] = (user_id, time.time() + 600)

def get_linking_token(code: str) -> Optional[str]:
    if redis_client:
        try:
            val = redis_client.get(f"telegram_link:{code}")
            if val:
                return val
        except Exception:
            pass
    if code in local_tokens:
        user_id, expire = local_tokens[code]
        if time.time() < expire:
            return user_id
        else:
            del local_tokens[code]
    return None

# Endpoints
# Helper server-to-server para sincronizar comandos hacia KODA_Remaster (bot_commands)
async def _sync_command_to_remaster(method: str, endpoint: str, tenant_id: str, payload: Optional[dict] = None) -> Optional[dict]:
    if not KODA_REMASTER_API_URL or not TELEGRAM_LINK_INTERNAL_API_KEY:
        return None
    url = f"{KODA_REMASTER_API_URL}/webhook/telegram{endpoint}"
    headers = {
        "X-Telegram-Link-Key": TELEGRAM_LINK_INTERNAL_API_KEY,
        "X-Tenant-Id": str(tenant_id)
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if method == "GET":
                res = await client.get(url, headers=headers)
            elif method == "POST":
                res = await client.post(url, json=payload, headers=headers)
            elif method == "DELETE":
                res = await client.delete(url, headers=headers)
            else:
                return None
            if res.status_code < 400:
                try:
                    return res.json()
                except Exception:
                    return {}
    except Exception as e:
        print(f"[TELEGRAM_SYNC] Fallo de sincronización con KODA_Remaster ({method} {endpoint}): {e}")
    return None

# Endpoints
@router.get("/commands", response_model=List[TelegramCommandResponse])
def list_commands(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Obtiene la lista de comandos dinámicos del bot de Telegram para el tenant activo."""
    return db.query(TelegramCommand).order_by(TelegramCommand.id).all()

@router.post("/commands", response_model=TelegramCommandResponse, status_code=status.HTTP_201_CREATED)
async def create_command(request: Request, cmd_in: TelegramCommandCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Crea un nuevo comando dinámico y lo sincroniza con KODA_Remaster (public.bot_commands)."""
    # Ensure command starts with /
    trigger = cmd_in.trigger_command.strip()
    if not trigger.startswith("/"):
        raise HTTPException(status_code=400, detail="El comando debe iniciar con '/'")

    # Check duplicate trigger for tenant
    duplicate = db.query(TelegramCommand).filter(TelegramCommand.trigger_command == trigger).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="El comando ya está registrado en este tenant")

    new_cmd = TelegramCommand(
        trigger_command=trigger,
        response_text=cmd_in.response_text.strip(),
        internal_action=cmd_in.internal_action.strip() if cmd_in.internal_action else None,
        is_active=cmd_in.is_active,
        tenant_id=current_user.tenant_id
    )
    db.add(new_cmd)

    real_ip = get_real_ip_str(request)
    db.add(AuditoriaLog(
        tenant_id=current_user.tenant_id,
        usuario=current_user.email,
        accion="CREACION_COMANDO_TELEGRAM",
        modulo="Telegram",
        detalle=f"Se creó el comando de Telegram: {trigger}",
        ip=real_ip
    ))

    db.commit()
    db.refresh(new_cmd)

    # Sincronizar server-to-server hacia KODA_Remaster (fuente de verdad del webhook del bot)
    await _sync_command_to_remaster(
        method="POST",
        endpoint="/commands",
        tenant_id=str(current_user.tenant_id),
        payload={
            "trigger_command": trigger,
            "response_text": cmd_in.response_text.strip(),
            "internal_action": cmd_in.internal_action.strip() if cmd_in.internal_action else None,
            "is_active": cmd_in.is_active,
            "tenant_id": str(current_user.tenant_id),
            "user_id": str(current_user.id)
        }
    )

    return new_cmd

@router.delete("/commands/{cmd_id}")
async def delete_command(request: Request, cmd_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Elimina un comando dinámico de Telegram y lo remueve en KODA_Remaster."""
    cmd = db.query(TelegramCommand).filter(TelegramCommand.id == cmd_id).first()
    if not cmd:
        raise HTTPException(status_code=404, detail="Comando no encontrado")
    
    trigger = cmd.trigger_command
    db.delete(cmd)

    real_ip = get_real_ip_str(request)
    db.add(AuditoriaLog(
        tenant_id=current_user.tenant_id,
        usuario=current_user.email,
        accion="ELIMINACION_COMANDO_TELEGRAM",
        modulo="Telegram",
        detalle=f"Se eliminó el comando de Telegram: {trigger}",
        ip=real_ip
    ))

    db.commit()

    # Sincronizar eliminación hacia KODA_Remaster por trigger_command
    await _sync_command_to_remaster(
        method="DELETE",
        endpoint=f"/commands/{trigger}",
        tenant_id=str(current_user.tenant_id)
    )

    return {"ok": True, "message": f"Comando '{trigger}' eliminado exitosamente."}

@router.post("/generate-token")
async def generate_linking_token(current_user: Profile = Depends(get_current_user)):
    """
    Pide, server-to-server, el token REAL de vinculación de Telegram
    (formato KODA-XXXXXX) a KODA_Remaster/sistema-corporativo/backend — la
    única fuente de verdad que el bot real valida — en nombre del
    tenant_id/user_id ya autenticados en este ERP. Ya NO genera un código
    local (ver store_linking_token más arriba, marcada en desuso): ese
    código nunca era validado por el bot real y por eso la vinculación nunca
    funcionaba.
    """
    try:
        code = await _request_real_linking_token(
            tenant_id=str(current_user.tenant_id),
            user_id=str(current_user.id),
        )
    except TelegramLinkError as e:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
                if e.status_code is not None
                else status.HTTP_504_GATEWAY_TIMEOUT
            ),
            detail="No se pudo generar el código de vinculación de Telegram. Intenta de nuevo en unos segundos.",
        )
    return {"code": code}
