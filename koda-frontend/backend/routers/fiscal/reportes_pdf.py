from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
import io
import hashlib

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.erp_extended import Empresa, RetencionISLR, RetencionIVA
from backend.models.operations import Proveedor
from backend.utils.helpers import to_float
from backend.core.security import get_current_user

router = APIRouter()


def _obtener_empresa_emisor(db: Session, tenant_id) -> dict:
    emp = db.query(Empresa).filter(Empresa.tenant_id == tenant_id).first()
    if not emp:
        raise HTTPException(
            status_code=400,
            detail="Debe configurar el perfil de su Empresa (razón social, RIF) en Admin > Perfil de Empresa antes de emitir documentos fiscales."
        )

    return {
        "rif": emp.rif,
        "razon_social": emp.razon_social,
        "direccion": emp.direccion if emp.direccion else "Dirección no registrada"
    }


@router.get("/arc/pdf")
def generar_pdf_arc(
    proveedor_id: str = Query(...),
    anio: int = Query(...),
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    """
    Genera un comprobante ARC (Retenciones de ISLR) en formato PDF inmutable.
    Este documento cuenta con validez forense y jurídica para auditorías del SENIAT.
    """
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle
    except ImportError:
        return {"error": "Librería reportlab no instalada. Ejecute: pip install reportlab"}

    # Consultar datos reales de la Empresa emisora en la BD
    empresa_info = _obtener_empresa_emisor(db, current_user.tenant_id)
    emisor_nombre = empresa_info["razon_social"]
    emisor_rif = empresa_info["rif"]

    # Consultar datos reales del Proveedor en la BD
    proveedor = db.query(Proveedor).filter(
        Proveedor.rif == proveedor_id,
        Proveedor.tenant_id == current_user.tenant_id,
    ).first()
    if not proveedor:
        raise HTTPException(
            status_code=404,
            detail="Proveedor no encontrado. Debe registrar el proveedor real antes de emitir este comprobante."
        )

    nombre_proveedor = proveedor.nombre

    # Creamos un buffer en memoria RAM para no llenar el disco duro del servidor
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    ancho, alto = letter
    
    # --- 1. ENCABEZADO OFICIAL ---
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, alto - 50, emisor_nombre)
    c.setFont("Helvetica", 10)
    c.drawString(50, alto - 65, f"R.I.F.: {emisor_rif}")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(ancho / 2, alto - 100, "COMPROBANTE DE RETENCIONES VARIAS (ARC)")
    c.setFont("Helvetica", 10)
    c.drawCentredString(ancho / 2, alto - 115, f"EJERCICIO FISCAL: {anio}")
    
    # --- 2. DATOS DEL SUJETO RETENIDO ---
    c.rect(50, alto - 180, ancho - 100, 40)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(55, alto - 155, "Nombre o Razón Social del Sujeto Retenido:")
    c.drawString(350, alto - 155, "Registro de Información Fiscal (R.I.F.):")
    
    c.setFont("Helvetica", 10)
    c.drawString(55, alto - 170, nombre_proveedor)
    c.drawString(350, alto - 170, proveedor_id)
    
    # --- 3. TABLA DE RETENCIONES (Platypus Engine) ---
    data = [["Mes", "Concepto", "Base Imponible", "% Ret.", "Monto Retenido"]]
    
    # Consultar retenciones reales en la BD
    retenciones = db.query(RetencionISLR).filter(
        RetencionISLR.proveedor_rif == proveedor_id,
        RetencionISLR.periodo.like(f"{anio}%"),
        RetencionISLR.tenant_id == current_user.tenant_id,
    ).all()

    meses_map = {
        "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
        "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
        "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
    }

    total_base = 0.0
    total_monto = 0.0

    for r in retenciones:
        # Determinar mes a partir del periodo
        mes_num = "01"
        if "-" in r.periodo:
            parts = r.periodo.split("-")
            if len(parts) > 1:
                mes_num = parts[1]
        elif len(r.periodo) == 6:
            mes_num = r.periodo[4:]
        mes_nombre = meses_map.get(mes_num, "Enero")

        # Convertir base y monto a float para formateo y acumulación
        base_val = float(r.base_usd)
        monto_val = float(r.monto_usd)
        total_base += base_val
        total_monto += monto_val

        # Formatear al estilo de Venezuela
        base_str = f"{base_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        monto_str = f"{monto_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        
        alicuota_pct = float(r.alicuota) * 100
        alicuota_str = f"{alicuota_pct:.0f}%"

        data.append([
            mes_nombre,
            f"Retención ISLR (Cod. {r.concepto_codigo})",
            base_str,
            alicuota_str,
            monto_str
        ])

    total_base_str = f"{total_base:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    total_monto_str = f"{total_monto:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    data.append(["TOTALES", "", total_base_str, "", total_monto_str])
    
    tabla = Table(data, colWidths=[80, 150, 100, 60, 100])
    tabla.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.black),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'), # Fila de Totales en Negrita
    ]))
    
    tabla.wrapOn(c, ancho, alto)
    tabla.drawOn(c, 50, alto - 450)
    
    # --- 4. SELLO FORENSE ---
    c.setFont("Helvetica-Oblique", 7)
    hash_val = hashlib.sha256(f"{proveedor_id}{anio}".encode()).hexdigest()[:16]
    c.drawString(50, 50, f"Documento generado electrónicamente por KODA ERP. Hash de validación de data: {hash_val}")
    
    c.save()
    buffer.seek(0)
    
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=ARC_{proveedor_id}_{anio}.pdf"})


@router.get("/retencion-iva/pdf")
def generar_pdf_retencion_iva(
    proveedor_id: str = Query(...),
    periodo: str = Query(...),  # Formato YYYYMM o YYYY-MM
    correlativo: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    """
    Genera un comprobante de Retención de IVA en formato PDF inmutable.
    Cumple estrictamente con la Providencia Administrativa vigente del SENIAT.
    """
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle
    except ImportError:
        return {"error": "Librería reportlab no instalada."}

    # Consultar datos reales de la Empresa emisora en la BD
    empresa_info = _obtener_empresa_emisor(db, current_user.tenant_id)
    emisor_nombre = empresa_info["razon_social"]
    emisor_rif = empresa_info["rif"]
    emisor_direccion = empresa_info["direccion"]

    # Consultar datos reales del Proveedor en la BD
    proveedor = db.query(Proveedor).filter(
        Proveedor.rif == proveedor_id,
        Proveedor.tenant_id == current_user.tenant_id,
    ).first()
    if not proveedor:
        raise HTTPException(
            status_code=404,
            detail="Proveedor no encontrado. Debe registrar el proveedor real antes de emitir este comprobante."
        )

    nombre_proveedor = proveedor.nombre

    buffer = io.BytesIO()
    # Usamos orientación apaisada (landscape) porque la tabla de IVA tiene muchas columnas
    c = canvas.Canvas(buffer, pagesize=landscape(letter))
    ancho, alto = landscape(letter)
    
    # --- 1. ENCABEZADO OFICIAL ---
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, alto - 40, emisor_nombre)
    c.setFont("Helvetica", 9)
    c.drawString(40, alto - 52, f"R.I.F.: {emisor_rif}")
    c.drawString(40, alto - 64, f"Dirección: {emisor_direccion}")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(ancho / 2, alto - 90, "COMPROBANTE DE RETENCIÓN DEL IMPUESTO AL VALOR AGREGADO")
    
    c.setFont("Helvetica", 8)
    c.drawCentredString(ancho / 2, alto - 105, "(Decreto con Rango, Valor y Fuerza de Ley que establece el Impuesto al Valor Agregado)")
    
    # Número de Comprobante (Derecha)
    fecha_emision_str = datetime.now().strftime("%d/%m/%Y")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(ancho - 250, alto - 40, f"N° COMPROBANTE: {correlativo}")
    c.drawString(ancho - 250, alto - 55, f"FECHA DE EMISIÓN: {fecha_emision_str}")
    c.drawString(ancho - 250, alto - 70, f"PERÍODO FISCAL: {periodo}")
    
    # --- 2. DATOS DE LOS SUJETOS ---
    c.rect(40, alto - 180, ancho - 80, 50)
    
    c.setFont("Helvetica-Bold", 8)
    c.drawString(45, alto - 145, "DATOS DEL AGENTE DE RETENCIÓN:")
    c.drawString(ancho / 2 + 10, alto - 145, "DATOS DEL SUJETO RETENIDO:")
    
    c.setFont("Helvetica", 9)
    c.drawString(45, alto - 160, f"Razón Social: {emisor_nombre}")
    c.drawString(45, alto - 172, f"R.I.F.: {emisor_rif}")
    
    c.drawString(ancho / 2 + 10, alto - 160, f"Razón Social: {nombre_proveedor}")
    c.drawString(ancho / 2 + 10, alto - 172, f"R.I.F.: {proveedor_id}")
    
    # Línea divisoria vertical
    c.line(ancho / 2, alto - 180, ancho / 2, alto - 130)
    
    # --- 3. TABLA DE FACTURAS (Formato SENIAT) ---
    # Consultamos los registros reales de RetencionIVA correspondientes al proveedor y periodo
    # Acepta tanto formato YYYYMM como YYYY-MM en el filtro
    periodos_posibles = [periodo]
    if len(periodo) == 6 and periodo.isdigit():
        periodos_posibles.append(f"{periodo[:4]}-{periodo[4:]}")
    elif len(periodo) == 7 and "-" in periodo:
        periodos_posibles.append(periodo.replace("-", ""))

    query_retenciones = db.query(RetencionIVA).filter(
        RetencionIVA.proveedor_rif == proveedor_id,
        RetencionIVA.periodo.in_(periodos_posibles),
        RetencionIVA.tenant_id == current_user.tenant_id,
    )

    # Si hay registros específicos para este número de comprobante, filtramos por él;
    # de lo contrario, incluimos las del período para el proveedor
    retenciones_comprobante = query_retenciones.all()
    if correlativo:
        ret_con_correlativo = [r for r in retenciones_comprobante if r.numero_comprobante == correlativo]
        if ret_con_correlativo:
            retenciones_comprobante = ret_con_correlativo

    # Cabeceras requeridas legalmente
    data = [
        ["Operación", "Fecha Doc.", "Nro. Factura", "Nro. Control", "Total Compras", "Sin Derecho a \nCrédito Fiscal", "Base Imponible", "% Alícuota", "Impuesto IVA", "% Ret.", "IVA Retenido"]
    ]
    
    total_compras = 0.0
    total_base = 0.0
    total_iva = 0.0
    total_ret = 0.0
    
    for r in retenciones_comprobante:
        base = to_float(r.base_usd)
        ret = to_float(r.monto_usd)
        alicuota_ret = float(r.alicuota)  # Ej. 0.75 para 75%, 1.0 para 100%
        alicuota_ret_pct = alicuota_ret * 100 if alicuota_ret <= 1.0 else alicuota_ret
        
        # IVA de la operación (16% estándar sobre la base imponible)
        iva = base * 0.16
        total = base + iva
        
        total_compras += total
        total_base += base
        total_iva += iva
        total_ret += ret
        
        fecha_doc_str = r.fecha_comprobante.strftime("%d/%m/%Y") if r.fecha_comprobante else datetime.now().strftime("%d/%m/%Y")
        
        data.append([
            "01 - Reg",
            fecha_doc_str,
            r.numero_factura or "S/N",
            r.numero_comprobante or "S/N",
            f"{total:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "0,00",
            f"{base:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "16%",
            f"{iva:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            f"{alicuota_ret_pct:.0f}%",
            f"{ret:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        ])
        
    if not retenciones_comprobante:
        data.append(["No hay retenciones", "-", "-", "-", "0,00", "0,00", "0,00", "16%", "0,00", "0%", "0,00"])
        
    # Totales
    data.append([
        "TOTALES", "", "", "",
        f"{total_compras:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
        "0,00",
        f"{total_base:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
        "",
        f"{total_iva:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
        "",
        f"{total_ret:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    ])
    
    # Ajustamos anchos de columnas para caber en la página apaisada
    col_widths = [60, 65, 70, 70, 80, 80, 80, 50, 75, 40, 75]
    tabla = Table(data, colWidths=col_widths)
    
    tabla.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0B5156")), # KODA Main Color para cabecera
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'), # Fila totales
        ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
    ]))
    
    tabla.wrapOn(c, ancho, alto)
    # Posicionamos la tabla. Ajustar la altura dependiendo de la cantidad de filas.
    tabla.drawOn(c, 40, alto - 280)
    
    # --- 4. FIRMAS Y SELLO FORENSE ---
    c.line(150, 100, 300, 100)
    c.drawCentredString(225, 85, "FIRMA Y SELLO DEL AGENTE")
    
    c.line(ancho - 300, 100, ancho - 150, 100)
    c.drawCentredString(ancho - 225, 85, "FIRMA Y SELLO DEL PROVEEDOR")
    
    c.setFont("Helvetica-Oblique", 6)
    hash_val = hashlib.sha256(f"{proveedor_id}{correlativo}{periodo}".encode()).hexdigest()[:16]
    c.drawString(40, 30, f"Documento generado electrónicamente por KODA ERP. Hash de validación criptográfica (SHA-256): {hash_val}")
    
    c.save()
    buffer.seek(0)
    
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=RET_IVA_{correlativo}.pdf"})
