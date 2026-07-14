"""Router de Logística: Vehículos, Choferes, Turnos de Despacho y Mantenimiento."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, date
import os
import requests
import asyncio
import hashlib
import io

# ReportLab imports para la generación de PDF
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from backend.core.database import get_db
from backend.core.security import get_current_user, require_role
from backend.models.erp_extended import Vehiculo, Chofer, TurnoDespacho, RegistroMantenimiento, TurnoVentaAsociacion, TurnoGasto, LogisticaLedger, CuarentenaLogistica
from backend.models.operations import Venta, VentaDetalle, Producto

router = APIRouter(prefix="/api/logistica", tags=["Logística"])

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _generar_numero_turno(db: Session) -> str:
    """Genera un número de turno secuencial: TRN-000001."""
    last = db.query(TurnoDespacho).order_by(TurnoDespacho.id.desc()).first()
    next_id = (last.id + 1) if last else 1
    return f"TRN-{next_id:06d}"


async def _enviar_telegram(chat_id: str, texto: str) -> bool:
    """Envía mensaje al Telegram del chofer si el token está configurado."""
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        def do_request():
            resp = requests.post(url, json={
                "chat_id": chat_id,
                "text": texto,
                "parse_mode": "Markdown"
            }, timeout=5.0)
            return resp.status_code == 200
        return await asyncio.to_thread(do_request)
    except Exception:
        return False


async def _enviar_documento_telegram(chat_id: str, archivo_bytes: bytes, nombre_archivo: str, caption: str = None) -> bool:
    """Envía un documento PDF al chat de Telegram del chofer."""
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument"
    try:
        def do_request():
            files = {
                "document": (nombre_archivo, archivo_bytes, "application/pdf")
            }
            data = {
                "chat_id": chat_id
            }
            if caption:
                data["caption"] = caption
                data["parse_mode"] = "Markdown"
            resp = requests.post(url, data=data, files=files, timeout=10.0)
            return resp.status_code == 200
        return await asyncio.to_thread(do_request)
    except Exception as e:
        print(f"Error enviando documento Telegram: {e}")
        return False


def generar_pdf_hoja_ruta(turno: TurnoDespacho, db: Session) -> bytes:
    """Genera el PDF de la hoja de ruta en memoria usando ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Estilos maquetación KODA
    title_style = ParagraphStyle(
        'KodaTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0b5156'),
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'KodaSub',
        parent=styles['Normal'],
        fontSize=11,
        leading=13,
        textColor=colors.HexColor('#444444'),
        fontName='Helvetica-Bold',
        alignment=2 # Derecha
    )
    label_style = ParagraphStyle(
        'KodaLabel',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#0b5156'),
        fontName='Helvetica-Bold'
    )
    value_style = ParagraphStyle(
        'KodaValue',
        parent=styles['Normal'],
        fontSize=10,
        leading=12,
        textColor=colors.HexColor('#222222'),
        fontName='Helvetica'
    )
    table_hdr_style = ParagraphStyle(
        'KodaHdr',
        parent=styles['Normal'],
        fontSize=9,
        leading=11,
        textColor=colors.white,
        fontName='Helvetica-Bold'
    )
    
    story = []
    
    # 1. Encabezado
    header_data = [
        [Paragraph("KODA ERP", title_style), 
         Paragraph(f"HOJA DE RUTA / MANIFIESTO DE CARGA<br/><b>{turno.numero_turno}</b>", subtitle_style)]
    ]
    header_table = Table(header_data, colWidths=[200, 340])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('LINEBELOW', (0,0), (-1,-1), 2.5, colors.HexColor('#0b5156')),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    
    # 2. Información del Despacho
    fecha_salida_str = turno.fecha_salida.strftime("%d/%m/%Y %I:%M %p")
    vehiculo_str = f"{turno.vehiculo.nombre} (PLACA: {turno.vehiculo.placa}) - TIPO: {turno.vehiculo.tipo}" if turno.vehiculo else "N/A"
    chofer_str = f"{turno.chofer.nombre} {f'(TEL: {turno.chofer.telefono})' if turno.chofer.telefono else ''}" if turno.chofer else "No asignado"
    
    info_data = [
        [
            Paragraph("VEHÍCULO DE CARGA", label_style),
            Paragraph("FECHA DE SALIDA", label_style)
        ],
        [
            Paragraph(vehiculo_str.upper(), value_style),
            Paragraph(fecha_salida_str, value_style)
        ],
        [
            Paragraph("CONDUCTOR ASIGNADO", label_style),
            Paragraph("DESTINO / DIRECCIÓN DE ENTREGA", label_style)
        ],
        [
            Paragraph(chofer_str.upper(), value_style),
            Paragraph(turno.destino.upper(), value_style)
        ]
    ]
    
    if turno.nota_entrega_ref:
        info_data.append([Paragraph("REFERENCIA / NOTA DE ENTREGA VINCULADA", label_style), ""])
        info_data.append([Paragraph(turno.nota_entrega_ref.upper(), value_style), ""])
        
    info_table = Table(info_data, colWidths=[270, 270])
    info_table.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#eeeeee')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#eeeeee')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('SPAN', (0,4), (1,4)) if turno.nota_entrega_ref else ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('SPAN', (0,5), (1,5)) if turno.nota_entrega_ref else ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 15))
    
    # Observaciones
    if turno.observaciones:
        obs_data = [
            [Paragraph("INSTRUCCIONES / OBSERVACIONES ESPECIALES", label_style)],
            [Paragraph(turno.observaciones.upper(), value_style)]
        ]
        obs_table = Table(obs_data, colWidths=[540])
        obs_table.setStyle(TableStyle([
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ]))
        story.append(obs_table)
        story.append(Spacer(1, 15))
        
    # 3. Mercancía
    story.append(Paragraph("MERCANCÍA DECLARADA EN CARGA", label_style))
    story.append(Spacer(1, 5))
    
    venta_ids = [va.venta_id for va in turno.ventas_asociadas]
    if turno.venta_id and turno.venta_id not in venta_ids:
        venta_ids.append(turno.venta_id)
        
    items_table_data = [
        [Paragraph("DESCRIPCIÓN DEL PRODUCTO", table_hdr_style), Paragraph("CANTIDAD", table_hdr_style)]
    ]
    
    if venta_ids:
        detalles = db.query(VentaDetalle).filter(VentaDetalle.venta_id.in_(venta_ids)).all()
        cons = {}
        for d in detalles:
            pid = d.producto_id
            p_nombre = str(d.producto.nombre if d.producto else "Producto Desconocido")
            p_cantidad = int(d.cantidad)
            if pid not in cons:
                cons[pid] = (p_nombre, 0)
            cons[pid] = (p_nombre, cons[pid][1] + p_cantidad)
        
        for p_nombre, p_cantidad in cons.values():
            items_table_data.append([
                Paragraph(p_nombre.upper(), value_style),
                Paragraph(str(p_cantidad), ParagraphStyle('Qty', parent=value_style, alignment=1))
            ])
    else:
        items_table_data.append([
            Paragraph("NO HAY PRODUCTOS ASIGNADOS A ESTE DESPACHO", value_style),
            Paragraph("0", value_style)
        ])
        
    items_table = Table(items_table_data, colWidths=[420, 120])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0b5156')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dddddd')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 25))
    
    # 4. Firmas
    sig_data = [
        ["", ""],
        ["FIRMA DESPACHADOR / AUTORIZADO", "FIRMA CONDUCTOR (CONFORME CARGA)"]
    ]
    sig_table = Table(sig_data, colWidths=[250, 250])
    sig_table.setStyle(TableStyle([
        ('LINEABOVE', (0,1), (0,1), 1, colors.HexColor('#333333')),
        ('LINEABOVE', (1,1), (1,1), 1, colors.HexColor('#333333')),
        ('TOPPADDING', (0,0), (-1,-1), 40),
        ('ALIGN', (0,1), (-1,-1), 'CENTER'),
        ('VALIGN', (0,1), (-1,-1), 'TOP'),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 30))
    
    client_sig_data = [
        [""],
        ["RECIBIDO CONFORME POR EL CLIENTE (FIRMA, FECHA Y SELLO)"]
    ]
    client_sig_table = Table(client_sig_data, colWidths=[350])
    client_sig_table.setStyle(TableStyle([
        ('LINEABOVE', (0,1), (0,1), 0.75, colors.HexColor('#666666')),
        ('TOPPADDING', (0,0), (-1,-1), 40),
        ('ALIGN', (0,1), (-1,-1), 'CENTER'),
    ]))
    
    outer_sig_table = Table([[client_sig_table]], colWidths=[540])
    outer_sig_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    story.append(outer_sig_table)
    
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def registrar_evento_ledger(db: Session, turno_id: int, estado_anterior: Optional[str], estado_nuevo: str, usuario: str, motivo: Optional[str] = None):
    """Inserta un registro inmutable en el ledger de logística con hashing encadenado SHA-256."""
    last = db.query(LogisticaLedger).order_by(LogisticaLedger.id.desc()).first()
    prev_hash = last.hash_seguridad if last else "0" * 64
    
    payload = f"{prev_hash}|{turno_id}|{estado_anterior or ''}|{estado_nuevo}|{usuario}|{motivo or ''}"
    current_hash = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    
    entry = LogisticaLedger(
        turno_id=turno_id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        usuario=usuario,
        motivo=motivo,
        hash_seguridad=current_hash
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ─── SCHEMAS ──────────────────────────────────────────────────────────────────

class VehiculoCreate(BaseModel):
    nombre: str
    placa: str
    tipo: str = "CAMION"
    marca: Optional[str] = None
    modelo: Optional[str] = None
    anio: Optional[int] = None
    color: Optional[str] = None
    capacidad_kg: Optional[float] = None
    km_actuales: Optional[float] = 0
    proximo_servicio_km: Optional[float] = None

class VehiculoUpdate(VehiculoCreate):
    estado: Optional[str] = None
    activo: Optional[bool] = None

class ChoferCreate(BaseModel):
    nombre: str
    cedula: Optional[str] = None
    telefono: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    licencia_tipo: Optional[str] = None
    licencia_vence: Optional[date] = None

class ChoferUpdate(ChoferCreate):
    estado: Optional[str] = None
    activo: Optional[bool] = None

class TurnoCreate(BaseModel):
    vehiculo_id: int
    chofer_id: int
    fecha_salida: datetime
    destino: str
    ruta_descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    nota_entrega_ref: Optional[str] = None
    venta_id: Optional[int] = None
    venta_ids: Optional[List[int]] = None

class TurnoEstadoUpdate(BaseModel):
    estado: str  # PROGRAMADO, EN_RUTA, ENTREGADO, CANCELADO
    fecha_retorno: Optional[datetime] = None

class GastoItem(BaseModel):
    categoria: str  # COMBUSTIBLE, PEAJES, VIATICOS, OTRO
    monto_usd: float
    litros_combustible: Optional[float] = None
    descripcion: Optional[str] = None

class TurnoLiquidar(BaseModel):
    km_retorno: float
    gastos: List[GastoItem]
    motivo: Optional[str] = None

class CuarentenaResolve(BaseModel):
    resolucion: str  # REINGRESO, DESECHO
    motivo: Optional[str] = None

class MantenimientoCreate(BaseModel):
    vehiculo_id: int
    tipo: str
    descripcion: Optional[str] = None
    costo_usd: Optional[float] = None
    km_al_servicio: Optional[float] = None
    proximo_km: Optional[float] = None


# ─── DASHBOARD ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """KPIs y estado general de la flota."""
    total_vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True, Vehiculo.tenant_id == current_user.tenant_id).count()
    disponibles = db.query(Vehiculo).filter(Vehiculo.estado == "DISPONIBLE", Vehiculo.activo == True, Vehiculo.tenant_id == current_user.tenant_id).count()
    en_ruta = db.query(Vehiculo).filter(Vehiculo.estado == "EN_RUTA", Vehiculo.activo == True, Vehiculo.tenant_id == current_user.tenant_id).count()
    en_mantenimiento = db.query(Vehiculo).filter(Vehiculo.estado == "EN_MANTENIMIENTO", Vehiculo.activo == True, Vehiculo.tenant_id == current_user.tenant_id).count()

    hoy = datetime.now(timezone.utc).date()
    programados_hoy = db.query(TurnoDespacho).filter(
        func.date(TurnoDespacho.fecha_salida) == hoy,
        TurnoDespacho.estado.in_(["PROGRAMADO", "EN_RUTA"]),
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).count()
    entregados_hoy = db.query(TurnoDespacho).filter(
        func.date(TurnoDespacho.fecha_salida) == hoy,
        TurnoDespacho.estado == "ENTREGADO",
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).count()

    total_choferes = db.query(Chofer).filter(Chofer.activo == True, Chofer.tenant_id == current_user.tenant_id).count()
    choferes_disponibles = db.query(Chofer).filter(Chofer.estado == "DISPONIBLE", Chofer.activo == True, Chofer.tenant_id == current_user.tenant_id).count()

    # Alertas de vencimiento de licencia (<= 30 días)
    from datetime import timedelta
    alerta_fecha = (datetime.now(timezone.utc) + timedelta(days=30)).date()
    licencias_por_vencer = db.query(Chofer).filter(
        Chofer.licencia_vence != None,
        Chofer.licencia_vence <= alerta_fecha,
        Chofer.activo == True,
        Chofer.tenant_id == current_user.tenant_id
    ).count()

    return {
        "vehiculos": {
            "total": total_vehiculos,
            "disponibles": disponibles,
            "en_ruta": en_ruta,
            "en_mantenimiento": en_mantenimiento
        },
        "turnos_hoy": {
            "programados": programados_hoy,
            "entregados": entregados_hoy
        },
        "choferes": {
            "total": total_choferes,
            "disponibles": choferes_disponibles
        },
        "alertas": {
            "licencias_por_vencer": licencias_por_vencer
        }
    }


# ─── VEHÍCULOS ────────────────────────────────────────────────────────────────

@router.get("/vehiculos")
def listar_vehiculos(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    items = db.query(Vehiculo).filter(Vehiculo.activo == True, Vehiculo.tenant_id == current_user.tenant_id).order_by(Vehiculo.id.asc()).all()
    return [
        {
            "id": v.id, "nombre": v.nombre, "placa": v.placa, "tipo": v.tipo,
            "marca": v.marca, "modelo": v.modelo, "anio": v.anio, "color": v.color,
            "capacidad_kg": float(v.capacidad_kg) if v.capacidad_kg else None,
            "estado": v.estado,
            "km_actuales": float(v.km_actuales) if v.km_actuales else 0,
            "proximo_servicio_km": float(v.proximo_servicio_km) if v.proximo_servicio_km else None,
            "ultimo_servicio": v.ultimo_servicio.isoformat() if v.ultimo_servicio else None,
        }
        for v in items
    ]


@router.post("/vehiculos", status_code=201)
def crear_vehiculo(data: VehiculoCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Verificar placa única
    existe = db.query(Vehiculo).filter(Vehiculo.placa == data.placa.upper(), Vehiculo.tenant_id == current_user.tenant_id).first()
    if existe:
        raise HTTPException(status_code=400, detail="Ya existe un vehículo con esa placa.")
    v = Vehiculo(
        nombre=data.nombre,
        placa=data.placa.upper(),
        tipo=data.tipo,
        marca=data.marca,
        modelo=data.modelo,
        anio=data.anio,
        color=data.color,
        capacidad_kg=data.capacidad_kg,
        km_actuales=data.km_actuales or 0,
        proximo_servicio_km=data.proximo_servicio_km,
        estado="DISPONIBLE",
        tenant_id=current_user.tenant_id
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "numero_turno": None, "mensaje": "Vehículo registrado correctamente."}


@router.put("/vehiculos/{vehiculo_id}")
def actualizar_vehiculo(vehiculo_id: int, data: VehiculoUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    v = db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    for field, val in data.model_dump(exclude_unset=True).items():
        if field == "placa" and val:
            val = val.upper()
        setattr(v, field, val)
    db.commit()
    return {"ok": True}


@router.delete("/vehiculos/{vehiculo_id}")
def desactivar_vehiculo(vehiculo_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    v = db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    v.activo = False
    db.commit()
    return {"ok": True}


# ─── CHOFERES ─────────────────────────────────────────────────────────────────

@router.get("/choferes")
def listar_choferes(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    items = db.query(Chofer).filter(Chofer.activo == True, Chofer.tenant_id == current_user.tenant_id).order_by(Chofer.id.asc()).all()
    from datetime import timedelta
    hoy = datetime.now(timezone.utc).date()
    alerta_fecha = hoy + timedelta(days=30)
    return [
        {
            "id": c.id, "nombre": c.nombre, "cedula": c.cedula, "telefono": c.telefono,
            "telegram_chat_id": c.telegram_chat_id,
            "tiene_telegram": bool(c.telegram_chat_id),
            "licencia_tipo": c.licencia_tipo,
            "licencia_vence": c.licencia_vence.isoformat() if c.licencia_vence else None,
            "licencia_alerta": bool(c.licencia_vence and c.licencia_vence <= alerta_fecha),
            "estado": c.estado,
        }
        for c in items
    ]


@router.post("/choferes", status_code=201)
def crear_chofer(data: ChoferCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    if data.cedula:
        existe = db.query(Chofer).filter(Chofer.cedula == data.cedula, Chofer.tenant_id == current_user.tenant_id).first()
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe un chofer con esa cédula.")
    c = Chofer(**data.model_dump(), tenant_id=current_user.tenant_id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "mensaje": "Chofer registrado correctamente."}


@router.put("/choferes/{chofer_id}")
def actualizar_chofer(chofer_id: int, data: ChoferUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    c = db.query(Chofer).filter(Chofer.id == chofer_id, Chofer.tenant_id == current_user.tenant_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chofer no encontrado.")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(c, field, val)
    db.commit()
    return {"ok": True}


@router.delete("/choferes/{chofer_id}")
def desactivar_chofer(chofer_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    c = db.query(Chofer).filter(Chofer.id == chofer_id, Chofer.tenant_id == current_user.tenant_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chofer no encontrado.")
    c.activo = False
    db.commit()
    return {"ok": True}


# ─── TURNOS DE DESPACHO ───────────────────────────────────────────────────────

@router.get("/turnos")
def listar_turnos(fecha: Optional[str] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Lista los turnos. Si se pasa `fecha` (YYYY-MM-DD) filtra por ese día. Sin fecha → todos."""
    query = db.query(TurnoDespacho).filter(TurnoDespacho.tenant_id == current_user.tenant_id)
    if fecha:
        try:
            filter_date = datetime.strptime(fecha, "%Y-%m-%d").date()
            query = query.filter(func.date(TurnoDespacho.fecha_salida) == filter_date)
        except ValueError:
            pass
    
    turnos = query.order_by(TurnoDespacho.fecha_salida.desc()).all()
    result = []
    for t in turnos:
      v = db.query(Vehiculo).filter(Vehiculo.id == t.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
      c = db.query(Chofer).filter(Chofer.id == t.chofer_id, Chofer.tenant_id == current_user.tenant_id).first()
      
      paradas_list = []
      for va in t.ventas_asociadas:
          paradas_list.append({
              "id": va.id,
              "venta_id": va.venta_id,
              "numero_factura": va.venta.numero_factura if va.venta else "",
              "cliente": va.venta.cliente.nombre if va.venta and va.venta.cliente else "Cliente",
              "orden": va.orden_parada,
              "estado": va.estado_entrega,
              "evidencia_foto_url": va.evidencia_foto_url,
              "motivo_rechazo": va.motivo_rechazo
          })
      
      # Ordenar por orden de parada
      paradas_list.sort(key=lambda x: x["orden"])

      result.append({
          "id": t.id,
          "numero_turno": t.numero_turno,
          "fecha_salida": t.fecha_salida.isoformat(),
          "destino": t.destino,
          "ruta_descripcion": t.ruta_descripcion,
          "observaciones": t.observaciones,
          "nota_entrega_ref": t.nota_entrega_ref,
          "venta_id": t.venta_id,
          "venta_factura": t.venta.numero_factura if t.venta else None,
          "venta_ids": [va.venta_id for va in t.ventas_asociadas],
          "paradas": paradas_list,
          "km_retorno": float(t.km_retorno) if t.km_retorno else None,
          "gastos": [{
              "id": g.id,
              "categoria": g.categoria,
              "monto_usd": float(g.monto_usd),
              "litros": float(g.litros_combustible) if g.litros_combustible else None,
              "descripcion": g.descripcion
          } for g in t.gastos],
          "estado": t.estado,
          "telegram_notificado": t.telegram_notificado,
          "vehiculo": {
              "id": v.id, 
              "nombre": v.nombre, 
              "placa": v.placa, 
              "tipo": v.tipo, 
              "capacidad_kg": float(v.capacidad_kg) if v.capacidad_kg else 0,
              "km_actuales": float(v.km_actuales) if v.km_actuales else 0
          } if v else None,
          "chofer": {"id": c.id, "nombre": c.nombre, "telefono": c.telefono, "tiene_telegram": bool(c.telegram_chat_id)} if c else None,
      })
    return result


@router.post("/turnos", status_code=201)
async def crear_turno(data: TurnoCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Crea un turno, asocia múltiples ventas y dispara notificaciones Telegram."""
    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == data.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    chofer = db.query(Chofer).filter(Chofer.id == data.chofer_id, Chofer.tenant_id == current_user.tenant_id).first()
    if not chofer:
        raise HTTPException(status_code=404, detail="Chofer no encontrado.")

    numero = _generar_numero_turno(db)
    
    # Resolver referencias de notas y facturas
    ref_nota = data.nota_entrega_ref
    factura_primaria_id = data.venta_id
    
    # Si viene lista de IDs de venta
    venta_ids_asoc = data.venta_ids or []
    if factura_primaria_id and factura_primaria_id not in venta_ids_asoc:
        venta_ids_asoc.insert(0, factura_primaria_id)
        
    if not ref_nota and venta_ids_asoc:
        ventas_db = db.query(Venta).filter(Venta.id.in_(venta_ids_asoc), Venta.tenant_id == current_user.tenant_id).all()
        ref_nota = ", ".join([v.numero_factura for v in ventas_db])
        if ventas_db and not factura_primaria_id:
            factura_primaria_id = ventas_db[0].id

    # Si es multi-parada y no se dio destino, armamos una ruta
    destino_final = data.destino
    if not destino_final.strip() and venta_ids_asoc:
        ventas_db = db.query(Venta).filter(Venta.id.in_(venta_ids_asoc), Venta.tenant_id == current_user.tenant_id).all()
        destino_final = " -> ".join([v.cliente.nombre if v.cliente else "Cliente" for v in ventas_db])

    turno = TurnoDespacho(
        numero_turno=numero,
        vehiculo_id=data.vehiculo_id,
        chofer_id=data.chofer_id,
        venta_id=factura_primaria_id,
        nota_entrega_ref=ref_nota,
        fecha_salida=data.fecha_salida,
        destino=destino_final,
        ruta_descripcion=data.ruta_descripcion,
        observaciones=data.observaciones,
        estado="PROGRAMADO",
        tenant_id=current_user.tenant_id
    )
    db.add(turno)
    db.flush()  # Para obtener el ID del turno

    # Crear paradas individuales
    for idx, v_id in enumerate(venta_ids_asoc, start=1):
        # Validar que la venta pertenezca al tenant
        v_db = db.query(Venta).filter(Venta.id == v_id, Venta.tenant_id == current_user.tenant_id).first()
        if not v_db:
            raise HTTPException(status_code=403, detail=f"No tiene acceso a la venta ID {v_id}")
        asoc = TurnoVentaAsociacion(
            turno_id=turno.id,
            venta_id=v_id,
            orden_parada=idx,
            estado_entrega="PENDIENTE"
        )
        db.add(asoc)

    # Actualizar estados de vehículo y chofer
    vehiculo.estado = "EN_RUTA" if turno.estado == "EN_RUTA" else vehiculo.estado
    chofer.estado = "EN_RUTA" if turno.estado == "EN_RUTA" else chofer.estado

    db.commit()
    db.refresh(turno)

    # Registrar en Ledger inmutable
    registrar_evento_ledger(
        db=db,
        turno_id=turno.id,
        estado_anterior=None,
        estado_nuevo="PROGRAMADO",
        usuario=f"USER: {current_user.email}",
        motivo="Creación de despacho y asignación de ruta."
    )

    # Notificación Telegram
    telegram_enviado = False
    if chofer.telegram_chat_id:
        hora_str = data.fecha_salida.strftime("%d/%m/%Y %I:%M %p")
        msg = (
            f"*TURNO ASIGNADO — KODA ERP*\n\n"
            f"Turno: `{numero}`\n"
            f"Chofer: {chofer.nombre}\n"
            f"Vehículo: {vehiculo.placa} — {vehiculo.marca or ''} {vehiculo.modelo or ''}\n"
            f"Destino: {data.destino}\n"
            f"Salida: {hora_str}\n"
        )
        if data.nota_entrega_ref:
            msg += f"Nota de Entrega: {data.nota_entrega_ref}\n"
        if data.observaciones:
            msg += f"Obs: {data.observaciones}\n"
        msg += "\n_Confirma recibido respondiendo con un OK o ✅_"
        telegram_enviado = await _enviar_telegram(chofer.telegram_chat_id, msg)
        if telegram_enviado:
            turno.telegram_notificado = True
            db.commit()

    return {
        "id": turno.id,
        "numero_turno": numero,
        "telegram_enviado": telegram_enviado,
        "mensaje": "Turno creado correctamente."
    }


@router.put("/turnos/{turno_id}/estado")
async def actualizar_estado_turno(turno_id: int, data: TurnoEstadoUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Cambia el estado de un turno, audita en el ledger y deriva a cuarentena si es cancelado."""
    turno = db.query(TurnoDespacho).filter(
        TurnoDespacho.id == turno_id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado.")

    estados_validos = ["PROGRAMADO", "EN_RUTA", "ENTREGADO", "CANCELADO"]
    if data.estado not in estados_validos:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Válidos: {estados_validos}")

    estado_anterior = turno.estado
    turno.estado = data.estado
    if data.fecha_retorno:
        turno.fecha_retorno = data.fecha_retorno

    # Sincronizar estado del vehículo y chofer
    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == turno.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    chofer = db.query(Chofer).filter(Chofer.id == turno.chofer_id, Chofer.tenant_id == current_user.tenant_id).first()

    motivo_ledger = f"Estado actualizado de {estado_anterior} a {data.estado}."

    if data.estado == "CANCELADO":
        if vehiculo:
            vehiculo.estado = "DISPONIBLE"
        if chofer:
            chofer.estado = "DISPONIBLE"
            
        # Alerta de Telegram al chofer sobre la cancelación del viaje
        if chofer and chofer.telegram_chat_id:
            msg_cancel = (
                f"⚠️ *DESPACHO CANCELADO — KODA ERP*\n\n"
                f"📋 Turno: `{turno.numero_turno}`\n"
                f"📍 Tu viaje asignado con destino a *{turno.destino}* ha sido CANCELADO por control de despacho.\n\n"
                f"Tanto el camión {vehiculo.placa if vehiculo else 'N/A'} como tú quedan liberados en estado DISPONIBLE."
            )
            import asyncio
            asyncio.create_task(_enviar_telegram(chofer.telegram_chat_id, msg_cancel))
            
        # Logística Inversa Estricta: Mover la mercancía a cuarentena en vez de regresar a stock
        # Obtener todas las facturas asociadas a este viaje
        venta_ids = [va.venta_id for va in turno.ventas_asociadas]
        if turno.venta_id and turno.venta_id not in venta_ids:
            venta_ids.append(turno.venta_id)
            
        productos_movidos = 0
        for v_id in venta_ids:
            detalles = db.query(VentaDetalle).join(Venta).filter(
                VentaDetalle.venta_id == v_id,
                Venta.tenant_id == current_user.tenant_id
            ).all()
            for d in detalles:
                # Insertar en cuarentena
                item = CuarentenaLogistica(
                    turno_id=turno.id,
                    producto_id=d.producto_id,
                    cantidad=d.cantidad,
                    motivo=f"Despacho cancelado ({turno.numero_turno})",
                    estado="PENDIENTE_REVISION"
                )
                db.add(item)
                productos_movidos += 1
                
        motivo_ledger += f" Mercancía de {len(venta_ids)} facturas ({productos_movidos} ítems) movida a cuarentena para revisión."

    elif data.estado == "ENTREGADO":
        if vehiculo:
            vehiculo.estado = "DISPONIBLE"
        if chofer:
            chofer.estado = "DISPONIBLE"
            
        # Marcar todas las paradas como entregadas
        for va in turno.ventas_asociadas:
            if va.estado_entrega == "PENDIENTE":
                va.estado_entrega = "ENTREGADO"
                
    elif data.estado == "EN_RUTA":
        if vehiculo:
            vehiculo.estado = "EN_RUTA"
        if chofer:
            chofer.estado = "EN_RUTA"
            
        # Alerta de Telegram en caliente al chofer cuando el viaje inicia ruta
        if chofer and chofer.telegram_chat_id:
            hora_str = turno.fecha_salida.strftime("%d/%m/%Y %I:%M %p")
            msg = (
                f"🚛 *DESPACHO EN RUTA — KODA ERP*\n\n"
                f"📋 Turno: `{turno.numero_turno}`\n"
                f"👤 Chofer: {chofer.nombre}\n"
                f"🚗 Vehículo: {vehiculo.placa} — {vehiculo.marca or ''} {vehiculo.modelo or ''}\n"
                f"📍 Destino: {turno.destino}\n"
                f"🕐 Salida: {hora_str}\n"
            )
            if turno.nota_entrega_ref:
                msg += f"📦 Nota de Entrega: {turno.nota_entrega_ref}\n"
            if turno.observaciones:
                msg += f"📝 Obs: {turno.observaciones}\n"
            msg += "\n_Reporta tu estado de entrega o incidencias respondiendo a este chat._"
            
            import asyncio
            asyncio.create_task(_enviar_telegram(chofer.telegram_chat_id, msg))
            turno.telegram_notificado = True

    db.commit()

    # Registrar evento en el Ledger inmutable
    registrar_evento_ledger(
        db=db,
        turno_id=turno.id,
        estado_anterior=estado_anterior,
        estado_nuevo=data.estado,
        usuario=f"USER: {current_user.email}",
        motivo=motivo_ledger
    )

    return {"ok": True, "nuevo_estado": data.estado}


# ─── MANTENIMIENTO ────────────────────────────────────────────────────────────

@router.get("/mantenimiento")
def listar_mantenimientos(vehiculo_id: Optional[int] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    q = db.query(RegistroMantenimiento).filter(RegistroMantenimiento.tenant_id == current_user.tenant_id)
    if vehiculo_id:
        v_check = db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
        if not v_check:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado o no pertenece al tenant.")
        q = q.filter(RegistroMantenimiento.vehiculo_id == vehiculo_id)
    items = q.order_by(RegistroMantenimiento.fecha.desc()).limit(100).all()
    result = []
    for m in items:
        v = db.query(Vehiculo).filter(Vehiculo.id == m.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
        result.append({
            "id": m.id,
            "vehiculo": {"id": v.id, "nombre": v.nombre, "placa": v.placa} if v else None,
            "fecha": m.fecha.isoformat(),
            "tipo": m.tipo,
            "descripcion": m.descripcion,
            "costo_usd": float(m.costo_usd) if m.costo_usd else None,
            "km_al_servicio": float(m.km_al_servicio) if m.km_al_servicio else None,
            "proximo_km": float(m.proximo_km) if m.proximo_km else None,
        })
    return result


@router.post("/mantenimiento", status_code=201)
def registrar_mantenimiento(data: MantenimientoCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == data.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")

    m = RegistroMantenimiento(**data.model_dump(), tenant_id=current_user.tenant_id)
    db.add(m)

    # Actualizar km del próximo servicio y último servicio en el vehículo
    if data.proximo_km:
        vehiculo.proximo_servicio_km = data.proximo_km
    db.commit()
    return {"id": m.id, "mensaje": "Mantenimiento registrado correctamente."}


# ─── NUEVOS ENDPOINTS: INTEGRACIÓN DE MERCANCÍAS Y VENTAS ─────────────────────

@router.get("/ventas-pendientes")
def listar_ventas_pendientes(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Obtiene facturas activas sin despacho asignado o con turnos cancelados."""
    # Subquery para obtener venta_ids que ya tienen despachos activos para este tenant
    subquery = db.query(TurnoDespacho.venta_id).filter(
        TurnoDespacho.venta_id != None,
        TurnoDespacho.estado != "CANCELADO",
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).subquery()

    ventas = db.query(Venta).filter(
        Venta.estado == "ACTIVA",
        Venta.tenant_id == current_user.tenant_id,
        ~Venta.id.in_(subquery)
    ).order_by(Venta.fecha.desc()).all()

    result = []
    for v in ventas:
        detalles = []
        for d in v.detalles:
            detalles.append({
                "producto_id": d.producto_id,
                "nombre": d.producto.nombre if d.producto else "Producto Desconocido",
                "cantidad": float(d.cantidad),
                "precio_usd": float(d.precio_usd_capturado)
            })
        result.append({
            "id": v.id,
            "numero_factura": v.numero_factura,
            "fecha": v.fecha.isoformat(),
            "cliente": v.cliente.nombre if v.cliente else "Cliente Genérico",
            "total_usd": float(v.total_usd),
            "detalles": detalles
        })
    return result


@router.get("/turnos/{turno_id}/mercancia")
def obtener_mercancia_turno(turno_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Consulta la mercancía consolidada asociada a todas las ventas de un despacho."""
    turno = db.query(TurnoDespacho).filter(
        TurnoDespacho.id == turno_id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    
    venta_ids = [va.venta_id for va in turno.ventas_asociadas]
    if turno.venta_id and turno.venta_id not in venta_ids:
        venta_ids.append(turno.venta_id)
        
    if not venta_ids:
        return []

    detalles = db.query(VentaDetalle).join(Venta).filter(
        VentaDetalle.venta_id.in_(venta_ids),
        Venta.tenant_id == current_user.tenant_id
    ).all()
    
    # Consolidar cantidades por producto
    cons = {}
    for d in detalles:
        pid = d.producto_id
        if pid not in cons:
            cons[pid] = {
                "producto_id": pid,
                "nombre": d.producto.nombre if d.producto else "Producto Desconocido",
                "cantidad": 0.0,
                "precio_usd": float(d.precio_usd_capturado)
            }
        cons[pid]["cantidad"] = float(cons[pid]["cantidad"]) + float(d.cantidad)
        
    return list(cons.values())


# ─── FASE 2 AVANZADA: TELEGRAM WEBHOOK, CENTRO DE COSTOS, LEDGER Y CUARENTENA ───

@router.post("/telegram-webhook")
async def telegram_webhook(update: dict, db: Session = Depends(get_db)):
    """Webhook de comunicación bidireccional para choferes."""
    message = update.get("message")
    if not message:
        return {"status": "ignored"}
    
    chat_id = str(message.get("chat", {}).get("id"))
    text = message.get("text", "")
    photo = message.get("photo")
    
    # ─── ROUTING DE COMANDOS DEL BOT DE TELEGRAM ───
    ES_ADMIN = (chat_id == "1910741543" or chat_id == "5552622913")
    
    # 1. Comando /start (Vinculación automática con token, o muestra ID)
    if text.strip().lower().startswith("/start"):
        parts = text.strip().split(" ", 1)
        if len(parts) > 1:
            token_code = parts[1].strip()
            from backend.models.core import Profile
            from backend.routers.telegram_api import get_linking_token
            user_id = get_linking_token(token_code)
            if user_id:
                user = db.query(Profile).filter(Profile.id == user_id).first()
                if user:
                    user.telegram_chat_id = chat_id
                    db.commit()
                    mensaje_success = (
                        "✅ *VINCULACIÓN EXITOSA - KODA ERP*\n\n"
                        f"Tu cuenta de Telegram ha sido enlazada al usuario *{user.nombre}* ({user.email}).\n\n"
                        "Ahora recibirás alertas de seguridad y reportes del ERP en tiempo real."
                    )
                    await _enviar_telegram(chat_id, mensaje_success)
                    return {"status": "linking_success", "user_id": user_id}
            
            await _enviar_telegram(chat_id, "⚠️ *Código Inválido o Expirado.*\n\nPor favor, genera un nuevo token de vinculación desde el panel de Telegram en Koda ERP.")
            return {"status": "linking_failed"}
            
        mensaje_start = (
            "🚀 *KODA LOGÍSTICA - VINCULACIÓN DE CHAT*\n\n"
            "Bienvenido al asistente de despacho digital de Koda ERP.\n\n"
            f"🔑 *Tu ID de Chat de Telegram:* `{chat_id}`\n\n"
            "Por favor, copia este identificador numérico y regístralo en el perfil del conductor dentro de la pestaña *Choferes* en Koda ERP para activar tu cuenta de despacho."
        )
        await _enviar_telegram(chat_id, mensaje_start)
        return {"status": "start_command_handled"}

    # 2. Comando /logistica (Reporte consolidado de despachos de hoy)
    if text.strip().lower() in ["/logistica", "logistica", "/status", "status"]:
        # Buscar chofer por chat ID para seguridad y alcance de tenant
        chofer_auth = db.query(Chofer).filter(Chofer.telegram_chat_id == chat_id, Chofer.activo == True).first()
        if not chofer_auth:
            await _enviar_telegram(chat_id, "⚠️ No estás registrado como chofer activo en KODA ERP.")
            return {"status": "unauthorized"}

        # Consultar despachos activos del día (PROGRAMADO, EN_RUTA) para el tenant del chofer
        turnos_activos = db.query(TurnoDespacho).filter(
            TurnoDespacho.estado.in_(["PROGRAMADO", "EN_RUTA"]),
            TurnoDespacho.tenant_id == chofer_auth.tenant_id
        ).all()
        
        if not turnos_activos:
            await _enviar_telegram(chat_id, "👑 *ESTADO DE LA FLOTA - KODA ERP*\n\n✅ Todos los despachos de hoy están completados o no hay turnos activos en ruta en este momento.")
            return {"status": "logistica_status_empty"}
            
        reporte_list = ["👑 *ESTADO DE LA FLOTA - KODA ERP*\n"]
        for t in turnos_activos:
            chofer_nombre = t.chofer.nombre if t.chofer else "Sin chofer"
            placa_camion = t.vehiculo.placa if t.vehiculo else "S/P"
            estado_label = "Prog. 🟡" if t.estado == "PROGRAMADO" else "En Ruta 🔵"
            reporte_list.append(
                f"• *{t.numero_turno}* | {estado_label}\n"
                f"  Destino: {t.destino}\n"
                f"  Chofer: {chofer_nombre} (Camión: {placa_camion})\n"
            )
        
        reporte = "\n".join(reporte_list)
        await _enviar_telegram(chat_id, reporte)
        return {"status": "logistica_status_sent"}

    # 3. Comando /admin (Configuración del Bot de Telegram)
    if text.strip().lower() == "/admin":
        if not ES_ADMIN:
            await _enviar_telegram(chat_id, "⚠️ No tienes privilegios de administrador en este canal.")
            return {"status": "admin_access_denied"}
            
        mensaje_admin = (
            "👑 *KODA LOGÍSTICA - CONFIGURACIÓN DEL BOT*\n\n"
            "📡 *Servicio:* Koda Dispatcher Engine v2.1\n"
            "🔗 *Webhook SSL:* Activo\n"
            "🛡️ *Acceso:* Administrador Global Autorizado\n"
            "💻 *Canal de Base de Datos:* Postgres / Supabase\n\n"
            "💬 *Comandos rápidos disponibles:*\n"
            "• `/logistica` - Estado actual de los despachos y la flota\n"
            "• `/start` - Consultar mi ID de chat actual"
        )
        await _enviar_telegram(chat_id, mensaje_admin)
        return {"status": "admin_command_handled"}

    # 4. Comandos dinámicos personalizados (Multi-tenant)
    from backend.models.core import Profile
    from backend.models.erp_extended import TelegramCommand

    # Resolver tenant del emisor del chat para buscar el comando de su tenant
    sender_profile = db.query(Profile).filter(Profile.telegram_chat_id == chat_id).first()
    sender_chofer = db.query(Chofer).filter(Chofer.telegram_chat_id == chat_id, Chofer.activo == True).first()
    tenant_id = sender_profile.tenant_id if sender_profile else (sender_chofer.tenant_id if sender_chofer else None)

    cmd_query = db.query(TelegramCommand).filter(
        TelegramCommand.trigger_command == text.strip(),
        TelegramCommand.is_active == True
    )
    if tenant_id:
        cmd_query = cmd_query.filter(TelegramCommand.tenant_id == tenant_id)

    custom_cmd = cmd_query.first()
    if custom_cmd:
        await _enviar_telegram(chat_id, custom_cmd.response_text)
        return {"status": "custom_command_handled", "command": custom_cmd.trigger_command}

    # Buscar chofer por chat ID para operaciones regulares de ruta
    chofer = db.query(Chofer).filter(Chofer.telegram_chat_id == chat_id, Chofer.activo == True).first()
    if not chofer:
        # Mensaje de ayuda genérico si no es conductor registrado
        await _enviar_telegram(chat_id, "ℹ️ Escribe `/start` para conocer tu ID de chat o contacta al administrador de Koda ERP.")
        return {"status": "chofer_not_found"}
    
    # 1. Buscar confirmación de recepción (✅ / recibido / conforme) para turnos en PROGRAMADO o EN_RUTA
    turno_confirmar = db.query(TurnoDespacho).filter(
        TurnoDespacho.chofer_id == chofer.id,
        TurnoDespacho.estado.in_(["PROGRAMADO", "EN_RUTA"])
    ).order_by(TurnoDespacho.fecha_salida.desc()).first()

    if turno_confirmar and (text.strip() == "✅" or "conforme" in text.lower() or "recibido" in text.lower() or "ok" in text.lower()):
        # Registrar confirmación
        turno_confirmar.observaciones = f"🔔 [CONDUCTOR CONFORME VIA TELEGRAM] | " + (turno_confirmar.observaciones or "")
        registrar_evento_ledger(
            db=db,
            turno_id=turno_confirmar.id,
            estado_anterior=turno_confirmar.estado,
            estado_nuevo=turno_confirmar.estado,
            usuario=f"CHOFER: {chofer.nombre}",
            motivo=f"Conductor confirmó recepción y conformidad del despacho vía Telegram bot."
        )

        # Consultar y consolidar la mercancía asignada al despacho
        venta_ids = [va.venta_id for va in turno_confirmar.ventas_asociadas]
        if turno_confirmar.venta_id and turno_confirmar.venta_id not in venta_ids:
            venta_ids.append(turno_confirmar.venta_id)
            
        items_msg_list = []
        if venta_ids:
            detalles = db.query(VentaDetalle).filter(VentaDetalle.venta_id.in_(venta_ids)).all()
            cons = {}
            for d in detalles:
                pid = d.producto_id
                if pid not in cons:
                    cons[pid] = {
                        "nombre": str(d.producto.nombre if d.producto else "Producto Desconocido"),
                        "cantidad": 0
                    }
                cons[pid]["cantidad"] += int(d.cantidad)
            
            for item in cons.values():
                items_msg_list.append(f"📦 *{item['nombre']}* — x{item['cantidad']}")
            items_msg = "\n".join(items_msg_list) + "\n"
        else:
            items_msg = "_No hay mercancía asignada en sistema._\n"

        # Armar el mensaje estructurado de la hoja de ruta digital
        respuesta = (
            f"*CONFIRMACIÓN REGISTRADA EN KODA*\n\n"
            f"*HOJA DE RUTA DIGITAL (`{turno_confirmar.numero_turno}`)*\n"
            f"*Destino*: {turno_confirmar.destino}\n"
            f"*Vehículo*: {turno_confirmar.vehiculo.placa if turno_confirmar.vehiculo else 'S/P'}\n\n"
            f"*Mercancía Declarada a Entregar:*\n{items_msg}\n"
            f"_Buen viaje, conduce con precaución._"
        )
        
        await _enviar_telegram(chat_id, respuesta)
        
        # Generar el PDF oficial y enviarlo directamente como archivo adjunto a Telegram
        try:
            pdf_bytes = generar_pdf_hoja_ruta(turno_confirmar, db)
            nombre_pdf = f"HOJA_DE_RUTA_{turno_confirmar.numero_turno}.pdf"
            caption_pdf = f"📄 *Manifiesto Oficial PDF*: `{turno_confirmar.numero_turno}`"
            await _enviar_documento_telegram(chat_id, pdf_bytes, nombre_pdf, caption_pdf)
        except Exception as e:
            print(f"Error generando o enviando PDF por Telegram: {e}")
            
        return {"status": "driver_confirmed"}

    # 2. Buscar su turno activo para incidencias / POD
    turno = db.query(TurnoDespacho).filter(
        TurnoDespacho.chofer_id == chofer.id,
        TurnoDespacho.estado == "EN_RUTA"
    ).order_by(TurnoDespacho.fecha_salida.desc()).first()
    
    if not turno:
        await _enviar_telegram(chat_id, "⚠️ No tienes ningún turno de despacho activo *En Ruta* asignado en este momento.")
        return {"status": "no_active_turno"}
    
    # 1. Reporte de Incidencias en Ruta (Comandos)
    if text.startswith("/retraso ") or text.startswith("/falla "):
        motivo = text.split(" ", 1)[1]
        tipo = "RETRASO" if text.startswith("/retraso") else "FALLA"
        
        # Registrar en observaciones e historiar en el ledger
        turno.observaciones = f"[{tipo}] {motivo} | " + (turno.observaciones or "")
        registrar_evento_ledger(
            db=db,
            turno_id=turno.id,
            estado_anterior=turno.estado,
            estado_nuevo=turno.estado,
            usuario=f"CHOFER: {chofer.nombre}",
            motivo=f"Incidencia reportada via Telegram: {tipo} - {motivo}"
        )
        await _enviar_telegram(chat_id, f"✅ Incidencia registrada correctamente en tu Hoja de Ruta `{turno.numero_turno}`.")
        return {"status": "incidencia_recorded"}
    
    # 2. Confirmación de entrega por texto
    text_clean = text.strip().lower()
    if text_clean in ["entregado", "finalizado", "completado", "terminado", "entrega ok"]:
        estado_anterior = turno.estado
        turno.estado = "ENTREGADO"
        turno.fecha_retorno = datetime.now()
        
        # Liberar vehículo y chofer
        vehiculo = db.query(Vehiculo).filter(Vehiculo.id == turno.vehiculo_id).first()
        if vehiculo:
            vehiculo.estado = "DISPONIBLE"
        chofer.estado = "DISPONIBLE"
        
        # Marcar paradas del turno como entregadas
        paradas = db.query(TurnoVentaAsociacion).filter(TurnoVentaAsociacion.turno_id == turno.id).all()
        for p in paradas:
            p.estado_entrega = "ENTREGADO"
            
        db.commit()
        
        # Ledger inmutable
        registrar_evento_ledger(
            db=db,
            turno_id=turno.id,
            estado_anterior=estado_anterior,
            estado_nuevo="ENTREGADO",
            usuario=f"CHOFER: {chofer.nombre}",
            motivo="Confirmación de entrega por texto enviada por el conductor vía Telegram."
        )
        
        await _enviar_telegram(chat_id, f"✅ Despacho `{turno.numero_turno}` marcado como ENTREGADO en KODA ERP. ¡Buen trabajo!")
        return {"status": "delivery_confirmed_by_text"}

    # 3. Prueba de Entrega (POD) con Foto
    if photo:
        largest_photo = photo[-1]
        file_id = largest_photo.get("file_id")
        
        url_file = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile"
        try:
            res = requests.get(url_file, params={"file_id": file_id}, timeout=5.0)
            if res.status_code == 200:
                file_path = res.json().get("result", {}).get("file_path")
                download_url = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}"
                
                # Descargar y guardar en local uploads
                file_res = requests.get(download_url, timeout=10.0)
                if file_res.status_code == 200:
                    os.makedirs("uploads/logistica_pod", exist_ok=True)
                    local_filename = f"uploads/logistica_pod/turno_{turno.id}_{datetime.now().strftime('%H%M%S')}.jpg"
                    with open(local_filename, "wb") as f:
                        f.write(file_res.content)
                    
                    url_evidencia = f"/uploads/logistica_pod/{os.path.basename(local_filename)}"
                    
                    # Marcar paradas del turno como entregadas
                    paradas = db.query(TurnoVentaAsociacion).filter(TurnoVentaAsociacion.turno_id == turno.id).all()
                    for p in paradas:
                        p.estado_entrega = "ENTREGADO"
                        p.evidencia_foto_url = url_evidencia
                    
                    # Cambiar estado del turno a ENTREGADO
                    estado_anterior = turno.estado
                    turno.estado = "ENTREGADO"
                    turno.fecha_retorno = datetime.now()
                    
                    # Liberar vehículo y chofer
                    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == turno.vehiculo_id).first()
                    if vehiculo:
                        vehiculo.estado = "DISPONIBLE"
                    chofer.estado = "DISPONIBLE"
                    
                    db.commit()
                    
                    # Ledger inmutable
                    registrar_evento_ledger(
                        db=db,
                        turno_id=turno.id,
                        estado_anterior=estado_anterior,
                        estado_nuevo="ENTREGADO",
                        usuario="TELEGRAM_BOT",
                        motivo="POD (Prueba de entrega fotográfica) cargada por el conductor via Telegram webhook."
                    )
                    
                    await _enviar_telegram(chat_id, f"🎉 ¡Evidencia recibida! Tu despacho `{turno.numero_turno}` ha sido completado y entregado en KODA ERP.")
                    return {"status": "pod_recorded"}
        except Exception as ex:
            print("Error en Telegram Webhook POD:", ex)
            await _enviar_telegram(chat_id, "❌ Hubo un problema al procesar la foto de entrega. Por favor, reenvíala.")
            return {"status": "error_processing_photo"}
            
    return {"status": "ignored"}


@router.post("/turnos/{turno_id}/liquidar")
def liquidar_gastos_turno(turno_id: int, data: TurnoLiquidar, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Liquida los gastos de un viaje de despacho (Combustible, viáticos, peajes) y registra el kilometraje de retorno."""
    turno = db.query(TurnoDespacho).filter(
        TurnoDespacho.id == turno_id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
        
    # Registrar kilometraje de retorno en el viaje y actualizar en el vehículo
    turno.km_retorno = data.km_retorno
    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == turno.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    if vehiculo and data.km_retorno > 0:
        # Validar consistencia
        if data.km_retorno < vehiculo.km_actuales:
            raise HTTPException(status_code=400, detail=f"Kilometraje de retorno inválido. El vehículo ya registra {vehiculo.km_actuales} km.")
        vehiculo.km_actuales = data.km_retorno

    # Eliminar gastos anteriores para evitar duplicados en re-liquidaciones
    db.query(TurnoGasto).filter(TurnoGasto.turno_id == turno.id).delete()

    # Guardar nuevos gastos
    for g in data.gastos:
        gasto = TurnoGasto(
            turno_id=turno.id,
            categoria=g.categoria,
            monto_usd=g.monto_usd,
            litros_combustible=g.litros_combustible,
            descripcion=g.descripcion
        )
        db.add(gasto)

    # Si el turno estaba PROGRAMADO o EN_RUTA, lo cerramos a ENTREGADO
    estado_anterior = turno.estado
    if turno.estado in ["PROGRAMADO", "EN_RUTA"]:
        turno.estado = "ENTREGADO"
        turno.fecha_retorno = datetime.now()
        if vehiculo:
            vehiculo.estado = "DISPONIBLE"
        chofer = db.query(Chofer).filter(Chofer.id == turno.chofer_id, Chofer.tenant_id == current_user.tenant_id).first()
        if chofer:
            chofer.estado = "DISPONIBLE"

    db.commit()

    # Ledger de auditoría
    registrar_evento_ledger(
        db=db,
        turno_id=turno.id,
        estado_anterior=estado_anterior,
        estado_nuevo="ENTREGADO",
        usuario=f"USER: {current_user.email}",
        motivo=f"Viaje liquidado administrativamente. Gastos registrados. Retorno de vehículo a {data.km_retorno} km."
    )
    
    return {"ok": True, "mensaje": "Viaje liquidado correctamente."}


@router.get("/cuarentena")
def listar_cuarentena(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Obtiene el listado de mercancía retenida en cuarentena (logística inversa)."""
    items = db.query(CuarentenaLogistica).join(TurnoDespacho).filter(
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).order_by(CuarentenaLogistica.created_at.desc()).all()
    return [
        {
            "id": c.id,
            "turno_id": c.turno_id,
            "turno_numero": c.turno.numero_turno if c.turno else "N/A",
            "producto_id": c.producto_id,
            "producto_nombre": c.producto.nombre if c.producto else "Producto",
            "producto_sku": c.producto.sku if c.producto else "S/S",
            "cantidad": float(c.cantidad),
            "motivo": c.motivo,
            "estado": c.estado,
            "fecha": c.created_at.isoformat()
        } for c in items
    ]


@router.post("/cuarentena/{cuarentena_id}/resolver")
def resolver_cuarentena(cuarentena_id: int, data: CuarentenaResolve, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Aprobación de reingreso o desecho contable del inventario en cuarentena."""
    item = db.query(CuarentenaLogistica).join(TurnoDespacho).filter(
        CuarentenaLogistica.id == cuarentena_id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de cuarentena no encontrado")

    if item.estado != "PENDIENTE_REVISION":
        raise HTTPException(status_code=400, detail="Este registro ya fue resuelto previamente")

    if data.resolucion not in ["REINGRESO", "DESECHO"]:
        raise HTTPException(status_code=400, detail="Resolución inválida. Debe ser REINGRESO o DESECHO.")

    item.estado = f"APROBADO_{data.resolucion}" if data.resolucion == "REINGRESO" else "DESECHADO"
    
    # Si es reingreso, sumamos el stock físico del producto
    if data.resolucion == "REINGRESO":
        producto = db.query(Producto).filter(
            Producto.id == item.producto_id,
            Producto.tenant_id == current_user.tenant_id
        ).first()
        if producto:
            producto.stock += item.cantidad
            
    db.commit()
    return {"ok": True, "nuevo_estado": item.estado}


@router.get("/turnos/{turno_id}/ledger")
def consultar_ledger_turno(turno_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Obtiene la bitácora inmutable de eventos de tránsito de un turno."""
    turno = db.query(TurnoDespacho).filter(
        TurnoDespacho.id == turno_id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado o sin permisos")
        
    logs = db.query(LogisticaLedger).filter(LogisticaLedger.turno_id == turno_id).order_by(LogisticaLedger.fecha_cambio.asc()).all()
    return [
        {
            "id": l.id,
            "estado_anterior": l.estado_anterior,
            "estado_nuevo": l.estado_nuevo,
            "fecha": l.fecha_cambio.isoformat(),
            "usuario": l.usuario,
            "motivo": l.motivo,
            "hash": l.hash_seguridad
        } for l in logs
    ]


class ParadaEstadoUpdate(BaseModel):
    estado: str  # ENTREGADO, RECHAZADO
    motivo_rechazo: Optional[str] = None


@router.put("/turnos/paradas/{parada_id}/estado")
def actualizar_estado_parada(parada_id: int, data: ParadaEstadoUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Actualiza el estado de entrega de una parada individual y audita en el ledger. Deriva a cuarentena si es rechazada."""
    parada = db.query(TurnoVentaAsociacion).join(TurnoDespacho).filter(
        TurnoVentaAsociacion.id == parada_id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).first()
    if not parada:
        raise HTTPException(status_code=404, detail="Parada no encontrada")

    estado_anterior = parada.estado_entrega
    parada.estado_entrega = data.estado

    if data.estado == "RECHAZADO":
        parada.motivo_rechazo = data.motivo_rechazo
        # Logística inversa: derivar mercancías de esta venta a cuarentena
        detalles = db.query(VentaDetalle).join(Venta).filter(
            VentaDetalle.venta_id == parada.venta_id,
            Venta.tenant_id == current_user.tenant_id
        ).all()
        for d in detalles:
            item = CuarentenaLogistica(
                turno_id=parada.turno_id,
                producto_id=d.producto_id,
                cantidad=d.cantidad,
                motivo=f"Parada rechazada en {parada.turno.numero_turno if parada.turno else 'N/A'}. Motivo: {data.motivo_rechazo or 'Sin especificar'}",
                estado="PENDIENTE_REVISION"
            )
            db.add(item)

    db.commit()

    # Registrar evento en Ledger inmutable
    msg = f"Parada #{parada.orden_parada} ({parada.venta.numero_factura if parada.venta else 'Factura'}) marcada como {data.estado}."
    if data.motivo_rechazo:
        msg += f" Motivo: {data.motivo_rechazo}"
    registrar_evento_ledger(
        db=db,
        turno_id=parada.turno_id,
        estado_anterior=parada.turno.estado if parada.turno else None,
        estado_nuevo=parada.turno.estado if parada.turno else "N/A",
        usuario=f"USER: {current_user.email}",
        motivo=msg
    )

    return {"ok": True, "estado": data.estado}


# ─── NUEVO MÓDULO: PLANIFICACIÓN DE PERSONAL Y LOGÍSTICA (FASE 4) ─────────────
from backend.models.logistics_new import (
    Crew as NewCrew,
    CrewMember as NewCrewMember,
    LogisticsPlan as NewLogisticsPlan,
    DispatchRecord as NewDispatchRecord,
    NotificationJob as NewNotificationJob
)
from backend.models.core import Profile

# ---- 1. TRIPULACIONES (CREWS) ----

@router.get("/crews", response_model=List[dict])
def get_crews(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Lista las tripulaciones del tenant actual."""
    query = db.query(NewCrew).filter(NewCrew.tenant_id == current_user.tenant_id)
    if current_user.rol not in ('Admin', 'Supervisor', 'CEO', 'Desarrollador', 'Gerente'):
        query = query.join(NewCrewMember).filter(NewCrewMember.profile_id == current_user.id)
    
    crews = query.all()
    result = []
    for c in crews:
        # Get helpers
        members = db.query(NewCrewMember).filter(
            NewCrewMember.crew_id == c.id,
            NewCrewMember.tenant_id == current_user.tenant_id
        ).all()
        ayudantes = []
        for m in members:
            p = db.query(Profile).filter(Profile.id == m.profile_id).first()
            if p:
                ayudantes.append({
                    "id": str(p.id),
                    "nombre": f"{p.nombre or ''} {p.apellido or ''}".strip() or p.username,
                    "email": p.email
                })
        
        driver = db.query(Profile).filter(Profile.id == c.chofer_id).first()
        veh = db.query(Vehiculo).filter(Vehiculo.id == c.vehiculo_id).first()
        
        result.append({
            "id": c.id,
            "nombre": c.nombre,
            "vehiculo": {
                "id": veh.id if veh else None,
                "nombre": veh.nombre if veh else "N/A",
                "placa": veh.placa if veh else "N/A"
            },
            "chofer": {
                "id": str(driver.id) if driver else None,
                "nombre": f"{driver.nombre or ''} {driver.apellido or ''}".strip() if driver else "N/A",
                "email": driver.email if driver else "N/A"
            },
            "ayudantes": ayudantes,
            "activo": c.activo
        })
    return result

class CrewCreateSchema(BaseModel):
    nombre: str
    vehiculo_id: int
    chofer_id: str
    ayudantes_ids: List[str]

@router.post("/crews")
def create_crew(payload: CrewCreateSchema, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Crea una tripulaciones y sus miembros asociados (solo Admin/Supervisor)."""
    if current_user.rol not in ('Admin', 'Supervisor', 'CEO', 'Desarrollador', 'Gerente'):
        raise HTTPException(status_code=403, detail="Permisos insuficientes.")
    
    veh = db.query(Vehiculo).filter(Vehiculo.id == payload.vehiculo_id, Vehiculo.tenant_id == current_user.tenant_id).first()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    
    driver = db.query(Profile).filter(Profile.id == payload.chofer_id, Profile.tenant_id == current_user.tenant_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Chofer no encontrado.")

    c = NewCrew(
        tenant_id=current_user.tenant_id,
        nombre=payload.nombre,
        vehiculo_id=payload.vehiculo_id,
        chofer_id=payload.chofer_id,
        activo=True
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    for h_id in payload.ayudantes_ids:
        helper = db.query(Profile).filter(Profile.id == h_id, Profile.tenant_id == current_user.tenant_id).first()
        if helper:
            member = NewCrewMember(
                tenant_id=current_user.tenant_id,
                crew_id=c.id,
                profile_id=helper.id,
                rol="AYUDANTE"
            )
            db.add(member)
    db.commit()
    return {"ok": True, "id": c.id}

# ---- 3. PLANES LOGÍSTICOS & DESPACHOS ----

@router.get("/planes", response_model=List[dict])
def get_plans(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Lista todos los planes logísticos del tenant."""
    query = db.query(NewLogisticsPlan).filter(NewLogisticsPlan.tenant_id == current_user.tenant_id)
    if current_user.rol not in ('Admin', 'Supervisor', 'CEO', 'Desarrollador', 'Gerente'):
        query = query.filter(NewLogisticsPlan.estado == 'APROBADO').join(NewDispatchRecord).join(NewCrew).join(NewCrewMember).filter(NewCrewMember.profile_id == current_user.id)
    
    plans = query.order_by(NewLogisticsPlan.fecha_planificacion.desc()).all()
    result = []
    for p in plans:
        dispatches = db.query(NewDispatchRecord).filter(
            NewDispatchRecord.plan_id == p.id,
            NewDispatchRecord.tenant_id == current_user.tenant_id
        ).all()
        
        disp_list = []
        for d in dispatches:
            crew = db.query(NewCrew).filter(NewCrew.id == d.crew_id).first()
            disp_list.append({
                "id": d.id,
                "crew": {
                    "id": crew.id if crew else None,
                    "nombre": crew.nombre if crew else "N/A"
                },
                "ruta": d.ruta,
                "estado": d.estado,
                "detalles": d.detalles
            })
            
        result.append({
            "id": p.id,
            "fecha_planificacion": p.fecha_planificacion.strftime("%Y-%m-%d"),
            "estado": p.estado,
            "creado_por": str(p.creado_por),
            "aprobado_por": str(p.aprobado_por) if p.aprobado_por else None,
            "despachos": disp_list
        })
    return result

class DispatchCreateSchema(BaseModel):
    crew_id: int
    ruta: str
    detalles: Optional[str] = None

class PlanCreateSchema(BaseModel):
    fecha_planificacion: str
    despachos: List[DispatchCreateSchema]

@router.post("/planes")
def create_plan(payload: PlanCreateSchema, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Crea un plan logístico en borrador (solo Admin/Supervisor)."""
    if current_user.rol not in ('Admin', 'Supervisor', 'CEO', 'Desarrollador', 'Gerente'):
        raise HTTPException(status_code=403, detail="Permisos insuficientes.")
    
    try:
        parsed_date = datetime.strptime(payload.fecha_planificacion, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usar YYYY-MM-DD.")
    
    plan = NewLogisticsPlan(
        tenant_id=current_user.tenant_id,
        fecha_planificacion=parsed_date,
        estado="BORRADOR",
        creado_por=current_user.id
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    
    for d in payload.despachos:
        crew = db.query(NewCrew).filter(NewCrew.id == d.crew_id, NewCrew.tenant_id == current_user.tenant_id).first()
        if crew:
            disp = NewDispatchRecord(
                tenant_id=current_user.tenant_id,
                plan_id=plan.id,
                crew_id=d.crew_id,
                ruta=d.ruta,
                estado="PENDIENTE",
                detalles=d.detalles
            )
            db.add(disp)
    db.commit()
    return {"ok": True, "id": plan.id}


async def process_notification_jobs():
    """Worker asíncrono en background que consume la cola de notificaciones de Telegram."""
    from backend.core.database import SessionLocal
    db = SessionLocal()
    try:
        jobs = db.query(NewNotificationJob).filter(NewNotificationJob.estado == "PENDING").all()
        for job in jobs:
            job.estado = "PROCESSING"
            job.intentos += 1
            db.commit()
            
            success = await _enviar_telegram(job.telegram_chat_id, job.mensaje)
            if success:
                job.estado = "SENT"
            else:
                job.estado = "FAILED"
                job.error_log = "Error de red o chat ID inválido en Telegram."
            job.updated_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        print(f"[WORKER ERROR] Error al procesar cola de notificaciones: {e}", flush=True)
    finally:
        db.close()


@router.post("/planes/{plan_id}/aprobar")
def aprobar_plan_logistico(plan_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Aprobación masiva y atómica de un plan logístico (Maker-Checker, solo Admin/Supervisor)."""
    if current_user.rol not in ('Admin', 'Supervisor', 'CEO', 'Desarrollador', 'Gerente'):
        raise HTTPException(status_code=403, detail="Permisos insuficientes para aprobar planes.")
    
    plan = db.query(NewLogisticsPlan).filter(
        NewLogisticsPlan.id == plan_id,
        NewLogisticsPlan.tenant_id == current_user.tenant_id
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan logístico no encontrado.")
    
    if plan.estado == "APROBADO":
        return {"ok": True, "message": "El plan ya se encuentra aprobado."}
    
    try:
        plan.estado = "APROBADO"
        plan.aprobado_por = current_user.id
        
        dispatches = db.query(NewDispatchRecord).filter(
            NewDispatchRecord.plan_id == plan_id,
            NewDispatchRecord.tenant_id == current_user.tenant_id
        ).all()
        
        for d in dispatches:
            d.estado = "PENDIENTE"
            
            crew = db.query(NewCrew).filter(NewCrew.id == d.crew_id, NewCrew.tenant_id == current_user.tenant_id).first()
            if crew:
                driver = db.query(Profile).filter(Profile.id == crew.chofer_id).first()
                if driver and getattr(driver, 'telegram_chat_id', None):
                    msg = f"🚚 *Ruta Asignada: {d.ruta}*\nHola {driver.nombre}, tienes una nueva hoja de ruta aprobada. Detalles: {d.detalles or 'Ninguno'}."
                    job = NewNotificationJob(
                        tenant_id=current_user.tenant_id,
                        dispatch_id=d.id,
                        profile_id=driver.id,
                        telegram_chat_id=driver.telegram_chat_id,
                        mensaje=msg,
                        estado="PENDING"
                    )
                    db.add(job)
                
                members = db.query(NewCrewMember).filter(NewCrewMember.crew_id == crew.id, NewCrewMember.tenant_id == current_user.tenant_id).all()
                for m in members:
                    helper = db.query(Profile).filter(Profile.id == m.profile_id).first()
                    if helper and getattr(helper, 'telegram_chat_id', None):
                        msg = f"👷 *Asignación de Ruta: {d.ruta}*\nHola {helper.nombre}, has sido asignado como Ayudante para la tripulación *{crew.nombre}* hoy."
                        job = NewNotificationJob(
                            tenant_id=current_user.tenant_id,
                            dispatch_id=d.id,
                            profile_id=helper.id,
                            telegram_chat_id=helper.telegram_chat_id,
                            mensaje=msg,
                            estado="PENDING"
                        )
                        db.add(job)
        
        db.commit()
        
        asyncio.create_task(process_notification_jobs())
        
        return {"ok": True, "message": "Plan aprobado exitosamente de forma atómica. Notificaciones encoladas."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al aprobar plan: {str(e)}")

# ---- 4. MOTOR DE PERSONAL & MÉTRICAS ----

@router.get("/personal", response_model=List[dict])
def get_personal_engine(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Retorna jerarquías del personal, tareas asignadas y métricas de desempeño."""
    profiles = db.query(Profile).filter(Profile.tenant_id == current_user.tenant_id).all()
    result = []
    
    for p in profiles:
        cm = db.query(NewCrewMember).filter(NewCrewMember.profile_id == p.id, NewCrewMember.tenant_id == current_user.tenant_id).first()
        crew_name = "Sin Tripulación"
        role_label = p.rol
        
        total_despachos = 0
        completados = 0
        
        if cm:
            crew = db.query(NewCrew).filter(NewCrew.id == cm.crew_id).first()
            if crew:
                crew_name = crew.nombre
                role_label = cm.rol
                
                dispatches = db.query(NewDispatchRecord).filter(
                    NewDispatchRecord.crew_id == crew.id,
                    NewDispatchRecord.tenant_id == current_user.tenant_id
                ).all()
                total_despachos = len(dispatches)
                completados = sum(1 for d in dispatches if d.estado == "ENTREGADO" or d.estado == "DELIVERED")
        else:
            crew = db.query(NewCrew).filter(NewCrew.chofer_id == p.id, NewCrew.tenant_id == current_user.tenant_id).first()
            if crew:
                crew_name = crew.nombre
                role_label = "CHOFER"
                
                dispatches = db.query(NewDispatchRecord).filter(
                    NewDispatchRecord.crew_id == crew.id,
                    NewDispatchRecord.tenant_id == current_user.tenant_id
                ).all()
                total_despachos = len(dispatches)
                completados = sum(1 for d in dispatches if d.estado == "ENTREGADO" or d.estado == "DELIVERED")

        efficiency = 100.0 if total_despachos == 0 else round((completados / total_despachos) * 100, 1)
        
        reporta_a = "Supervisor" if role_label in ("CHOFER", "AYUDANTE", "Chofer", "Ayudante") else "Admin"
        if p.rol == "Admin":
            reporta_a = "CEO"

        result.append({
            "id": str(p.id),
            "nombre": f"{p.nombre or ''} {p.apellido or ''}".strip() or p.username,
            "email": p.email,
            "rol": role_label,
            "tripulacion": crew_name,
            "rutas_totales": total_despachos,
            "rutas_completadas": completados,
            "eficiencia": efficiency,
            "reporta_a": reporta_a,
            "estado": "Activo" if p.estado == 1 else "Inactivo",
            "telegram_chat_id": p.telegram_chat_id
        })
        
    return result

class LinkTelegramSchema(BaseModel):
    profile_id: str
    telegram_chat_id: str

@router.post("/personal/telegram")
async def link_telegram(payload: LinkTelegramSchema, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Asocia un chat ID de Telegram al perfil de un usuario (solo Admin/Supervisor)."""
    if current_user.rol not in ('Admin', 'Supervisor', 'CEO', 'Desarrollador', 'Gerente'):
        raise HTTPException(status_code=403, detail="Permisos insuficientes.")
    
    p = db.query(Profile).filter(Profile.id == payload.profile_id, Profile.tenant_id == current_user.tenant_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    p.telegram_chat_id = payload.telegram_chat_id
    db.commit()
    
    # Enviar mensaje de confirmación a Telegram
    msg = (
        f"✅ *KODA ERP - Vinculación Exitosa*\n\n"
        f"Hola *{p.nombre or p.username}*, tu cuenta ha sido vinculada correctamente al sistema.\n"
        f"A partir de ahora recibirás aquí tus hojas de ruta y notificaciones operativas."
    )
    asyncio.create_task(_enviar_telegram(p.telegram_chat_id, msg))
    
    return {"ok": True, "message": "Telegram enlazado correctamente."}



