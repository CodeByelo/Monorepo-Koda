from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from typing import Optional, List

from backend.core.database import get_db
from backend.models.operations import (
    Venta, Cliente, Proveedor, Producto, VentaDetalle, KardexMovimiento, EvaluacionProveedor
)
from backend.models.erp_extended import (
    Compra, CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario,
    Cotizacion, CotizacionItem, OrdenVenta, RequisicionCompra, TransferenciaInventario,
    RetencionIVA, RetencionISLR, Vendedor, Almacen, RecepcionStock, DevolucionProveedor, LoteProducto,
    NotaCredito, AnticipoCliente, Cheque, FondoCajaChica, GastoCajaChica, StockPorAlmacen,
    NotaEntrega, NotaEntregaItem
)
from backend.schemas.operations import (
    CotizacionCreate, CotizacionStatusUpdate, CompraCreate, RecepcionStockCreate, RecepcionStockResponse,
    DevolucionProveedorCreate, NotaEntregaCreate, NotaEntregaEstadoUpdate
)
from backend.core.security import get_current_user, require_role
from backend.models.core import TasaCambio
from backend.utils.helpers import to_float, periodo_rango, ventas_periodo, tasa_actual, margen_bruto_pct, get_almacen_principal_id, verificar_periodo_abierto
from backend.services.contabilidad import ContabilidadService
from backend.routers.operaciones._shared import _as_aware, ISLR_WITHHOLDING_TABLE, _resolver_islr_automatico, calcular_reserva_fiscal

reportes_router = APIRouter(prefix="/reportes", tags=["Reportes"], dependencies=[Depends(get_current_user)])


@reportes_router.get("/dashboard")
def reportes_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import CuentaBancaria, CuentaPorCobrar, LoteProducto
    from backend.models.operations import Producto, Venta
    from backend.services.reportes import ReporteService
    from datetime import datetime, timezone, timedelta

    # 1. Saldo en bancos y CxC (misma fuente que /repo_dashboard_resumen del "Inicio")
    resumen = ReporteService.dashboard_resumen(db, current_user.tenant_id)
    total_bancos = resumen["saldo_bancos_usd"]
    total_cxc = resumen["saldo_cxc_usd"]

    # 3. Cantidad de SKUs
    total_productos = db.query(func.count(Producto.id)).filter(
        Producto.tenant_id == current_user.tenant_id
    ).scalar() or 0
    
    # 4. Ventas del mes corriente
    ahora = datetime.now(timezone.utc)
    inicio_mes = datetime(ahora.year, ahora.month, 1, tzinfo=timezone.utc)
    total_ventas_mes = db.query(func.sum(Venta.total_usd)).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.estado == "ACTIVA",
        Venta.fecha >= inicio_mes
    ).scalar() or 0.0

    metrics = [
        {
            "label": "Disponibilidad Bancaria",
            "value": f"${float(total_bancos):,.2f}",
            "trend": "Saldos netos en USD/Bs",
            "trendColor": "text-[#0b5156]",
            "type": "wallet"
        },
        {
            "label": "Cuentas por Cobrar",
            "value": f"${float(total_cxc):,.2f}",
            "trend": "Pendiente de cobro",
            "trendColor": "text-amber-500",
            "type": "shield"
        },
        {
            "label": "Productos Activos",
            "value": str(total_productos),
            "trend": "Items en inventario",
            "trendColor": "text-blue-500",
            "type": "package"
        },
        {
            "label": "Ventas del Mes",
            "value": f"${float(total_ventas_mes):,.2f}",
            "trend": "Mes corriente",
            "trendColor": "text-green-600",
            "type": "trend"
        }
    ]

    # Alertas ejecutivas
    alerts = []
    # Alerta 1: Stock agotado
    agotados_count = db.query(func.count(Producto.id)).filter(
        Producto.tenant_id == current_user.tenant_id,
        Producto.stock <= 0
    ).scalar() or 0
    if agotados_count > 0:
        alerts.append({
            "type": "CRÍTICO",
            "color": "bg-red-50 text-red-700 border-red-200",
            "title": "ALERTA DE INVENTARIO CERO",
            "desc": f"Se han detectado {agotados_count} SKUs con existencia en cero. Afecta despachos.",
            "link": "/reportes/rentabilidad"
        })

    # Alerta 2: Cuentas por cobrar vencidas
    cxc_vencidas = db.query(func.count(CuentaPorCobrar.id)).filter(
        CuentaPorCobrar.tenant_id == current_user.tenant_id,
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < ahora
    ).scalar() or 0
    if cxc_vencidas > 0:
        alerts.append({
            "type": "ADVERTENCIA",
            "color": "bg-amber-50 text-amber-700 border-amber-200",
            "title": "MORAS ACTIVAS EN CARTERA",
            "desc": f"Hay {cxc_vencidas} facturas vencidas sin recaudar. Riesgo de devaluación.",
            "link": "/reportes/antiguedad-cartera"
        })

    # Alerta 3: Lotes venciendo pronto
    dentro_60 = ahora + timedelta(days=60)
    lotes_venciendo = db.query(func.count(LoteProducto.id)).filter(
        LoteProducto.tenant_id == current_user.tenant_id,
        LoteProducto.fecha_vencimiento <= dentro_60,
        LoteProducto.fecha_vencimiento >= ahora,
        LoteProducto.cantidad > 0
    ).scalar() or 0
    if lotes_venciendo > 0:
        alerts.append({
            "type": "ATENCIÓN",
            "color": "bg-blue-50 text-blue-700 border-blue-200",
            "title": "LOTES PRÓXIMOS A VENCER",
            "desc": f"Hay {lotes_venciendo} lotes de productos que vencen en los próximos 60 días.",
            "link": "/reportes/rentabilidad"
        })

    if not alerts:
        alerts.append({
            "type": "INFO",
            "color": "bg-green-50 text-green-700 border-green-200",
            "title": "CONTROL DE RIESGO OPTIMIZADO",
            "desc": "No se registran alertas operativas críticas para el tenant actual.",
            "link": None
        })

    available_reports = [
        {
            "name": "Resumen Fiscal (Libro IVA)",
            "desc": "Impuestos, base imponible y cuota tributaria mensual para la DP-31.",
            "area": "Impuestos",
            "freq": "Mensual",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Declaración Fiscal",
            "link": "/reportes/libro-fiscal"
        },
        {
            "name": "Análisis de Ventas",
            "desc": "Evolución de facturación, ticket promedio e histórico mensual.",
            "area": "Ventas",
            "freq": "Tiempo Real",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Planificación Comercial",
            "link": "/reportes/ventas"
        },
        {
            "name": "Análisis de Compras y Egresos",
            "desc": "Gastos acumulados, distribución por categoría y proveedores críticos.",
            "area": "Compras",
            "freq": "Tiempo Real",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Auditoría de Costos",
            "link": "/reportes/compras"
        },
        {
            "name": "Antigüedad de Cartera (CxC)",
            "desc": "Segmentación de moras por tramos de vencimiento y pérdida por devaluación.",
            "area": "Cobranzas",
            "freq": "Diario",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Riesgo Crediticio",
            "link": "/reportes/antiguedad-cartera"
        },
        {
            "name": "Realización Diferencial Cambiario",
            "desc": "Ganancia o pérdida en bolívares por cobro/pago indexado a tasa BCV.",
            "area": "Finanzas",
            "freq": "Tiempo Real",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Control Cambiario",
            "link": "/reportes/diferencial-cambiario"
        },
        {
            "name": "Eficiencia Operativa",
            "desc": "Cálculo de punto de equilibrio y ventas requeridas por sucursal.",
            "area": "Finanzas",
            "freq": "Mensual",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Rentabilidad de Sedes",
            "link": "/reportes/eficiencia"
        },
        {
            "name": "Rentabilidad de Productos",
            "desc": "Margen neto real por SKU cruzando costo de reposición y gastos prorrateados.",
            "area": "Inventarios",
            "freq": "Tiempo Real",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Estrategia de Precios",
            "link": "/reportes/rentabilidad"
        },
        {
            "name": "Fuerza de Ventas y Comisiones",
            "desc": "Rendimiento comercial de vendedores y comisiones liquidadas por cobro efectivo.",
            "area": "Comercial",
            "freq": "Mensual",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Cálculo de Incentivos",
            "link": "/reportes/vendedores"
        },
        {
            "name": "Matriz ABC de Inventario",
            "desc": "Clasificación de existencias según Rotación vs Margen (Estrellas, Vacas, Perros).",
            "area": "Inventarios",
            "freq": "Mensual",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Rotación de Stock",
            "link": "/reportes/matriz-abc"
        },
        {
            "name": "Excepciones de Control Interno",
            "desc": "Bitácora de operaciones anuladas, fuera de stock o manuales de alto riesgo.",
            "area": "Auditoría",
            "freq": "Diario",
            "status": "Riesgo Detectado",
            "statusColor": "bg-red-50 text-red-700 border-red-200",
            "usage": "Prevención de Pérdidas",
            "link": "/reportes/excepciones"
        },
        {
            "name": "Constructor de Consultas",
            "desc": "Extractor dinámico de dimensiones y métricas operativas para PowerBI/Excel.",
            "area": "BI / Extracción",
            "freq": "Ad-hoc",
            "status": "Listo",
            "statusColor": "bg-green-50 text-green-700 border-green-200",
            "usage": "Auditoría Externa",
            "link": "/reportes/query-builder"
        }
    ]

    return {
        "metrics": metrics,
        "executiveAlerts": alerts,
        "availableReports": available_reports,
        "ultima_actualizacion": ahora.isoformat()
    }


@reportes_router.get("/ventas")
def reporte_ventas(periodo: str = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.operations import Venta, VentaDetalle, Cliente, Producto
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    
    # Resolver periodo
    if not periodo:
        ahora = datetime.now(timezone.utc)
        periodo = ahora.strftime("%Y-%m")
        
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = datetime.now(timezone.utc).year, datetime.now(timezone.utc).month

    # Rango del mes
    inicio_mes = datetime(y, m, 1, tzinfo=timezone.utc)
    if m == 12:
        fin_mes = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:
        fin_mes = datetime(y, m + 1, 1, tzinfo=timezone.utc)

    # Ventas totales del periodo
    ventas = db.query(Venta).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.estado == "ACTIVA",
        Venta.fecha >= inicio_mes,
        Venta.fecha < fin_mes
    ).all()

    total_facturado = sum(float(v.total_usd) for v in ventas)
    cantidad_ventas = len(ventas)
    ticket_promedio = total_facturado / cantidad_ventas if cantidad_ventas > 0 else 0.0

    # Margen bruto promedio
    # Cruzamos detalles con costo de producto
    venta_detalles = db.query(VentaDetalle).join(Venta).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.estado == "ACTIVA",
        Venta.fecha >= inicio_mes,
        Venta.fecha < fin_mes
    ).all()
    
    total_venta_usd = 0.0
    total_costo_usd = 0.0
    for d in venta_detalles:
        cant = float(d.cantidad)
        precio = float(d.precio_usd_capturado)
        costo = float(d.producto.costo_usd) if d.producto else 0.0
        total_venta_usd += cant * precio
        total_costo_usd += cant * costo
        
    margen_bruto = ((total_venta_usd - total_costo_usd) / total_venta_usd * 100.0) if total_venta_usd > 0 else 0.0

    metrics = [
        {
            "label": "Total Facturado",
            "value": f"${total_facturado:,.2f}",
            "trend": "Ventas del mes",
            "trendColor": "text-green-600",
            "type": "trend"
        },
        {
            "label": "Ventas Registradas",
            "value": str(cantidad_ventas),
            "trend": "Transacciones",
            "trendColor": "text-blue-500",
            "type": "target"
        },
        {
            "label": "Ticket Promedio",
            "value": f"${ticket_promedio:,.2f}",
            "trend": "Valor medio",
            "trendColor": "text-[#0b5156]",
            "type": "ticket"
        },
        {
            "label": "Margen Bruto Medio",
            "value": f"{margen_bruto:.1f}%",
            "trend": "Rentabilidad comercial",
            "trendColor": "text-green-600",
            "type": "activity"
        }
    ]

    # Top 10 Clientes
    clientes_agregados = defaultdict(float)
    for v in ventas:
        c_name = v.cliente.nombre if v.cliente else "CLIENTE GENERAL"
        clientes_agregados[c_name] += float(v.total_usd)
        
    top_clients_list = []
    sorted_clients = sorted(clientes_agregados.items(), key=lambda x: x[1], reverse=True)[:10]
    for name, val in sorted_clients:
        share = (val / total_facturado * 100.0) if total_facturado > 0 else 0.0
        top_clients_list.append({
            "name": name,
            "share": f"{share:.1f}%",
            "amount": f"${val:,.2f}",
            "trend": "stable"
        })

    # Top Productos por Monto
    productos_agregados = defaultdict(lambda: {"qty": 0.0, "amount": 0.0})
    for d in venta_detalles:
        p_name = d.producto.nombre if d.producto else "Producto Desconocido"
        cant = float(d.cantidad)
        monto = cant * float(d.precio_usd_capturado)
        productos_agregados[p_name]["qty"] += cant
        productos_agregados[p_name]["amount"] += monto
        
    top_products_list = []
    sorted_prods = sorted(productos_agregados.items(), key=lambda x: x[1]["amount"], reverse=True)[:10]
    for name, data_p in sorted_prods:
        top_products_list.append({
            "name": name,
            "qty": int(data_p["qty"]),
            "amount": f"${data_p['amount']:,.2f}"
        })

    # Datos históricos últimos 6 meses
    chart_data = []
    meses_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    for i in range(5, -1, -1):
        m_temp = m - i
        y_temp = y
        while m_temp <= 0:
            m_temp += 12
            y_temp -= 1
        ini_temp = datetime(y_temp, m_temp, 1, tzinfo=timezone.utc)
        if m_temp == 12:
            fin_temp = datetime(y_temp + 1, 1, 1, tzinfo=timezone.utc)
        else:
            fin_temp = datetime(y_temp, m_temp + 1, 1, tzinfo=timezone.utc)
            
        m_total = db.query(func.sum(Venta.total_usd)).filter(
            Venta.tenant_id == current_user.tenant_id,
            Venta.estado == "ACTIVA",
            Venta.fecha >= ini_temp,
            Venta.fecha < fin_temp
        ).scalar() or 0.0
        
        m_total_k = float(m_total) / 1000.0
        is_current = (y_temp == y and m_temp == m)
        
        # Obtener tasa BCV histórica para el gráfico
        tasa_mes = db.query(TasaCambio.valor_ves).filter(
            (TasaCambio.tenant_id == current_user.tenant_id) | (TasaCambio.tenant_id.is_(None)),
            TasaCambio.fecha < fin_temp
        ).order_by(TasaCambio.fecha.desc()).first()
        tasa_val = float(tasa_mes[0]) if tasa_mes else tasa_actual(db, current_user.tenant_id)
        
        chart_data.append({
            "month": meses_es[m_temp - 1],
            "value": round(m_total_k, 1),
            "height": f"{min(100, int(m_total_k * 5))}%" if m_total_k > 0 else "5%",
            "active": is_current,
            "rate": round(tasa_val, 2)
        })

    insight = (
        f"Durante el período {periodo}, se facturó un total de ${total_facturado:,.2f} USD. "
        f"El margen comercial neto se situó en {margen_bruto:.1f}% cruzando el costo de reposición real."
    )

    return {
        "metrics": metrics,
        "topClients": top_clients_list,
        "topProducts": top_products_list,
        "chartData": chart_data,
        "insight": insight,
        "alertContraction": None
    }


@reportes_router.get("/compras")
def reporte_compras(periodo: str = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import Compra, CuentaPorPagar
    from backend.models.operations import Proveedor, EvaluacionProveedor
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    
    # Resolver periodo
    if not periodo:
        ahora = datetime.now(timezone.utc)
        periodo = ahora.strftime("%Y-%m")
        
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = datetime.now(timezone.utc).year, datetime.now(timezone.utc).month

    # Rango del mes
    inicio_mes = datetime(y, m, 1, tzinfo=timezone.utc)
    if m == 12:
        fin_mes = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:
        fin_mes = datetime(y, m + 1, 1, tzinfo=timezone.utc)

    # Compras totales
    compras = db.query(Compra).filter(
        Compra.tenant_id == current_user.tenant_id,
        Compra.estado == "ACTIVA",
        Compra.fecha >= inicio_mes,
        Compra.fecha < fin_mes
    ).all()

    total_compras = sum(float(c.total_usd) for c in compras)
    cantidad_compras = len(compras)
    promedio_compra = total_compras / cantidad_compras if cantidad_compras > 0 else 0.0

    # Cuentas por pagar pendientes
    cxp_total = db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd)).filter(
        CuentaPorPagar.tenant_id == current_user.tenant_id,
        CuentaPorPagar.estado != "PAGADA"
    ).scalar() or 0.0

    metrics = [
        {
            "label": "Gasto del Período",
            "value": f"${total_compras:,.2f}",
            "trend": "Compras del mes",
            "trendColor": "text-[#0b5156]",
            "type": "receipt"
        },
        {
            "label": "Facturas Recibidas",
            "value": str(cantidad_compras),
            "trend": "Transacciones",
            "trendColor": "text-blue-500",
            "type": "clipboard"
        },
        {
            "label": "Cuentas por Pagar",
            "value": f"${float(cxp_total):,.2f}",
            "trend": "Pendiente de pago",
            "trendColor": "text-red-600",
            "type": "clock"
        },
        {
            "label": "Promedio por Factura",
            "value": f"${promedio_compra:,.2f}",
            "trend": "Valor medio",
            "trendColor": "text-[#0b5156]",
            "type": "truck"
        }
    ]

    # Distribución por Categorías
    cat_labels = {
        "BIENES_INVENTARIO": "Bienes de Inventario",
        "LOGISTICA": "Logística y Transporte",
        "SERVICIOS": "Servicios y Suministros",
        "OTROS": "Otros Gastos",
    }
    cat_colors = {
        "BIENES_INVENTARIO": "bg-[#0b5156]",
        "LOGISTICA": "bg-amber-500",
        "SERVICIOS": "bg-indigo-500",
        "OTROS": "bg-slate-400",
    }
    
    categories_agregados = defaultdict(float)
    for c in compras:
        cat_key = c.categoria or "OTROS"
        categories_agregados[cat_key] += float(c.total_usd)
        
    categories_list = []
    for cat_key, value in categories_agregados.items():
        pct = (value / total_compras * 100.0) if total_compras > 0 else 0.0
        categories_list.append({
            "name": cat_labels.get(cat_key, cat_key),
            "amount": f"${value:,.2f}",
            "percentage": round(pct, 1),
            "color": cat_colors.get(cat_key, "bg-slate-400")
        })
    categories_list.sort(key=lambda x: x["percentage"], reverse=True)

    # Proveedores Críticos
    proveedores_agregados = defaultdict(float)
    for c in compras:
        prov_name = c.proveedor.nombre if c.proveedor else "Proveedor General"
        proveedores_agregados[prov_name] += float(c.total_usd)
        
    suppliers_list = []
    evaluaciones = db.query(EvaluacionProveedor).filter(EvaluacionProveedor.tenant_id == current_user.tenant_id).all()
    eval_scores = {e.proveedor_id: float((e.score_precio * 0.4) + (e.score_calidad * 0.3) + (e.score_entrega * 0.3)) / 10.0 for e in evaluaciones}
    
    sorted_provs = sorted(proveedores_agregados.items(), key=lambda x: x[1], reverse=True)[:10]
    for name, val in sorted_provs:
        prov_obj = db.query(Proveedor).filter(Proveedor.nombre == name, Proveedor.tenant_id == current_user.tenant_id).first()
        score = eval_scores.get(prov_obj.id, 8.5) if prov_obj else 8.5
        suppliers_list.append({
            "name": name,
            "amount": f"${val:,.2f}",
            "quality": round(score, 1),
            "condition": "Crédito 30d"
        })

    # Histórico de compras 6 meses
    chart_data = []
    meses_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    for i in range(5, -1, -1):
        m_temp = m - i
        y_temp = y
        while m_temp <= 0:
            m_temp += 12
            y_temp -= 1
        ini_temp = datetime(y_temp, m_temp, 1, tzinfo=timezone.utc)
        if m_temp == 12:
            fin_temp = datetime(y_temp + 1, 1, 1, tzinfo=timezone.utc)
        else:
            fin_temp = datetime(y_temp, m_temp + 1, 1, tzinfo=timezone.utc)
            
        m_total = db.query(func.sum(Compra.total_usd)).filter(
            Compra.tenant_id == current_user.tenant_id,
            Compra.estado == "ACTIVA",
            Compra.fecha >= ini_temp,
            Compra.fecha < fin_temp
        ).scalar() or 0.0
        
        m_total_k = float(m_total) / 1000.0
        is_current = (y_temp == y and m_temp == m)
        chart_data.append({
            "month": meses_es[m_temp - 1],
            "value": round(m_total_k, 1),
            "height": f"{min(100, int(m_total_k * 5))}%" if m_total_k > 0 else "5%",
            "active": is_current
        })

    insight = (
        f"Durante el período {periodo}, se registraron compras por un monto total de ${total_compras:,.2f} USD. "
        f"El saldo acumulado de cuentas por pagar (CxP) activas del tenant es de ${float(cxp_total):,.2f} USD."
    )

    return {
        "metrics": metrics,
        "suppliers": suppliers_list,
        "categories": categories_list,
        "chartData": chart_data,
        "insight": insight
    }


@reportes_router.get("/antiguedad-cartera")
def reporte_antiguedad(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import CuentaPorCobrar
    from backend.models.operations import Cliente
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    
    ahora = datetime.now(timezone.utc)
    tasa_val = tasa_actual(db, current_user.tenant_id)
    
    cxc_list = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.tenant_id == current_user.tenant_id,
        CuentaPorCobrar.estado != "PAGADA"
    ).all()

    total_cxc = sum(float(c.monto_total_usd - c.monto_pagado_usd) for c in cxc_list)
    total_vencido = 0.0
    total_perdida = 0.0
    
    tramos = {
        "Al día": 0.0,
        "Mora (1-30 d)": 0.0,
        "Mora (31-60 d)": 0.0,
        "Mora (+60 d)": 0.0
    }
    
    clients_agregados = defaultdict(lambda: {
        "total": 0.0,
        "overdue": 0.0,
        "days0_30": 0.0,
        "days31_60": 0.0,
        "daysPlus60": 0.0,
        "loss": 0.0
    })

    for c in cxc_list:
        saldo = float(c.monto_total_usd - c.monto_pagado_usd)
        dias_vencimiento = (ahora - _as_aware(c.fecha_vencimiento)).days
        
        metodo = c.venta.metodo_pago if c.venta else "Transferencia"
        perdida_c = 0.0
        if metodo not in ["Divisa", "Efectivo"]:
            tasa_orig = float(c.tasa_cambio_bs) if c.tasa_cambio_bs else tasa_val
            monto_bs = saldo * tasa_orig
            usd_hoy = monto_bs / tasa_val if tasa_val > 0 else saldo
            perdida_c = max(0.0, saldo - usd_hoy)
            total_perdida += perdida_c
            
        cli_name = c.cliente.nombre if c.cliente else "Cliente General"
        clients_agregados[cli_name]["total"] += saldo
        clients_agregados[cli_name]["loss"] += perdida_c
        
        if dias_vencimiento <= 0:
            tramos["Al día"] += saldo
        else:
            total_vencido += saldo
            clients_agregados[cli_name]["overdue"] += saldo
            
            if dias_vencimiento <= 30:
                tramos["Mora (1-30 d)"] += saldo
                clients_agregados[cli_name]["days0_30"] += saldo
            elif dias_vencimiento <= 60:
                tramos["Mora (31-60 d)"] += saldo
                clients_agregados[cli_name]["days31_60"] += saldo
            else:
                tramos["Mora (+60 d)"] += saldo
                clients_agregados[cli_name]["daysPlus60"] += saldo

    dso = 0.0
    if len(cxc_list) > 0:
        total_dias = sum(max(0, (ahora - _as_aware(c.fecha_emision)).days) for c in cxc_list)
        dso = total_dias / len(cxc_list)

    metrics = [
        {
            "label": "Total por Cobrar",
            "value": f"${total_cxc:,.2f}",
            "trend": "Cartera de clientes",
            "trendColor": "text-[#0b5156]",
            "type": "wallet"
        },
        {
            "label": "Cartera Vencida",
            "value": f"${total_vencido:,.2f}",
            "trend": "Mora activa",
            "trendColor": "text-red-600",
            "type": "alert"
        },
        {
            "label": "Erosión de Capital",
            "value": f"-${total_perdida:,.2f}",
            "trend": "Pérdida por devaluación",
            "trendColor": "text-red-500",
            "type": "trend"
        },
        {
            "label": "Plazo Medio Cobro (DSO)",
            "value": f"{int(dso)} días",
            "trend": "Antigüedad promedio",
            "trendColor": "text-blue-600",
            "type": "clock"
        }
    ]

    risk_segments = []
    colors_map = {
        "Al día": ("bg-emerald-500", "bg-emerald-500"),
        "Mora (1-30 d)": ("bg-teal-600", "bg-teal-600"),
        "Mora (31-60 d)": ("bg-[#0b5156]", "bg-[#0b5156]"),
        "Mora (+60 d)": ("bg-red-600", "bg-red-600")
    }
    
    for label, val in tramos.items():
        pct = (val / total_cxc * 100.0) if total_cxc > 0 else 0.0
        c1, c2 = colors_map.get(label, ("bg-slate-400", "bg-slate-400"))
        risk_segments.append({
            "label": label,
            "value": f"${val:,.2f}",
            "percentage": round(pct, 1),
            "color": c1,
            "legendColor": c2
        })

    clients_data_list = []
    for name, data_c in clients_agregados.items():
        risk = "Bajo"
        risk_color = "bg-green-50 text-green-700"
        
        if data_c["overdue"] > 0:
            pct_venc = data_c["overdue"] / data_c["total"]
            if pct_venc > 0.5:
                risk = "Crítico"
                risk_color = "bg-red-100 text-red-700"
            elif pct_venc > 0.2:
                risk = "Alto"
                risk_color = "bg-red-50 text-red-600"
            else:
                risk = "Medio"
                risk_color = "bg-amber-50 text-amber-700"
                
        clients_data_list.append({
            "name": name,
            "total": f"${data_c['total']:,.2f}",
            "overdue": f"${data_c['overdue']:,.2f}",
            "days0_30": f"${data_c['days0_30']:,.2f}",
            "days31_60": f"${data_c['days31_60']:,.2f}",
            "daysPlus60": f"${data_c['daysPlus60']:,.2f}",
            "loss": f"Bs. {(data_c['loss'] * tasa_val):,.2f}",
            "risk": risk,
            "riskColor": risk_color
        })
        
    insight = (
        f"La cartera por cobrar activa suma un total de ${total_cxc:,.2f} USD. "
        f"La tasa de erosión proyectada es de {((total_perdida / total_cxc * 100.0) if total_cxc > 0 else 0.0):.1f}%, "
        f"equivalente a una pérdida real de capital de ${total_perdida:,.2f} USD por devaluación."
    )

    return {
        "metrics": metrics,
        "riskSegments": risk_segments,
        "clientsData": clients_data_list,
        "insight": insight
    }


@reportes_router.get("/diferencial-cambiario")
def reporte_diferencial(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar
    from datetime import datetime, timezone
    
    tasa_val = tasa_actual(db, current_user.tenant_id)
    
    cxc = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.tenant_id == current_user.tenant_id,
        CuentaPorCobrar.estado == "PAGADA"
    ).all()
    
    cxp = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.tenant_id == current_user.tenant_id,
        CuentaPorPagar.estado == "PAGADA"
    ).all()

    ganancia_ves = 0.0
    perdida_ves = 0.0
    operations = []

    for c in cxc:
        saldo_usd = float(c.monto_pagado_usd)
        tasa_issue = float(c.tasa_cambio_bs)
        diff_tasa = tasa_val - tasa_issue
        diff_bs = saldo_usd * diff_tasa
        
        cli_name = c.cliente.nombre if c.cliente else "Cliente General"
        
        if diff_bs > 0:
            ganancia_ves += diff_bs
            diff_type = "success"
            diff_str = f"+Bs. {diff_bs:,.2f}"
        else:
            perdida_ves += abs(diff_bs)
            diff_type = "danger"
            diff_str = f"-Bs. {abs(diff_bs):,.2f}"
            
        operations.append({
            "id": c.numero_documento,
            "client": cli_name,
            "rateIssue": f"{tasa_issue:.2f}",
            "rateCollection": f"{tasa_val:.2f}",
            "amountUsd": f"${saldo_usd:,.2f}",
            "amountBsIssue": f"Bs. {(saldo_usd * tasa_issue):,.2f}",
            "amountBsCollection": f"Bs. {(saldo_usd * tasa_val):,.2f}",
            "diff": diff_str,
            "diffType": diff_type
        })

    for p in cxp:
        saldo_usd = float(p.monto_pagado_usd)
        tasa_issue = float(p.tasa_cambio_bs)
        diff_tasa = tasa_val - tasa_issue
        diff_bs = saldo_usd * diff_tasa
        
        prov_name = p.proveedor.nombre if p.proveedor else "Proveedor General"
        
        if diff_bs > 0:
            perdida_ves += diff_bs
            diff_type = "danger"
            diff_str = f"-Bs. {diff_bs:,.2f}"
        else:
            ganancia_ves += abs(diff_bs)
            diff_type = "success"
            diff_str = f"+Bs. {abs(diff_bs):,.2f}"
            
        operations.append({
            "id": p.numero_documento,
            "client": prov_name,
            "rateIssue": f"{tasa_issue:.2f}",
            "rateCollection": f"{tasa_val:.2f}",
            "amountUsd": f"${saldo_usd:,.2f}",
            "amountBsIssue": f"Bs. {(saldo_usd * tasa_issue):,.2f}",
            "amountBsCollection": f"Bs. {(saldo_usd * tasa_val):,.2f}",
            "diff": diff_str,
            "diffType": diff_type
        })

    neto_ves = ganancia_ves - perdida_ves
    neto_usd = neto_ves / tasa_val if tasa_val > 0 else 0.0

    metrics = [
        {
            "label": "Ganancia Cambiaria",
            "value": f"Bs. {ganancia_ves:,.2f}",
            "desc": "Ajuste positivo acumulado",
            "color": "text-green-600",
            "type": "up"
        },
        {
            "label": "Pérdida Cambiaria",
            "value": f"Bs. {perdida_ves:,.2f}",
            "desc": "Ajuste negativo acumulado",
            "color": "text-red-500",
            "type": "down"
        },
        {
            "label": "Diferencial Cambiario Neto",
            "value": f"Bs. {neto_ves:,.2f}",
            "desc": f"Equivalente a ${neto_usd:,.2f} USD",
            "color": "text-[#0b5156]" if neto_ves >= 0 else "text-red-600",
            "type": "activity"
        }
    ]

    insight = (
        f"La devaluación acumulada del período genera una ganancia cambiaria nominal en Bolívares de Bs. {ganancia_ves:,.2f} "
        f"y una pérdida cambiaria de Bs. {perdida_ves:,.2f}, resultando en un diferencial neto de Bs. {neto_ves:,.2f}."
    )

    return {
        "metrics": metrics,
        "operations": operations,
        "insight": insight
    }


@reportes_router.get("/eficiencia")
def reporte_eficiencia(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import Sucursal, Compra, CuentaPorPagar
    from backend.models.operations import Venta
    from datetime import datetime, timezone
    
    sucursales = db.query(Sucursal).filter(
        Sucursal.tenant_id == current_user.tenant_id,
        Sucursal.estado == "Activo"
    ).all()

    ventas_totales = db.query(func.sum(Venta.total_usd)).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.estado == "ACTIVA"
    ).scalar() or 0.0
    ventas_totales = float(ventas_totales)

    gastos_totales = db.query(func.sum(CuentaPorPagar.monto_total_usd)).filter(
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).scalar() or 0.0
    gastos_totales = float(gastos_totales)

    if not sucursales:
        distribucion = [
            {"id": 0, "nombre": "Sede Principal", "pct_sales": 1.0, "pct_expenses": 1.0, "meta": max(10000.0, float(gastos_totales) * 1.2)}
        ]
    else:
        distribucion = []
        for idx, s in enumerate(sucursales):
            pct_s = 1.0 / len(sucursales)
            distribucion.append({
                "id": s.id,
                "nombre": s.nombre,
                "pct_sales": pct_s,
                "pct_expenses": pct_s,
                "meta": max(5000.0, (float(gastos_totales) / len(sucursales)) * 1.2)
            })

    branches_data = []
    for d in distribucion:
        s_sales = ventas_totales * d["pct_sales"]
        s_fixed = gastos_totales * d["pct_expenses"]
        
        profitable = s_sales >= s_fixed
        status = "SUPERÁVIT" if profitable else "DÉFICIT"
        status_color = "bg-green-50 text-green-700 border-green-200" if profitable else "bg-red-50 text-red-700 border-red-200"
        
        meta_s = d["meta"]
        marker_pct = (s_fixed / meta_s * 100.0) if meta_s > 0 else 0.0
        progress_pct = (s_sales / meta_s * 100.0) if meta_s > 0 else 0.0
        
        missing_val = max(0.0, s_fixed - s_sales)
        missing_str = f"${missing_val:,.2f}" if missing_val > 0 else None

        branches_data.append({
            "name": d["nombre"],
            "sales": f"${s_sales:,.2f}",
            "fixedExpenses": f"${s_fixed:,.2f}",
            "status": status,
            "statusColor": status_color,
            "marker": min(100, int(marker_pct)),
            "progress": min(100, int(progress_pct)),
            "profitable": profitable,
            "required": f"${s_fixed:,.2f}",
            "missing": missing_str,
            "meta": f"${meta_s:,.2f}"
        })

    margen_neto = ((ventas_totales - gastos_totales) / ventas_totales * 100.0) if ventas_totales > 0 else 0.0
    metrics = [
        {
            "label": "Margen Operativo General",
            "value": f"{margen_neto:.1f}%",
            "desc": "Utilidad neta consolidada",
            "color": "text-[#0b5156]" if margen_neto >= 0 else "text-red-600",
            "type": "trend"
        },
        {
            "label": "Punto Equilibrio Global",
            "value": f"${gastos_totales:,.2f}",
            "desc": "Ventas mínimas requeridas",
            "color": "text-green-600",
            "type": "target"
        },
        {
            "label": "Eficiencia Consolidada",
            "value": f"{round((ventas_totales / gastos_totales * 100.0) if gastos_totales > 0 else 0.0, 1)}%",
            "desc": "Relación Ingresos/Egresos",
            "color": "text-[#0b5156]" if ventas_totales >= gastos_totales else "text-red-500",
            "type": "building"
        }
    ]

    insight = (
        f"El punto de equilibrio consolidado se ubica en ${gastos_totales:,.2f} USD. "
        f"Las sucursales que presenten ventas por debajo de su costo fijo incurren en déficit operativo."
    )

    return {
        "metrics": metrics,
        "branches": branches_data,
        "insight": insight
    }


@reportes_router.get("/matriz-abc")
def matriz_abc(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.services.analitica_inventario import calcular_matriz_abc

    clasificados = calcular_matriz_abc(db, current_user.tenant_id)

    stars_items = []
    questions_items = []
    cows_items = []
    dogs_items = []

    buckets = {"stars": stars_items, "questions": questions_items, "cows": cows_items, "dogs": dogs_items}

    for c in clasificados:
        p = c.producto
        item_formatted = {
            "name": p.nombre,
            "nombre": p.nombre,
            "value": f"Margen: {c.rentabilidad:.1f}% ({int(c.rotacion)} u. vendidas)",
            "valor": f"Margen: {c.rentabilidad:.1f}% ({int(c.rotacion)} u. vendidas)"
        }
        buckets[c.cuadrante].append(item_formatted)

    products_data = clasificados  # usado más abajo solo para el conteo del insight

    stars_items = stars_items[:10]
    questions_items = questions_items[:10]
    cows_items = cows_items[:10]
    dogs_items = dogs_items[:10]
    
    quadrants = [
        {
            "id": "stars",
            "title": "Estrellas",
            "subtitle": "Alta Rotación • Alto Margen",
            "desc": "Productos clave para el negocio. Garantizar disponibilidad y vigilar el stock.",
            "color": "border-[#0b5156] bg-teal-50/10",
            "textColor": "text-[#0b5156]",
            "items": stars_items
        },
        {
            "id": "questions",
            "title": "Incógnitas",
            "subtitle": "Baja Rotación • Alto Margen",
            "desc": "Productos con buena ganancia pero poca salida. Considerar campañas de promoción.",
            "color": "border-blue-300 bg-blue-50/10",
            "textColor": "text-blue-600",
            "items": questions_items
        },
        {
            "id": "cows",
            "title": "Vacas de Efectivo",
            "subtitle": "Alta Rotación • Bajo Margen",
            "desc": "Generadores constantes de liquidez. Mantener inventario optimizado.",
            "color": "border-green-500 bg-green-50/10",
            "textColor": "text-green-600",
            "items": cows_items
        },
        {
            "id": "dogs",
            "title": "Perros",
            "subtitle": "Baja Rotación • Bajo Margen",
            "desc": "Bajo aporte al negocio. Evaluar su descontinuación o venta en liquidación.",
            "color": "border-red-300 bg-red-50/10",
            "textColor": "text-red-500",
            "items": dogs_items
        }
    ]
    
    insight = (
        f"El algoritmo procesó {len(products_data)} productos del catálogo. "
        f"Se identificaron {len(stars_items)} productos Estrella, {len(questions_items)} Incógnitas, "
        f"{len(cows_items)} Vacas de Efectivo y {len(dogs_items)} Perros. "
        f"Se recomienda asegurar el stock de las Estrellas."
    )
    
    return {
        "quadrants": quadrants,
        "insight": insight
    }


@reportes_router.get("/rentabilidad")
def rentabilidad_productos(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.services.analitica_inventario import calcular_rentabilidad

    calculados = calcular_rentabilidad(db, current_user.tenant_id)

    total_rentabilidad = 0.0
    items_count = 0
    prod_rentables = 0
    prod_perdida = 0
    total_valor_riesgo = 0.0

    products_list = []

    for c in calculados:
        p = c.producto
        p_precio = float(p.precio_usd or 0.0)
        p_costo = float(p.costo_usd or 0.0)
        gasto_operativo = c.gasto_operativo
        margen_neto = c.margen_neto
        margen_neto_pct = c.margen_neto_pct
        is_loss = c.is_loss

        if is_loss:
            prod_perdida += 1
            total_valor_riesgo += float(p.stock) * abs(margen_neto)
        else:
            prod_rentables += 1

        total_rentabilidad += margen_neto_pct
        items_count += 1

        status = "Rentable" if margen_neto > 0 else "Crítico"
        status_color = "bg-green-50 text-green-700 border-green-200" if margen_neto > 0 else "bg-red-50 text-red-700 border-red-200"

        products_list.append({
            "name": p.nombre,
            "price": f"${p_precio:,.2f}",
            "cost": f"${p_costo:,.2f}",
            "opExp": f"${gasto_operativo:,.2f}",
            "netMargin": f"${margen_neto:,.2f}",
            "netPercent": f"{margen_neto_pct:.1f}%",
            "status": status,
            "statusColor": status_color,
            "isLoss": is_loss
        })

    avg_margen = (total_rentabilidad / items_count) if items_count > 0 else 0.0
    
    metrics = [
        {
            "label": "Margen Neto Promedio",
            "value": f"{avg_margen:.1f}%",
            "desc": "Margen neta ponderada",
            "color": "text-green-600" if avg_margen >= 0 else "text-red-500",
            "type": "scale"
        },
        {
            "label": "Productos con Pérdida",
            "value": str(prod_perdida),
            "desc": "Margen neto crítico",
            "color": "text-red-600" if prod_perdida > 0 else "text-slate-800",
            "type": "down"
        },
        {
            "label": "Valor en Riesgo",
            "value": f"${total_valor_riesgo:,.2f}",
            "desc": "Pérdida latente en stock",
            "color": "text-red-500",
            "type": "alert"
        },
        {
            "label": "SKUs Analizados",
            "value": str(items_count),
            "desc": "Items de catálogo",
            "color": "text-[#0b5156]",
            "type": "trend"
        }
    ]
    
    insight = (
        f"El catálogo de productos del tenant cuenta con {items_count} SKUs analizados. "
        f"Se registra un margen neto promedio ponderado del {avg_margen:.1f}%. "
        f"Se detectaron {prod_perdida} productos con margen de utilidad neto negativo."
    )
    
    return {
        "metrics": metrics,
        "products": products_list,
        "insight": insight
    }


def _parse_vendedor_ids(vendedor_ids: str = None):
    """Parsea el query param `vendedor_ids` ("1,2,3") a una lista de enteros.
    Devuelve None cuando no se envía el filtro (comportamiento: todos los
    vendedores, igual que antes de este filtro)."""
    if not vendedor_ids:
        return None
    ids = []
    for raw in vendedor_ids.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            ids.append(int(raw))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"vendedor_ids inválido: '{raw}' no es un ID numérico.",
            )
    return ids or None


@reportes_router.get("/vendedores")
def reporte_vendedores(vendedor_ids: str = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import Vendedor, CuentaPorCobrar
    from backend.models.operations import Venta
    from datetime import datetime, timezone

    ids_filtro = _parse_vendedor_ids(vendedor_ids)

    ventas_query = db.query(Venta).filter(Venta.tenant_id == current_user.tenant_id, Venta.estado == "ACTIVA")
    if ids_filtro is not None:
        ventas_query = ventas_query.filter(Venta.vendedor_id.in_(ids_filtro))
    ventas = ventas_query.all()

    cxc_query = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id == current_user.tenant_id)
    if ids_filtro is not None:
        # Restringimos la CxC a las ventas ya filtradas por vendedor (evita
        # una segunda consulta ambigua vía relationship y mantiene todo
        # tenant-scoped).
        venta_ids_filtradas = [v.id for v in ventas]
        cxc_query = cxc_query.filter(CuentaPorCobrar.venta_id.in_(venta_ids_filtradas))
    cxc = cxc_query.all()

    total_facturado = sum(to_float(v.total_usd) for v in ventas)
    total_cobrado = sum(to_float(c.monto_pagado_usd) for c in cxc)
    sales_force = []

    vendedores_query = db.query(Vendedor).filter(
        Vendedor.tenant_id == current_user.tenant_id,
        Vendedor.activo == True
    )
    if ids_filtro is not None:
        vendedores_query = vendedores_query.filter(Vendedor.id.in_(ids_filtro))
    vendedores = vendedores_query.all()

    # --- Comisión: usar el valor REAL calculado y persistido en cada venta
    # (Venta.comision_usd, congelado a la tasa vigente del vendedor en el
    # momento de la emisión de la factura) en vez de recalcular un 5% plano
    # para todas las ventas.
    #
    # FALLBACK EXPLÍCITO (no silencioso): las ventas emitidas ANTES de la
    # migración que agregó esta columna tienen `comision_usd IS NULL` (su
    # comisión real nunca se calculó ni se guardó). Para esas, y SOLO para
    # esas, se mantiene la estimación histórica de 5% sobre el monto
    # efectivamente cobrado — igual que hacía este reporte antes de que
    # existiera `comision_usd` — para no mostrar $0 de comisión sobre el
    # histórico pre-migración.
    def _comision_con_fallback(ventas_grupo, cxc_grupo):
        ventas_con_dato = [v for v in ventas_grupo if v.comision_usd is not None]
        ventas_sin_dato_ids = {v.id for v in ventas_grupo if v.comision_usd is None}
        comision_real = sum(to_float(v.comision_usd) for v in ventas_con_dato)
        cobrado_sin_dato = sum(
            to_float(c.monto_pagado_usd) for c in cxc_grupo
            if c.venta_id in ventas_sin_dato_ids
        )
        comision_estimada_legacy = cobrado_sin_dato * 0.05
        return comision_real + comision_estimada_legacy

    if not vendedores and ids_filtro is None:
        # Fallback histórico: tenant sin vendedores registrados en absoluto.
        # Si el usuario filtró por vendedor_ids y ninguno coincidió, NO se
        # aplica este fallback (mostraría un total "Vendedor Interno" que no
        # respeta el filtro que el usuario pidió) — simplemente cae al bloque
        # `else` con `vendedores` vacío, que produce una lista vacía.
        v_billed = total_facturado
        v_collected = total_cobrado
        v_efficiency = (v_collected / v_billed * 100.0) if v_billed > 0 else 100.0
        v_commission = _comision_con_fallback(ventas, cxc)
        total_comision = v_commission
        v_overdue_pct = max(0.0, 100.0 - v_efficiency)
        status = "ACTIVO" if v_efficiency >= 75 else "REVISIÓN"
        status_color = "bg-green-50 text-green-700 border-green-200" if v_efficiency >= 75 else "bg-red-50 text-red-700 border-red-200"

        sales_force.append({
            "name": "Vendedor Interno",
            "billed": f"${v_billed:,.2f}",
            "collected": f"${v_collected:,.2f}",
            "efficiency": f"{v_efficiency:.1f}%",
            "dso": "0 días",
            "overdue": f"{v_overdue_pct:.1f}%",
            "commission": f"${v_commission:,.2f}",
            "status": status,
            "statusColor": status_color,
            "isCritical": v_efficiency < 75
        })
    else:
        total_comision = 0.0
        for v in vendedores:
            ventas_v = [venta for venta in ventas if getattr(venta, 'vendedor_id', None) == v.id]
            v_billed = sum(float(venta.total_usd) for venta in ventas_v)

            cxc_v = [c for c in cxc if c.venta and getattr(c.venta, 'vendedor_id', None) == v.id]
            v_collected = sum(float(c.monto_pagado_usd) for c in cxc_v)

            v_efficiency = (v_collected / v_billed * 100.0) if v_billed > 0 else (100.0 if v_collected == 0 and v_billed == 0 else 0.0)
            v_commission = _comision_con_fallback(ventas_v, cxc_v)
            total_comision += v_commission
            v_overdue_pct = max(0.0, 100.0 - v_efficiency)

            status = "ACTIVO" if v_efficiency >= 75 else "REVISIÓN"
            status_color = "bg-green-50 text-green-700 border-green-200" if v_efficiency >= 75 else "bg-red-50 text-red-700 border-red-200"

            sales_force.append({
                "id": v.id,
                "name": v.nombre,
                "billed": f"${v_billed:,.2f}",
                "collected": f"${v_collected:,.2f}",
                "efficiency": f"{v_efficiency:.1f}%",
                "dso": "30 días",
                "overdue": f"{v_overdue_pct:.1f}%",
                "commission": f"${v_commission:,.2f}",
                "porcentaje_comision": to_float(v.porcentaje_comision),
                "status": status,
                "statusColor": status_color,
                "isCritical": v_efficiency < 75
            })

    cobrabilidad_global = (total_cobrado / total_facturado * 100.0) if total_facturado > 0 else 0.0
    metrics = [
        {
            "label": "Cobrado Consolidado",
            "value": f"${total_cobrado:,.2f}",
            "desc": "Efectivo real en caja",
            "color": "text-[#0b5156]",
            "type": "dollar"
        },
        {
            "label": "Cobrabilidad Media",
            "value": f"{cobrabilidad_global:.1f}%",
            "desc": "Efectividad de recaudo",
            "color": "text-green-600" if cobrabilidad_global >= 75 else "text-amber-500",
            "type": "percent"
        },
        {
            "label": "Comisiones Liquidadas",
            "value": f"${total_comision:,.2f}",
            "desc": "Tasa real por vendedor (5% hist. si no hay dato)",
            "color": "text-[#0b5156]",
            "type": "clock"
        },
        {
            "label": "Vendedores Críticos",
            "value": str(sum(1 for v in sales_force if v["isCritical"])),
            "desc": "Rendimiento < 75%",
            "color": "text-red-600",
            "type": "alert"
        }
    ]

    insight = (
        f"El porcentaje de cobrabilidad promedio de la fuerza comercial del tenant es del {cobrabilidad_global:.1f}%. "
        f"Las comisiones se calculan con la tasa real configurada por vendedor sobre cada venta emitida "
        f"(congelada al momento de la factura); para ventas históricas sin ese dato se estima 5% sobre el cobro efectivo."
    )

    return {
        "metrics": metrics,
        "salesForce": sales_force,
        "insight": insight
    }


@reportes_router.get("/excepciones")
def reporte_excepciones(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import AuditoriaLog, Compra
    from backend.models.operations import Producto, Venta
    from datetime import datetime, timezone
    
    agotados = db.query(Producto).filter(
        Producto.tenant_id == current_user.tenant_id,
        Producto.stock <= 0
    ).all()
    
    ventas_anuladas = db.query(Venta).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.estado == "ANULADA"
    ).all()
    
    compras_anuladas = db.query(Compra).filter(
        Compra.tenant_id == current_user.tenant_id,
        Compra.estado == "ANULADA"
    ).all()

    logs = db.query(AuditoriaLog).filter(
        AuditoriaLog.tenant_id == current_user.tenant_id
    ).order_by(AuditoriaLog.fecha.desc()).all()

    exceptions_list = []
    
    for a in agotados:
        exceptions_list.append({
            "time": "Reciente",
            "type": "Stock Agotado",
            "typeColor": "bg-red-50 text-red-700 border-red-100",
            "user": "Sistema",
            "ref": a.sku,
            "value": "N/A",
            "justification": f"Producto '{a.nombre}' se quedó sin existencia física.",
            "risk": "Alto",
            "riskColor": "bg-red-50 text-red-600"
        })
        
    for v in ventas_anuladas:
        exceptions_list.append({
            "time": v.fecha.strftime("%Y-%m-%d %H:%M") if v.fecha else "N/A",
            "type": "Venta Anulada",
            "typeColor": "bg-red-50 text-red-700 border-red-100",
            "user": "Ventas",
            "ref": v.numero_factura,
            "value": f"${float(v.total_usd):,.2f}",
            "justification": "Factura anulada por el departamento de facturación.",
            "risk": "Crítico",
            "riskColor": "bg-red-100 text-red-700"
        })
        
    for c in compras_anuladas:
        exceptions_list.append({
            "time": c.fecha.strftime("%Y-%m-%d %H:%M") if c.fecha else "N/A",
            "type": "Compra Anulada",
            "typeColor": "bg-red-50 text-red-700 border-red-100",
            "user": "Compras",
            "ref": c.numero_factura,
            "value": f"${float(c.total_usd):,.2f}",
            "justification": "Orden de compra anulada por proveedor.",
            "risk": "Alto",
            "riskColor": "bg-red-50 text-red-600"
        })

    for log in logs:
        exceptions_list.append({
            "time": log.fecha.strftime("%Y-%m-%d %H:%M") if log.fecha else "N/A",
            "type": log.accion,
            "typeColor": "bg-slate-50 text-slate-700 border-slate-100",
            "user": log.usuario,
            "ref": log.modulo,
            "value": "Auditoría",
            "justification": log.detalle[:100] if log.detalle else "Registro de logs",
            "risk": "Medio",
            "riskColor": "bg-amber-50 text-amber-700"
        })

    exceptions_list = exceptions_list[:50]
    total_exceptions = len(exceptions_list)
    total_valor_anulado = sum(float(v.total_usd) for v in ventas_anuladas)
    usuarios_inv = len(set(log.usuario for log in logs))
    
    metrics = [
        {
            "label": "Excepciones Totales",
            "value": str(total_exceptions),
            "desc": "Eventos bajo revisión",
            "color": "text-slate-800",
            "borderColor": "border-slate-300",
            "type": "file"
        },
        {
            "label": "Monto Anulado",
            "value": f"${total_valor_anulado:,.2f}",
            "desc": "Facturas canceladas",
            "color": "text-red-600",
            "borderColor": "border-red-500",
            "type": "credit"
        },
        {
            "label": "Usuarios Involucrados",
            "value": str(max(1, usuarios_inv)),
            "desc": "Acceso a excepciones",
            "color": "text-blue-500",
            "borderColor": "border-blue-500",
            "type": "package"
        },
        {
            "label": "SKUs Agotados",
            "value": str(len(agotados)),
            "desc": "Afecta operatividad",
            "color": "text-red-500",
            "borderColor": "border-red-400",
            "type": "percent"
        }
    ]

    insight = (
        f"Se registran {total_exceptions} excepciones de control. El volumen de facturas anuladas sumó "
        f"${total_valor_anulado:,.2f} USD. Se recomienda auditar las anulaciones del período."
    )

    return {
        "metrics": metrics,
        "exceptions": exceptions_list,
        "insight": insight
    }


@reportes_router.get("/exportar")
def exportar_reporte(reporte: str, periodo: str = None, formato: str = "csv", vendedor_ids: str = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    import io
    import csv
    from datetime import datetime, timezone

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    if reporte == "ventas":
        data_sales = reporte_ventas(periodo, db, current_user)
        writer.writerow(["REPORTE DE VENTAS - PERIODO " + (periodo or "")])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_sales["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Top Clientes"])
        writer.writerow(["Cliente", "Participacion", "Monto"])
        for c in data_sales["topClients"]:
            writer.writerow([c["name"], c["share"], c["amount"]])
        writer.writerow([])
        writer.writerow(["Top Productos"])
        writer.writerow(["Producto", "Cantidad", "Monto"])
        for p in data_sales["topProducts"]:
            writer.writerow([p["name"], p["qty"], p["amount"]])
            
    elif reporte == "compras":
        data_purch = reporte_compras(periodo, db, current_user)
        writer.writerow(["REPORTE DE COMPRAS - PERIODO " + (periodo or "")])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_purch["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Gasto por Categoria"])
        writer.writerow(["Categoria", "Monto", "Porcentaje"])
        for cat in data_purch["categories"]:
            writer.writerow([cat["name"], cat["amount"], f"{cat['percentage']}%"])
        writer.writerow([])
        writer.writerow(["Proveedores Criticos"])
        writer.writerow(["Proveedor", "Monto", "Evaluacion"])
        for s in data_purch["suppliers"]:
            writer.writerow([s["name"], s["amount"], s["quality"]])
            
    elif reporte == "antiguedad":
        data_aging = reporte_antiguedad(db, current_user)
        writer.writerow(["REPORTE DE ANTIGUEDAD DE CARTERA - KODA ERP"])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_aging["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Antiguedad por Cliente"])
        writer.writerow(["Cliente", "Total Saldo", "Vencido", "0-30 d", "31-60 d", "+60 d", "Perdida Val. (Bs)", "Riesgo"])
        for cli in data_aging["clientsData"]:
            writer.writerow([cli["name"], cli["total"], cli["overdue"], cli["days0_30"], cli["days31_60"], cli["daysPlus60"], cli["loss"], cli["risk"]])

    elif reporte == "diferencial":
        data_diff = reporte_diferencial(db, current_user)
        writer.writerow(["REPORTE DE DIFERENCIAL CAMBIARIO REALIZADO - KODA ERP"])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_diff["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Detalle de Operaciones"])
        writer.writerow(["Documento", "Cliente / Proveedor", "Tasa Emision", "Tasa Cobro", "Monto USD", "Bs (Emision)", "Bs (Cobro)", "Diferencial"])
        for op in data_diff["operations"]:
            writer.writerow([op["id"], op["client"], op["rateIssue"], op["rateCollection"], op["amountUsd"], op["amountBsIssue"], op["amountBsCollection"], op["diff"]])

    elif reporte == "eficiencia":
        data_eff = reporte_eficiencia(db, current_user)
        writer.writerow(["REPORTE DE EFICIENCIA OPERATIVA POR SUCURSAL"])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_eff["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Desglose por Sucursal"])
        writer.writerow(["Sucursal", "Ventas Actuales", "Gastos Fijos", "Ventas Requeridas", "Diferencia / Faltante", "Meta", "Estado"])
        for b in data_eff["branches"]:
            writer.writerow([b["name"], b["sales"], b["fixedExpenses"], b["required"], b["missing"] or "0.00", b["meta"], b["status"]])

    elif reporte == "rentabilidad":
        data_prof = rentabilidad_productos(db, current_user)
        writer.writerow(["REPORTE DE RENTABILIDAD NETAS POR SKU"])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_prof["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Desglose de Margen Real"])
        writer.writerow(["Producto / SKU", "Precio Venta (USD)", "Costo Reposic. (USD)", "Gasto Oper. (Prorr)", "Margen Neto ($)", "Margen Neto (%)", "Estado"])
        for p in data_prof["products"]:
            writer.writerow([p["name"], p["price"], p["cost"], p["opExp"], p["netMargin"], p["netPercent"], p["status"]])

    elif reporte == "vendedores":
        data_vend = reporte_vendedores(vendedor_ids, db, current_user)
        writer.writerow(["REPORTE DE RENDIMIENTO FUERZA DE VENTAS Y COMISIONES"])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_vend["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Ranking de Efectividad"])
        writer.writerow(["Vendedor", "Facturado ($)", "Cobrado ($)", "% Cobrabilidad", "DSO (Dias)", "% Vencido", "Comision", "Estado"])
        for s in data_vend["salesForce"]:
            writer.writerow([s["name"], s["billed"], s["collected"], s["efficiency"], s["dso"], s["overdue"], s["commission"], s["status"]])

    elif reporte == "excepciones":
        data_exc = reporte_excepciones(db, current_user)
        writer.writerow(["REPORTE DE EXCEPCIONES Y LOGS DE AUDITORIA"])
        writer.writerow([])
        writer.writerow(["Metricas"])
        for m in data_exc["metrics"]:
            writer.writerow([m["label"], m["value"], m.get("desc", m.get("trend", ""))])
        writer.writerow([])
        writer.writerow(["Bitacora de Acciones de Alto Riesgo"])
        writer.writerow(["Fecha/Hora", "Tipo", "Usuario", "Referencia", "Valor Afectado", "Justificacion", "Riesgo"])
        for ex in data_exc["exceptions"]:
            writer.writerow([ex["time"], ex["type"], ex["user"], ex["ref"], ex["value"], ex["justification"], ex["risk"]])

    elif reporte == "abc":
        data_abc = matriz_abc(db, current_user)
        writer.writerow(["MATRIZ ABC DE INVENTARIO - ESTRATEGICO"])
        writer.writerow([])
        writer.writerow(["Insight:"])
        writer.writerow([data_abc["insight"]])
        writer.writerow([])
        for q in data_abc["quadrants"]:
            writer.writerow(["Cuadrante: " + q["title"] + " (" + q["subtitle"] + ")"])
            writer.writerow(["Descripcion: " + q["desc"]])
            writer.writerow(["Nombre Producto", "Metrica/Margen"])
            for item in q["items"]:
                writer.writerow([item["name"], item["value"]])
            writer.writerow([])
    else:
        writer.writerow(["REPORTE DESCONOCIDO"])

    output = io.BytesIO(buffer.getvalue().encode("utf-8-sig"))
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=reporte_{reporte}_{periodo or 'koda'}.csv"}
    )


@reportes_router.get("/query-builder/exportar")
def exportar_query_builder(fields: str, periodo: str = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    import io
    import csv
    from datetime import datetime, timezone
    from backend.models.operations import Venta, VentaDetalle, Producto
    
    field_keys = [f.strip() for f in fields.split(",") if f.strip()]
    
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    
    headers = [k.upper() for k in field_keys]
    writer.writerow(headers)
    
    from sqlalchemy.orm import joinedload

    query = db.query(VentaDetalle).join(Venta).options(
        joinedload(VentaDetalle.venta).joinedload(Venta.cliente),
        joinedload(VentaDetalle.venta).joinedload(Venta.vendedor),
        joinedload(VentaDetalle.producto)
    ).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.estado == "ACTIVA"
    )
    
    if periodo:
        try:
            inicio, fin = periodo_rango(periodo)
            query = query.filter(Venta.fecha >= inicio, Venta.fecha < fin)
        except:
            pass
            
    detalles = query.all()
    
    for d in detalles:
        row = []
        for key in field_keys:
            if key == "date":
                row.append(d.venta.fecha.strftime("%Y-%m-%d") if d.venta and d.venta.fecha else "N/A")
            elif key == "branch":
                row.append("Principal" if not getattr(d.venta, 'sucursal_id', None) else "Otra Sucursal")
            elif key == "customer":
                row.append(d.venta.cliente.nombre if d.venta and d.venta.cliente else "CLIENTE GENERAL")
            elif key == "sku":
                row.append(d.producto.sku if d.producto else "N/A")
            elif key == "category":
                row.append("General" if not d.producto else ("Exento" if d.producto.es_exento else "Gravado"))
            elif key == "seller":
                row.append(d.venta.vendedor.nombre if d.venta and getattr(d.venta, 'vendedor', None) else "NO ASIGNADO")
            elif key == "netAmount":
                row.append(f"{float(d.precio_usd_capturado * d.cantidad):.2f}")
            elif key == "quantity":
                row.append(f"{float(d.cantidad):.2f}")
            elif key == "cost":
                costo = float(d.producto.costo_usd) if d.producto else 0.0
                row.append(f"{costo * float(d.cantidad):.2f}")
            elif key == "margin":
                precio = float(d.precio_usd_capturado)
                costo = float(d.producto.costo_usd) if d.producto else 0.0
                margin = ((precio - costo) / precio * 100.0) if precio > 0 else 0.0
                row.append(f"{margin:.1f}%")
            elif key == "tax":
                row.append(f"{float(d.precio_usd_capturado * d.cantidad * Decimal('0.16')):.2f}")
            else:
                row.append("")
        writer.writerow(row)
        
    output = io.BytesIO(buffer.getvalue().encode("utf-8-sig"))
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=query_koda_export.csv"}
    )


@reportes_router.post("/bloquear")
def bloquear_periodo_critico(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import AuditoriaLog
    from datetime import datetime, timezone
    
    log = AuditoriaLog(
        tenant_id=current_user.tenant_id,
        usuario=current_user.email,
        accion="CIERRE_PERIODO",
        modulo="REPORTES",
        detalle="Se ha bloqueado el período operativo crítico para auditoría de control interno por el usuario.",
        fecha=datetime.now(timezone.utc)
    )
    db.add(log)
    db.commit()
    return {"status": "ok", "message": "Período crítico bloqueado exitosamente."}


# --- VENTAS EXTENDIDAS ---
