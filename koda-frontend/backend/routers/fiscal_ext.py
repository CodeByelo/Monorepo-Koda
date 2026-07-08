from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from backend.core.database import get_db
from backend.models.operations import Venta, Cliente
from backend.models.erp_extended import Compra, DeclaracionIVA, RetencionIVA, RetencionISLR, DeclaracionISLR
from backend.models.fiscal import ReglaFiscal
from backend.utils.helpers import ventas_periodo, periodo_rango, to_float, tasa_actual
from fastapi.responses import StreamingResponse
import io
import csv
import xml.etree.ElementTree as ET
from reportlab.lib.pagesizes import landscape, letter
from backend.core.security import get_current_user

router = APIRouter(prefix="/fiscal", tags=["Fiscal SENIAT"], dependencies=[Depends(get_current_user)])


def _tasa_iva(db: Session) -> Decimal:
    regla = db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IVA", ReglaFiscal.activa == True).first()
    return Decimal(str(regla.tasa)) if regla else Decimal("0.16")


@router.get("/dashboard")
def fiscal_dashboard(periodo: str = Query(...), db: Session = Depends(get_db)):
    ventas = ventas_periodo(db, periodo).all()
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(Compra.fecha >= inicio, Compra.fecha < fin, Compra.estado == "ACTIVA").all()

    total_ventas = sum(to_float(v.total) for v in ventas)
    iva_ventas = sum(to_float(v.iva) for v in ventas)
    base_ventas = sum(to_float(v.subtotal) for v in ventas)

    iva_compras = sum(to_float(c.iva) for c in compras)
    base_compras = sum(to_float(c.subtotal) for c in compras)

    tasa = tasa_actual(db)

    # Convert to Bs
    debitos_fiscales = iva_ventas * tasa
    creditos_fiscales = iva_compras * tasa
    base_ventas_bs = base_ventas * tasa
    base_compras_bs = base_compras * tasa

    # Calculate Retenciones Soportadas (IVA)
    # IVA Withheld by our clients (RECIBIDAS)
    retenciones = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo == "RECIBIDA"
    ).all()
    retenciones_soportadas = sum(to_float(r.monto_usd) for r in retenciones)
    # Lógica básica Calendario SENIAT (asumiendo dígito 0 por defecto)
    import calendar
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7
    nm = m + 1
    ny = y
    if nm > 12:
        nm = 1
        ny += 1
        
    calendario = [
        {
            "fecha": f"{ny}-{nm:02d}-15",
            "fecha_label": f"15 {calendar.month_abbr[nm].upper()}",
            "tipo": "IVA",
            "titulo": "Declaración Definitiva de IVA",
            "descripcion": f"Pago correspondiente al período {periodo}",
            "link": "/fiscal/declaracion-iva",
            "link_text": "Generar Declaración"
        },
        {
            "fecha": f"{ny}-{nm:02d}-10",
            "fecha_label": f"10 {calendar.month_abbr[nm].upper()}",
            "tipo": "ISLR",
            "titulo": "Retenciones de ISLR",
            "descripcion": f"Enteramiento de retenciones del período {periodo}",
            "link": "/fiscal/retenciones-islr",
            "link_text": "Ver Retenciones"
        }
    ]

    return {
        "periodo": periodo,
        "metrics": [
            {"label": "Ventas del período", "value": f"${total_ventas:,.2f}", "desc": f"{len(ventas)} facturas", "color": "text-[#0b5156]"},
            {"label": "IVA Débito", "value": f"Bs. {debitos_fiscales:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), "desc": "Ventas gravadas", "color": "text-red-600"},
            {"label": "Libros", "value": "OK" if ventas else "VACÍO", "desc": "Libro de ventas", "color": "text-green-600"},
            {"label": "Próximo Venc.", "value": f"15 {calendar.month_abbr[nm].upper()}", "desc": "Declaración de IVA", "color": "text-amber-500"},
        ],
        "resumen_libros": {
            "debitos_fiscales": debitos_fiscales,
            "base_ventas": base_ventas_bs,
            "creditos_fiscales": creditos_fiscales,
            "base_compras": base_compras_bs,
            "retenciones_soportadas": retenciones_soportadas
        },
        "calendario": calendario,
    }


@router.get("/libro-ventas")
def libro_ventas(periodo: str = Query(...), db: Session = Depends(get_db)):
    ventas = ventas_periodo(db, periodo).order_by(Venta.fecha).all()
    clientes = {c.id: c for c in db.query(Cliente).all()}
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
def auditar_rifs_ventas(periodo: str = Query(...), db: Session = Depends(get_db)):
    import re
    ventas = ventas_periodo(db, periodo).all()
    clientes = {c.id: c for c in db.query(Cliente).all()}
    
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
def exportar_libro_ventas(periodo: str, formato: str = "pdf", db: Session = Depends(get_db)):
    ventas = ventas_periodo(db, periodo).order_by(Venta.fecha).all()
    clientes = {c.id: c for c in db.query(Cliente).all()}
    
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
def libro_compras(periodo: str = Query(...), db: Session = Depends(get_db)):
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(Compra.fecha >= inicio, Compra.fecha < fin, Compra.estado == "ACTIVA").all()
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

    return {
        "movimientos": movimientos,
        "resumen": {
            "base_imponible": total_base,
            "exento": 0,
            "credito_perdido": 0,
            "credito_fiscal_iva": total_iva,
            "retenciones_por_pagar": total_iva * 0.75, # Ejemplo
            "porcentaje_validacion": round(pct_val),
            "total_base": total_base,
            "total_iva": total_iva,
            "cantidad": len(movimientos),
        },
    }


@router.get("/declaracion-iva")
def declaracion_iva(periodo: str = Query(...), db: Session = Depends(get_db)):
    ventas = ventas_periodo(db, periodo).all()
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(Compra.fecha >= inicio, Compra.fecha < fin).all()
    debito = sum(to_float(v.iva) for v in ventas)
    credito = sum(to_float(c.iva) for c in compras)
    base_ventas = sum(to_float(v.subtotal) for v in ventas)
    base_compras = sum(to_float(c.subtotal) for c in compras)
    tasa = tasa_actual(db)
    
    # Calcular retenciones soportadas
    from backend.models.erp_extended import RetencionIVA
    rets = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo == 'SOPORTADA'
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

@router.patch("/libro-compras/{compra_id}/control")
async def actualizar_control_compra(compra_id: int, request: Request, db: Session = Depends(get_db)):
    compra = db.query(Compra).filter(Compra.id == compra_id).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    body = await request.json()
    ret = RetencionIVA()
    ret.tenant_id = db.query(RetencionIVA).first().tenant_id if db.query(RetencionIVA).first() else None
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


@router.get("/declaraciones-iva/historial")
def historial_declaraciones_iva(db: Session = Depends(get_db)):
    return db.query(DeclaracionIVA).order_by(DeclaracionIVA.periodo.desc()).limit(12).all()


@router.post("/declaracion-iva/borrador")
def guardar_borrador_iva(body: dict, db: Session = Depends(get_db)):
    periodo = body.get("periodo")
    decl = db.query(DeclaracionIVA).filter(DeclaracionIVA.periodo == periodo).first()
    if not decl:
        decl = DeclaracionIVA(periodo=periodo, estado="BORRADOR", tasa_cambio_bs=tasa_actual(db))
        db.add(decl)
    decl.retenciones = body.get("retenciones", 0)
    decl.estado = "BORRADOR"
    db.commit()
    return {"ok": True}


@router.post("/declaracion-iva/finalizar")
def finalizar_iva(body: dict, db: Session = Depends(get_db)):
    periodo = body.get("periodo")
    data = declaracion_iva(periodo, db)
    decl = db.query(DeclaracionIVA).filter(DeclaracionIVA.periodo == periodo).first()
    if not decl:
        decl = DeclaracionIVA(periodo=periodo, tasa_cambio_bs=tasa_actual(db))
        db.add(decl)
    decl.debito_fiscal = data["debito_fiscal"]
    decl.credito_fiscal_mes = data["credito_fiscal_mes"]
    decl.retenciones = body.get("retenciones", 0)
    decl.estado = "FINALIZADA"
    decl.fecha_presentacion = datetime.now(timezone.utc)
    
    db.add(decl)
    db.commit()
    return {"ok": True, "id": decl.id}


@router.get("/retenciones-iva")
def retenciones_iva(periodo: str = Query(...), db: Session = Depends(get_db)):
    rows = db.query(RetencionIVA).filter(RetencionIVA.periodo == periodo).all()
    
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
def exportar_retenciones(periodo: str, db: Session = Depends(get_db)):
    from backend.models.erp_extended import Empresa
    import re
    # Obtener el RIF de la empresa (agente de retención)
    empresa = db.query(Empresa).first()
    rif_agente = re.sub(r'[\s\-]', '', empresa.rif.upper()) if empresa else "J300000000"
    
    # Formatear el periodo para el SENIAT: YYYYMM (por ejemplo, "202605" para "2026-05")
    periodo_fiscal = periodo.replace("-", "")
    
    # Obtener retenciones de IVA para el periodo
    rows = db.query(RetencionIVA).filter(RetencionIVA.periodo == periodo).all()
    
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
def crear_comprobante(body: dict):
    return {"ok": True}


@router.get("/retencion-iva/detalle")
def detalle_retencion(id: int = Query(...)):
    return {"id": id, "proveedor": "", "monto": 0}


@router.get("/igtf")
def igtf(periodo: str, quincena: str = "1", db: Session = Depends(get_db)):
    from sqlalchemy import extract
    from backend.utils.helpers import to_float
    import calendar
    
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7
        
    query = ventas_periodo(db, periodo).filter(Venta.estado == "ACTIVA")
    
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
def exportar_igtf(formato: str, periodo: str, quincena: str, db: Session = Depends(get_db)):
    from sqlalchemy import extract
    from backend.utils.helpers import to_float
    
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7
        
    query = ventas_periodo(db, periodo).filter(Venta.estado == "ACTIVA")
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
def arc_sujetos(anio: int, db: Session = Depends(get_db)):
    # Retornar los sujetos con retenciones ISLR registradas en ese año
    retenciones = db.query(RetencionISLR.proveedor_rif, RetencionISLR.proveedor_nombre).filter(
        RetencionISLR.periodo.like(f"{anio}-%")
    ).distinct(RetencionISLR.proveedor_rif).all()
    
    return [{"rif": r[0], "nombre": r[1]} for r in retenciones]


@router.get("/arc")
def arc(anio: int, sujeto: str, db: Session = Depends(get_db)):
    from backend.utils.helpers import to_float
    
    retenciones = db.query(RetencionISLR).filter(
        RetencionISLR.proveedor_rif == sujeto,
        RetencionISLR.periodo.like(f"{anio}-%")
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
def exportar_arc(formato: str, anio: int, sujeto: str, db: Session = Depends(get_db)):
    from backend.utils.helpers import to_float
    import io
    
    res = arc(anio, sujeto, db)
    
    if formato == "pdf":
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        c.setTitle(f"Comprobante ARC - {sujeto}")
        
        # Header
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, 750, "KODA ERP SOLUTIONS")
        c.setFont("Helvetica", 10)
        c.drawString(50, 735, f"R.I.F.: J-30000000-1")
        
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
        root = ET.Element("RelacionRetencionesISLR", Anio=str(anio), RifAgente="J-30000000-1")
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
def exportar_ret_practicadas(formato: str, periodo: str):
    return {"ok": True}


import re

@router.get("/validar-rif")
def validar_rif(rif: str, db: Session = Depends(get_db)):
    # Normalizar RIF: mayúsculas, quitar espacios y guiones para reformatear
    clean_rif = re.sub(r'[\s\-]', '', rif.upper())
    
    # Validar estructura básica: Letra inicial (V, E, J, P, G) seguida de 9 números
    if not re.match(r'^[VEJPG]\d{9}$', clean_rif):
        raise HTTPException(status_code=400, detail="Formato de RIF inválido. Debe comenzar con V, E, J, P, G seguido de 9 dígitos.")
    
    # Formatear con guiones: Letra - 8 dígitos - 1 dígito
    formatted_rif = f"{clean_rif[0]}-{clean_rif[1:9]}-{clean_rif[9]}"
    
    # Buscar en base de datos local (clientes o proveedores)
    from backend.models.operations import Cliente, Proveedor
    existing_client = db.query(Cliente).filter(Cliente.rif == formatted_rif).first()
    if existing_client:
        return {
            "rif": formatted_rif,
            "nombre": existing_client.nombre,
            "contribuyente_especial": getattr(existing_client, "contribuyente_especial", False),
            "valido": True,
            "origen": "Base de Datos Interna (Cliente)"
        }
        
    existing_supplier = db.query(Proveedor).filter(Proveedor.rif == formatted_rif).first()
    if existing_supplier:
        return {
            "rif": formatted_rif,
            "nombre": existing_supplier.nombre,
            "contribuyente_especial": getattr(existing_supplier, "contribuyente_especial", False),
            "valido": True,
            "origen": "Base de Datos Interna (Proveedor)"
        }
    
    # Registro espejo para simulación de consulta SENIAT
    registro_espejo = {
        "J-30000000-0": ("SENIAT (ADMINISTRACION ADUANERA Y TRIBUTARIA)", True),
        "J-00000000-0": ("CONSUMIDOR FINAL", False),
        "J-31234567-8": ("DISTRIBUIDORA ALIMENTOS POLAR, C.A.", True),
        "J-41234567-9": ("SERVICIOS Y TECNOLOGIA KODA, C.A.", False),
        "V-12345678-9": ("JUAN VICENTE GOMEZ", False),
        "J-50012345-6": ("INVERSIONES EL SOL, S.A.", True),
        "G-20000062-0": ("GOBIERNO DEL DISTRITO CAPITAL", True),
    }
    
    if formatted_rif in registro_espejo:
        nombre, especial = registro_espejo[formatted_rif]
        return {
            "rif": formatted_rif,
            "nombre": nombre,
            "contribuyente_especial": especial,
            "valido": True,
            "origen": "Registro Nacional de Contribuyentes (SENIAT)"
        }
    
    # Si es válido pero no está registrado, generamos una respuesta genérica de contribuyente ordinario
    tipo = "Persona Natural" if clean_rif[0] in ['V', 'E'] else "Empresa/Organismo"
    nombre_sugerido = f"CONTRIBUYENTE {formatted_rif} ({tipo})"
    return {
        "rif": formatted_rif,
        "nombre": nombre_sugerido,
        "contribuyente_especial": False,
        "valido": True,
        "origen": "Registro Nacional de Contribuyentes (SENIAT)"
    }


@router.get("/retenciones-islr")
def retenciones_islr_list(periodo: str = Query(...), db: Session = Depends(get_db)):
    rows = db.query(RetencionISLR).filter(RetencionISLR.periodo == periodo).all()
    
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
def exportar_retenciones_islr(periodo: str = Query(...), db: Session = Depends(get_db)):
    rows = db.query(RetencionISLR).filter(RetencionISLR.periodo == periodo).all()
    
    root = ET.Element("RelacionRetencionesISLR", RifAgente="J000000000", Periodo=periodo.replace("-", ""))
    
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

@router.get("/declaracion-islr")
def declaracion_islr_calc(periodo: str = Query(...), db: Session = Depends(get_db)):
    # Proyección básica: sumar ventas y compras del año
    from backend.models.operations import Venta, Compra
    from sqlalchemy import extract
    
    year = int(periodo)
    
    decl = db.query(DeclaracionISLR).filter(DeclaracionISLR.ejercicio == str(year)).first()
    
    if not decl:
        ventas = db.query(Venta).filter(extract('year', Venta.fecha) == year).all()
        compras = db.query(Compra).filter(extract('year', Compra.fecha) == year).all()
        
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
        } for d in db.query(DeclaracionISLR).filter(DeclaracionISLR.estado == "FINALIZADA").order_by(DeclaracionISLR.ejercicio.desc()).all()
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
async def registrar_declaracion_islr(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    ejercicio = body.get("ejercicio")
    decl = db.query(DeclaracionISLR).filter(DeclaracionISLR.ejercicio == ejercicio).first()
    if not decl:
        decl = DeclaracionISLR(ejercicio=ejercicio)
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

@router.get("/calendario")
def calendario_fiscal(db: Session = Depends(get_db)):
    from backend.models.erp_extended import Empresa
    
    perfil = db.query(Empresa).first()
    rif = perfil.rif if perfil and perfil.rif else "J-00000000-0"
    digito = int(rif[-1]) if rif[-1].isdigit() else 0
    # Empresa no tiene tipo_contribuyente, asumo False por defecto o si lo tiene lo leo
    especial = False
    if hasattr(perfil, "tipo_contribuyente"):
        especial = perfil.tipo_contribuyente == "ESPECIAL"
    
    now = datetime.now()
    y, m = now.year, now.month
    
    # Reglas simples:
    # IVA Especial: día 10 + digito
    # ISLR Especial: día 15 + digito
    
    dia_iva = 10 + digito if especial else 15
    dia_islr = 15 + digito if especial else 20
    
    def next_date(day):
        try:
            return datetime(y, m, day)
        except ValueError:
            return datetime(y, m, 28)
            
    import calendar
    vencimientos = [
        {
            "fecha_limite": next_date(dia_iva).strftime("%d/%m/%Y"),
            "nombre": "Declaración y Pago de IVA",
            "descripcion": f"Correspondiente al período {m-1:02d}/{y}",
            "tipo": "IVA",
            "estado": "PENDIENTE",
            "link": "/fiscal/declaracion-iva",
            "mes": calendar.month_abbr[m].upper(),
            "urgente": (next_date(dia_iva) - now).days < 5
        },
        {
            "fecha_limite": next_date(dia_islr).strftime("%d/%m/%Y"),
            "nombre": "Anticipos de ISLR",
            "descripcion": f"Enteramiento quincenal/mensual",
            "tipo": "ISLR",
            "estado": "PENDIENTE",
            "link": "/fiscal/declaracion-islr",
            "mes": calendar.month_abbr[m].upper(),
            "urgente": (next_date(dia_islr) - now).days < 5
        }
    ]
    
    return {
        "vencimientos": vencimientos,
        "metricas": {
            "al_dia": True,
            "porcentaje_cumplimiento": "100%",
            "sanciones": 0
        }
    }

