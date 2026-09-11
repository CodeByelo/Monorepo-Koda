from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta

from backend.core.database import get_db
from backend.services.auth import get_current_user
from backend.models.erp_extended import NotificacionSistema, NotificacionSistemaLectura

router = APIRouter(
    prefix="/notificaciones-sistema",
    tags=["Notificaciones Globales del Sistema"]
)

# --- Pydantic Schemas ---
class NotificacionSistemaItem(BaseModel):
    id: int
    titulo: str
    mensaje: str
    activa: bool
    creado_por: Optional[UUID] = None
    creado_en: datetime

    class Config:
        from_attributes = True

class NotificacionSistemaHistorialItem(NotificacionSistemaItem):
    leida: bool

class MarcarLeidaResponse(BaseModel):
    ok: bool
    notificacion_id: int
    mensaje: str


@router.get("/mis-pendientes", response_model=List[NotificacionSistemaItem])
def get_mis_notificaciones_pendientes(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Devuelve las notificaciones activas que el usuario actual (por su usuario_id,
    sin filtrar por tenant) todavía NO tiene registradas en NotificacionSistemaLectura.
    Alimenta tanto el popup modal como el badge de la campana.
    """
    user_id = getattr(current_user, "id", None)
    if not user_id:
        return []

    # Subquery de IDs leídos por este usuario
    subquery_leidas = (
        db.query(NotificacionSistemaLectura.notificacion_id)
        .filter(NotificacionSistemaLectura.usuario_id == user_id)
    )

    pendientes = (
        db.query(NotificacionSistema)
        .filter(
            NotificacionSistema.activa == True,
            NotificacionSistema.id.notin_(subquery_leidas)
        )
        .order_by(NotificacionSistema.creado_en.desc())
        .all()
    )
    return pendientes


@router.get("/historial", response_model=List[NotificacionSistemaHistorialItem])
def get_historial_notificaciones(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Todas las notificaciones activas de los últimos 90 días, con un
    campo `leida: bool` según si el usuario actual ya tiene lectura registrada.
    Alimenta el dropdown de la campana.
    """
    user_id = getattr(current_user, "id", None)
    if not user_id:
        return []

    limite_90_dias = datetime.now(timezone.utc) - timedelta(days=90)

    notificaciones = (
        db.query(NotificacionSistema)
        .filter(
            NotificacionSistema.activa == True,
            NotificacionSistema.creado_en >= limite_90_dias
        )
        .order_by(NotificacionSistema.creado_en.desc())
        .all()
    )

    if not notificaciones:
        return []

    notif_ids = [n.id for n in notificaciones]
    lecturas = (
        db.query(NotificacionSistemaLectura.notificacion_id)
        .filter(
            NotificacionSistemaLectura.usuario_id == user_id,
            NotificacionSistemaLectura.notificacion_id.in_(notif_ids)
        )
        .all()
    )
    leidas_set = {r[0] for r in lecturas}

    resultado = []
    for n in notificaciones:
        resultado.append(NotificacionSistemaHistorialItem(
            id=n.id,
            titulo=n.titulo,
            mensaje=n.mensaje,
            activa=n.activa,
            creado_por=n.creado_por,
            creado_en=n.creado_en,
            leida=(n.id in leidas_set)
        ))

    return resultado


@router.post("/{id}/marcar-leida", response_model=MarcarLeidaResponse)
def marcar_notificacion_leida(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea el registro en NotificacionSistemaLectura para el usuario actual.
    Idempotente (si ya existe lectura previa, no falla ni duplica).
    """
    user_id = getattr(current_user, "id", None)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no autenticado")

    # Verificar existencia de la notificación
    notif = db.query(NotificacionSistema).filter(NotificacionSistema.id == id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificación no encontrada")

    # Idempotencia: comprobar si ya fue leída
    lectura_existente = (
        db.query(NotificacionSistemaLectura)
        .filter(
            NotificacionSistemaLectura.notificacion_id == id,
            NotificacionSistemaLectura.usuario_id == user_id
        )
        .first()
    )

    if not lectura_existente:
        nueva_lectura = NotificacionSistemaLectura(
            notificacion_id=id,
            usuario_id=user_id,
            leido_en=datetime.now(timezone.utc)
        )
        db.add(nueva_lectura)
        try:
            db.commit()
        except Exception:
            db.rollback()
            # Si hubo colisión concurrente, la lectura ya está garantizada
            pass

    return MarcarLeidaResponse(
        ok=True,
        notificacion_id=id,
        mensaje="Notificación marcada como leída"
    )
