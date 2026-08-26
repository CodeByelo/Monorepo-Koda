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

tesoreria_router = APIRouter(prefix="/tesoreria", tags=["Tesorería"], dependencies=[Depends(get_current_user)])


@tesoreria_router.get("/dashboard")
def tesoreria_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    def format_currency(val):
        return f"${val:,.2f}"

    todas_cuentas = db.query(CuentaBancaria).filter(
        CuentaBancaria.activa == True,
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).all()
    
    bancos_bs = 0.0
    efectivo_zelle = 0.0
    custodia = 0.0
    bancos_lista = []
    
    for c in todas_cuentas:
        saldo = to_float(c.saldo_actual_usd)
        nombre = c.banco.lower()
        
        if "zelle" in nombre or "efectivo" in nombre:
            efectivo_zelle += saldo
        elif "custodia" in nombre:
            custodia += saldo * 0.99
        elif c.moneda == "VES":
            bancos_bs += saldo
        else:
            bancos_bs += saldo

        moneda = "VES" if c.moneda == "VED" else c.moneda
        bancos_lista.append({
            "nombre": c.banco,
            "saldo": format_currency(saldo),
            "neto": format_currency(saldo),
            "alerta": saldo < 100,
            "metadata": f"{moneda} - {c.numero_cuenta[-4:]}" if c.numero_cuenta else moneda,
            "icono": c.banco[0].upper() if c.banco else "B"
        })
    
    reserva_fiscal = calcular_reserva_fiscal(db, current_user.tenant_id)

    efectivo_transito = db.query(func.sum(MovimientoBancario.monto_usd)).filter(
        MovimientoBancario.estado == "PENDIENTE",
        MovimientoBancario.tenant_id == current_user.tenant_id
    ).scalar()
    efectivo_transito = to_float(efectivo_transito)

    cheques_pd = db.query(func.sum(Cheque.monto_usd)).filter(
        Cheque.estado == "POST_DATADO",
        Cheque.tenant_id == current_user.tenant_id
    ).scalar()
    cheques_por_cobrar = to_float(cheques_pd)
    cheques_restar = 0.0 # Cheques emitidos (cxp) si hubiera una tabla, por ahora 0.
    
    # Cuarentena: sum of cuarentena_usd from all bank accounts
    cuarentena_restar = sum(to_float(c.cuarentena_usd) for c in todas_cuentas)

    disponibilidad_total = (bancos_bs + efectivo_zelle + custodia) - (cheques_restar + cuarentena_restar)
    liquidez_real = disponibilidad_total - reserva_fiscal

    ahora = datetime.now(timezone.utc)
    cxp_vencidas = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.fecha_vencimiento < ahora,
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    
    # Proyeccion 7 dias
    limite_7d = ahora + timedelta(days=7)
    
    cxc_7d = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento >= ahora,
        CuentaPorCobrar.fecha_vencimiento <= limite_7d,
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    ingresos_7d = sum(to_float(c.monto_total_usd - c.monto_pagado_usd) for c in cxc_7d)

    cxp_7d = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.fecha_vencimiento >= ahora,
        CuentaPorPagar.fecha_vencimiento <= limite_7d,
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    egresos_7d = sum(to_float(c.monto_total_usd - c.monto_pagado_usd) for c in cxp_7d)
    
    alertas_lista = []
    if cxp_vencidas:
        total_vencido = sum(to_float(c.monto_total_usd - c.monto_pagado_usd) for c in cxp_vencidas)
        alertas_lista.append({
            "tipo": "ALERTA",
            "titulo": f"{len(cxp_vencidas)} CXP VENCIDAS",
            "descripcion": f"Total: {format_currency(total_vencido)}",
            "bg": "bg-red-50",
            "color": "text-red-600"
        })
    
    if reserva_fiscal > 0:
        alertas_lista.append({
            "tipo": "FISCAL",
            "titulo": "DECLARACIÓN PENDIENTE",
            "descripcion": f"Retenciones retenidas: {format_currency(reserva_fiscal)}",
            "bg": "bg-amber-50",
            "color": "text-amber-600"
        })

    if not alertas_lista:
        alertas_lista.append({
            "tipo": "INFO",
            "titulo": "SIN COMPROMISOS URGENTES",
            "descripcion": "El flujo de caja está sano.",
            "bg": "bg-green-50",
            "color": "text-green-600"
        })

    return {
        "disponibilidad": {
            "total": format_currency(disponibilidad_total),
            "bancos_bs": format_currency(bancos_bs),
            "efectivo_zelle": format_currency(efectivo_zelle),
            "custodia": format_currency(custodia),
            "cheques_restar": format_currency(cheques_restar),
            "cuarentena_restar": format_currency(cuarentena_restar)
        },
        "cuarentena": format_currency(cuarentena_restar),
        "cheques_por_cobrar": format_currency(cheques_por_cobrar),
        "alertas": alertas_lista,
        "proyeccion_7d": {
            "ingresos_esperados": ingresos_7d,
            "egresos_esperados": egresos_7d
        },
        "metricas": [
            { "label": "Liquidez Real", "value": format_currency(liquidez_real), "desc": "Neto de compromisos", "color": "text-green-600", "border": "border-l-4 border-green-500" },
            { "label": "Cheques por Cobrar", "value": format_currency(cheques_por_cobrar), "desc": "Emitidos (Post-datados)", "color": "text-red-600", "border": "border-l-4 border-red-500" },
            { "label": "Efectivo en Tránsito", "value": format_currency(efectivo_transito), "desc": "Depósitos pendientes", "color": "text-amber-600", "border": "border-l-4 border-amber-500" },
            { "label": "Reserva Fiscal", "value": format_currency(reserva_fiscal), "desc": "IVA/ISLR Retenido", "color": "text-red-600", "border": "border-l-4 border-red-600" }
        ],
        "bancos": bancos_lista,
        "alertas": alertas_lista
    }


# ---- CUENTAS POR PAGAR (real, mirra la antigüedad de /cobranzas/* para CxC) ----

@tesoreria_router.get("/cuentas-por-pagar")
def cuentas_por_pagar_list(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Lista real de CuentaPorPagar del tenant, con antigüedad (días vencido)
    calculada sobre fecha_vencimiento vs. hoy, e IVA soportado tomado de la
    Compra vinculada (si existe). Mismo criterio de antigüedad que
    /cobranzas/cuentas usa para CuentaPorCobrar."""
    cxp = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).order_by(CuentaPorPagar.fecha_vencimiento.asc()).all()
    today = datetime.now(timezone.utc).date()

    compra_ids = [c.compra_id for c in cxp if c.compra_id]
    compras_map = {}
    if compra_ids:
        compras_map = {
            c.id: c for c in db.query(Compra).filter(Compra.id.in_(compra_ids)).all()
        }

    result = []
    for c in cxp:
        monto_total = to_float(c.monto_total_usd)
        monto_pagado = to_float(c.monto_pagado_usd)
        saldo = monto_total - monto_pagado
        vencimiento = c.fecha_vencimiento.date() if c.fecha_vencimiento else None
        dias_vencido = (today - vencimiento).days if vencimiento and today > vencimiento else 0
        estado_display = (
            "Vencida" if dias_vencido > 0
            else ("Por Vencer" if vencimiento and (vencimiento - today).days <= 7 else c.estado)
        )
        compra = compras_map.get(c.compra_id) if c.compra_id else None
        iva_soportado = to_float(compra.iva_usd) if compra else 0.0

        result.append({
            "id": c.id,
            "proveedor": c.proveedor.nombre if c.proveedor else "N/A",
            "rif": c.proveedor.rif if c.proveedor else "J-00000000-0",
            "numero_doc": c.numero_documento,
            "numero_control": compra.numero_control if compra and compra.numero_control else "N/A",
            "fecha_emision": c.fecha_emision.strftime("%d/%m/%Y") if c.fecha_emision else "",
            "fecha_vencimiento": vencimiento.strftime("%d/%m/%Y") if vencimiento else "",
            "monto_total": f"${monto_total:,.2f}",
            "monto_total_raw": monto_total,
            "monto_pagado": f"${monto_pagado:,.2f}",
            "saldo": f"${saldo:,.2f}",
            "saldo_raw": saldo,
            "iva_soportado": f"${iva_soportado:,.2f}",
            "iva_soportado_raw": iva_soportado,
            "dias_vencido": dias_vencido,
            "estado": estado_display,
            "estado_db": c.estado,
        })
    return result


@tesoreria_router.get("/cuentas-por-pagar/kpis")
def kpis_cuentas_por_pagar(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """KPIs reales para el header de Cuentas por Pagar (Tesorería)."""
    def format_currency(val):
        return f"${val:,.2f}"

    cxp = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    today = datetime.now(timezone.utc).date()
    abiertas = [c for c in cxp if c.estado != "PAGADA"]

    total_por_pagar = sum(to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd) for c in abiertas)
    por_vencer_7d = sum(
        to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd)
        for c in abiertas
        if c.fecha_vencimiento and 0 <= (c.fecha_vencimiento.date() - today).days <= 7
    )

    compra_ids = [c.compra_id for c in abiertas if c.compra_id]
    credito_fiscal_iva_usd = 0.0
    if compra_ids:
        compras = db.query(Compra).filter(Compra.id.in_(compra_ids)).all()
        credito_fiscal_iva_usd = sum(to_float(c.iva_usd) for c in compras)

    tasa = tasa_actual(db, current_user.tenant_id)
    credito_fiscal_iva_bs = credito_fiscal_iva_usd * tasa

    retenciones_pendientes = db.query(RetencionIVA).filter(
        RetencionIVA.tenant_id == current_user.tenant_id,
        RetencionIVA.tipo == "PRACTICADA",
        RetencionIVA.estado == "PENDIENTE",
    ).count()

    return {
        "metricas": [
            {"label": "Cuentas por Pagar", "value": format_currency(total_por_pagar), "desc": "Obligaciones totales", "color": "text-slate-800"},
            {"label": "A Pagar (7 días)", "value": format_currency(por_vencer_7d), "desc": "Requisición de flujo", "color": "text-amber-500"},
            {"label": "Crédito Fiscal IVA", "value": f"Bs. {credito_fiscal_iva_bs:,.2f}", "desc": "Acumulado a favor (CxP abiertas)", "color": "text-koda-main"},
            {"label": "Retenciones Pend.", "value": f"{retenciones_pendientes} Comp.", "desc": "Entregar a proveedores", "color": "text-blue-600"},
        ],
        "total_por_pagar_raw": total_por_pagar,
        "por_vencer_7d_raw": por_vencer_7d,
        "credito_fiscal_iva_raw": credito_fiscal_iva_bs,
        "retenciones_pendientes": retenciones_pendientes,
        "proveedores_vencidos": len({c.proveedor_id for c in abiertas if c.fecha_vencimiento and today > c.fecha_vencimiento.date()}),
    }


@tesoreria_router.get("/bancos")
def listar_bancos(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cuentas = db.query(CuentaBancaria).filter(CuentaBancaria.tenant_id == current_user.tenant_id).all()
    tasa = tasa_actual(db, current_user.tenant_id)
    res = []
    for c in cuentas:
        saldo_usd = to_float(c.saldo_actual_usd)
        saldo_local = saldo_usd * (tasa if c.moneda == "VES" else 1)
        movimientos_pendientes = db.query(MovimientoBancario).filter(
            MovimientoBancario.cuenta_id == c.id,
            MovimientoBancario.estado == "PENDIENTE"
        ).all()
        
        diferencia_pendiente = 0.00
        for m in movimientos_pendientes:
            monto_mov = to_float(m.monto_usd)
            if m.tipo == "EGRESO":
                monto_mov = -monto_mov
            diferencia_pendiente += monto_mov
        
        res.append({
            "id": c.id,
            "nombre": c.banco,
            "numero": c.numero_cuenta,
            "moneda": c.moneda,
            # Raw numbers for frontend calculation
            "saldo_contable_raw": saldo_local,
            "saldo_divisas_raw": saldo_usd,
            "diferencia_raw": diferencia_pendiente,
            # Formatted string fallbacks (optional, frontend should prefer formatting raw)
            "saldo_contable": f"{'Bs. ' if c.moneda == 'VES' else '$'}{saldo_local:,.2f}",
            "saldo_divisas": f"${saldo_usd:,.2f}",
            "diferencia": f"${diferencia_pendiente:,.2f}",
            "estado": "Activa" if c.activa else "Inactiva"
        })
    return res


@tesoreria_router.post("/bancos")
def crear_banco(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    c = CuentaBancaria(
        banco=body.get("nombre", ""),
        numero_cuenta=body.get("numero", ""),
        moneda=body.get("moneda", "VES"),
        saldo_actual_usd=body.get("saldo_actual", 0),
        activa=(body.get("estado") == "Activa"),
        tenant_id=current_user.tenant_id
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@tesoreria_router.get("/movimientos")
def movimientos_banco(periodo: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    inicio, fin = periodo_rango(periodo)
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.fecha >= inicio,
        MovimientoBancario.fecha < fin,
        MovimientoBancario.tenant_id == current_user.tenant_id
    ).all()
    return [{
        "id": f"MOV-{str(m.id).zfill(4)}", 
        "fecha": m.fecha.strftime("%d/%m/%Y"), 
        "concepto": m.concepto, 
        "monto": to_float(m.monto), 
        "tipo": m.tipo,
        "referencia": m.referencia,
        "estado": m.estado,
        "banco": m.cuenta.banco if m.cuenta else "Banco Asociado",
        "moneda": m.cuenta.moneda if m.cuenta else "USD"
    } for m in movs]


@tesoreria_router.post("/movimientos/importar")
def importar_movimientos():
    return {"ok": True}


@tesoreria_router.get("/conciliacion")
def conciliacion(periodo: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    inicio, fin = periodo_rango(periodo)
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.fecha >= inicio,
        MovimientoBancario.fecha < fin,
        MovimientoBancario.tenant_id == current_user.tenant_id
    ).all()
    
    movimientos = []
    cuentas_dict = {}
    for m in movs:
        banco_name = m.cuenta.banco if m.cuenta else "Banco Asociado"
        if m.cuenta_id not in cuentas_dict:
            cuentas_dict[m.cuenta_id] = {
                "cuenta": banco_name,
                "saldo_banco": to_float(m.cuenta.saldo_actual_usd) if m.cuenta else 0.0,
                "movs": []
            }
        
        cuentas_dict[m.cuenta_id]["movs"].append(m)
        
        movimientos.append({
            "id": f"MOV-{str(m.id).zfill(4)}",
            "fecha": m.fecha.strftime("%d/%m/%Y"),
            "banco": banco_name, 
            "referencia": m.referencia or "-",
            "monto": f"${to_float(m.monto_usd):,.2f}",
            "documento": f"KODA-{str(m.id).zfill(4)}",
            "estado": m.estado,
            "tipo": m.tipo.capitalize() if m.tipo else "Desconocido"
        })
        
    resumen_cuentas = []
    for c_id, data in cuentas_dict.items():
        saldo_banco = data["saldo_banco"]
        
        pendientes = sum([to_float(m.monto_usd) if m.tipo == "INGRESO" else -to_float(m.monto_usd) for m in data["movs"] if m.estado != "Conciliado" and m.estado != "CONCILIADO"])
        diferencia = pendientes
        saldo_koda = saldo_banco - diferencia
        
        estado = "Cuadra" if abs(diferencia) < 0.01 else "Diferencia"
        
        resumen_cuentas.append({
            "cuenta": data["cuenta"],
            "saldo_banco": f"${saldo_banco:,.2f}",
            "saldo_koda": f"${saldo_koda:,.2f}",
            "diferencia": f"${diferencia:,.2f}",
            "estado": estado
        })
    
    return {
        "metrics": {
            "movimientos_count": len(movs),
            "conciliados": len([m for m in movs if m.estado == 'CONCILIADO']),
            "pendientes": len([m for m in movs if m.estado != 'CONCILIADO']),
            "monto_x_conciliar": f"${sum([to_float(m.monto_usd) for m in movs if m.estado != 'CONCILIADO']):,.2f}"
        },
        "movimientos": movimientos,
        "resumen_cuentas": resumen_cuentas,
        "diferencias": []
    }


from pydantic import BaseModel
class RelacionarRequest(BaseModel):
    movimiento_id: str
    documento_id: str


@tesoreria_router.get("/conciliacion/pendientes")
def obtener_documentos_pendientes(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Devuelve ventas pendientes a modo de ejemplo
    from backend.models.erp_extended import Venta
    ventas = db.query(Venta).filter(
        Venta.estado != 'ANULADA',
        Venta.tenant_id == current_user.tenant_id
    ).limit(10).all()
    docs = []
    for v in ventas:
        docs.append({
            "id": v.numero_factura,
            "label": f"{v.numero_factura} (Cliente)",
            "monto": f"${to_float(v.total_usd):,.2f}"
        })
    return docs

@tesoreria_router.post("/conciliacion/relacionar")
def relacionar_documento(payload: RelacionarRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # movimiento_id viene como MOV-123
    try:
        mov_id = int(payload.movimiento_id.replace("MOV-", ""))
        mov = db.query(MovimientoBancario).filter(
            MovimientoBancario.id == mov_id,
            MovimientoBancario.tenant_id == current_user.tenant_id
        ).first()
        if mov:
            mov.estado = "CONCILIADO"
            mov.documento_referencia = payload.documento_id
            db.commit()
    except:
        pass
    return {"ok": True}


@tesoreria_router.get("/flujo-caja")
def flujo_caja_tesoreria(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cxc_rows = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).all()
    cxp_rows = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    proyecciones = []
    for r in cxc_rows:
        saldo = to_float(r.monto_total - r.monto_pagado)
        proyecciones.append({
            "date": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "fecha": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "concept": f"Cobranza {r.numero_documento}",
            "concepto": f"Cobranza {r.numero_documento}",
            "sub": r.cliente.nombre if r.cliente else "",
            "detalle": r.cliente.nombre if r.cliente else "",
            "area": "Cobranzas",
            "amount": saldo,
            "monto": saldo,
            "type": "Entrada",
            "tipo": "Entrada",
            "status": r.estado,
            "estado": r.estado,
            "statusColor": "bg-green-50 text-green-600",
        })
    for r in cxp_rows:
        saldo = to_float(r.monto_total - r.monto_pagado)
        vencida = r.fecha_vencimiento < datetime.now(timezone.utc)
        proyecciones.append({
            "date": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "fecha": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "concept": f"Pago {r.numero_documento}",
            "concepto": f"Pago {r.numero_documento}",
            "sub": r.proveedor.nombre if r.proveedor else "",
            "detalle": r.proveedor.nombre if r.proveedor else "",
            "area": "Pagos",
            "amount": saldo,
            "monto": saldo,
            "type": "Salida",
            "tipo": "Salida",
            "status": r.estado,
            "estado": r.estado,
            "isCritical": vencida,
            "statusColor": "bg-red-50 text-red-600" if vencida else "bg-amber-50 text-amber-600",
        })
    return {"proyecciones": sorted(proyecciones, key=lambda x: x["date"])}


@tesoreria_router.post("/conciliacion/marcar")
def marcar_movimiento(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    mov_id = body.get("id") or body.get("movimiento_id")
    estado = body.get("estado", "CONCILIADO")
    
    mov = db.query(MovimientoBancario).filter(
        MovimientoBancario.id == mov_id,
        MovimientoBancario.tenant_id == current_user.tenant_id
    ).first()
    if not mov:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    
    mov.estado = estado
    db.commit()
    return {"ok": True, "id": mov_id, "estado": estado}

@tesoreria_router.post("/conciliacion/cerrar")
def cerrar_conciliacion_periodo(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    periodo = body.get("periodo")
    if not periodo:
        raise HTTPException(status_code=400, detail="Periodo es requerido")
    
    inicio, fin = periodo_rango(periodo)
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.fecha >= inicio, 
        MovimientoBancario.fecha < fin,
        MovimientoBancario.estado != "CERRADO",
        MovimientoBancario.tenant_id == current_user.tenant_id
    ).all()
    
    count = 0
    for m in movs:
        m.estado = "CERRADO"
        count += 1
        
    db.commit()
    return {"ok": True, "cerrados": count, "mensaje": f"Periodo {periodo} cerrado exitosamente"}


@tesoreria_router.get("/caja-chica")
def caja_chica(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Seed default fund if none exists for the tenant
    if db.query(FondoCajaChica).filter(FondoCajaChica.tenant_id == current_user.tenant_id).count() == 0:
        default_fondo = FondoCajaChica(
            nombre="Caja Chica Operativa",
            responsable="Administración",
            asignado_usd=500.00,
            disponible_usd=500.00,
            tenant_id=current_user.tenant_id
        )
        db.add(default_fondo)
        db.commit()

    fondos = db.query(FondoCajaChica).filter(FondoCajaChica.tenant_id == current_user.tenant_id).all()
    gastos = db.query(GastoCajaChica).join(FondoCajaChica).filter(
        FondoCajaChica.tenant_id == current_user.tenant_id
    ).order_by(GastoCajaChica.fecha.desc(), GastoCajaChica.id.desc()).limit(50).all()

    total_asignado = sum(to_float(f.asignado_usd) for f in fondos)
    total_disponible = sum(to_float(f.disponible_usd) for f in fondos)
    soportes_pendientes = db.query(GastoCajaChica).join(FondoCajaChica).filter(
        FondoCajaChica.tenant_id == current_user.tenant_id,
        GastoCajaChica.soporte == "Sin Soporte"
    ).count()
    reintegro_sugerido = total_asignado - total_disponible

    return {
        "metricas": {
            "fondo_asignado": f"${total_asignado:,.2f}",
            "saldo_disponible": f"${total_disponible:,.2f}",
            "soportes_pendientes": str(soportes_pendientes),
            "reintegro_sugerido": f"${max(0, reintegro_sugerido):,.2f}"
        },
        "fondos": [
            {
                "id": f"FD-{f.id:03d}",
                "nombre": f.nombre,
                "responsable": f.responsable,
                "asignado": f"${to_float(f.asignado_usd):,.2f}",
                "disponible": f"${to_float(f.disponible_usd):,.2f}",
                "estado": f.estado.capitalize(),
                "color": "bg-green-100 text-green-700" if f.estado == "ACTIVO" else "bg-amber-100 text-amber-700"
            } for f in fondos
        ],
        "gastos": [
            {
                "id": f"GC-{g.id:04d}",
                "referencia": f"GC-{g.id:04d}",
                "concepto": g.concepto,
                "fondo": g.fondo.nombre if g.fondo else "N/A",
                "monto": f"${to_float(g.monto_usd):,.2f}",
                "soporte": g.soporte,
                "fecha": g.fecha.strftime("%d/%m/%Y"),
                "estado": g.estado.capitalize(),
                "color": "bg-slate-100 text-slate-700" if g.estado == "PROCESADO" else "bg-amber-100 text-amber-700"
            } for g in gastos
        ]
    }


@tesoreria_router.post("/caja-chica/movimiento")
def movimiento_caja_chica(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    fondo_id_str = body.get("fondo_id", "")
    try:
        fid = int(fondo_id_str.replace("FD-", ""))
    except:
        fid = 1

    fondo = db.query(FondoCajaChica).filter(
        FondoCajaChica.id == fid,
        FondoCajaChica.tenant_id == current_user.tenant_id
    ).first()
    if not fondo:
        raise HTTPException(status_code=404, detail="Fondo de caja chica no encontrado")

    monto = float(body.get("monto", 0))
    fondo.disponible_usd = max(0, float(fondo.disponible_usd) - monto)

    gasto = GastoCajaChica(
        fondo_id=fid,
        concepto=body.get("concepto", "Gasto sin concepto"),
        monto_usd=monto,
        soporte=body.get("soporte", "Sin Soporte"),
        no_deducible=body.get("no_deducible", False),
        tenant_id=current_user.tenant_id
    )
    db.add(gasto)
    db.commit()
    return {"ok": True, "id": gasto.id}


@tesoreria_router.post("/caja-chica/reponer")
def reponer_caja_chica(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    fondos = db.query(FondoCajaChica).filter(FondoCajaChica.tenant_id == current_user.tenant_id).all()
    for f in fondos:
        f.disponible_usd = f.asignado_usd
    db.commit()
    return {"ok": True}


@tesoreria_router.post("/caja-chica/fondos")
def registrar_fondo_caja_chica(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    nombre = body.get("nombre", "")
    responsable = body.get("responsable", "")
    asignado_usd = float(body.get("asignado_usd", 0.0))
    
    if not nombre or not responsable:
        raise HTTPException(status_code=400, detail="Nombre y responsable requeridos")
        
    nuevo_fondo = FondoCajaChica(
        nombre=nombre,
        responsable=responsable,
        asignado_usd=asignado_usd,
        disponible_usd=asignado_usd,
        tenant_id=current_user.tenant_id
    )
    db.add(nuevo_fondo)
    db.commit()
    return {"ok": True, "id": nuevo_fondo.id}


@tesoreria_router.get("/arqueo")
def arqueo_caja(fecha: str, caja: str = "Caja Principal USD", db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Seed default cash accounts if they do not exist for the tenant
    caja_usd = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == "Caja Principal USD",
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    if not caja_usd:
        caja_usd = CuentaBancaria(
            banco="Caja Principal USD",
            numero_cuenta="1234-CAJA-USD-01",
            moneda="USD",
            saldo_actual_usd=1500.00,
            tenant_id=current_user.tenant_id
        )
        db.add(caja_usd)
        
    caja_ventas = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == "Caja Chica Ventas",
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    if not caja_ventas:
        caja_ventas = CuentaBancaria(
            banco="Caja Chica Ventas",
            numero_cuenta="1234-CAJA-USD-02",
            moneda="USD",
            saldo_actual_usd=350.00,
            tenant_id=current_user.tenant_id
        )
        db.add(caja_ventas)

    caja_ves = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == "Caja Principal VES",
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    if not caja_ves:
        caja_ves = CuentaBancaria(
            banco="Caja Principal VES",
            numero_cuenta="1234-CAJA-VES-01",
            moneda="VES",
            saldo_actual_usd=25000.00,
            tenant_id=current_user.tenant_id
        )
        db.add(caja_ves)
        
    db.commit()

    # Get balance of selected cash account
    selected = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == caja,
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    saldo_usd = to_float(selected.saldo_actual_usd) if selected else 0.0

    # Get balance of VES cash account
    saldo_ves = to_float(caja_ves.saldo_actual_usd) if caja_ves else 0.0

    return {
        "fecha": fecha,
        "caja": caja,
        "saldo_sistema_usd": saldo_usd,
        "saldo_sistema_ves": saldo_ves
    }


@tesoreria_router.post("/arqueo/cerrar")
def cerrar_arqueo(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    import json
    from backend.models.erp_extended import AuditoriaLog
    
    caja_name = body.get("caja", "Caja Principal USD")
    fisico_usd = float(body.get("fisico_usd", 0.0))
    fisico_ves = float(body.get("fisico_ves", 0.0))
    sistema_usd = float(body.get("sistema_usd", 0.0))
    cajero = body.get("cajero", "José Pérez")
    justificacion = body.get("justificacion", "")

    # Update balance of the selected cash account to reflect the physical count
    selected = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == caja_name,
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    if selected:
        selected.saldo_actual_usd = fisico_usd

    # Update balance of the VES cash account
    caja_ves = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == "Caja Principal VES",
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    if caja_ves:
        caja_ves.saldo_actual_usd = fisico_ves

    # Log the audit closure
    diferencia = fisico_usd - sistema_usd
    detalle_data = {
        "caja": caja_name,
        "sistema": sistema_usd,
        "fisico": fisico_usd,
        "diferencia": diferencia,
        "justificacion": justificacion,
        "resolucion": "Aceptable" if abs(diferencia) <= 50.0 else "Sujeto a Auditoría"
    }

    log_entry = AuditoriaLog(
        usuario=cajero,
        accion="CIERRE_ARQUEO",
        modulo="TESORERIA",
        detalle=json.dumps(detalle_data),
        fecha=datetime.now(timezone.utc),
        tenant_id=current_user.tenant_id
    )
    db.add(log_entry)
    db.commit()
    return {"ok": True}


@tesoreria_router.get("/arqueo/pdf")
def exportar_arqueo_pdf(
    fecha: str,
    caja: str = "Caja Principal USD",
    justificacion: str = "",
    fisico_ves: float = 0.0,
    denom_100: int = 0,
    denom_50: int = 0,
    denom_20: int = 0,
    denom_10: int = 0,
    denom_5: int = 0,
    denom_1: int = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    import io

    # Retrieve system totals
    selected = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == caja,
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    system_usd = to_float(selected.saldo_actual_usd) if selected else 0.0

    caja_ves = db.query(CuentaBancaria).filter(
        CuentaBancaria.banco == "Caja Principal VES",
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).first()
    system_ves = to_float(caja_ves.saldo_actual_usd) if caja_ves else 0.0

    denoms = {
        "100": denom_100,
        "50": denom_50,
        "20": denom_20,
        "10": denom_10,
        "5": denom_5,
        "1": denom_1
    }
    fisico_usd = sum(int(k) * v for k, v in denoms.items())
    diff_usd = fisico_usd - system_usd
    diff_ves = fisico_ves - system_ves

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    story = []

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#0b5156'),
        spaceAfter=15
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=25
    )
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#0b5156'),
        spaceAfter=10
    )
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12
    )

    story.append(Paragraph("ACTA DE ARQUEO FÍSICO DE CAJA", title_style))
    story.append(Paragraph(f"Fecha de Auditoría: {fecha} | Caja: {caja}", subtitle_style))
    story.append(Spacer(1, 10))

    # Summary Table
    data_summary = [
        [Paragraph("<b>CONCEPTO</b>", normal_style), Paragraph("<b>VALOR SISTEMA</b>", normal_style), Paragraph("<b>VALOR FÍSICO</b>", normal_style), Paragraph("<b>DIFERENCIA</b>", normal_style)],
        ["Efectivo USD", f"${system_usd:,.2f}", f"${fisico_usd:,.2f}", f"${diff_usd:,.2f}"],
        ["Efectivo VES", f"Bs. {system_ves:,.2f}", f"Bs. {fisico_ves:,.2f}", f"Bs. {diff_ves:,.2f}"]
    ]

    t_summary = Table(data_summary, colWidths=[150, 120, 120, 120])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8f9fa')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#0b5156')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    story.append(t_summary)
    story.append(Spacer(1, 20))

    # Denominations Table
    story.append(Paragraph("DESGLOSE DE EFECTIVO FÍSICO (USD)", section_style))
    data_denoms = [
        [Paragraph("<b>DENOMINACIÓN</b>", normal_style), Paragraph("<b>CANTIDAD</b>", normal_style), Paragraph("<b>TOTAL USD</b>", normal_style)],
    ]
    for denom, qty in sorted(denoms.items(), key=lambda x: int(x[0]), reverse=True):
        data_denoms.append([f"${denom}", str(qty), f"${int(denom) * qty:,.2f}"])
        
    t_denoms = Table(data_denoms, colWidths=[170, 170, 170])
    t_denoms.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8f9fa')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    story.append(t_denoms)
    story.append(Spacer(1, 20))

    # Justification
    story.append(Paragraph("JUSTIFICACIÓN Y OBSERVACIONES", section_style))
    story.append(Paragraph(justificacion if justificacion else "SIN OBSERVACIONES DECLARADAS.", normal_style))
    story.append(Spacer(1, 40))

    # Signatures
    data_sigs = [
        ["_________________________", "_________________________"],
        ["Firma Responsable Caja", "Firma Auditor Autorizado"]
    ]
    t_sigs = Table(data_sigs, colWidths=[250, 250])
    t_sigs.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_sigs)

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=acta_arqueo_{fecha}.pdf"}
    )


# --- REPORTES ---
