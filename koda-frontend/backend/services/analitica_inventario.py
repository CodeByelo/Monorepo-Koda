"""
Cálculos de analítica de inventario/rentabilidad compartidos entre los
endpoints REST del ERP y la API de servicio para el bot de Telegram
(`routers/bot_api.py`).

Este módulo NO formatea respuestas HTTP: solo calcula, para que los
distintos consumidores (dashboard web, bot) nunca diverjan en la
definición de "stock crítico", "baja rotación" o "producto en pérdida".

Lógica extraída, sin cambios de negocio, de:
  - `routers/extras_ext.py::inventario_criticos` (stock crítico)
  - `routers/operaciones/inventario.py::matriz_abc` (matriz de rotación/rentabilidad)
  - `routers/operaciones/inventario.py::rentabilidad_productos` (margen neto / pérdida)
"""

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.operations import Producto, Venta, VentaDetalle
from backend.models.erp_extended import StockPorAlmacen, CuentaPorPagar
from backend.utils.helpers import to_float


@dataclass
class ProductoStockCritico:
    producto: Producto
    disponible: float
    minimo: float


def calcular_stock_critico(db: Session, tenant_id) -> List[ProductoStockCritico]:
    """Productos en o bajo su `stock_minimo` REAL, comparado contra la
    existencia sumada de todos sus almacenes (StockPorAlmacen), no contra el
    total global de `Producto.stock`. Idéntica lógica a
    `routers/extras_ext.py::inventario_criticos`."""
    totales_rows = db.query(
        StockPorAlmacen.producto_id,
        func.sum(StockPorAlmacen.cantidad).label("total")
    ).filter(
        StockPorAlmacen.tenant_id == tenant_id
    ).group_by(StockPorAlmacen.producto_id).all()
    stock_totals = {r.producto_id: r.total for r in totales_rows}

    productos = db.query(Producto).filter(Producto.tenant_id == tenant_id).all()

    resultado = []
    for p in productos:
        disponible = to_float(stock_totals.get(p.id, Decimal("0.00")))
        minimo = to_float(p.stock_minimo)
        if disponible > minimo:
            continue
        resultado.append(ProductoStockCritico(producto=p, disponible=disponible, minimo=minimo))

    return sorted(resultado, key=lambda item: item.disponible)


@dataclass
class ProductoClasificadoABC:
    producto: Producto
    rotacion: float
    rentabilidad: float
    cuadrante: str  # "stars" | "questions" | "cows" | "dogs"


def calcular_matriz_abc(db: Session, tenant_id) -> List[ProductoClasificadoABC]:
    """Clasifica el catálogo del tenant en los 4 cuadrantes de la matriz
    BCG (Estrellas/Incógnitas/Vacas de Efectivo/Perros) según rotación de
    ventas (últimos 30 días) y rentabilidad bruta. Idéntica lógica a
    `routers/operaciones/inventario.py::matriz_abc`."""
    hace_30_dias = datetime.now(timezone.utc) - timedelta(days=30)
    ventas_query = db.query(
        VentaDetalle.producto_id,
        func.sum(VentaDetalle.cantidad).label('total_vendido')
    ).select_from(VentaDetalle).join(Venta, VentaDetalle.venta_id == Venta.id).filter(
        Venta.tenant_id == tenant_id,
        Venta.fecha >= hace_30_dias,
        Venta.estado != 'ANULADA'
    ).group_by(VentaDetalle.producto_id).all()

    sales_map = {prod_id: float(qty) for prod_id, qty in ventas_query}

    productos = db.query(Producto).filter(Producto.tenant_id == tenant_id).all()
    interim = []
    for p in productos:
        rotacion = sales_map.get(p.id, 0.0)
        p_precio = float(p.precio_usd or 0)
        p_costo = float(p.costo_usd or 0)
        rentabilidad = ((p_precio - p_costo) / p_precio * 100.0) if p_precio > 0 else 0.0
        interim.append({"producto": p, "rotacion": rotacion, "rentabilidad": rentabilidad})

    margins = [d["rentabilidad"] for d in interim]
    rotations = [d["rotacion"] for d in interim]

    avg_margin = sum(margins) / len(margins) if margins else 30.0
    avg_rot = sum(rotations) / len(rotations) if rotations else 1.0

    margin_threshold = max(10.0, avg_margin)
    rot_threshold = max(1.0, avg_rot)

    resultado = []
    for d in interim:
        rot = d["rotacion"]
        rent = d["rentabilidad"]

        if rot >= rot_threshold and rent >= margin_threshold:
            cuadrante = "stars"
        elif rot < rot_threshold and rent >= margin_threshold:
            cuadrante = "questions"
        elif rot >= rot_threshold and rent < margin_threshold:
            cuadrante = "cows"
        else:
            cuadrante = "dogs"

        resultado.append(ProductoClasificadoABC(
            producto=d["producto"], rotacion=rot, rentabilidad=rent, cuadrante=cuadrante
        ))

    return resultado


@dataclass
class ProductoRentabilidad:
    producto: Producto
    gasto_operativo: float
    margen_neto: float
    margen_neto_pct: float
    is_loss: bool


def calcular_rentabilidad(db: Session, tenant_id) -> List[ProductoRentabilidad]:
    """Margen neto por producto, prorrateando los gastos operativos
    (CuentaPorPagar) por valor de stock. Idéntica lógica a
    `routers/operaciones/inventario.py::rentabilidad_productos`."""
    productos = db.query(Producto).filter(Producto.tenant_id == tenant_id).all()

    gastos_totales = db.query(func.sum(CuentaPorPagar.monto_total_usd)).filter(
        CuentaPorPagar.tenant_id == tenant_id
    ).scalar() or 0.0
    gastos_totales = float(gastos_totales)

    total_stock_value = sum(float(p.costo_usd or 0.0) * float(p.stock or 0.0) for p in productos)

    resultado = []
    for p in productos:
        p_precio = float(p.precio_usd or 0.0)
        p_costo = float(p.costo_usd or 0.0)
        p_stock = float(p.stock or 0.0)

        if total_stock_value > 0 and p_stock > 0:
            porcentaje_gasto = (p_costo * p_stock) / total_stock_value
            gasto_operativo_total = gastos_totales * porcentaje_gasto
            gasto_operativo = gasto_operativo_total / p_stock
        else:
            gasto_operativo = 0.0

        margen_neto = p_precio - p_costo - gasto_operativo
        margen_neto_pct = (margen_neto / p_precio * 100.0) if p_precio > 0 else 0.0
        is_loss = margen_neto < 0

        resultado.append(ProductoRentabilidad(
            producto=p,
            gasto_operativo=gasto_operativo,
            margen_neto=margen_neto,
            margen_neto_pct=margen_neto_pct,
            is_loss=is_loss,
        ))

    return resultado
