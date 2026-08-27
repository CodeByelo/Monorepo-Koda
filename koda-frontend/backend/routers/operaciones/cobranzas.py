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

cobranzas_router = APIRouter(prefix="/cobranzas", tags=["Cobranzas"], dependencies=[Depends(get_current_user)])


def _sync_cxc_desde_ventas(db: Session, tenant_id):
    """Genera CxC para ventas a crédito sin documento asociado."""
    ventas_credito = db.query(Venta).filter(
        Venta.estado == "ACTIVA",
        Venta.metodo_pago.in_(["Transferencia", "PagoMovil"]),
        Venta.tenant_id == tenant_id
    ).all()
    clientes = db.query(Cliente).filter(Cliente.tenant_id == tenant_id).all()
    if not clientes:
        return
    cli = clientes[0]
    for v in ventas_credito:
        existe = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.numero_documento == v.numero_factura,
            CuentaPorCobrar.tenant_id == tenant_id
        ).first()
        if not existe:
            tasa_bs = Decimal(str(tasa_actual(db, tenant_id)))
            try:
                db.add(CuentaPorCobrar(
                    cliente_id=cli.id,
                    venta_id=v.id,
                    numero_documento=v.numero_factura,
                    monto_total_usd=v.total,
                    monto_pagado_usd=Decimal("0"),
                    tasa_cambio_bs=tasa_bs,
                    fecha_emision=v.fecha,
                    fecha_vencimiento=v.fecha + timedelta(days=30),
                    estado="PENDIENTE",
                    tenant_id=tenant_id
                ))
                db.commit()
            except Exception:
                db.rollback()


@cobranzas_router.get("/kpis")
def cobranzas_kpis(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    pendiente = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).scalar() or 0
    vencido = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < datetime.utcnow(),
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).scalar() or 0
    
    clientes_mora = db.query(CuentaPorCobrar.cliente_id).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < datetime.utcnow(),
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).distinct().count()

    return [
        {"label": "TOTAL POR COBRAR", "value": f"${to_float(pendiente):,.2f}", "desc": "Documentos abiertos", "color": "text-slate-800"},
        {"label": "VENCIDO (MORA)", "value": f"${to_float(vencido):,.2f}", "desc": "Prioridad alta", "color": "text-red-600"},
        {"label": "POR VENCER", "value": f"${max(0, to_float(pendiente) - to_float(vencido)):,.2f}", "desc": "Próximos 30 días", "color": "text-[#43584b]"},
        {"label": "CLIENTES EN MORA", "value": str(clientes_mora), "desc": "Activos", "color": "text-red-600"},
    ]


@cobranzas_router.get("/criticas")
def facturas_criticas(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    rows = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < datetime.utcnow(),
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).limit(10).all()
    return [{
        "doc": r.numero_documento, 
        "cliente": r.cliente.nombre if r.cliente else "", 
        "monto": to_float(r.monto_total - r.monto_pagado),
        "telefono": r.cliente.telefono if r.cliente and hasattr(r.cliente, 'telefono') else "No registrado",
        "email": r.cliente.email if r.cliente and hasattr(r.cliente, 'email') else "No registrado",
        "direccion": r.cliente.direccion if r.cliente and hasattr(r.cliente, 'direccion') else "No registrada"
    } for r in rows]


@cobranzas_router.get("/cartera")
def cartera_clientes(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    clientes = db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()
    result = []
    for c in clientes:
        # Documentos pendientes y saldo total
        cxc_pendientes = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.cliente_id == c.id, 
            CuentaPorCobrar.estado != "PAGADA",
            CuentaPorCobrar.tenant_id == current_user.tenant_id
        ).all()
        
        docs_count = len(cxc_pendientes)
        saldo = sum(to_float(cxc.monto_total) - to_float(cxc.monto_pagado) for cxc in cxc_pendientes)
        
        # Mora real (vencidas)
        ahora = datetime.now(timezone.utc)
        cxc_vencidas = [cxc for cxc in cxc_pendientes if _as_aware(cxc.fecha_vencimiento) < ahora]
        mora_real = sum(to_float(cxc.monto_total) - to_float(cxc.monto_pagado) for cxc in cxc_vencidas)
        
        # Último pago (aproximado usando la fecha de la última factura PAGADA)
        ultima_cxc_pagada = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.cliente_id == c.id,
            CuentaPorCobrar.estado == "PAGADA",
            CuentaPorCobrar.tenant_id == current_user.tenant_id
        ).order_by(CuentaPorCobrar.fecha_emision.desc()).first()
        
        ultimo_pago = ultima_cxc_pagada.fecha_emision.strftime("%d/%m/%Y") if ultima_cxc_pagada else "Sin pagos"

        result.append({
            "id": c.rif, 
            "name": c.nombre, 
            "nombre": c.nombre, 
            "rif": c.rif, 
            "balance": saldo,
            "docs_count": docs_count,
            "ultimo_pago": ultimo_pago,
            "mora_real": mora_real,
            "status": "MORA" if mora_real > 0 else "AL DÍA"
        })
    return result


@cobranzas_router.get("/antiguedad")
def antiguedad_saldos(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    ahora = datetime.now(timezone.utc)
    rangos = {"0-30 días": 0, "31-60 días": 0, "61-90 días": 0, "+90 días": 0}
    for r in db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all():
        dias = (ahora - _as_aware(r.fecha_vencimiento)).days
        saldo = to_float(r.monto_total - r.monto_pagado)
        if dias <= 30:
            rangos["0-30 días"] += saldo
        elif dias <= 60:
            rangos["31-60 días"] += saldo
        elif dias <= 90:
            rangos["61-90 días"] += saldo
        else:
            rangos["+90 días"] += saldo
    total = sum(rangos.values()) or 1
    return [{"rango": k, "monto": v, "pct": round(v / total * 100, 1)} for k, v in rangos.items()]


@cobranzas_router.get("/antiguedad-detalle")
def antiguedad_saldos_detalle(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    ahora = datetime.now(timezone.utc)
    
    # Get current BCV rate
    tasa_actual_bcv = float(tasa_actual(db, current_user.tenant_id))
    
    tramos = [
        {"l": "CORRIENTE", "v": 0.0, "c": "bg-emerald-500", "min": -9999, "max": 0},
        {"l": "1-15 DÍAS", "v": 0.0, "c": "bg-[#0b5156]", "min": 1, "max": 15},
        {"l": "16-30 DÍAS", "v": 0.0, "c": "bg-blue-600", "min": 16, "max": 30},
        {"l": "31-60 DÍAS", "v": 0.0, "c": "bg-amber-600", "min": 31, "max": 60},
        {"l": "+60 DÍAS", "v": 0.0, "c": "bg-red-600", "min": 61, "max": 9999}
    ]
    
    facturas_expuestas = []
    total_perdida_usd = 0.0
    total_expuesto_usd = 0.0
    
    cxc_list = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    
    for r in cxc_list:
        dias_mora = (ahora - _as_aware(r.fecha_vencimiento)).days
        saldo_usd_origen = float(r.monto_total_usd - r.monto_pagado_usd)
        
        # Determine tramo
        for t in tramos:
            if t["min"] <= dias_mora <= t["max"]:
                t["v"] += saldo_usd_origen
                break
                
        # Calculate exposure (only for non-divisa sales)
        metodo = r.venta.metodo_pago if r.venta else "Transferencia"
        if metodo not in ["Divisa", "Efectivo"]:
            total_expuesto_usd += saldo_usd_origen
            tasa_origen = float(r.tasa_cambio_bs) if r.tasa_cambio_bs else tasa_actual_bcv
            
            # If current rate is higher, the original Bs amount buys less USD now
            monto_bs = saldo_usd_origen * tasa_origen
            usd_hoy = monto_bs / tasa_actual_bcv if tasa_actual_bcv > 0 else saldo_usd_origen
            perdida = saldo_usd_origen - usd_hoy
            
            if perdida > 0 or dias_mora > 0:
                total_perdida_usd += max(0, perdida)
                cliente_nombre = r.cliente.nombre if r.cliente else "Desconocido"
                
                priority = "MEDIA"
                if dias_mora > 30 or perdida > 50:
                    priority = "CRÍTICA"
                elif dias_mora > 15:
                    priority = "ALTA"
                    
                facturas_expuestas.append({
                    "client": cliente_nombre,
                    "doc": r.numero_documento,
                    "days": f"{max(0, dias_mora)}d",
                    "bs": f"Bs. {monto_bs:,.2f}",
                    "usdOrig": f"${saldo_usd_origen:,.2f}",
                    "usdNow": f"${usd_hoy:,.2f}",
                    "loss": f"-${max(0, perdida):,.2f}",
                    "priority": priority
                })

    # Calculate percentages for tramos - compute sum BEFORE converting to str
    total_cartera = sum(t["v"] for t in tramos) or 1.0
    for t in tramos:
        t["p"] = f"{round((t['v'] / total_cartera) * 100, 1)}%"
        t["v"] = f"${t['v']:,.2f}"  # format after ratio computed
        
    facturas_count = len(facturas_expuestas)
    erosion_rate = (total_perdida_usd / total_cartera * 100) if total_cartera > 0 else 0.0
    avg_mora = sum(max(0, (ahora - _as_aware(r.fecha_vencimiento)).days) for r in cxc_list) / max(1, len(cxc_list))
    
    kpis = [
        {"label": "COSTO REPOSICIÓN PERDIDO", "value": f"-${total_perdida_usd:,.2f}", "desc": "Pérdida real de capital USD", "color": "text-red-600"},
        {"label": "TASA DE EROSIÓN CARTERA", "value": f"{erosion_rate:.1f}%", "desc": "Impacto devaluación en CxC", "color": "text-amber-600"},
        {"label": "FACTURAS EXPUESTAS", "value": str(facturas_count), "desc": "Riesgo patrimonial activo", "color": "text-slate-800"},
        {"label": "PROMEDIO DÍAS MORA", "value": f"{int(avg_mora)}d", "desc": "Tiempo de rotación CxC", "color": "text-blue-600"}
    ]
    
    return {
        "kpis": kpis,
        "facturas_expuestas": sorted(facturas_expuestas, key=lambda x: (x["priority"] == "CRÍTICA", x["loss"]), reverse=True),
        "tramos": tramos
    }


@cobranzas_router.get("/erosion")
def cartera_erosion(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    
    # Calculate exposure based on payment method
    cxc_list = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    
    total_cartera = 0.0
    protegido = 0.0
    expuesto = 0.0
    riesgo = False
    
    for r in cxc_list:
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        total_cartera += saldo_usd
        
        metodo = r.venta.metodo_pago if r.venta else "Transferencia"
        if metodo in ["Divisa", "Efectivo"]:
            protegido += saldo_usd
        else:
            expuesto += saldo_usd
            riesgo = True
            
    if total_cartera == 0:
        return {
            "protegida": 0.0,
            "expuesta": 0.0,
            "protegido_usd": 0.0,
            "expuesto_usd": 0.0,
            "riesgo_detectado": False
        }
        
    return {
        "protegida": round((protegido / total_cartera) * 100, 1),
        "expuesta": round((expuesto / total_cartera) * 100, 1),
        "protegido_usd": protegido,
        "expuesto_usd": expuesto,
    }


@cobranzas_router.get("/flujo-proyectado")
def flujo_proyectado(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    ahora = datetime.now(timezone.utc)
    
    # Get current BCV rate
    tasa_actual_bcv = float(tasa_actual(db, current_user.tenant_id))
    
    # 3 buckets: 7 days, 15 days, 30 days
    buckets = [
        {"label": "Próximos 7 días", "min": -9999, "max": 7, "exp": 0.0, "color": "text-blue-600"},
        {"label": "8 - 15 días", "min": 8, "max": 15, "exp": 0.0, "color": "text-amber-600"},
        {"label": "16 - 30 días", "min": 16, "max": 30, "exp": 0.0, "color": "text-red-600"}
    ]
    
    cxc_list = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    
    facturas_impacto = []
    
    for r in cxc_list:
        # For projected flow, we look at days until due or already due
        # If already due (dias_mora > 0), they belong in the first bucket "Proximos 7 dias" for immediate collection
        dias_para_vencer = (_as_aware(r.fecha_vencimiento) - ahora).days
        
        # If it's already due, it goes into bucket 1
        if dias_para_vencer <= 0:
            dias_para_vencer = 0
            
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        
        # Find bucket
        for b in buckets:
            if b["min"] <= dias_para_vencer <= b["max"]:
                b["exp"] += saldo_usd
                break
        
        # Add to table
        tasa_origen = float(r.tasa_cambio_bs) if r.tasa_cambio_bs else tasa_actual_bcv
        monto_bs = saldo_usd * tasa_origen
        
        # Only add relevant ones to table (e.g. <= 30 days)
        if dias_para_vencer <= 30:
            facturas_impacto.append({
                "client": r.cliente.nombre if r.cliente else "Desconocido",
                "due": "Vencida" if dias_para_vencer <= 0 else f"En {dias_para_vencer}d",
                "bs": monto_bs,  # numeric for frontend calculations
                "usd": saldo_usd, # numeric for frontend calculations
            })
            
    # Format buckets
    formatted_buckets = []
    for b in buckets:
        formatted_buckets.append({
            "label": b["label"],
            "exp": b["exp"], # Sending raw number so frontend can stress it
            "color": b["color"]
        })
        
    return {
        "bcv": tasa_actual_bcv,
        "buckets": formatted_buckets,
        "invoices": sorted(facturas_impacto, key=lambda x: (x["due"] != "Vencida", x["usd"]), reverse=True)
    }


@cobranzas_router.post("/contingencia")
def ejecutar_plan_contingencia(payload: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Ejecuta un plan de contingencia real sobre las cuentas por cobrar."""
    devaluacion = payload.get("devaluacion", 10)
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    ahora = datetime.now(timezone.utc)
    
    cxc_list = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    
    facturas_afectadas = 0
    monto_expuesto_usd = 0.0
    
    for r in cxc_list:
        dias_para_vencer = (_as_aware(r.fecha_vencimiento) - ahora).days
        if dias_para_vencer <= 30:
            facturas_afectadas += 1
            monto_expuesto_usd += float(r.monto_total_usd - r.monto_pagado_usd)
            
    # En un sistema completo, aquí se insertaría un log de auditoría o se dispararía un correo a los cobradores.
    
    return {
        "ok": True, 
        "facturas_afectadas": facturas_afectadas,
        "monto_protegido_usd": round(monto_expuesto_usd, 2),
        "message": f"Plan de contingencia activado. {facturas_afectadas} documentos en protocolo de cobro acelerado por riesgo cambiario del {devaluacion}%."
    }


@cobranzas_router.get("/cuentas")
def cuentas_cobrar(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    _sync_cxc_desde_ventas(db, current_user.tenant_id)
    rows = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    return [
        {
            "id": r.id,
            "cliente": r.cliente.nombre if r.cliente else "",
            "rif": r.cliente.rif if r.cliente else "",
            "documento": r.numero_documento,
            "monto_total": to_float(r.monto_total),
            "monto_pagado": to_float(r.monto_pagado),
            "saldo": to_float(r.monto_total - r.monto_pagado),
            "fecha_emision": r.fecha_emision.strftime("%d/%m/%Y"),
            "fecha_vencimiento": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "estado": r.estado
        }
        for r in rows
    ]


@cobranzas_router.get("/recaudacion")
def recaudacion_composicion(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cxc_pagado = db.query(func.sum(CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).scalar() or 0
    
    cxc_venta_ids = db.query(CuentaPorCobrar.venta_id).filter(
        CuentaPorCobrar.venta_id != None,
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    )
    
    cajas_ventas = db.query(func.sum(Venta.total_usd)).filter(
        Venta.estado == "ACTIVA",
        Venta.tenant_id == current_user.tenant_id,
        ~Venta.id.in_(cxc_venta_ids)
    ).scalar() or 0
    
    liquid = float(cxc_pagado) + float(cajas_ventas)
    retenciones = db.query(func.sum(Venta.retencion_iva_usd)).filter(
        Venta.estado == "ACTIVA",
        Venta.tenant_id == current_user.tenant_id
    ).scalar() or 0
    ajustes = db.query(func.sum(NotaCredito.monto_usd)).filter(
        NotaCredito.tenant_id == current_user.tenant_id
    ).scalar() or 0
    
    total = liquid + float(retenciones) + float(ajustes)
    total_val = float(total) if total > 0 else 1.0
    
    return {
        "liquid": float(liquid),
        "liquid_pct": round(float(liquid) / total_val * 100, 1) if total > 0 else 0.0,
        "retenciones": float(retenciones),
        "retenciones_pct": round(float(retenciones) / total_val * 100, 1) if total > 0 else 0.0,
        "ajustes": float(ajustes),
        "ajustes_pct": round(float(ajustes) / total_val * 100, 1) if total > 0 else 0.0,
        "total": float(total)
    }


@cobranzas_router.get("/aplicacion")
def datos_aplicacion(factura_id: str = Query(None), db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Calculate real KPIs from CuentaPorCobrar
    hoy = datetime.now(timezone.utc).date()
    
    # Cobrado Hoy (Proxy: sum of monto_pagado for recent activity, here we just sum all pagado for simplicity or mock it based on real data)
    cxc_list = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id == current_user.tenant_id).all()
    
    por_aplicar = sum(float(c.monto_total_usd - c.monto_pagado_usd) for c in cxc_list if c.estado != "PAGADA")
    aplicado = sum(float(c.monto_pagado_usd) for c in cxc_list)
    pendientes_count = sum(1 for c in cxc_list if c.estado != "PAGADA")
    
    kpis = [
        {"label": "COBRADO HOY", "value": f"${aplicado:,.2f}", "desc": "Total acumulado", "color": "text-slate-800"},
        {"label": "POR APLICAR", "value": f"${por_aplicar:,.2f}", "desc": f"{pendientes_count} pagos pendientes", "color": "text-amber-600"},
        {"label": "APLICADO", "value": f"${aplicado:,.2f}", "desc": "Saldos liberados", "color": "text-[#0b5156]"},
        {"label": "DIFERENCIAS", "value": "0", "desc": "Requieren revisión", "color": "text-red-600"}
    ]
    
    pendientes = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).order_by(CuentaPorCobrar.fecha_emision.desc()).limit(10).all()
    
    pagos_pendientes = []
    for p in pendientes:
        cliente_nombre = p.cliente.nombre if p.cliente else "Desconocido"
        pagos_pendientes.append({
            "id": p.numero_documento,
            "date": p.fecha_emision.strftime("%Y-%m-%d"),
            "status": p.estado,
            "client": cliente_nombre,
            "amount": f"${float(p.monto_total_usd - p.monto_pagado_usd):,.2f}",
            "color": "text-amber-600",
            "bg": "bg-amber-50"
        })
        
    return {
        "factura": factura_id, 
        "saldo": 0, 
        "kpis": kpis,
        "pagos_pendientes": pagos_pendientes
    }


@cobranzas_router.post("/aplicacion/procesar")
def procesar_aplicacion(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        doc = body.get("factura_id") or body.get("numero_documento")
        if not doc:
            raise HTTPException(status_code=400, detail="Debe proporcionar el número de factura o documento.")
            
        cxc = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.numero_documento == doc,
            CuentaPorCobrar.tenant_id == current_user.tenant_id
        ).first()
        if not cxc:
            raise HTTPException(status_code=404, detail="Cuenta por cobrar no encontrada.")
            
        monto_raw = body.get("monto")
        if monto_raw is None or float(monto_raw) <= 0:
            raise HTTPException(status_code=400, detail="El monto a aplicar debe ser mayor a cero.")
            
        monto_aplicar_cxc = Decimal(str(monto_raw))

        metodos = body.get("metodos")
        if not metodos:
            metodos = [{"type": "Efectivo", "amount": str(monto_aplicar_cxc), "account": None}]

        total_recibido = Decimal("0.00")
        for m in metodos:
            m_type = m.get("type", "Efectivo")
            m_amount_raw = Decimal(str(m.get("amount", 0)))
            m_rate = Decimal(str(m.get("rate") or 1))
            if m_rate == 0:
                m_rate = Decimal("1")
            # Igual que methodEquivalent() en el frontend (PaymentApplication.tsx):
            # solo "Bolívares" se manda en moneda origen y hay que convertir a
            # su equivalente en USD dividiendo por la tasa; el resto de los
            # tipos ya vienen expresados en USD.
            m_amount = (m_amount_raw / m_rate) if m_type == "Bolívares" else m_amount_raw
            m_account = m.get("account")
            m_ref = m.get("ref") or doc
            total_recibido += m_amount

            if m_type != "Efectivo":
                if not m_account:
                    raise HTTPException(status_code=400, detail="Debe especificar la cuenta bancaria para pagos que no son en efectivo.")
                banco = db.query(CuentaBancaria).filter(
                    CuentaBancaria.banco == m_account,
                    CuentaBancaria.tenant_id == current_user.tenant_id
                ).first()
                if not banco:
                    raise HTTPException(status_code=400, detail=f"Cuenta bancaria '{m_account}' no encontrada.")

                banco.saldo_actual_usd += m_amount

                mov = MovimientoBancario(
                    cuenta_id=banco.id,
                    concepto=f"Cobro CxC {doc} ({m_type})",
                    monto_usd=m_amount,
                    tasa_cambio_bs=cxc.tasa_cambio_bs if getattr(cxc, "tasa_cambio_bs", None) else Decimal("1.0"),
                    tipo="INGRESO",
                    referencia=m_ref,
                    estado="ACTIVO",
                    tenant_id=current_user.tenant_id
                )
                db.add(mov)

        cxc.monto_pagado = min(cxc.monto_total, cxc.monto_pagado + monto_aplicar_cxc)
        if cxc.monto_pagado >= cxc.monto_total:
            cxc.estado = "PAGADA"

        diferencia_raw = body.get("diferencia", 0)
        diferencia = Decimal(str(diferencia_raw or 0))
        accion_diferencia = body.get("accion_diferencia", "Sin diferencia")

        cliente_nombre = cxc.cliente.nombre if (getattr(cxc, "cliente", None) and getattr(cxc.cliente, "nombre", None)) else "N/A"

        # Generar Asiento Contable Automático de Cobro a Cliente
        ContabilidadService.generar_asiento_cobro_cliente(
            monto_neto_recibido=total_recibido,
            monto_factura_cancelado=monto_aplicar_cxc,
            diferencia=diferencia,
            accion_diferencia=accion_diferencia,
            referencia=f"COBRO-{doc}",
            concepto=f"Cobro Factura {doc} - Cliente {cliente_nombre}",
            fecha=datetime.now(timezone.utc),
            tasa_cambio_bs=tasa_actual(db, current_user.tenant_id),
            db=db,
            tenant_id=current_user.tenant_id,
        )

        db.commit()
        return {"ok": True, "message": "Pago aplicado exitosamente."}
    except HTTPException:
        db.rollback()
        raise



@cobranzas_router.get("/anticipos-data")
def anticipos_data(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tasa_actual_bcv = float(tasa_actual(db, current_user.tenant_id))
    
    clientes = [{"id": c.id, "nombre": c.nombre} for c in db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()]
    
    anticipos_db = db.query(AnticipoCliente).filter(
        AnticipoCliente.estado == "ACTIVO",
        AnticipoCliente.tenant_id == current_user.tenant_id
    ).all()
    protected_balances = []
    
    for ant in anticipos_db:
        cliente_nombre = ant.cliente.nombre if ant.cliente else "Desconocido"
        monto_usd = float(ant.monto_usd)
        current_bs = monto_usd * tasa_actual_bcv
        
        protected_balances.append({
            "client": cliente_nombre,
            "base": f"${monto_usd:,.2f}",
            "currentBs": f"Bs. {current_bs:,.2f}"
        })
        
    return {
        "bcv": tasa_actual_bcv,
        "clientes": clientes,
        "balances": protected_balances
    }


@cobranzas_router.post("/anticipos")
def crear_anticipo(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cliente_id = body.get("cliente_id")
    monto_bs = float(body.get("monto_bs", 0))
    tasa_def = float(tasa_actual(db, current_user.tenant_id))
    tasa_bcv = float(body.get("tasa_bcv") or tasa_def)
    
    if not cliente_id or monto_bs <= 0 or tasa_bcv <= 0:
        raise HTTPException(status_code=400, detail="Datos de anticipo inválidos.")
        
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id, Cliente.tenant_id == current_user.tenant_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    monto_usd = monto_bs / tasa_bcv
    
    nuevo_anticipo = AnticipoCliente(
        cliente_id=cliente_id,
        monto_usd=monto_usd,
        moneda="USD",
        tasa_cambio_bs=tasa_bcv,
        estado="ACTIVO",
        tenant_id=current_user.tenant_id
    )
    
    db.add(nuevo_anticipo)
    db.commit()
    return {"ok": True, "message": "Anticipo registrado exitosamente."}


@cobranzas_router.post("/estado-cuenta/enviar")
def enviar_estado_cuenta(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="El correo electrónico es requerido")

    # No existe infraestructura real de envío de email en este backend (no hay
    # smtplib/SendGrid/SES ni variables EMAIL_*/SMTP_* configuradas). Antes este
    # endpoint simulaba éxito escribiendo en un log de desarrollo hardcodeado;
    # eso engañaba al usuario haciéndole creer que el cliente recibió el correo.
    # Se falla honestamente hasta que se integre un proveedor de email real.
    raise HTTPException(
        status_code=501,
        detail="El envío de email no está configurado. Contacte al administrador del sistema.",
    )


# --- PAGOS ---
