from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
import io
from fastapi.responses import StreamingResponse

from backend.core.database import get_db
from backend.models.accounting import AsientoContable
from backend.schemas.accounting import AsientoContableResponse, PaginatedAsientoContableResponse
from backend.core.security import get_current_user

router = APIRouter(prefix="/contabilidad", tags=["Contabilidad y Finanzas"])

@router.get("/asientos", response_model=PaginatedAsientoContableResponse)
def listar_asientos(
    limit: int = 50,
    offset: int = 0,
    fecha: Optional[str] = None,
    buscar: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Obtiene todos los asientos contables registrados en el Libro Diario.
    Ordenados del mas reciente al mas antiguo, con filtros por fecha y concepto.
    """
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    q = db.query(AsientoContable)
    if fecha:
        try:
            dt = datetime.strptime(fecha, "%Y-%m-%d").date()
            q = q.filter(func.date(AsientoContable.fecha) == dt)
        except ValueError:
            pass
            
    if buscar:
        q = q.filter(
            AsientoContable.concepto.ilike(f"%{buscar}%") |
            AsientoContable.referencia.ilike(f"%{buscar}%")
        )

    total_records = q.count()
    asientos = q.order_by(AsientoContable.fecha.desc()).offset(offset).limit(limit).all()

    return {
        "total_records": total_records,
        "limit": limit,
        "offset": offset,
        "data": asientos
    }

@router.get("/asientos/exportar-pdf")
def exportar_asientos_pdf(fecha: Optional[str] = None, db: Session = Depends(get_db)):
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    q = db.query(AsientoContable)
    if fecha:
        try:
            dt = datetime.strptime(fecha, "%Y-%m-%d").date()
            q = q.filter(func.date(AsientoContable.fecha) == dt)
        except:
            pass
    asientos = q.order_by(AsientoContable.fecha.asc()).all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=14,
        textColor=colors.HexColor('#0b5156'),
        spaceAfter=15
    )
    
    story.append(Paragraph("KODA ERP - LIBRO DIARIO OFICIAL", title_style))
    if fecha:
        story.append(Paragraph(f"Fecha filtrada: {fecha}", styles['Normal']))
    story.append(Spacer(1, 10))
    
    for a in asientos:
        story.append(Paragraph(f"Asiento #{a.id} - Ref: {a.referencia} - Fecha: {a.fecha.strftime('%d/%m/%Y %H:%M')}", styles['Heading3']))
        story.append(Paragraph(f"Concepto: {a.concepto}", styles['Normal']))
        
        table_data = [['Codigo', 'Nombre Cuenta', 'Debe (USD)', 'Haber (USD)']]
        for d in a.detalles:
            debe = f"{float(d.debe_usd):,.2f}" if d.debe_usd > 0 else ""
            haber = f"{float(d.haber_usd):,.2f}" if d.haber_usd > 0 else ""
            table_data.append([d.cuenta_codigo, d.cuenta_nombre, debe, haber])
            
        t = Table(table_data, colWidths=[80, 240, 100, 100])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f2f2f2')),
            ('ALIGN', (2, 0), (3, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 15))
        
    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=libro_diario_oficial.pdf"}
    )

@router.get("/asientos/{id}", response_model=AsientoContableResponse)
def obtener_asiento(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Obtiene el detalle de un asiento contable especifico por ID.
    """
    asiento = db.query(AsientoContable).filter(AsientoContable.id == id).first()
    if not asiento:
        raise HTTPException(status_code=404, detail="Asiento contable no encontrado")
    return asiento
