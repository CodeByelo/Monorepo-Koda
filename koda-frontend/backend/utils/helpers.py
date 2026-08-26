"""Utilidades compartidas para agregaciones del ERP."""
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Optional, Tuple, Union
import re
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from backend.models.core import TasaCambio
from backend.models.operations import Venta, Producto, VentaDetalle
from backend.models.erp_extended import Almacen


def to_float(val) -> float:
    if val is None:
        return 0.0
    return float(val)


def verificar_periodo_abierto(
    db: Session,
    tenant_id,
    fecha: Optional[Union[datetime, date]] = None,
    contexto: str = "asientos",
) -> None:
    """Rechaza la operación si `fecha` cae en un período contable ya cerrado.

    Único punto de verdad para el chequeo de `CierrePeriodo`: reutilizado tanto
    por la creación manual de asientos contables (routers/contabilidad/) como por
    la creación de compras (routers/operaciones/compras.py), para que ambos flujos respeten el
    mismo cierre de período y no se puedan registrar documentos retroactivos
    en un período ya cerrado.

    `contexto` sólo cambia la palabra usada en el mensaje de error (p.ej.
    "asientos" o "compras") para mantener el copy existente en cada router.
    """
    from backend.models.accounting import CierrePeriodo  # import perezoso: evita ciclos de import

    if fecha is None:
        fecha = datetime.now(timezone.utc)
    periodo = fecha.strftime("%Y-%m")

    cierre = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == tenant_id,
    ).first()
    if cierre:
        raise HTTPException(
            status_code=403,
            detail=f"No se pueden registrar {contexto} en el período {periodo} porque está CERRADO.",
        )


def get_almacen_principal_id(db: Session, tenant_id) -> Optional[int]:
    """Resuelve el almacén "principal" a usar como destino/origen por defecto
    para flujos que todavía no son explícitamente conscientes de almacén
    (recepciones de compra sin almacén indicado, ajustes de inventario sin
    almacén indicado, etc).

    Convención: el almacén activo con menor id del tenant (el primero creado
    / el del seed inicial). Esto evita que StockPorAlmacen quede sin
    actualizar (divergiendo de Producto.stock) cuando el llamador no informa
    un almacén explícito. Devuelve None si el tenant no tiene ningún almacén
    activo configurado todavía (caso límite: no hay nada que sincronizar).
    """
    almacen = (
        db.query(Almacen)
        .filter(Almacen.tenant_id == tenant_id, Almacen.activo == True)  # noqa: E712
        .order_by(Almacen.id.asc())
        .first()
    )
    return almacen.id if almacen else None


def get_almacen_local_id(db: Session, tenant_id) -> Optional[int]:
    """Devuelve el id del almacén marcado tipo='LOCAL' (la tienda física),
    o None si el tenant todavía no configuró ninguno como tal."""
    almacen = (
        db.query(Almacen)
        .filter(Almacen.tenant_id == tenant_id, Almacen.activo == True, Almacen.tipo == "LOCAL")  # noqa: E712
        .first()
    )
    return almacen.id if almacen else None


def resolver_almacen_venta(db: Session, tenant_id) -> Optional[int]:
    """Almacén del cual debe descontarse una venta: el marcado LOCAL si
    existe; si no, el almacén "principal" de siempre (compatibilidad con
    tenants que aún no configuraron un Local explícito); None si el tenant
    no tiene ningún almacén activo todavía."""
    local_id = get_almacen_local_id(db, tenant_id)
    return local_id if local_id else get_almacen_principal_id(db, tenant_id)


def descontar_stock_almacen(db: Session, tenant_id, producto_id: int, almacen_id: Optional[int], cantidad) -> None:
    """Descuenta `cantidad` del StockPorAlmacen del almacén de una venta.

    Deliberadamente NO bloquea la venta si el desglose por almacén no
    alcanza o no existe fila — `Producto.stock` (el total global) ya es
    quien autoriza o rechaza la venta; esto es solo mantener el desglose
    por almacén lo más fiel posible, con piso en 0 (nunca negativo)."""
    from backend.models.erp_extended import StockPorAlmacen
    if not almacen_id:
        return
    fila = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == producto_id,
        StockPorAlmacen.almacen_id == almacen_id,
        StockPorAlmacen.tenant_id == tenant_id,
    ).with_for_update().first()
    if not fila:
        return
    nueva_cantidad = Decimal(str(fila.cantidad)) - Decimal(str(cantidad))
    fila.cantidad = nueva_cantidad if nueva_cantidad > 0 else Decimal("0")


def periodo_rango(periodo: str) -> Tuple[datetime, datetime]:
    """periodo formato YYYY-MM -> inicio y fin del mes."""
    if not periodo or not re.match(r"^\d{4}-\d{2}$", periodo):
        raise HTTPException(status_code=400, detail=f"Período inválido: '{periodo}'. Debe tener el formato YYYY-MM (ej. 2026-07).")
    year, month = map(int, periodo.split("-"))
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail=f"Período inválido: '{periodo}'. El mes debe estar entre 01 y 12.")
    inicio = datetime(year, month, 1)
    if month == 12:
        fin = datetime(year + 1, 1, 1)
    else:
        fin = datetime(year, month + 1, 1)
    return inicio, fin


def ventas_periodo(db: Session, tenant_id, periodo: Optional[str] = None):
    q = db.query(Venta).filter(Venta.estado == "ACTIVA", Venta.tenant_id == tenant_id)
    if periodo:
        inicio, fin = periodo_rango(periodo)
        q = q.filter(Venta.fecha >= inicio, Venta.fecha < fin)
    return q


# Fallback usado únicamente cuando no existe NINGÚN registro de tasa en BD
# (bootstrap/último recurso). No usar este valor para cálculos normales:
# siempre debe preferirse la tasa real vigente vía tasa_actual().
TASA_CAMBIO_FALLBACK_DEFAULT = 36.52


def tasa_actual(db: Session, tenant_id) -> float:
    tasa = (
        db.query(TasaCambio)
        .filter((TasaCambio.tenant_id == tenant_id) | (TasaCambio.tenant_id.is_(None)))
        .order_by(TasaCambio.fecha.desc())
        .first()
    )
    if tasa and getattr(tasa, "valor_ves", None):
        val = to_float(tasa.valor_ves)
        if val > 0:
            return val
    return 784.66


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
