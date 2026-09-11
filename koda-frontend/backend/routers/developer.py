from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from backend.core.database import get_db
from backend.services.auth import get_current_user
from backend.models.erp_extended import Empresa, AuditoriaLog, NotificacionSistema

router = APIRouter(
    prefix="/developer",
    tags=["Developer SaaS"]
)

# --- Pydantic Schemas ---
class EmpresaResponse(BaseModel):
    id: int
    rif: str
    razon_social: str
    nombre_comercial: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    tipo_contribuyente: str
    estado_suscripcion: str
    limite_usuarios: int
    modulos_activos: Optional[str] = None
    tenant_id: Optional[UUID] = None

    class Config:
        from_attributes = True

class EmpresaUpdate(BaseModel):
    estado_suscripcion: str
    limite_usuarios: int
    modulos_activos: str

class AuditoriaLogResponse(BaseModel):
    id: int
    usuario: str
    accion: str
    modulo: str
    detalle: Optional[str] = None
    ip: Optional[str] = None
    fecha: datetime
    tenant_id: Optional[UUID] = None

    class Config:
        from_attributes = True

class NotificacionSistemaCreate(BaseModel):
    titulo: str
    mensaje: str
    activa: bool = True

class NotificacionSistemaUpdate(BaseModel):
    titulo: Optional[str] = None
    mensaje: Optional[str] = None
    activa: Optional[bool] = None

class NotificacionSistemaResponse(BaseModel):
    id: int
    titulo: str
    mensaje: str
    activa: bool
    creado_por: Optional[UUID] = None
    creado_en: datetime

    class Config:
        from_attributes = True

# --- Middlewares o validadores de rol específicos para Desarrollador ---
def require_developer_role(current_user = Depends(get_current_user)):
    role = getattr(current_user, "rol", getattr(current_user, "role", ""))
    if str(role).strip().lower() not in ["desarrollador", "dev", "developer"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permisos insuficientes. Se requiere rol de Desarrollador."
        )
    return current_user

# --- Endpoints ---

@router.get("/empresas", response_model=List[EmpresaResponse])
def get_all_empresas(
    db: Session = Depends(get_db),
    dev_user: dict = Depends(require_developer_role)
):
    # Saltamos el filtro de tenant y buscamos en la tabla directamente
    empresas = db.query(Empresa).all()
    return empresas

@router.put("/empresas/{empresa_id}", response_model=EmpresaResponse)
def update_empresa_saas(
    empresa_id: int,
    empresa_data: EmpresaUpdate,
    db: Session = Depends(get_db),
    dev_user: dict = Depends(require_developer_role)
):
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.estado_suscripcion = empresa_data.estado_suscripcion
    empresa.limite_usuarios = empresa_data.limite_usuarios
    empresa.modulos_activos = empresa_data.modulos_activos

    db.commit()
    db.refresh(empresa)
    return empresa

@router.get("/auditoria-global", response_model=List[AuditoriaLogResponse])
def get_global_audit_logs(
    db: Session = Depends(get_db),
    dev_user: dict = Depends(require_developer_role),
    limit: int = 100
):
    logs = db.query(AuditoriaLog).order_by(AuditoriaLog.fecha.desc()).limit(limit).all()
    return logs

# ==========================================
# NOTIFICACIONES GLOBALES DEL SISTEMA (DEV)
# ==========================================

@router.post("/notificaciones", response_model=NotificacionSistemaResponse, status_code=status.HTTP_201_CREATED)
def create_global_notification(
    data: NotificacionSistemaCreate,
    db: Session = Depends(get_db),
    dev_user = Depends(require_developer_role)
):
    """
    Crea una notificación global del sistema (activa=True por defecto).
    Visible para todas las cuentas de todos los tenants.
    """
    user_id = getattr(dev_user, "id", None)
    notif = NotificacionSistema(
        titulo=data.titulo.strip(),
        mensaje=data.mensaje.strip(),
        activa=data.activa,
        creado_por=user_id
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif

@router.get("/notificaciones", response_model=List[NotificacionSistemaResponse])
def list_global_notifications(
    db: Session = Depends(get_db),
    dev_user = Depends(require_developer_role)
):
    """
    Lista todas las notificaciones globales ordenadas por fecha reciente
    para monitoreo y control del desarrollador.
    """
    return db.query(NotificacionSistema).order_by(NotificacionSistema.creado_en.desc()).all()

@router.patch("/notificaciones/{id}", response_model=NotificacionSistemaResponse)
def toggle_global_notification(
    id: int,
    data: NotificacionSistemaUpdate,
    db: Session = Depends(get_db),
    dev_user = Depends(require_developer_role)
):
    """
    Activa o desactiva una notificación del sistema existente, o actualiza su contenido.
    """
    notif = db.query(NotificacionSistema).filter(NotificacionSistema.id == id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    if data.activa is not None:
        notif.activa = data.activa
    if data.titulo is not None:
        notif.titulo = data.titulo.strip()
    if data.mensaje is not None:
        notif.mensaje = data.mensaje.strip()

    db.commit()
    db.refresh(notif)
    return notif

