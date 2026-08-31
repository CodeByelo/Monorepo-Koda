"""
Módulo de Garantías: seguimiento de cobertura post-venta por producto.

Permite registrar la garantía de un producto (asociada o no a una venta
puntual), consultarla/filtrarla y actualizar su estado cuando el cliente
presenta un reclamo.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_user, require_role
from backend.models.core import Profile
from backend.models.erp_extended import Garantia
from backend.models.operations import Producto, Venta, Cliente, VentaDetalle

router = APIRouter(prefix="/garantias", tags=["Garantías"])

ESTADOS_VALIDOS = ("VIGENTE", "VENCIDA", "RECLAMADA", "ANULADA")


def _sumar_meses(fecha: datetime, meses: int) -> datetime:
    """Suma `meses` a `fecha` sin depender de python-dateutil (no está en
    requirements.txt). Ajusta el día si el mes destino es más corto
    (ej. 31 de enero + 1 mes -> 28/29 de febrero)."""
    mes_total = fecha.month - 1 + meses
    anio = fecha.year + mes_total // 12
    mes = mes_total % 12 + 1
    # Último día válido del mes destino
    if mes == 12:
        siguiente_mes_primero = datetime(anio + 1, 1, 1)
    else:
        siguiente_mes_primero = datetime(anio, mes + 1, 1)
    ultimo_dia_mes = (siguiente_mes_primero - _un_dia()).day
    dia = min(fecha.day, ultimo_dia_mes)
    return fecha.replace(year=anio, month=mes, day=dia)


def _un_dia():
    from datetime import timedelta
    return timedelta(days=1)


class GarantiaCreate(BaseModel):
    producto_id: int
    venta_id: Optional[int] = None
    cliente_id: int
    fecha_inicio: Optional[datetime] = None
    duracion_meses: int = Field(gt=0)
    notas: Optional[str] = None


class GarantiaUpdate(BaseModel):
    estado: str
    notas: Optional[str] = None


class GarantiaResponse(BaseModel):
    id: int
    producto_id: int
    venta_id: Optional[int]
    cliente_id: int
    fecha_inicio: datetime
    duracion_meses: int
    fecha_vencimiento: datetime
    estado: str
    notas: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("", response_model=GarantiaResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=GarantiaResponse, status_code=status.HTTP_201_CREATED)
def crear_garantia(
    payload: GarantiaCreate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    producto = db.query(Producto).filter(
        Producto.id == payload.producto_id,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    cliente = db.query(Cliente).filter(
        Cliente.id == payload.cliente_id,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    fecha_inicio = payload.fecha_inicio or datetime.now(timezone.utc)

    if payload.venta_id is not None:
        venta = db.query(Venta).filter(
            Venta.id == payload.venta_id,
            Venta.tenant_id == current_user.tenant_id,
        ).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if venta.cliente_id != payload.cliente_id:
            raise HTTPException(
                status_code=400,
                detail=f"El cliente indicado (ID {payload.cliente_id}) no coincide con el cliente de la venta (ID {venta.cliente_id})."
            )

        detalle_venta = db.query(VentaDetalle).filter(
            VentaDetalle.venta_id == payload.venta_id,
            VentaDetalle.producto_id == payload.producto_id,
            VentaDetalle.tenant_id == current_user.tenant_id,
        ).first()
        if not detalle_venta:
            raise HTTPException(
                status_code=400,
                detail=f"El producto indicado (ID {payload.producto_id}) no forma parte de la venta especificada (ID {payload.venta_id})."
            )

        # Si no se especifica fecha_inicio, se usa la fecha de la venta.
        if payload.fecha_inicio is None:
            fecha_inicio = venta.fecha

    fecha_vencimiento = _sumar_meses(fecha_inicio, payload.duracion_meses)

    garantia = Garantia(
        tenant_id=current_user.tenant_id,
        producto_id=payload.producto_id,
        venta_id=payload.venta_id,
        cliente_id=payload.cliente_id,
        fecha_inicio=fecha_inicio,
        duracion_meses=payload.duracion_meses,
        fecha_vencimiento=fecha_vencimiento,
        estado="VIGENTE",
        notas=payload.notas,
    )
    db.add(garantia)
    db.commit()
    db.refresh(garantia)
    return garantia


@router.get("", response_model=List[GarantiaResponse])
@router.get("/", response_model=List[GarantiaResponse])
def listar_garantias(
    cliente_id: Optional[int] = None,
    producto_id: Optional[int] = None,
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    query = db.query(Garantia).filter(Garantia.tenant_id == current_user.tenant_id)
    if cliente_id is not None:
        query = query.filter(Garantia.cliente_id == cliente_id)
    if producto_id is not None:
        query = query.filter(Garantia.producto_id == producto_id)
    if estado is not None:
        estado_norm = estado.upper()
        if estado_norm not in ESTADOS_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Estado inválido. Use uno de: {', '.join(ESTADOS_VALIDOS)}")
        query = query.filter(Garantia.estado == estado_norm)
    return query.order_by(Garantia.fecha_vencimiento.desc()).all()


@router.get("/{garantia_id}", response_model=GarantiaResponse)
def obtener_garantia(
    garantia_id: int,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    garantia = db.query(Garantia).filter(
        Garantia.id == garantia_id,
        Garantia.tenant_id == current_user.tenant_id,
    ).first()
    if not garantia:
        raise HTTPException(status_code=404, detail="Garantía no encontrada")
    return garantia


@router.patch("/{garantia_id}", response_model=GarantiaResponse)
def actualizar_garantia(
    garantia_id: int,
    payload: GarantiaUpdate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(require_role(["Admin", "Gerente"])),
):
    garantia = db.query(Garantia).filter(
        Garantia.id == garantia_id,
        Garantia.tenant_id == current_user.tenant_id,
    ).first()
    if not garantia:
        raise HTTPException(status_code=404, detail="Garantía no encontrada")

    estado_norm = payload.estado.upper()
    if estado_norm not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Use uno de: {', '.join(ESTADOS_VALIDOS)}")

    garantia.estado = estado_norm
    if payload.notas is not None:
        garantia.notas = payload.notas
    db.commit()
    db.refresh(garantia)
    return garantia
