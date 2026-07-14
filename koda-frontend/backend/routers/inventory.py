from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from backend.core.database import get_db
from backend.models.operations import Producto, KardexMovimiento, AjusteInventario
from backend.models.core import TasaCambio
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.schemas.operations import AjusteInventarioCreate, AjusteInventarioResponse, KardexMovimientoResponse
from backend.core.security import get_current_user, require_role
from backend.utils.idempotency import require_idempotency

router = APIRouter(prefix="/inventario", tags=["Inventario y Almacén"])


@router.post("/ajustes/proponer", response_model=AjusteInventarioResponse, status_code=status.HTTP_201_CREATED)
def proponer_ajuste(
    ajuste_in: AjusteInventarioCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user) # MAKER: Cualquier operador puede proponer
):
    """
    Paso 1 (Maker): Un operador reporta una merma o sobrante físico.
    No afecta el inventario real ni la contabilidad todavía.
    """
    producto = db.query(Producto).filter(
        Producto.id == ajuste_in.producto_id,
        Producto.tenant_id == current_user.tenant_id
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    nuevo_ajuste = AjusteInventario(
        producto_id=ajuste_in.producto_id,
        cantidad=ajuste_in.cantidad,
        motivo=ajuste_in.motivo,
        estado="PENDIENTE",
        tenant_id=current_user.tenant_id
    )
    db.add(nuevo_ajuste)
    db.commit()
    db.refresh(nuevo_ajuste)
    return nuevo_ajuste

@router.get("/ajustes/pendientes", response_model=List[AjusteInventarioResponse])
def listar_ajustes_pendientes(
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"])) # CHECKER: Solo un gerente puede ver esto
):
    """
    Retorna la lista de ajustes reportados por los operadores que aún no han sido aprobados.
    """
    return db.query(AjusteInventario).filter(
        AjusteInventario.estado == "PENDIENTE",
        AjusteInventario.tenant_id == current_user.tenant_id
    ).order_by(AjusteInventario.fecha_solicitud.desc()).all()

@router.post("/ajustes/{ajuste_id}/aprobar", response_model=AjusteInventarioResponse)
@require_idempotency
def aprobar_ajuste(
    request: Request,
    ajuste_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"])) # CHECKER: Solo un gerente puede aprobar
):
    """
    Paso 2 (Checker): Un gerente audita y aprueba el ajuste.
    Esto ejecuta una transacción atómica que modifica el stock real, deja el rastro en el Kardex,
    y genera automáticamente el Asiento Contable (Libro Diario).
    """
    ajuste = db.query(AjusteInventario).filter(
        AjusteInventario.id == ajuste_id,
        AjusteInventario.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not ajuste or ajuste.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail="Ajuste no encontrado o ya procesado.")

    producto = db.query(Producto).filter(
        Producto.id == ajuste.producto_id,
        Producto.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if producto.stock + ajuste.cantidad < 0:
        raise HTTPException(status_code=400, detail="El ajuste dejaría el stock en negativo.")
        
    # Extraer la tasa de cambio activa para valorar el asiento contable en Bolívares
    tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    if not tasa_activa:
        raise HTTPException(status_code=400, detail="No hay tasa de cambio registrada para valorar contablemente el ajuste.")
        
    # Cálculos de costo total con redondeo bancario perfecto
    tasa_bs = Decimal(str(tasa_activa.valor_ves))
    costo_unitario_bs = Decimal(str(producto.costo_usd)) * tasa_bs
    monto_total_bs = (costo_unitario_bs * abs(ajuste.cantidad)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # 1. Aprobar Ajuste
    ajuste.estado = "APROBADO"
    ajuste.fecha_aprobacion = datetime.now(timezone.utc)

    # 2. Impactar Stock Físico
    producto.stock += ajuste.cantidad

    # 3. Grabar en Libro Mayor de Inventario (Kardex)
    tipo_mov = "Ajuste_Entrada" if ajuste.cantidad > 0 else "Ajuste_Salida"
    movimiento = KardexMovimiento(
        producto_id=producto.id,
        tipo_movimiento=tipo_mov,
        cantidad=ajuste.cantidad,
        documento_referencia=f"AJU-{str(ajuste.id).zfill(6)}",
        tenant_id=current_user.tenant_id
    )
    
    db.add(movimiento)
    
    # 4. Generar Asiento Contable Automático (Libro Diario)
    if ajuste.cantidad < 0:
        # Merma o Salida (Representa un Gasto/Pérdida)
        cuenta_debe = {"codigo": "6.1.02.05", "nombre": "Gastos por Mermas y Faltantes"}
        cuenta_haber = {"codigo": "1.1.04.01", "nombre": "Inventario de Mercancía"}
    else:
        # Sobrante o Entrada (Representa un Ingreso/Ganancia Extraordinaria)
        cuenta_debe = {"codigo": "1.1.04.01", "nombre": "Inventario de Mercancía"}
        cuenta_haber = {"codigo": "7.1.02.01", "nombre": "Ingresos por Sobrantes de Inventario"}
        
    asiento = AsientoContable(
        concepto=f"Ajuste de Inventario: {ajuste.motivo}",
        referencia=movimiento.documento_referencia,
        total_debe=monto_total_bs,
        total_haber=monto_total_bs,
        detalles=[
            AsientoDetalle(
                cuenta_codigo=cuenta_debe["codigo"], cuenta_nombre=cuenta_debe["nombre"],
                debe=monto_total_bs, haber=Decimal("0.00")
            ),
            AsientoDetalle(
                cuenta_codigo=cuenta_haber["codigo"], cuenta_nombre=cuenta_haber["nombre"],
                debe=Decimal("0.00"), haber=monto_total_bs
            )
        ],
        tenant_id=current_user.tenant_id
    )
    db.add(asiento)

    db.commit()
    db.refresh(ajuste)
    return ajuste

@router.get("/kardex/{producto_id}", response_model=List[KardexMovimientoResponse])
def obtener_kardex_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Obtiene el historial de movimientos inmutables (Kardex) de un producto específico.
    """
    # Verificar si el producto existe
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.tenant_id == current_user.tenant_id
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado en el sistema.")

    # Retornar movimientos ordenados del más reciente al más antiguo
    return db.query(KardexMovimiento).filter(
        KardexMovimiento.producto_id == producto_id,
        KardexMovimiento.tenant_id == current_user.tenant_id
    ).order_by(KardexMovimiento.fecha.desc()).all()

@router.post("/ajustes/{ajuste_id}/rechazar", response_model=AjusteInventarioResponse)
def rechazar_ajuste(
    ajuste_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"]))
):
    """
    Rechaza una propuesta de ajuste de inventario.
    """
    ajuste = db.query(AjusteInventario).filter(
        AjusteInventario.id == ajuste_id,
        AjusteInventario.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not ajuste or ajuste.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail="Ajuste no encontrado o ya procesado.")
    ajuste.estado = "RECHAZADO"
    db.commit()
    db.refresh(ajuste)
    return ajuste

@router.get("/ajustes", response_model=List[AjusteInventarioResponse])
def listar_todos_ajustes(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Obtiene todos los ajustes propuestos en el sistema.
    """
    return db.query(AjusteInventario).filter(
        AjusteInventario.tenant_id == current_user.tenant_id
    ).order_by(AjusteInventario.fecha_solicitud.desc()).all()

@router.get("/kardex/{producto_id}/pdf")
def generar_kardex_pdf(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Genera un reporte PDF con el historial del Kardex de un producto específico.
    """
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.tenant_id == current_user.tenant_id
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
        
    movimientos = db.query(KardexMovimiento).filter(
        KardexMovimiento.producto_id == producto_id,
        KardexMovimiento.tenant_id == current_user.tenant_id
    ).order_by(KardexMovimiento.fecha.desc()).all()
    
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    except ImportError:
        raise HTTPException(status_code=500, detail="Librería reportlab no instalada en el servidor.")

    import io
    from fastapi.responses import StreamingResponse

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#0b5156'),
        spaceAfter=15
    )
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#334155')
    )
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.white,
        fontName='Helvetica-Bold'
    )
    
    # 1. Encabezado
    story.append(Paragraph(f"KODA ERP | REPORTE OFICIAL DE KARDEX", title_style))
    story.append(Paragraph(f"<b>Producto:</b> {producto.nombre} | <b>SKU:</b> {producto.sku}", normal_style))
    story.append(Paragraph(f"<b>Fecha de Generación:</b> {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}", normal_style))
    story.append(Spacer(1, 15))
    
    # 2. Tabla de Movimientos
    data = [[
        Paragraph("<b>FECHA / HORA</b>", header_style),
        Paragraph("<b>TIPO</b>", header_style),
        Paragraph("<b>CANTIDAD</b>", header_style),
        Paragraph("<b>REFERENCIA</b>", header_style)
    ]]
    
    for m in movimientos:
        fecha_str = m.fecha.strftime('%d/%m/%Y %H:%M:%S') if m.fecha else "N/A"
        tipo_str = str(m.tipo_movimiento).upper()
        cant_str = f"+{m.cantidad}" if m.cantidad > 0 else str(m.cantidad)
        ref_str = str(m.documento_referencia or 'N/A').upper()
        
        cant_color = '#16a34a' if m.cantidad > 0 else '#dc2626'
        cant_p_style = ParagraphStyle(
            'CantStyle', parent=normal_style, textColor=colors.HexColor(cant_color), fontName='Helvetica-Bold'
        )
        
        data.append([
            Paragraph(fecha_str, normal_style),
            Paragraph(tipo_str, normal_style),
            Paragraph(cant_str, cant_p_style),
            Paragraph(ref_str, normal_style)
        ])
        
    t = Table(data, colWidths=[150, 100, 80, 210])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0b5156')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    story.append(t)
    
    doc.build(story)
    buffer.seek(0)
    
    filename = f"Kardex-{producto.sku}.pdf"
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )