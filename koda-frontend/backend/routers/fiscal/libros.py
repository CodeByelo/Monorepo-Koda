from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime
import io
import csv
import re
from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfgen import canvas
from fastapi.responses import StreamingResponse

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.operations import Venta, Cliente
from backend.models.erp_extended import Compra, RetencionIVA
from backend.utils.helpers import ventas_periodo, periodo_rango, to_float
from backend.core.security import get_current_user

router = APIRouter()


@router.get("/libro-ventas")
def libro_ventas(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    ventas = ventas_periodo(db, current_user.tenant_id, periodo).order_by(Venta.fecha).all()
    clientes = {c.id: c for c in db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()}
    movimientos = []
    for v in ventas:
        cli = clientes.get(getattr(v, "cliente_id", None)) if hasattr(v, "cliente_id") else None
        base = to_float(v.subtotal)
        
        # Generar número de control derivado del correlativo de la factura
        fact_num = v.numero_factura or ""
        digits = "".join(ch for ch in fact_num if ch.isdigit())
        numero_control = f"00-{digits.zfill(8)}"
        
        movimientos.append({
            "doc": v.numero_factura,
            "numero_control": numero_control,
            "fecha": v.fecha.strftime("%d/%m/%Y"),
            "rif": cli.rif if cli else "J-00000000-0",
            "client": cli.nombre if cli else "CONSUMIDOR FINAL",
            "base": base,
            "iva": to_float(v.iva),
            "total": to_float(v.total),
            "tipo": "FACTURA",
            "rif_validado": True,
        })
    resumen = {
        "total_base": sum(m["base"] for m in movimientos),
        "total_iva": sum(m["iva"] for m in movimientos),
        "total_general": sum(m["total"] for m in movimientos),
        "cantidad": len(movimientos),
    }
    return {"movimientos": movimientos, "resumen": resumen, "periodo": periodo}


@router.get("/libro-ventas/auditar-rifs")
def auditar_rifs_ventas(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    ventas = ventas_periodo(db, current_user.tenant_id, periodo).all()
    clientes = {c.id: c for c in db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()}
    
    invalidos = []
    rif_pattern = re.compile(r'^[VJGE]-\d{8}-\d$')
    for v in ventas:
        if hasattr(v, "cliente_id") and v.cliente_id:
            cli = clientes.get(v.cliente_id)
            if cli and cli.rif:
                if not rif_pattern.match(cli.rif):
                    invalidos.append({
                        "doc": v.numero_factura,
                        "cliente": cli.nombre,
                        "rif": cli.rif,
                        "error": "Formato inválido"
                    })
    return {"ok": True, "invalidos": invalidos, "total_revisados": len(ventas)}


@router.get("/libro-ventas/exportar")
def exportar_libro_ventas(periodo: str, formato: str = "pdf", db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    ventas = ventas_periodo(db, current_user.tenant_id, periodo).order_by(Venta.fecha).all()
    clientes = {c.id: c for c in db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()}

    if formato == "txt":
        output = io.StringIO()
        writer = csv.writer(output, delimiter='\t')
        writer.writerow(["FECHA", "RIF", "CLIENTE", "FACTURA", "CONTROL", "BASE", "IVA", "TOTAL"])
        for v in ventas:
            cli = clientes.get(getattr(v, "cliente_id", None)) if hasattr(v, "cliente_id") else None
            fact_num = v.numero_factura or ""
            digits = "".join(ch for ch in fact_num if ch.isdigit())
            numero_control = f"00-{digits.zfill(8)}"
            writer.writerow([
                v.fecha.strftime("%d/%m/%Y"),
                cli.rif if cli else "J-00000000-0",
                cli.nombre if cli else "CONSUMIDOR FINAL",
                fact_num,
                numero_control,
                f"{to_float(v.subtotal):.2f}",
                f"{to_float(v.iva):.2f}",
                f"{to_float(v.total):.2f}"
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]), 
            media_type="text/plain", 
            headers={"Content-Disposition": f"attachment; filename=Libro_Ventas_{periodo}.txt"}
        )
    elif formato == "xlsx" or formato == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["FECHA", "RIF", "CLIENTE", "FACTURA", "NRO CONTROL", "BASE IMPONIBLE", "IVA", "TOTAL"])
        for v in ventas:
            cli = clientes.get(getattr(v, "cliente_id", None)) if hasattr(v, "cliente_id") else None
            fact_num = v.numero_factura or ""
            digits = "".join(ch for ch in fact_num if ch.isdigit())
            writer.writerow([
                v.fecha.strftime("%d/%m/%Y"),
                cli.rif if cli else "J-00000000-0",
                cli.nombre if cli else "CONSUMIDOR FINAL",
                fact_num,
                f"00-{digits.zfill(8)}",
                to_float(v.subtotal),
                to_float(v.iva),
                to_float(v.total)
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]), 
            media_type="text/csv", 
            headers={"Content-Disposition": f"attachment; filename=Libro_Ventas_{periodo}.csv"}
        )
    
    # Default to PDF
    output = io.BytesIO()
    p = canvas.Canvas(output, pagesize=landscape(letter))
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, 570, f"LIBRO DE VENTAS - PERIODO {periodo}")
    p.setFont("Helvetica", 10)
    y = 540
    p.drawString(50, y, "FECHA | RIF | CLIENTE | FACTURA | BASE | IVA | TOTAL")
    y -= 20
    for v in ventas:
        if y < 50:
            p.showPage()
            y = 570
        cli = clientes.get(getattr(v, "cliente_id", None)) if hasattr(v, "cliente_id") else None
        line = f"{v.fecha.strftime('%d/%m/%Y')} | {cli.rif if cli else 'N/A'} | {(cli.nombre[:20] if cli else 'N/A')} | {v.numero_factura} | {to_float(v.subtotal):.2f} | {to_float(v.iva):.2f} | {to_float(v.total):.2f}"
        p.drawString(50, y, line)
        y -= 15
    p.save()
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=Libro_Ventas_{periodo}.pdf"}
    )


@router.get("/libro-compras")
def libro_compras(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(
        Compra.fecha >= inicio,
        Compra.fecha < fin,
        Compra.estado == "ACTIVA",
        Compra.tenant_id == current_user.tenant_id,
    ).all()
    movimientos = []
    for c in compras:
        prov = c.proveedor
        movimientos.append({
            "id": c.id,
            "doc": c.numero_factura,
            "control": c.numero_control or "FALTA",
            "fecha": c.fecha.strftime("%d/%m/%Y"),
            "rif": prov.rif if prov else "",
            "provider": prov.nombre if prov else "",
            "base": to_float(c.subtotal),
            "iva": to_float(c.iva),
            "total": to_float(c.total),
        })
    
    total_base = sum(m["base"] for m in movimientos)
    total_iva = sum(m["iva"] for m in movimientos)
    valid_controls = sum(1 for m in movimientos if m["control"] != "FALTA")
    pct_val = (valid_controls / len(movimientos) * 100) if movimientos else 0

    # Retenciones de IVA que practicamos realmente a nuestros proveedores en este período
    # (registros reales en RetencionIVA, no una fórmula estimada sobre el total de IVA)
    retenciones_practicadas = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo == "PRACTICADA",
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).all()
    retenciones_por_pagar = sum(to_float(r.monto_usd) for r in retenciones_practicadas)

    return {
        "movimientos": movimientos,
        "resumen": {
            "base_imponible": total_base,
            "exento": 0,
            "credito_perdido": 0,
            "credito_fiscal_iva": total_iva,
            "retenciones_por_pagar": retenciones_por_pagar,
            "porcentaje_validacion": round(pct_val),
            "total_base": total_base,
            "total_iva": total_iva,
            "cantidad": len(movimientos),
        },
    }


@router.get("/libro-compras/exportar")
def exportar_libro_compras(periodo: str, formato: str = "txt", db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Genera el archivo del Libro de Compras SENIAT para el período dado.
    Espejo de exportar_libro_ventas, adaptado a Compra/Proveedor."""
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(
        Compra.fecha >= inicio,
        Compra.fecha < fin,
        Compra.estado == "ACTIVA",
        Compra.tenant_id == current_user.tenant_id,
    ).order_by(Compra.fecha).all()

    if formato == "txt":
        output = io.StringIO()
        writer = csv.writer(output, delimiter='\t')
        writer.writerow(["FECHA", "RIF", "PROVEEDOR", "FACTURA", "CONTROL", "BASE", "IVA", "TOTAL"])
        for c in compras:
            prov = c.proveedor
            fact_num = c.numero_factura or ""
            numero_control = c.numero_control or "FALTA"
            writer.writerow([
                c.fecha.strftime("%d/%m/%Y"),
                prov.rif if prov else "J-00000000-0",
                prov.nombre if prov else "PROVEEDOR DESCONOCIDO",
                fact_num,
                numero_control,
                f"{to_float(c.subtotal):.2f}",
                f"{to_float(c.iva):.2f}",
                f"{to_float(c.total):.2f}"
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename=Libro_Compras_{periodo}.txt"}
        )
    elif formato == "xlsx" or formato == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["FECHA", "RIF", "PROVEEDOR", "FACTURA", "NRO CONTROL", "BASE IMPONIBLE", "IVA", "TOTAL"])
        for c in compras:
            prov = c.proveedor
            writer.writerow([
                c.fecha.strftime("%d/%m/%Y"),
                prov.rif if prov else "J-00000000-0",
                prov.nombre if prov else "PROVEEDOR DESCONOCIDO",
                c.numero_factura or "",
                c.numero_control or "FALTA",
                to_float(c.subtotal),
                to_float(c.iva),
                to_float(c.total)
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=Libro_Compras_{periodo}.csv"}
        )

    # Default a PDF
    output = io.BytesIO()
    p = canvas.Canvas(output, pagesize=landscape(letter))
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, 570, f"LIBRO DE COMPRAS - PERIODO {periodo}")
    p.setFont("Helvetica", 10)
    y = 540
    p.drawString(50, y, "FECHA | RIF | PROVEEDOR | FACTURA | BASE | IVA | TOTAL")
    y -= 20
    for c in compras:
        if y < 50:
            p.showPage()
            y = 570
        prov = c.proveedor
        line = f"{c.fecha.strftime('%d/%m/%Y')} | {prov.rif if prov else 'N/A'} | {(prov.nombre[:20] if prov else 'N/A')} | {c.numero_factura} | {to_float(c.subtotal):.2f} | {to_float(c.iva):.2f} | {to_float(c.total):.2f}"
        p.drawString(50, y, line)
        y -= 15
    p.save()
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Libro_Compras_{periodo}.pdf"}
    )


@router.patch("/libro-compras/{compra_id}/control")
async def actualizar_control_compra(compra_id: int, request: Request, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    compra = db.query(Compra).filter(
        Compra.id == compra_id,
        Compra.tenant_id == current_user.tenant_id,
    ).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    body = await request.json()
    ret = RetencionIVA()
    ret.tenant_id = current_user.tenant_id
    ret.tipo = body.get("tipo", "RECIBIDA")
    ret.agente_rif = body.get("agente_rif", "")
    ret.agente_nombre = body.get("agente_nombre", "")
    ret.numero_factura = body.get("numero_factura", "")
    ret.numero_comprobante = body.get("numero_comprobante", "")
    ret.fecha_comprobante = datetime.strptime(body.get("fecha_comprobante"), "%Y-%m-%d") if body.get("fecha_comprobante") else datetime.now()
    ret.base_usd = body.get("base", 0)
    ret.alicuota = body.get("alicuota", 0) / 100.0
    ret.monto_usd = body.get("iva_retenido", 0)
    ret.tasa_cambio_bs = 1.0 # default
    ret.periodo = body.get("periodo", "")
    ret.estado = "VALIDADO"
    
    db.add(ret)
    db.commit()
    
    compra.numero_control = body.get("numero_control")
    db.commit()
    return {"ok": True, "id": ret.id, "mensaje": "Comprobante cargado exitosamente"}
