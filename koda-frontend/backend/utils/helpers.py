"""Utilidades compartidas para agregaciones del ERP."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.core import TasaCambio
from backend.models.operations import Venta, Producto, VentaDetalle


def to_float(val) -> float:
    if val is None:
        return 0.0
    return float(val)


def periodo_rango(periodo: str) -> Tuple[datetime, datetime]:
    """periodo formato YYYY-MM -> inicio y fin del mes."""
    year, month = map(int, periodo.split("-"))
    inicio = datetime(year, month, 1)
    if month == 12:
        fin = datetime(year + 1, 1, 1)
    else:
        fin = datetime(year, month + 1, 1)
    return inicio, fin


def ventas_periodo(db: Session, periodo: Optional[str] = None):
    q = db.query(Venta).filter(Venta.estado == "ACTIVA")
    if periodo:
        inicio, fin = periodo_rango(periodo)
        q = q.filter(Venta.fecha >= inicio, Venta.fecha < fin)
    return q


def tasa_actual(db: Session) -> float:
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    return float(tasa.valor_ves) if tasa else 36.52


def margen_bruto_pct(db: Session) -> float:
    """Margen estimado desde detalles de venta vs costo de producto."""
    rows = (
        db.query(
            func.sum(VentaDetalle.cantidad * VentaDetalle.precio_usd_capturado).label("venta"),
            func.sum(VentaDetalle.cantidad * Producto.costo_usd).label("costo"),
        )
        .join(Venta, Venta.id == VentaDetalle.venta_id)
        .join(Producto, Producto.id == VentaDetalle.producto_id)
        .filter(Venta.estado == "ACTIVA")
        .first()
    )
    if not rows or not rows.venta:
        return 0.0
    venta = to_float(rows.venta)
    costo = to_float(rows.costo)
    if venta <= 0:
        return 0.0
    return round(((venta - costo) / venta) * 100, 1)


def ventas_mensuales_anio(db: Session, year: Optional[int] = None) -> list[float]:
    year = year or datetime.now(timezone.utc).year
    monthly = []
    for month in range(1, 13):
        inicio = datetime(year, month, 1)
        fin = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
        total = (
            db.query(func.sum(Venta.total))
            .filter(Venta.estado == "ACTIVA", Venta.fecha >= inicio, Venta.fecha < fin)
            .scalar()
        )
        monthly.append(to_float(total))
    return monthly
