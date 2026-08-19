from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone

from backend.core.database import get_db
from backend.models.operations import Venta, Producto
from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar
from backend.utils.helpers import to_float, margen_bruto_pct, ventas_mensuales_anio

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/metricas")
def get_dashboard_metrics(db: Session = Depends(get_db)):
    ventas_tot = db.query(func.sum(Venta.total_usd)).filter(Venta.estado == "ACTIVA").scalar() or 0
    por_cobrar = (
        db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd))
        .filter(CuentaPorCobrar.estado != "PAGADA")
        .scalar()
        or 0
    )
    por_pagar = (
        db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd))
        .filter(CuentaPorPagar.estado != "PAGADA")
        .scalar()
        or 0
    )
    margen = margen_bruto_pct(db) if to_float(ventas_tot) > 0 else 0
    monthly = ventas_mensuales_anio(db) if to_float(ventas_tot) > 0 else [0] * 12
    health = min(100, max(0, int(70 + margen * 0.3))) if to_float(ventas_tot) > 0 else 0

    return {
        "totalVendido": to_float(ventas_tot),
        "porCobrar": to_float(por_cobrar),
        "porPagar": to_float(por_pagar),
        "margen": margen,
        "healthScore": health,
        "saludOptima": 60 if health > 0 else 0,
        "saludAdvertencia": 30 if health > 0 else 0,
        "saludCritica": 10 if health > 0 else 0,
        "cajaLiquidez": min(100, health + 5) if health > 0 else 0,
        "eficienciaCobro": min(100, health),
        "rotacionStock": 75 if health > 0 else 0,
        "cumplimientoFiscal": 100 if health > 0 else 0,
        "monthlySales": monthly,
    }


@router.get("/alertas")
def get_alerts_center(db: Session = Depends(get_db)):
    ahora = datetime.now(timezone.utc)
    vencido_cobrar = (
        db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd))
        .filter(CuentaPorCobrar.estado != "PAGADA", CuentaPorCobrar.fecha_vencimiento < ahora)
        .scalar()
        or 0
    )
    vencido_pagar = (
        db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd))
        .filter(CuentaPorPagar.estado != "PAGADA", CuentaPorPagar.fecha_vencimiento < ahora)
        .scalar()
        or 0
    )
    prod_agotados = db.query(func.count(Producto.id)).filter(Producto.stock <= 0).scalar() or 0

    items, por_area, decisiones, resumen_operativo = [], [], [], []
    if to_float(vencido_cobrar) > 0:
        items.append({
            "alerta": "Facturas vencidas", "area": "Cobranza", "prioridad": "ALTA",
            "prioridadColor": "bg-red-500", "accion": "Cobrar", "url": "/cobranzas/cuentas-por-cobrar",
        })
        por_area.append({"area": "Cobranza", "descripcion": "Facturas vencidas", "cantidad": "1", "color": "bg-red-500"})
        decisiones.append({"titulo": "Cobrar saldos", "descripcion": "Mejora caja", "badge": "CLAVE", "badgeColor": "text-red-600 bg-red-50"})
        resumen_operativo.append({
            "badgeColor": "bg-red-500",
            "badge": "Cobranza",
            "titulo": "Facturas vencidas",
            "descripcion": "Cuentas por cobrar fuera de plazo que afectan la liquidez del negocio."
        })
    if prod_agotados > 0:
        items.append({
            "alerta": f"{prod_agotados} Productos agotados", "area": "Inventario", "prioridad": "ALTA",
            "prioridadColor": "bg-red-500", "accion": "Ver productos", "url": "/inventario/productos",
        })
        por_area.append({"area": "Inventario", "descripcion": "Agotados", "cantidad": str(prod_agotados), "color": "bg-amber-500"})
        decisiones.append({"titulo": "Reabastecer stock", "descripcion": "Evitar quiebres de inventario activo", "badge": "STOCK", "badgeColor": "text-amber-600 bg-amber-50"})
        resumen_operativo.append({
            "badgeColor": "bg-amber-500",
            "badge": "Inventario",
            "titulo": "Productos agotados",
            "descripcion": f"Se han detectado {prod_agotados} productos con stock en cero que requieren reabastecimiento."
        })
    if to_float(vencido_pagar) > 0:
        items.append({
            "alerta": "Pagos críticos", "area": "Pagos", "prioridad": "MEDIA",
            "prioridadColor": "bg-amber-500", "accion": "Priorizar", "url": "/pagos/cuentas-por-pagar",
        })
        decisiones.append({"titulo": "Priorizar pagos", "descripcion": "Negociar cuentas vencidas con proveedores", "badge": "PAGOS", "badgeColor": "text-red-600 bg-red-50"})
        resumen_operativo.append({
            "badgeColor": "bg-amber-500",
            "badge": "Pagos",
            "titulo": "Pagos vencidos",
            "descripcion": "Existen cuentas por pagar vencidas que requieren programación de pagos inmediata."
        })
    if not por_area:
        por_area = [
            {"area": "Cobranza", "descripcion": "Sin deudas", "cantidad": "0", "color": "bg-slate-400"},
            {"area": "Inventario", "descripcion": "Stock sano", "cantidad": "0", "color": "bg-slate-400"},
            {"area": "Pagos", "descripcion": "Solvente", "cantidad": "0", "color": "bg-slate-400"},
        ]

    return {
        "total": len(items),
        "criticas": sum(1 for i in items if i["prioridad"] == "ALTA"),
        "financieras": 1 if (to_float(vencido_cobrar) > 0 or to_float(vencido_pagar) > 0) else 0,
        "operativas": 1 if prod_agotados > 0 else 0,
        "vencidoCobrar": to_float(vencido_cobrar),
        "productosAgotados": prod_agotados,
        "vencidoPagar": to_float(vencido_pagar),
        "fiscalPendiente": False,
        "items": items,
        "porArea": por_area,
        "decisiones": decisiones,
        "resumenOperativo": resumen_operativo,
    }
