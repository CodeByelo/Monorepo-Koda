from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.fiscal import ReglaFiscal
from backend.schemas.fiscal import ReglaFiscalCreate, ReglaFiscalResponse
from backend.core.security import get_current_user, require_role

router = APIRouter()


@router.get("/reglas", response_model=List[ReglaFiscalResponse])
def obtener_reglas_fiscales(
    activas_solo: bool = True,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    """
    Obtiene el historial de reglas fiscales (ej. IVA, IGTF) del tenant actual.
    Por defecto, retorna solo las que están activas actualmente para aplicar en ventas.
    """
    query = db.query(ReglaFiscal).filter(ReglaFiscal.tenant_id == current_user.tenant_id)
    if activas_solo:
        query = query.filter(ReglaFiscal.activa == True)
    return query.order_by(ReglaFiscal.fecha_vigencia.desc()).all()


@router.post("/reglas", response_model=ReglaFiscalResponse, status_code=status.HTTP_201_CREATED)
def crear_regla_fiscal(
    regla_in: ReglaFiscalCreate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(require_role(["Admin", "Gerente"]))
):
    """
    Registra una nueva regla fiscal.
    Implementa versionamiento inteligente: Si ya existe una regla activa con el mismo
    nombre (ej. "IVA"), la desactiva automáticamente para proteger la historia contable.
    """
    regla_anterior = db.query(ReglaFiscal).filter(
        ReglaFiscal.nombre == regla_in.nombre,
        ReglaFiscal.activa == True,
        ReglaFiscal.tenant_id == current_user.tenant_id,
    ).first()
    if regla_anterior:
        regla_anterior.activa = False
        db.add(regla_anterior)

    nueva_regla = ReglaFiscal(
        nombre=regla_in.nombre,
        tasa=regla_in.tasa,
        activa=regla_in.activa,
        tenant_id=current_user.tenant_id,
    )
    db.add(nueva_regla)
    db.commit()
    db.refresh(nueva_regla)
    return nueva_regla
