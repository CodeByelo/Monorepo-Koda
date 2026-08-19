"""
Router Buscador Forense del Ledger.
Expone trazabilidad inmutable de entidades del sistema (ventas, facturas,
compras, documentos, etc.) buscando por su ID en la tabla auditoria_logs.
Accesible por usuarios con rol admin/desarrollador/auditor.
"""
from datetime import datetime
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.erp_extended import AuditoriaLog

router = APIRouter(prefix="/api/v1/auditoria", tags=["Búnker Forense"])

# ─────────────────────────────────────────────
#  Schemas de respuesta
# ─────────────────────────────────────────────

class EventoForense(BaseModel):
    event_id: int
    event_type: str
    actor_id: Optional[str]
    occurred_at: datetime
    payload: dict[str, Any]

    class Config:
        from_attributes = True


class LineaTiempoForenseResponse(BaseModel):
    total_records: int
    limit: int
    offset: int
    data: list[EventoForense]


# ─────────────────────────────────────────────
#  Roles permitidos
# ─────────────────────────────────────────────
ROLES_FORENSE = {"ceo", "administrador", "admin", "desarrollador", "dev", "developer", "auditor"}


# ─────────────────────────────────────────────
#  Endpoint principal
# ─────────────────────────────────────────────

@router.get(
    "/forense/{aggregate_id}",
    response_model=LineaTiempoForenseResponse,
    summary="Trazabilidad forense de una entidad",
    description=(
        "Devuelve la línea de tiempo cronológica inalterable de eventos "
        "para un aggregate_id (ID de factura, venta, compra, documento, etc.). "
        "No acepta IDs de usuarios."
    ),
)
def get_forensic_timeline(
    aggregate_id: str,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    # 1. Validar rol
    role_norm = str(getattr(current_user, "rol", "") or "").strip().lower()
    if role_norm not in ROLES_FORENSE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requieren privilegios de Auditoría o Administrador.",
        )

    # 2. Validar tenant
    tenant_id = getattr(current_user, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de sesión no contiene un tenant_id válido.",
        )

    limit = min(max(1, limit), 200)
    offset = max(0, offset)

    # 3. Buscar en auditoria_logs:
    #    Búsqueda flexible: el término puede aparecer en cualquier campo de texto.
    search_term = f"%{aggregate_id}%"
    base_q = (
        db.query(AuditoriaLog)
        .filter(
            AuditoriaLog.tenant_id == tenant_id,
            or_(
                cast(AuditoriaLog.detalle, String).ilike(search_term),
                cast(AuditoriaLog.accion, String).ilike(search_term),
                cast(AuditoriaLog.modulo, String).ilike(search_term),
                cast(AuditoriaLog.usuario, String).ilike(search_term),
                cast(AuditoriaLog.ip, String).ilike(search_term),
            ),
        )
        .order_by(AuditoriaLog.fecha.asc())
    )

    total_records = base_q.count()

    if total_records == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontraron eventos asociados al ID \"{aggregate_id}\" en este tenant.",
        )

    rows = base_q.offset(offset).limit(limit).all()

    events = [
        EventoForense(
            event_id=row.id,
            event_type=f"{row.modulo.upper()}.{row.accion.upper()}".replace(" ", "_"),
            actor_id=row.usuario,
            occurred_at=row.fecha,
            payload={
                "modulo": row.modulo,
                "accion": row.accion,
                "detalle": row.detalle or "",
                "ip": row.ip or "—",
            },
        )
        for row in rows
    ]

    return LineaTiempoForenseResponse(
        total_records=total_records,
        limit=limit,
        offset=offset,
        data=events,
    )
