from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, String, cast
from datetime import datetime, timezone
import logging

from backend.core.database import get_db
from backend.models.erp_extended import (
    CuentaBancaria,
    CuentaPorCobrar,
    CuentaPorPagar,
    MovimientoBancario,
    RetencionIVA,
    RetencionISLR
)

from backend.utils.auth import get_current_user

router = APIRouter(prefix="/tesoreria", tags=["Tesoreria"])
logger = logging.getLogger(__name__)

def to_float(val):
    return float(val) if val is not None else 0.0

def format_currency(val):
    return f"${val:,.2f}"

@router.get("/dashboard")
def get_treasury_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # 1. Saldos de Cuentas Bancarias
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
        
        # Clasificación simplificada por nombre/moneda
        if "zelle" in nombre or "efectivo" in nombre:
            efectivo_zelle += saldo
        elif "custodia" in nombre:
            custodia += saldo * 0.99  # Formula conservadora (99% neto)
        elif c.moneda == "VES":
            bancos_bs += saldo
        else:
            bancos_bs += saldo # Fallback genérico para bancos

        # Preparar data para lista de bancos
        bancos_lista.append({
            "nombre": c.banco,
            "saldo": format_currency(saldo),
            "neto": format_currency(saldo),
            "alerta": saldo < 100, # Arqueo requerido si saldo es bajo
            "metadata": f"{c.moneda} - {c.numero_cuenta[-4:]}" if c.numero_cuenta else c.moneda,
            "icono": c.banco[0].upper() if c.banco else "B"
        })
    
    # 2. Reserva Fiscal (IVA/ISLR retenido)
    ret_iva = db.query(func.sum(RetencionIVA.monto_usd)).filter(
        RetencionIVA.estado == "PENDIENTE",
        RetencionIVA.tenant_id == current_user.tenant_id
    ).scalar()
    ret_islr = db.query(func.sum(RetencionISLR.monto_usd)).filter(
        RetencionISLR.estado == "PENDIENTE",
        RetencionISLR.tenant_id == current_user.tenant_id
    ).scalar()
    reserva_fiscal = to_float(ret_iva) + to_float(ret_islr)

    # 3. Efectivo en Tránsito
    efectivo_transito = db.query(func.sum(MovimientoBancario.monto_usd)).filter(
        MovimientoBancario.estado == "PENDIENTE",
        MovimientoBancario.tenant_id == current_user.tenant_id
    ).scalar()
    efectivo_transito = to_float(efectivo_transito)

    # 4. Cheques por cobrar (post-datados). Como no hay tabla Cheque, lo dejamos en 0 de forma segura.
    cheques_por_cobrar = 0.0
    cheques_restar = 0.0
    cuarentena_restar = 0.0

    # 5. Disponibilidad / Liquidez Real
    disponibilidad_total = (bancos_bs + efectivo_zelle + custodia) - (cheques_restar + cuarentena_restar)
    liquidez_real = disponibilidad_total - reserva_fiscal

    # 6. Alertas Financieras (Cuentas por Pagar vencidas)
    ahora = datetime.now(timezone.utc)
    cxp_vencidas = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.fecha_vencimiento < ahora,
        CuentaPorPagar.tenant_id == current_user.tenant_id
    ).all()
    
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
        "metricas": [
            { "label": "Liquidez Real", "value": format_currency(liquidez_real), "desc": "Neto de compromisos", "color": "text-green-600", "border": "border-l-4 border-green-500" },
            { "label": "Cheques por Cobrar", "value": format_currency(cheques_por_cobrar), "desc": "Emitidos (Post-datados)", "color": "text-red-600", "border": "border-l-4 border-red-500" },
            { "label": "Efectivo en Tránsito", "value": format_currency(efectivo_transito), "desc": "Depósitos pendientes", "color": "text-amber-600", "border": "border-l-4 border-amber-500" },
            { "label": "Reserva Fiscal", "value": format_currency(reserva_fiscal), "desc": "IVA/ISLR Retenido", "color": "text-red-600", "border": "border-l-4 border-red-600" }
        ],
        "bancos": bancos_lista,
        "alertas": alertas_lista
    }
