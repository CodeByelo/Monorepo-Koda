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

pagos_router = APIRouter(prefix="/pagos", tags=["Pagos"], dependencies=[Depends(get_current_user)])


@pagos_router.get("/dashboard")
def pagos_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    cxps = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()

    deuda_indexada_usd = 0.0
    deuda_fija_bs = 0.0
    vencidos_count = 0
    proximos_count = 0
    validar_count = 0
    criticos_stock = 0

    now_utc = datetime.now(timezone.utc)

    for c in cxps:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        tasa_cxp = float(c.tasa_cambio_bs)

        if tasa_cxp == 1.0:
            deuda_fija_bs += saldo_usd
        else:
            deuda_indexada_usd += saldo_usd

        venc_dt = _as_aware(c.fecha_vencimiento)
        if venc_dt < now_utc:
            vencidos_count += 1
        elif venc_dt <= now_utc + timedelta(days=7):
            proximos_count += 1

        if c.estado == "PENDIENTE":
            validar_count += 1

    gasto_devaluacion_bs = deuda_indexada_usd * tasa_val * 0.0005

    cuentas = db.query(CuentaBancaria).filter(
        CuentaBancaria.activa == True,
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).all()
    saldo_bruto_usd = sum(float(cb.saldo_actual_usd) for cb in cuentas)

    reserva_fiscal_usd = calcular_reserva_fiscal(db, current_user.tenant_id)
    operativo_real_usd = saldo_bruto_usd - reserva_fiscal_usd

    total_deuda_usd = deuda_indexada_usd + (deuda_fija_bs / tasa_val)
    caja_comprometida_pct = 0.0
    if saldo_bruto_usd > 0:
        caja_comprometida_pct = min(100.0, (total_deuda_usd / saldo_bruto_usd) * 100.0)

    criticos_stock = db.query(Proveedor).join(EvaluacionProveedor).filter(
        Proveedor.tenant_id == current_user.tenant_id,
        EvaluacionProveedor.score_precio < 50
    ).distinct().count()

    metricas = [
        {
            "label": "Deuda Indexada (USD)",
            "value": f"${deuda_indexada_usd:,.2f}",
            "desc": "Prioridad Máxima: Sube con el dólar",
            "color": "text-red-600",
            "border": "border-b-4 border-red-500"
        },
        {
            "label": "Deuda Fija (Bs.)",
            "value": f"Bs. {deuda_fija_bs:,.2f}",
            "desc": "Prioridad Baja: Se licúa con el tiempo",
            "color": "text-green-600",
            "border": "border-b-4 border-green-500"
        },
        {
            "label": "Gasto por Devaluación (24h)",
            "value": f"Bs. {gasto_devaluacion_bs:,.2f}",
            "desc": "Costo extra por no pagar ayer",
            "color": "text-red-600",
            "border": "border-b-4 border-red-400"
        },
        {
            "label": "Caja Comprometida",
            "value": f"{caja_comprometida_pct:.1f}%",
            "desc": "Riesgo de liquidez ante salto BCV",
            "color": "text-amber-600",
            "border": "border-b-4 border-amber-500"
        }
    ]

    prioridades = [
        {
            "label": "Crítico",
            "value": f"{vencidos_count} proveedores con pagos vencidos",
            "desc": "Prioriza los que sostienen operación."
        },
        {
            "label": "Caja",
            "value": f"{proximos_count} salidas pueden presionar liquidez",
            "desc": "Revisar caja antes de ejecutar pagos."
        },
        {
            "label": "Compras",
            "value": f"{validar_count} facturas requieren validación",
            "desc": "No pagar sin recepción confirmada."
        },
        {
            "label": "Inventario",
            "value": f"{criticos_stock} proveedores afectan stock crítico",
            "desc": "Retrasos pueden afectar ventas."
        }
    ]

    liquidez = {
        "saldo_bruto": f"${saldo_bruto_usd:,.2f}",
        "reserva_fiscal": f"-${reserva_fiscal_usd:,.2f}",
        "operativo_real": f"${operativo_real_usd:,.2f}"
    }

    priority_payments = []
    for c in cxps[:10]:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        tasa_cxp = float(c.tasa_cambio_bs)
        
        deval_cost_bs = saldo_usd * (tasa_val - tasa_cxp) if tasa_cxp > 1.0 else 0.0
        costo_retraso_str = f"+Bs. {deval_cost_bs:,.2f}" if deval_cost_bs > 0 else "N/A"
        if tasa_cxp == 1.0:
            costo_retraso_str = "N/A"

        venc_dt = _as_aware(c.fecha_vencimiento)
        vence_str = "Vencido" if venc_dt < now_utc else venc_dt.strftime("%d/%m/%Y")

        priority_payments.append({
            "id": c.id,
            "provider": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "proveedor": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "type": "Fijo" if tasa_cxp == 1.0 else "Crítico" if venc_dt < now_utc else "Indexado",
            "tipo": "Fijo" if tasa_cxp == 1.0 else "Crítico" if venc_dt < now_utc else "Indexado",
            "due": vence_str,
            "vencimiento": vence_str,
            "amount": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "monto": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "rate": f"{tasa_cxp} Bs/$" if tasa_cxp > 1.0 else "Bs Fijo",
            "tasa": f"{tasa_cxp} Bs/$" if tasa_cxp > 1.0 else "Bs Fijo",
            "cost": costo_retraso_str,
            "costo": costo_retraso_str,
            "today": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "hoy": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "critical": venc_dt < now_utc,
            "critico": venc_dt < now_utc,
            "fixed": tasa_cxp == 1.0,
            "fijo": tasa_cxp == 1.0
        })

    return {
        "por_pagar": to_float(sum(float(c.monto_total_usd - c.monto_pagado_usd) for c in cxps)),
        "lotes_pendientes": 0,
        "metricas": metricas,
        "prioridades": prioridades,
        "liquidez": liquidez,
        "pagos_prioritarios": priority_payments
    }


@pagos_router.get("/cuentas")
def cuentas_pagar(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    rows = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()

    total_deuda_usd = 0.0
    total_facturas = len(rows)
    vencido_30d_usd = 0.0

    now_utc = datetime.now(timezone.utc)
    limit_30d = now_utc - timedelta(days=30)

    facturas_list = []

    for r in rows:
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        tasa_cxp = float(r.tasa_cambio_bs)
        
        if tasa_cxp == 1.0:
            saldo_bs = saldo_usd
            saldo_usd_converted = saldo_usd / tasa_val
        else:
            saldo_usd_converted = saldo_usd
            saldo_bs = saldo_usd * tasa_val

        total_deuda_usd += saldo_usd_converted

        venc_dt = _as_aware(r.fecha_vencimiento)
        if venc_dt < now_utc:
            if venc_dt < limit_30d:
                vencido_30d_usd += saldo_usd_converted

        if venc_dt < now_utc:
            due_str = "VENCIDA"
            color_status = "text-red-600"
            bg_status = "bg-red-50"
        else:
            due_str = venc_dt.strftime("%d/%m/%Y")
            color_status = "text-green-600" if r.estado == "PENDIENTE" else "text-amber-600"
            bg_status = "bg-green-50" if r.estado == "PENDIENTE" else "bg-amber-50"

        facturas_list.append({
            "id": r.id,
            "date": r.fecha_emision.strftime("%d/%m/%Y") if r.fecha_emision else "",
            "fecha": r.fecha_emision.strftime("%d/%m/%Y") if r.fecha_emision else "",
            "due": due_str,
            "vencimiento": due_str,
            "provider": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "proveedor": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "rif": r.proveedor.rif if r.proveedor else "J-00000000-0",
            "ref": r.numero_documento,
            "referencia": r.numero_documento,
            "usd": f"${saldo_usd_converted:,.2f}",
            "monto_usd": f"${saldo_usd_converted:,.2f}",
            "bs": f"Bs. {saldo_bs:,.2f}",
            "monto_bs": f"Bs. {saldo_bs:,.2f}",
            "status": r.estado,
            "estado": r.estado,
            "color": color_status,
            "bg": bg_status
        })

    metricas = [
        {"label": "Total Deuda", "value": f"${total_deuda_usd:,.2f}", "desc": "Monto total adeudado", "color": "text-red-600"},
        {"label": "Facturas Pendientes", "value": str(total_facturas), "desc": "Documentos abiertos", "color": "text-[#0b5156]"},
        {"label": "Vencido (+30d)", "value": f"${vencido_30d_usd:,.2f}", "desc": "Urgente", "color": "text-red-600"},
        {"label": "Pagos en Tránsito", "value": "$0.00", "desc": "Por conciliar", "color": "text-amber-600"},
    ]

    return {
        "metricas": metricas,
        "facturas": facturas_list
    }


@pagos_router.get("/ordenes")
def ordenes_pago(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    pendientes = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    
    now = datetime.now(timezone.utc)
    start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    historico = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado == "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).order_by(CuentaPorPagar.fecha_vencimiento.desc()).limit(10).all()

    pagadas_mes = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado == "PAGADA",
        CuentaPorPagar.fecha_vencimiento >= start_of_month,
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()

    total_pagadas_usd = sum(float(r.monto_total_usd) for r in pagadas_mes)
    count_pagadas = len(pagadas_mes)

    total_pendiente_usd = 0.0
    vencen_hoy_count = 0
    now_date = now.date()

    def _orden(r: CuentaPorPagar):
        nonlocal total_pendiente_usd, vencen_hoy_count
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        tasa_cxp = float(r.tasa_cambio_bs)
        
        saldo_usd_converted = saldo_usd / tasa_val if tasa_cxp == 1.0 else saldo_usd
        total_pendiente_usd += saldo_usd_converted

        venc_dt = _as_aware(r.fecha_vencimiento)
        vence_hoy = venc_dt.date() == now_date
        if vence_hoy:
            vencen_hoy_count += 1

        due_str = "Hoy" if vence_hoy else "Vencida" if venc_dt < now else venc_dt.strftime("%d/%m/%Y")
        priority_str = "Alta" if (venc_dt < now or vence_hoy) else "Normal"
        priority_color = "bg-red-50 text-red-600" if (venc_dt < now or vence_hoy) else "bg-slate-100 text-slate-600"

        msg = ""
        if r.proveedor and r.proveedor.evaluaciones:
            avg_price = sum(ev.score_precio for ev in r.proveedor.evaluaciones) / len(r.proveedor.evaluaciones)
            if avg_price < 50:
                msg = "Proveedor con evaluación de precio crítica"

        return {
            "id": f"OP-{r.id:06d}",
            "orden": f"OP-{r.id:06d}",
            "provider": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "proveedor": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "ref": r.numero_documento,
            "referencia": r.numero_documento,
            "amount": f"${saldo_usd_converted:,.2f}",
            "monto": f"${saldo_usd_converted:,.2f}",
            "due": due_str,
            "vencimiento": due_str,
            "method": "Transferencia",
            "metodo": "Transferencia",
            "priority": priority_str,
            "prioridad": priority_str,
            "pColor": priority_color,
            "status": r.estado,
            "estado": r.estado,
            "statusMsg": msg,
            "mensaje": msg
        }

    ordenes_list = [_orden(r) for r in pendientes]

    metricas = [
        { "label": "Órdenes Pendientes", "value": str(len(pendientes)), "desc": "Por aprobar", "color": "text-amber-600" },
        { "label": "Monto Total", "value": f"${total_pendiente_usd:,.2f}", "desc": "En cola de pago", "color": "text-[#0b5156]" },
        { "label": "Vencen Hoy", "value": str(vencen_hoy_count), "desc": "Urgente aprobar", "color": "text-red-600" },
        { "label": "Pagadas Mes", "value": str(count_pagadas), "desc": f"${total_pagadas_usd:,.2f} ejecutados", "color": "text-green-600" },
    ]

    return {
        "ordenes": ordenes_list,
        "ordenes_pendientes": ordenes_list,
        "historial": [
            {
                "id": f"OP-{r.id:06d}",
                "provider": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
                "amount": f"${float(r.monto_total_usd):,.2f}",
                "date": r.fecha_vencimiento.strftime("%d/%m/%Y"),
                "method": "Transferencia",
                "status": "PAGADA",
            }
            for r in historico
        ],
        "metricas": metricas,
        "total": total_pendiente_usd,
    }


class AprobarOrdenRequest(BaseModel):
    orden_id: str
    banco_id: int
    referencia: str
    metodo: str


@pagos_router.post("/ordenes/aprobar")
def aprobar_orden(body: AprobarOrdenRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        orden_id_str = body.orden_id
        if not orden_id_str:
             raise HTTPException(status_code=400, detail="Falta el orden_id")
        try:
             c_id = int(orden_id_str.replace("OP-", ""))
        except ValueError:
             raise HTTPException(status_code=400, detail="Formato de orden_id inválido")

        cxp = db.query(CuentaPorPagar).filter(
            CuentaPorPagar.id == c_id,
            CuentaPorPagar.tenant_id == current_user.tenant_id
        ).first()
        if not cxp:
             raise HTTPException(status_code=404, detail="Cuenta por pagar no encontrada")

        if cxp.estado == "PAGADA":
             raise HTTPException(status_code=400, detail="Esta cuenta ya fue pagada")

        banco = db.query(CuentaBancaria).filter(
            CuentaBancaria.id == body.banco_id,
            CuentaBancaria.tenant_id == current_user.tenant_id
        ).first()
        if not banco:
             raise HTTPException(status_code=400, detail="La cuenta bancaria seleccionada no existe")

        monto_restante = cxp.monto_total_usd - cxp.monto_pagado_usd
        cxp.monto_pagado_usd = cxp.monto_total_usd
        cxp.estado = "PAGADA"

        banco.saldo_actual_usd -= monto_restante

        mov = MovimientoBancario(
            cuenta_id=banco.id,
            concepto=f"Pago Orden {orden_id_str} | Prov: {cxp.proveedor.nombre if cxp.proveedor else 'N/A'} ({body.metodo})",
            monto_usd=monto_restante,
            tasa_cambio_bs=cxp.tasa_cambio_bs,
            tipo="EGRESO",
            referencia=body.referencia,
            estado="ACTIVO",
            tenant_id=current_user.tenant_id
        )
        db.add(mov)

        # Generar Asiento Contable Automático de Pago a Proveedor
        ContabilidadService.generar_asiento_pago_proveedor(
            monto=monto_restante,
            tasa_cambio_bs=cxp.tasa_cambio_bs,
            referencia=body.referencia or orden_id_str,
            concepto=f"Pago Orden {orden_id_str} - Proveedor {cxp.proveedor.nombre if cxp.proveedor else 'N/A'}",
            fecha=datetime.now(timezone.utc),
            db=db,
            tenant_id=current_user.tenant_id,
        )

        db.commit()
        return {"ok": True, "message": "Pago registrado y procesado exitosamente"}
    except HTTPException:
        db.rollback()
        raise


class CuentaPorPagarManualRequest(BaseModel):
    proveedor_id: int
    numero_documento: str
    monto_total_usd: Decimal
    tasa_cambio_bs: Decimal
    dias_credito: int


@pagos_router.post("/cuentas/manual")
def crear_cuenta_por_pagar_manual(body: CuentaPorPagarManualRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Validate supplier belongs to tenant
    proveedor = db.query(Proveedor).filter(
        Proveedor.id == body.proveedor_id,
        Proveedor.tenant_id == current_user.tenant_id
    ).first()
    if not proveedor:
         raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    now = datetime.now(timezone.utc)
    nueva_c = CuentaPorPagar(
        proveedor_id=body.proveedor_id,
        numero_documento=body.numero_documento,
        monto_total_usd=body.monto_total_usd,
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=body.tasa_cambio_bs,
        fecha_emision=now,
        fecha_vencimiento=now + timedelta(days=body.dias_credito),
        estado="PENDIENTE",
        tenant_id=current_user.tenant_id
    )
    db.add(nueva_c)
    db.commit()
    db.refresh(nueva_c)
    return {"ok": True, "message": "Factura de proveedor registrada exitosamente"}


@pagos_router.get("/programacion")
def programacion_pagos(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    hoy = datetime.now(timezone.utc).date()
    rows = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).order_by(CuentaPorPagar.fecha_vencimiento).all()
    buckets = {"vencido_hoy": [], "esta_semana": [], "proxima_semana": [], "fin_mes": []}

    for r in rows:
        saldo = to_float(r.monto_total - r.monto_pagado)
        dias = (r.fecha_vencimiento.date() - hoy).days
        item = {
            "id": r.id,
            "title": r.proveedor.nombre if r.proveedor else r.numero_documento,
            "meta": f"{r.numero_documento} - vence {r.fecha_vencimiento.strftime('%d/%m/%Y')}",
            "amount": f"${saldo:,.2f}",
            "urgent": dias <= 0,
            "critical": dias <= 0,
            "tag": r.estado,
        }
        if dias <= 0:
            buckets["vencido_hoy"].append(item)
        elif dias <= 7:
            buckets["esta_semana"].append(item)
        elif dias <= 14:
            buckets["proxima_semana"].append(item)
        else:
            buckets["fin_mes"].append(item)

    liquidez = db.query(func.sum(CuentaBancaria.saldo_actual_usd)).filter(CuentaBancaria.tenant_id == current_user.tenant_id).scalar() or 0
    deuda_indexada = db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd)).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).scalar() or 0
    return {
        "liquidez_base": to_float(liquidez),
        "deuda_indexada": to_float(deuda_indexada),
        "columnas": buckets,
    }


@pagos_router.get("/lotes/validar")
def validar_lotes(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    cxps = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    
    validaciones = []
    total_debitar_usd = 0.0

    for c in cxps:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        tasa_cxp = float(c.tasa_cambio_bs)
        saldo_usd_converted = saldo_usd / tasa_val if tasa_cxp == 1.0 else saldo_usd
        total_debitar_usd += saldo_usd_converted

        status = "OK"
        mensaje = "Listo para transferir"
        
        if not c.proveedor:
            status = "ERROR"
            mensaje = "Proveedor no asignado"
        elif not c.proveedor.rif or len(c.proveedor.rif) < 9:
            status = "ERROR"
            mensaje = "RIF inválido o incompleto"
        elif not c.proveedor.email:
            status = "WARNING"
            mensaje = "Falta correo electrónico para notificaciones"

        validaciones.append({
            "provider": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "proveedor": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "status": status,
            "estado": status,
            "error": mensaje if status == "ERROR" else None,
            "mensaje": mensaje,
            "meta": f"Ref: {c.numero_documento} | Saldo: ${saldo_usd_converted:,.2f}",
            "metadata": f"Ref: {c.numero_documento} | Saldo: ${saldo_usd_converted:,.2f}"
        })

    return {
        "valido": all(v["status"] != "ERROR" for v in validaciones),
        "validaciones": validaciones,
        "total_debitar": f"${total_debitar_usd:,.2f}"
    }


@pagos_router.post("/lotes/procesar")
def procesar_lotes(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        ref = body.get("referencia", "LOTE-GEN")
        
        cxps = db.query(CuentaPorPagar).filter(
            CuentaPorPagar.estado != "PAGADA",
            CuentaPorPagar.tenant_id == current_user.tenant_id
        ).all()
        if not cxps:
            return {"ok": True, "message": "No hay deudas pendientes"}

        banco = db.query(CuentaBancaria).filter(
            CuentaBancaria.activa == True,
            CuentaBancaria.tenant_id == current_user.tenant_id
        ).first()
        if not banco:
            raise HTTPException(status_code=400, detail="No hay una cuenta bancaria activa")

        total_debitar_usd = Decimal("0.00")
        for c in cxps:
            saldo_usd = c.monto_total_usd - c.monto_pagado_usd
            c.monto_pagado_usd = c.monto_total_usd
            c.estado = "PAGADA"
            total_debitar_usd += saldo_usd

        banco.saldo_actual_usd -= total_debitar_usd

        tasa_bcv = Decimal(str(tasa_actual(db, current_user.tenant_id)))

        mov = MovimientoBancario(
            cuenta_id=banco.id,
            concepto=f"Procesamiento Lote Pagos Ref: {ref}",
            monto_usd=total_debitar_usd,
            tasa_cambio_bs=tasa_bcv,
            tipo="EGRESO",
            referencia=ref,
            estado="ACTIVO",
            tenant_id=current_user.tenant_id
        )
        db.add(mov)

        # Generar Asiento Contable Automático de Pago por Lote a Proveedores
        ContabilidadService.generar_asiento_pago_proveedor(
            monto=total_debitar_usd,
            tasa_cambio_bs=tasa_bcv,
            referencia=ref,
            concepto=f"Pago por Lote - {len(cxps)} facturas - Ref: {ref}",
            fecha=datetime.now(timezone.utc),
            db=db,
            tenant_id=current_user.tenant_id,
        )

        db.commit()
        return {"ok": True, "message": f"Lote de pagos procesado. {len(cxps)} facturas liquidadas."}
    except HTTPException:
        db.rollback()
        raise


# --- TESORERÍA ---
