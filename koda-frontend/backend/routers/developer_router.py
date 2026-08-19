from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import uuid

from backend.core.database import get_db
from backend.models.core import Tenant, Profile
from backend.services.auth import get_current_user, role_required, redis_client, ALGORITHM, SECRET_KEY
from backend.services.websocket_manager import ws_manager

router = APIRouter(prefix="/developer", tags=["SaaS Developer Hub"])

# Esquemas
class TenantCreate(BaseModel):
    nombre_empresa: str

class TenantResponse(BaseModel):
    id: uuid.UUID
    nombre_empresa: str
    estado_licencia: str
    class Config:
        from_attributes = True

class SessionResponse(BaseModel):
    user_id: str
    status: str = "Online"

class KickRequest(BaseModel):
    reason: str = "Violación de políticas del sistema."

# ==========================================
# GESTIÓN DE TENANTS (SAAS B2B)
# ==========================================

@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def provision_tenant(
    tenant_in: TenantCreate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(role_required(["Desarrollador"]))
):
    """
    Aprovisiona una nueva empresa (Tenant).
    Solo accesible por Desarrollador (Super-Admin global).
    """
    new_tenant = Tenant(
        nombre_empresa=tenant_in.nombre_empresa,
        estado_licencia="ACTIVA"
    )
    db.add(new_tenant)
    db.commit()
    db.refresh(new_tenant)
    return new_tenant

@router.put("/tenants/{tenant_id}/license", response_model=TenantResponse)
def update_tenant_license(
    tenant_id: uuid.UUID,
    estado: str, # ACTIVA, SUSPENDIDA, EXPIRADA
    db: Session = Depends(get_db),
    current_user: Profile = Depends(role_required(["Desarrollador"]))
):
    """
    Actualiza el estado de la licencia de un Tenant.
    Si se suspende, se incluye en la Blacklist de Redis.
    """
    if estado not in ["ACTIVA", "SUSPENDIDA", "EXPIRADA"]:
        raise HTTPException(status_code=400, detail="Estado inválido.")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")

    tenant.estado_licencia = estado
    db.commit()
    db.refresh(tenant)

    # Lógica de Revocación Masiva (Redis Token Blacklist)
    if estado in ["SUSPENDIDA", "EXPIRADA"]:
        # Bloquear todas las futuras peticiones de este tenant (TTL 24h por defecto)
        redis_client.setex(f"blacklist:tenant:{tenant_id}", 86400, "revoked")
    else:
        # Remover de blacklist si se reactiva
        redis_client.delete(f"blacklist:tenant:{tenant_id}")

    return tenant


# ==========================================
# MONITOREO DE SESIONES (WEBSOCKETS & KICK)
# ==========================================

@router.get("/sessions", response_model=List[SessionResponse])
def list_active_sessions(current_user: Profile = Depends(role_required(["Desarrollador"]))):
    """
    Lista todos los user_ids que mantienen una conexión WebSocket abierta.
    """
    sessions = ws_manager.get_active_sessions()
    return [{"user_id": uid} for uid in sessions]

@router.post("/sessions/{user_id}/kick")
async def kick_user(
    user_id: str,
    kick_req: KickRequest,
    current_user: Profile = Depends(role_required(["Desarrollador"]))
):
    """
    1. Desconecta forzosamente al usuario del WebSocket (en vivo).
    2. Agrega su ID a la Blacklist de Redis para invalidar su JWT en API REST.
    """
    # 1. Expulsar del WebSocket
    kicked = await ws_manager.force_disconnect_user(user_id, kick_req.reason)

    # 2. Invalidar todos sus tokens activos en REST API mediante Redis
    # Lo bloqueamos por 24h (asumiendo que es el max TTL del token)
    redis_client.setex(f"blacklist:user:{user_id}", 86400, "kicked")

    return {
        "status": "success",
        "message": f"Usuario {user_id} ha sido bloqueado en Redis y expulsado del WebSocket.",
        "websocket_disconnected": kicked
    }

# ==========================================
# WEBSOCKET ENDPOINT (PARA CLIENTES)
# ==========================================

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    Endpoint al que se conectan los clientes (frontend) tras hacer login.
    """
    await websocket.accept()
    try:
        import jwt
        # Validamos token rápido antes de aceptar
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        # Verificar Blacklist inicial
        if redis_client.exists(f"blacklist:user:{user_id}"):
            await websocket.close(code=1008)
            return

        await ws_manager.connect(websocket, user_id)

        try:
            while True:
                # Mantener conexión viva (ping/pong u otros mensajes)
                data = await websocket.receive_text()
        except WebSocketDisconnect:
            await ws_manager.disconnect(user_id)

    except Exception as e:
        print(f"Error in websocket_endpoint: {e}")
        try:
            await websocket.close(code=1008)
        except:
            pass
