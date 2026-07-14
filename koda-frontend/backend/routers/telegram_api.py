from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.core.security import get_current_user, require_role
from backend.models.core import Profile
from backend.models.erp_extended import TelegramCommand, AuditoriaLog
from pydantic import BaseModel
from typing import Optional, List
import random
import os
import redis
import time
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
@router.get("/commands", response_model=List[TelegramCommandResponse])
def list_commands(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Obtiene la lista de comandos dinámicos del bot de Telegram para el tenant activo."""
    # current_tenant_id_var has automatically been set by get_current_user if it's not a developer,
    # so the global SQLAlchemy filter applies. For developers/transversal we can query directly.
    return db.query(TelegramCommand).order_by(TelegramCommand.id).all()

@router.post("/commands", response_model=TelegramCommandResponse, status_code=status.HTTP_201_CREATED)
def create_command(request: Request, cmd_in: TelegramCommandCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Crea un nuevo comando dinámico asociado al tenant actual."""
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
    return new_cmd

@router.delete("/commands/{cmd_id}")
def delete_command(request: Request, cmd_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Elimina un comando dinámico de Telegram."""
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
    return {"ok": True, "message": f"Comando '{trigger}' eliminado exitosamente."}

@router.post("/generate-token")
def generate_linking_token(current_user: Profile = Depends(get_current_user)):
    """Genera un token temporal de 6 dígitos para vincular el chat de Telegram de este usuario."""
    code = f"KOD-{random.randint(100000, 999999)}"
    store_linking_token(code, str(current_user.id))
    return {"code": code}
