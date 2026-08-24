from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
import io
from fastapi.responses import StreamingResponse

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.operations import Venta
from backend.models.erp_extended import Compra, DeclaracionIVA, RetencionIVA, DeclaracionISLR, Empresa
from backend.utils.helpers import ventas_periodo, periodo_rango, to_float, tasa_actual
from backend.core.security import get_current_user

router = APIRouter()


@router.get("/declaracion-iva")
def declaracion_iva(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    ventas = ventas_periodo(db, current_user.tenant_id, periodo).all()
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(
        Compra.fecha >= inicio,
        Compra.fecha < fin,
        Compra.tenant_id == current_user.tenant_id,
    ).all()
    debito = sum(to_float(v.iva) for v in ventas)
    credito = sum(to_float(c.iva) for c in compras)
    base_ventas = sum(to_float(v.subtotal) for v in ventas)
    base_compras = sum(to_float(c.subtotal) for c in compras)
    tasa = tasa_actual(db, current_user.tenant_id)

    # Calcular retenciones soportadas
    rets = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo == 'SOPORTADA',
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).all()
    retenciones_soportadas = sum(to_float(r.monto_usd) for r in rets)

    return {
        "periodo": periodo,
        "debito_fiscal": round(debito * tasa, 2),
        "credito_fiscal_mes": round(credito * tasa, 2),
        "credito_excedente_anterior": 0,
        "base_imponible_ventas": round(base_ventas * tasa, 2),
        "base_imponible_compras": round(base_compras * tasa, 2),
        "retenciones": round(retenciones_soportadas * tasa, 2),
        "metrics": [
            {"label": "Período", "value": periodo, "desc": "Declaración IVA", "color": "text-[#0b5156]"},
            {"label": "Débito Fiscal", "value": f"Bs. {debito * tasa:,.2f}", "desc": "IVA ventas", "color": "text-red-600"},
            {"label": "Crédito Fiscal", "value": f"Bs. {credito * tasa:,.2f}", "desc": "IVA compras", "color": "text-green-600"},
            {"label": "Facturas", "value": str(len(ventas)), "desc": "En libro de ventas", "color": "text-slate-800"},
        ],
        "estado_libros": [
            {"libro": "Ventas", "estado": "OK" if ventas else "VACÍO"},
            {"libro": "Compras", "estado": "OK" if compras else "VACÍO"},
        ],
    }


@router.get("/declaraciones-iva/historial")
def historial_declaraciones_iva(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    return db.query(DeclaracionIVA).filter(
        DeclaracionIVA.tenant_id == current_user.tenant_id
    ).order_by(DeclaracionIVA.periodo.desc()).limit(12).all()


@router.post("/declaracion-iva/borrador")
def guardar_borrador_iva(body: dict, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    periodo = body.get("periodo")
    decl = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == periodo,
        DeclaracionIVA.tenant_id == current_user.tenant_id,
    ).first()
    if not decl:
        decl = DeclaracionIVA(
            periodo=periodo,
            estado="BORRADOR",
            tasa_cambio_bs=tasa_actual(db, current_user.tenant_id),
            tenant_id=current_user.tenant_id,
        )
        db.add(decl)
    decl.retenciones = body.get("retenciones", 0)
    decl.estado = "BORRADOR"
    db.commit()
    return {"ok": True}


@router.post("/declaracion-iva/finalizar")
def finalizar_iva(body: dict, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    periodo = body.get("periodo")
    data = declaracion_iva(periodo, db, current_user)
    decl = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == periodo,
        DeclaracionIVA.tenant_id == current_user.tenant_id,
    ).first()
    if not decl:
        decl = DeclaracionIVA(
            periodo=periodo,
            tasa_cambio_bs=tasa_actual(db, current_user.tenant_id),
            tenant_id=current_user.tenant_id,
        )
        db.add(decl)
    decl.debito_fiscal = data["debito_fiscal"]
    decl.credito_fiscal_mes = data["credito_fiscal_mes"]
    decl.retenciones = body.get("retenciones", 0)
    decl.estado = "FINALIZADA"
    # NOTA: el modelo DeclaracionIVA no tiene columna `fecha_presentacion`
    # (solo `fecha_cierre`) — asignar el nombre viejo no fallaba porque
    # SQLAlchemy permite atributos arbitrarios en la instancia, pero nunca
    # se persistía. Se corrige al campo real.
    decl.fecha_cierre = datetime.now(timezone.utc)

    db.add(decl)
    db.commit()
    return {"ok": True, "id": decl.id}


@router.get("/declaracion-iva/pdf")
def generar_pdf_declaracion_iva(
    periodo: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    """Genera el documento oficial del Formulario DP-31 (Declaración y Pago de IVA)
    para un período ya finalizado. Sin esto, "Generar DP-31 Final" solo cerraba
    el período en la base de datos pero no producía ningún documento descargable."""
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter

    decl = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == periodo,
        DeclaracionIVA.tenant_id == current_user.tenant_id,
    ).first()
    if not decl or decl.estado != "FINALIZADA":
        raise HTTPException(status_code=404, detail="No existe una declaración DP-31 finalizada para este período.")

    empresa = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    rif = empresa.rif if empresa else "N/A"
    razon_social = empresa.razon_social if empresa else "N/A"

    debito = to_float(decl.debito_fiscal_usd)
    credito = to_float(decl.credito_fiscal_mes_usd)
    retenciones = to_float(decl.retenciones_usd)
    total_a_pagar = max(debito - credito - retenciones, 0)

    buffer = io.BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=letter)
    ancho, alto = letter

    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, alto - 50, razon_social)
    c.setFont("Helvetica", 10)
    c.drawString(50, alto - 65, f"R.I.F.: {rif}")

    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor("#0b5156"))
    c.drawString(340, alto - 50, "FORMULARIO DP-31")
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(340, alto - 68, "DECLARACIÓN Y PAGO DEL I.V.A.")
    c.setFont("Helvetica", 10)
    c.drawString(340, alto - 82, f"PERÍODO: {periodo}")
    c.drawString(340, alto - 96, f"ESTADO: {decl.estado}")

    c.setLineWidth(1)
    c.setStrokeColor(colors.HexColor("#e2e8f0"))
    c.line(50, alto - 115, ancho - 50, alto - 115)

    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, alto - 140, "RESUMEN DE LA DECLARACIÓN (Bs.)")

    filas = [
        ("Débito Fiscal (IVA en ventas)", debito),
        ("Crédito Fiscal del mes (IVA en compras)", credito),
        ("Retenciones de IVA soportadas", retenciones),
        ("Total a Pagar", total_a_pagar),
    ]
    y = alto - 165
    c.setFont("Helvetica", 10)
    for label, valor in filas:
        c.drawString(50, y, label)
        c.drawRightString(ancho - 50, y, f"Bs. {valor:,.2f}")
        y -= 20

    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(ancho / 2, 40, "Documento generado por Koda ERP. Presentar ante el Portal SENIAT conforme a la normativa vigente.")

    c.showPage()
    c.save()
    buffer.seek(0)

    filename = f"DP31_{periodo}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/declaracion-islr")
def declaracion_islr_calc(periodo: Optional[str] = None, anio: Optional[str] = None, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    from sqlalchemy import extract

    val_periodo = anio or periodo or str(datetime.now().year)
    year = int(val_periodo)

    decl = db.query(DeclaracionISLR).filter(
        DeclaracionISLR.ejercicio == str(year),
        DeclaracionISLR.tenant_id == current_user.tenant_id,
    ).first()

    if not decl:
        ventas = db.query(Venta).filter(
            extract('year', Venta.fecha) == year,
            Venta.tenant_id == current_user.tenant_id,
        ).all()
        compras = db.query(Compra).filter(
            extract('year', Compra.fecha) == year,
            Compra.tenant_id == current_user.tenant_id,
        ).all()
        
        ingresos = sum(to_float(v.subtotal) for v in ventas)
        costos = sum(to_float(c.subtotal) for c in compras)
        deducciones = 0.0
        enriquecimiento = ingresos - costos - deducciones
        if enriquecimiento < 0: enriquecimiento = 0
        impuesto = enriquecimiento * 0.34 # Tarifa corporativa simple
    else:
        ingresos = to_float(decl.ingresos_brutos)
        costos = to_float(decl.costos_ventas)
        deducciones = to_float(decl.deducciones)
        enriquecimiento = to_float(decl.enriquecimiento_neto)
        impuesto = to_float(decl.impuesto_determinado)
        
    historial = [
        {
            "id": d.id,
            "period": d.ejercicio,
            "date": d.fecha_presentacion.strftime("%d/%m/%Y") if d.fecha_presentacion else "N/A",
            "amount": d.islr_pagado,
            "status": "PAGADO" if d.estado == "FINALIZADA" else d.estado,
            "ref": f"ISLR-{d.ejercicio}"
        } for d in db.query(DeclaracionISLR).filter(
            DeclaracionISLR.estado == "FINALIZADA",
            DeclaracionISLR.tenant_id == current_user.tenant_id,
        ).order_by(DeclaracionISLR.ejercicio.desc()).all()
    ]
    
    return {
        "ejercicio": str(year),
        "metricas": [
            {"label": "Ingresos Brutos", "value": ingresos, "desc": "Total facturado", "color": "text-green-600"},
            {"label": "Costos y Deducciones", "value": costos + deducciones, "desc": "Compras y gastos", "color": "text-red-600"},
            {"label": "Enriquecimiento Neto", "value": enriquecimiento, "desc": "Base gravable", "color": "text-blue-600"},
            {"label": "Impuesto Determinado", "value": impuesto, "desc": "ISLR calculado", "color": "text-amber-500"}
        ],
        "calculo": [
            {"concept": "Ingresos Brutos Globales", "amount": ingresos, "notes": "Según Libro de Ventas", "isBold": True},
            {"concept": "(-) Costo de Ventas", "amount": costos, "notes": "Según Libro de Compras", "color": "text-red-500"},
            {"concept": "(-) Deducciones", "amount": deducciones, "notes": "Gastos operativos", "color": "text-red-500"},
            {"concept": "(=) Enriquecimiento Neto", "amount": enriquecimiento, "notes": "Base Imponible", "isHighlight": True},
            {"concept": "Impuesto Determinado (Tarifa 2)", "amount": impuesto, "notes": "34% para Empresas", "isHighlight": True, "color": "text-amber-600"}
        ],
        "historial": historial
    }


@router.post("/declaracion-islr/registrar")
async def registrar_declaracion_islr(request: Request, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    body = await request.json()
    ejercicio = body.get("ejercicio")
    decl = db.query(DeclaracionISLR).filter(
        DeclaracionISLR.ejercicio == ejercicio,
        DeclaracionISLR.tenant_id == current_user.tenant_id,
    ).first()
    if not decl:
        decl = DeclaracionISLR(ejercicio=ejercicio, tenant_id=current_user.tenant_id)
        db.add(decl)
    
    decl.ingresos_brutos = body.get("ingresos_brutos", 0)
    decl.costos_ventas = body.get("costos_ventas", 0)
    decl.deducciones = body.get("deducciones", 0)
    decl.enriquecimiento_neto = body.get("enriquecimiento_neto", 0)
    decl.impuesto_determinado = body.get("impuesto_determinado", 0)
    decl.retenciones_aplicables = body.get("retenciones_aplicables", 0)
    decl.islr_pagado = body.get("islr_pagado", 0)
    decl.estado = "FINALIZADA"
    decl.fecha_presentacion = datetime.now(timezone.utc)
    
    db.commit()
    return {"ok": True}
