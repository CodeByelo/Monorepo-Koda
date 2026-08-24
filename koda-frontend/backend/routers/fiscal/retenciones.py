from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
import io
import csv
import re
import xml.etree.ElementTree as ET
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from fastapi.responses import StreamingResponse

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.operations import Venta
from backend.models.erp_extended import RetencionIVA, RetencionISLR, Empresa
from backend.utils.helpers import ventas_periodo, to_float, tasa_actual
from backend.core.security import get_current_user

router = APIRouter()


@router.get("/retenciones-iva")
def retenciones_iva(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    rows = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).all()
    
    recibidas = []
    practicadas = []
    
    for r in rows:
        item = {
            "id": r.id,
            "tipo": r.tipo,
            "numero_comprobante": r.numero_comprobante,
            "fecha": r.fecha_comprobante.strftime("%d/%m/%Y") if r.fecha_comprobante else "",
            "agente_rif": r.agente_rif,
            "agente_nombre": r.agente_nombre,
            "base": to_float(r.base_usd),
            "iva_retenido": to_float(r.monto_usd),
            "alicuota": float(r.alicuota) * 100,
            "estado": r.estado
        }
        if r.tipo == "RECIBIDA":
            recibidas.append(item)
        else:
            practicadas.append(item)

    return {
        "periodo": periodo,
        "recibidas": recibidas,
        "practicadas": practicadas,
        "resumen": {
            "total_recibidas": sum(x["iva_retenido"] for x in recibidas),
            "cantidad_recibidas": len(recibidas),
            "total_practicadas": sum(x["iva_retenido"] for x in practicadas),
            "cantidad_practicadas": len(practicadas),
        },
    }


@router.get("/retenciones-iva/exportar")
def exportar_retenciones(periodo: str, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    # Obtener el RIF de la empresa (agente de retención)
    empresa = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    rif_agente = re.sub(r'[\s\-]', '', empresa.rif.upper()) if empresa else "J300000000"

    # Formatear el periodo para el SENIAT: YYYYMM (por ejemplo, "202605" para "2026-05")
    periodo_fiscal = periodo.replace("-", "")

    # Obtener retenciones de IVA para el periodo
    rows = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).all()
    
    lines = []
    for r in rows:
        rif_sujeto = re.sub(r'[\s\-]', '', r.proveedor_rif.upper())
        fecha_doc = datetime.now().strftime("%Y-%m-%d") # Fallback
        
        # Convertir montos a Bolívares (VES)
        tasa = Decimal(str(r.tasa_cambio_bs))
        base_ves = (Decimal(str(r.base_usd)) * tasa).quantize(Decimal("0.01"))
        monto_ves = (Decimal(str(r.monto_usd)) * tasa).quantize(Decimal("0.01"))
        total_ves = (base_ves + (base_ves * Decimal(str(r.alicuota)))).quantize(Decimal("0.01"))
        
        # Crear la línea delimitada por pipe
        # Formato: RIF_Agente|Periodo|FechaDoc|TipoOperacion|TipoDoc|RIF_Sujeto|NumDoc|NumControl|MontoTotal|BaseImponible|MontoRetenido|DocAfectado|NumComprobante|MontoExento|Alicuota|Expediente
        comprobante = f"{periodo_fiscal}{str(r.id).zfill(8)}" # 14-digit comprobante AAAAMMXXXXXXXX
        line = (
            f"{rif_agente}|{periodo_fiscal}|{fecha_doc}|C|01|{rif_sujeto}|"
            f"{r.numero_factura}|{r.numero_factura}|{total_ves:.2f}|{base_ves:.2f}|"
            f"{monto_ves:.2f}||{comprobante}|0.00|{r.alicuota * 100:.2f}|0"
        )
        lines.append(line)
        
    content = "\n".join(lines)
    return Response(
        content=content,
        media_type="text/plain",
        headers={
            "Content-Disposition": f"attachment; filename=retenciones_iva_{periodo_fiscal}.txt"
        }
    )


@router.post("/retenciones-iva/comprobante")
def crear_comprobante(body: dict, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    periodo = body.get("periodo")
    if not periodo:
        raise HTTPException(status_code=400, detail="El campo 'periodo' es requerido.")

    alicuota_pct = body.get("alicuota")
    ret = RetencionIVA(
        tenant_id=current_user.tenant_id,
        tipo=body.get("tipo", "RECIBIDA"),
        agente_rif=body.get("agente_rif", ""),
        agente_nombre=body.get("agente_nombre", ""),
        numero_factura=body.get("numero_factura", ""),
        numero_comprobante=body.get("numero_comprobante", ""),
        fecha_comprobante=(
            datetime.strptime(body.get("fecha_comprobante"), "%Y-%m-%d")
            if body.get("fecha_comprobante") else datetime.now()
        ),
        base_usd=body.get("base", 0) or 0,
        alicuota=(alicuota_pct / 100.0) if alicuota_pct else 0,
        monto_usd=body.get("iva_retenido", 0) or 0,
        tasa_cambio_bs=tasa_actual(db, current_user.tenant_id) or 1.0,
        periodo=periodo,
        estado="VALIDADO",
    )
    db.add(ret)
    db.commit()
    db.refresh(ret)
    return {"ok": True, "id": ret.id, "mensaje": "Comprobante cargado exitosamente"}


@router.get("/retencion-iva/detalle")
def detalle_retencion(id: int = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    r = db.query(RetencionIVA).filter(
        RetencionIVA.id == id,
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Retención de IVA no encontrada.")

    return {
        "id": r.id,
        "tipo": r.tipo,
        "proveedor": r.agente_nombre,
        "agente_rif": r.agente_rif,
        "agente_nombre": r.agente_nombre,
        "numero_factura": r.numero_factura,
        "numero_comprobante": r.numero_comprobante,
        "fecha_comprobante": r.fecha_comprobante.strftime("%d/%m/%Y") if r.fecha_comprobante else None,
        "base": to_float(r.base_usd),
        "alicuota": float(r.alicuota) * 100,
        "monto": to_float(r.monto_usd),
        "monto_usd": to_float(r.monto_usd),
        "tasa_cambio_bs": to_float(r.tasa_cambio_bs),
        "periodo": r.periodo,
        "estado": r.estado,
    }


@router.get("/igtf")
def igtf(periodo: str, quincena: str = "1", db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    from sqlalchemy import extract
    import calendar

    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7

    query = ventas_periodo(db, current_user.tenant_id, periodo)

    if quincena == "1":
        query = query.filter(extract('day', Venta.fecha) <= 15)
        rango = f"01/{m:02d}/{y} al 15/{m:02d}/{y}"
    else:
        query = query.filter(extract('day', Venta.fecha) > 15)
        last_day = calendar.monthrange(y, m)[1]
        rango = f"16/{m:02d}/{y} al {last_day:02d}/{m:02d}/{y}"
        
    ventas = query.all()
    
    percepciones = []
    total_igtf_bs = 0.0
    total_base_usd = 0.0
    operaciones_exentas = 0.0
    count_facturas = 0
    
    for v in ventas:
        igtf_usd = to_float(v.igtf_usd)
        tasa = to_float(v.tasa_cambio_bs) or 36.0
        
        if igtf_usd > 0 or v.metodo_pago in ["EFECTIVO_USD", "TRANSFERENCIA_USD", "DIVISA"]:
            count_facturas += 1
            # Si no tiene igtf_usd guardado pero fue en divisa, se calcula el 3%
            base_usd = to_float(v.subtotal_usd) if igtf_usd > 0 else to_float(v.total_usd)
            base_bs = base_usd * tasa
            igtf_bs = igtf_usd * tasa if igtf_usd > 0 else base_usd * 0.03 * tasa
            
            percepciones.append({
                "date": v.fecha.strftime("%d/%m/%Y"),
                "doc": v.numero_factura,
                "client": v.cliente.nombre if v.cliente else "CLIENTE GENÉRICO",
                "usd": base_usd,
                "bs": base_bs,
                "igtf": igtf_bs,
                "status": "PERCIBIDO"
            })
            total_igtf_bs += igtf_bs
            total_base_usd += base_usd
        else:
            operaciones_exentas += to_float(v.total_usd) * tasa
            
    return {
        "resumen": {
            "rango_fechas": rango,
            "estado": "ABIERTO" if (datetime.now().year == y and datetime.now().month == m) else "CERRADO",
            "total_igtf_bs": total_igtf_bs,
            "base_usd": total_base_usd,
            "count_facturas": count_facturas,
            "operaciones_exentas": operaciones_exentas,
            "retenciones_por_percibir": 0.0
        },
        "percepciones": percepciones
    }


@router.get("/igtf/exportar")
def exportar_igtf(formato: str, periodo: str, quincena: str, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    from sqlalchemy import extract

    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7

    query = ventas_periodo(db, current_user.tenant_id, periodo)
    if quincena == "1":
        query = query.filter(extract('day', Venta.fecha) <= 15)
    else:
        query = query.filter(extract('day', Venta.fecha) > 15)
        
    ventas = query.all()
    
    if formato == "txt":
        lines = []
        for v in ventas:
            igtf_usd = to_float(v.igtf_usd)
            if igtf_usd > 0 or v.metodo_pago in ["EFECTIVO_USD", "TRANSFERENCIA_USD", "DIVISA"]:
                tasa = to_float(v.tasa_cambio_bs) or 36.0
                base_bs = to_float(v.subtotal_usd) * tasa
                igtf_bs = igtf_usd * tasa if igtf_usd > 0 else base_bs * 0.03
                rif_cliente = v.cliente.rif if v.cliente and v.cliente.rif else "V-00000000-0"
                fecha_str = v.fecha.strftime("%Y-%m-%d")
                lines.append(f"{rif_cliente};{v.numero_factura};{base_bs:.2f};{igtf_bs:.2f};{fecha_str}")
        content = "\n".join(lines)
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename=igtf_{periodo}_Q{quincena}.txt"}
        )
    return {"ok": True}


@router.get("/arc/sujetos")
def arc_sujetos(anio: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    # Retornar los sujetos con retenciones ISLR registradas en ese año
    retenciones = db.query(RetencionISLR.proveedor_rif, RetencionISLR.proveedor_nombre).filter(
        RetencionISLR.periodo.like(f"{anio}-%"),
        RetencionISLR.tenant_id == current_user.tenant_id,
    ).distinct(RetencionISLR.proveedor_rif).all()

    return [{"rif": r[0], "nombre": r[1]} for r in retenciones]


@router.get("/arc")
def arc(anio: int, sujeto: str, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    retenciones = db.query(RetencionISLR).filter(
        RetencionISLR.proveedor_rif == sujeto,
        RetencionISLR.periodo.like(f"{anio}-%"),
        RetencionISLR.tenant_id == current_user.tenant_id,
    ).order_by(RetencionISLR.periodo).all()
    
    meses = {
        1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL",
        5: "MAYO", 6: "JUNIO", 7: "JULIO", 8: "AGOSTO",
        9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE"
    }
    
    concept_names = {
        "001": "HONORARIOS PROFESIONALES",
        "002": "COMISIONES",
        "003": "SERVICIOS TÉCNICOS"
    }
    
    detalles = []
    total_base = 0.0
    total_retenido = 0.0
    
    for r in retenciones:
        try:
            _, m_str = r.periodo.split("-")
            m_val = int(m_str)
            mes_name = meses.get(m_val, "OTRO")
        except:
            mes_name = "OTRO"
            
        base = to_float(r.base_usd)
        alicuota = to_float(r.alicuota)
        retenido = to_float(r.monto_usd)
        sustraendo = max(0.0, (base * alicuota) - retenido)
        
        detalles.append({
            "mes": mes_name,
            "concepto": concept_names.get(r.concepto_codigo, "OTRO CONCEPTO"),
            "base": base,
            "porcentaje": f"{alicuota * 100:.1f}%",
            "sustraendo": sustraendo,
            "retenido": retenido
        })
        total_base += base
        total_retenido += retenido
        
    nombre_sujeto = retenciones[0].proveedor_nombre if retenciones else sujeto
    
    return {
        "sujeto": {
            "rif": sujeto,
            "nombre": nombre_sujeto
        },
        "totales": {
            "base": total_base,
            "sustraendo": sum(d["sustraendo"] for d in detalles),
            "retenido": total_retenido
        },
        "detalles": detalles
    }


@router.get("/arc/exportar")
def exportar_arc(formato: str, anio: int, sujeto: str, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    res = arc(anio, sujeto, db, current_user)

    # Obtener los datos reales de la Empresa emisora (agente de retención)
    empresa = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    emisor_nombre = empresa.razon_social if empresa else "N/A"
    emisor_rif = empresa.rif if empresa else "N/A"
    rif_agente_xml = re.sub(r'[\s\-]', '', empresa.rif.upper()) if empresa else "J300000000"

    if formato == "pdf":
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        c.setTitle(f"Comprobante ARC - {sujeto}")

        # Header
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, 750, emisor_nombre)
        c.setFont("Helvetica", 10)
        c.drawString(50, 735, f"R.I.F.: {emisor_rif}")
        
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(300, 700, "COMPROBANTE DE RETENCIONES ARC")
        c.setFont("Helvetica", 12)
        c.drawCentredString(300, 680, f"EJERCICIO FISCAL: {anio}")
        
        # Subject Info
        c.setFont("Helvetica-Bold", 10)
        c.drawString(50, 630, f"Sujeto Retenido: {res['sujeto']['nombre']}")
        c.drawString(50, 615, f"R.I.F.: {res['sujeto']['rif']}")
        c.drawString(50, 600, f"Total Retenido: Bs. {res['totales']['retenido']:,.2f}")
        
        # Details Table
        y_pos = 550
        c.drawString(50, y_pos, "Mes")
        c.drawString(150, y_pos, "Concepto")
        c.drawString(320, y_pos, "Base Imponible")
        c.drawString(420, y_pos, "% Ret.")
        c.drawString(480, y_pos, "Monto Retenido")
        
        c.line(50, y_pos - 5, 550, y_pos - 5)
        
        c.setFont("Helvetica", 9)
        y_pos -= 20
        for d in res["detalles"]:
            c.drawString(50, y_pos, d["mes"])
            c.drawString(150, y_pos, d["concepto"][:28])
            c.drawString(320, y_pos, f"Bs. {d['base']:,.2f}")
            c.drawString(420, y_pos, d["porcentaje"])
            c.drawString(480, y_pos, f"Bs. {d['retenido']:,.2f}")
            y_pos -= 15
            if y_pos < 100:
                c.showPage()
                y_pos = 700
                
        c.showPage()
        c.save()
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=comprobante_arc_{sujeto}_{anio}.pdf"}
        )
        
    elif formato == "xml":
        # Generate SENIAT ISLR XML
        root = ET.Element("RelacionRetencionesISLR", Anio=str(anio), RifAgente=rif_agente_xml)
        for d in res["detalles"]:
            elem = ET.SubElement(root, "Retencion", Mes=d["mes"])
            ET.SubElement(elem, "RifRetenido").text = sujeto
            ET.SubElement(elem, "Concepto").text = d["concepto"]
            ET.SubElement(elem, "BaseImponible").text = f"{d['base']:.2f}"
            ET.SubElement(elem, "MontoRetenido").text = f"{d['retenido']:.2f}"
            
        xml_str = ET.tostring(root, encoding="utf-8")
        return Response(
            content=xml_str,
            media_type="application/xml",
            headers={"Content-Disposition": f"attachment; filename=arc_{sujeto}_{anio}.xml"}
        )
        
    return {"ok": True}


@router.get("/retenciones-practicadas/exportar")
def exportar_ret_practicadas(formato: str, periodo: str, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    rows = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo != "RECIBIDA",
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).order_by(RetencionIVA.fecha_comprobante).all()

    if formato in ("txt", "csv"):
        output = io.StringIO()
        writer = csv.writer(output, delimiter='\t' if formato == "txt" else ',')
        writer.writerow(["RIF AGENTE", "AGENTE", "FACTURA", "COMPROBANTE", "BASE", "IVA RETENIDO", "ESTADO"])
        for r in rows:
            writer.writerow([
                r.agente_rif,
                r.agente_nombre,
                r.numero_factura,
                r.numero_comprobante or "",
                f"{to_float(r.base_usd):.2f}",
                f"{to_float(r.monto_usd):.2f}",
                r.estado,
            ])
        output.seek(0)
        media_type = "text/plain" if formato == "txt" else "text/csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename=retenciones_practicadas_{periodo}.{formato}"}
        )

    raise HTTPException(status_code=501, detail="Formato de exportación no soportado para retenciones practicadas.")


@router.get("/validar-rif")
def validar_rif(rif: str, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    # Normalizar RIF: mayúsculas, quitar espacios y guiones para reformatear
    clean_rif = re.sub(r'[\s\-]', '', rif.upper())
    
    # Validar estructura básica: Letra inicial (V, E, J, P, G) seguida de 9 números
    if not re.match(r'^[VEJPG]\d{9}$', clean_rif):
        raise HTTPException(status_code=400, detail="Formato de RIF inválido. Debe comenzar con V, E, J, P, G seguido de 9 dígitos.")
    
    # Formatear con guiones: Letra - 8 dígitos - 1 dígito
    formatted_rif = f"{clean_rif[0]}-{clean_rif[1:9]}-{clean_rif[9]}"
    
    # Buscar en base de datos local (clientes o proveedores)
    from backend.models.operations import Cliente, Proveedor
    existing_client = db.query(Cliente).filter(
        Cliente.rif == formatted_rif,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if existing_client:
        return {
            "rif": formatted_rif,
            "nombre": existing_client.nombre,
            "contribuyente_especial": getattr(existing_client, "contribuyente_especial", False),
            "valido": True,
            "origen": "Base de Datos Interna (Cliente)"
        }
        
    existing_supplier = db.query(Proveedor).filter(
        Proveedor.rif == formatted_rif,
        Proveedor.tenant_id == current_user.tenant_id,
    ).first()
    if existing_supplier:
        return {
            "rif": formatted_rif,
            "nombre": existing_supplier.nombre,
            "contribuyente_especial": getattr(existing_supplier, "contribuyente_especial", False),
            "valido": True,
            "origen": "Base de datos local de KODA"
        }

    existing_empresa = db.query(Empresa).filter(
        Empresa.rif == formatted_rif,
        Empresa.tenant_id == current_user.tenant_id,
    ).first()
    if existing_empresa:
        return {
            "rif": formatted_rif,
            "nombre": existing_empresa.razon_social,
            "contribuyente_especial": getattr(existing_empresa, "tipo_contribuyente", None) == "ESPECIAL",
            "valido": True,
            "origen": "Base de datos local de KODA"
        }

    # KODA no tiene integración con el SENIAT para validar RIFs externos. Este RIF
    # tiene un formato correcto, pero no existe ningún registro (Cliente, Proveedor
    # o Empresa) asociado a él en esta base de datos, así que no se puede confirmar
    # ni fabricar información sobre el contribuyente real.
    return {
        "rif": formatted_rif,
        "nombre": None,
        "contribuyente_especial": False,
        "valido": False,
        "origen": "Base de datos local de KODA",
        "mensaje": "Este RIF no está registrado en su base de datos. KODA no tiene integración con el SENIAT para validar RIFs externos."
    }


@router.get("/retenciones-islr")
def retenciones_islr_list(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    rows = db.query(RetencionISLR).filter(
        RetencionISLR.periodo == periodo,
        RetencionISLR.tenant_id == current_user.tenant_id,
    ).all()
    
    retenciones = []
    honorarios_total = 0
    fletes_total = 0
    servicios_total = 0
    
    for r in rows:
        monto = to_float(r.monto_usd)
        base = to_float(r.base_usd)
        retenciones.append({
            "id": str(r.id),
            "date": r.fecha.strftime("%d/%m/%Y") if hasattr(r, 'fecha') else "01/01/2026",
            "doc": r.numero_factura,
            "provider": r.proveedor_nombre,
            "rif": r.proveedor_rif,
            "concept": "Honorarios Profesionales" if r.concepto_codigo == "001" else ("Fletes" if r.concepto_codigo == "002" else "Servicios"),
            "base": base,
            "perc": f"{float(r.alicuota) * 100:.2f}%",
            "ret": monto,
            "status": r.estado
        })
        
        if r.concepto_codigo == "001":
            honorarios_total += monto
        elif r.concepto_codigo == "002":
            fletes_total += monto
        else:
            servicios_total += monto
            
    base_imponible_total = sum(to_float(r.base_usd) for r in rows)
    total_islr = honorarios_total + fletes_total + servicios_total
            
    return {
        "periodo": periodo,
        "metricas": {
            "honorarios_total": honorarios_total,
            "fletes_total": fletes_total,
            "servicios_total": servicios_total,
            "total_islr": total_islr,
            "pagos_procesados": len(rows),
            "comprobantes_listos": len([r for r in rows if r.estado == "VALIDADO"]),
            "retenciones_pendientes": len([r for r in rows if r.estado == "PENDIENTE"]),
            "base_imponible_total": base_imponible_total
        },
        "retenciones": retenciones
    }


@router.get("/retenciones-islr/exportar")
def exportar_retenciones_islr(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    rows = db.query(RetencionISLR).filter(
        RetencionISLR.periodo == periodo,
        RetencionISLR.tenant_id == current_user.tenant_id,
    ).all()

    # Obtener el RIF real de la Empresa emisora (agente de retención)
    empresa = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    rif_agente = re.sub(r'[\s\-]', '', empresa.rif.upper()) if empresa else "J300000000"

    root = ET.Element("RelacionRetencionesISLR", RifAgente=rif_agente, Periodo=periodo.replace("-", ""))
    
    for r in rows:
        detalle = ET.SubElement(root, "DetalleRetencion")
        ET.SubElement(detalle, "RifRetenido").text = r.proveedor_rif.replace("-", "")
        ET.SubElement(detalle, "NumeroFactura").text = r.numero_factura
        ET.SubElement(detalle, "NumeroControl").text = r.numero_control or "00"
        ET.SubElement(detalle, "CodigoConcepto").text = r.concepto_codigo
        ET.SubElement(detalle, "MontoOperacion").text = f"{to_float(r.base_usd):.2f}"
        ET.SubElement(detalle, "PorcentajeRetencion").text = f"{float(r.alicuota) * 100:.2f}"
    
    tree = ET.ElementTree(root)
    output = io.BytesIO()
    tree.write(output, encoding="utf-8", xml_declaration=True)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=retenciones_islr_{periodo.replace('-', '')}.xml"}
    )
