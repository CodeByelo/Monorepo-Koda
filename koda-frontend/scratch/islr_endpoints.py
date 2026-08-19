@router.get("/retenciones-islr")
def retenciones_islr_list(periodo: str = Query(...), db: Session = Depends(get_db)):
    rows = db.query(RetencionISLR).filter(RetencionISLR.periodo == periodo).all()
    
    retenciones = []
    honorarios_total = 0
    fletes_total = 0
    servicios_total = 0
    
    for r in rows:
        monto = to_float(r.monto_usd)
        retenciones.append({
            "id": str(r.id),
            "date": r.fecha.strftime("%d/%m/%Y") if hasattr(r, 'fecha') else "01/01/2026",
            "doc": r.numero_factura,
            "provider": r.proveedor_nombre,
            "provider_rif": r.proveedor_rif,
            "concept": "Honorarios Profesionales" if r.concepto_codigo == "001" else ("Fletes" if r.concepto_codigo == "002" else "Servicios"),
            "base": to_float(r.base_usd),
            "pct": float(r.alicuota) * 100,
            "retained": monto,
            "status": r.estado
        })
        
        if r.concepto_codigo == "001":
            honorarios_total += monto
        elif r.concepto_codigo == "002":
            fletes_total += monto
        else:
            servicios_total += monto
            
    return {
        "periodo": periodo,
        "metricas": {
            "honorarios_total": honorarios_total,
            "fletes_total": fletes_total,
            "servicios_total": servicios_total
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
def declaracion_islr_calc(ejercicio: str = Query(...), db: Session = Depends(get_db)):
    # Proyección básica: sumar ventas y compras del año
    from backend.models.operations import Venta, Compra
    from sqlalchemy import extract
    
    # Try to find existing
    decl = db.query(DeclaracionISLR).filter(DeclaracionISLR.ejercicio == ejercicio).first()
    if decl:
        return {
            "ejercicio": decl.ejercicio,
            "ingresos_brutos": to_float(decl.ingresos_brutos),
            "costos_ventas": to_float(decl.costos_ventas),
            "deducciones": to_float(decl.deducciones),
            "enriquecimiento_neto": to_float(decl.enriquecimiento_neto),
            "impuesto_determinado": to_float(decl.impuesto_determinado),
            "retenciones_aplicables": to_float(decl.retenciones_aplicables),
            "islr_pagado": to_float(decl.islr_pagado),
            "estado": decl.estado,
            "historial": [
                {
                    "ejercicio": d.ejercicio,
                    "enriquecimiento_neto": to_float(d.enriquecimiento_neto),
                    "islr_pagado": to_float(d.islr_pagado),
                    "fecha_presentacion": d.fecha_presentacion.strftime("%d/%m/%Y") if d.fecha_presentacion else "N/A",
                    "estado": d.estado
                } for d in db.query(DeclaracionISLR).filter(DeclaracionISLR.estado == "FINALIZADA").all()
            ]
        }
    
    # Calculate
    year = int(ejercicio)
    ventas = db.query(Venta).filter(extract('year', Venta.fecha) == year).all()
    compras = db.query(Compra).filter(extract('year', Compra.fecha) == year).all()
    
    ingresos = sum(to_float(v.subtotal) for v in ventas)
    costos = sum(to_float(c.subtotal) for c in compras)
    deducciones = 0.0
    enriquecimiento = ingresos - costos - deducciones
    if enriquecimiento < 0: enriquecimiento = 0
    impuesto = enriquecimiento * 0.34 # Tarifa corporativa simple
    
    historial = [
        {
            "ejercicio": d.ejercicio,
            "enriquecimiento_neto": to_float(d.enriquecimiento_neto),
            "islr_pagado": to_float(d.islr_pagado),
            "fecha_presentacion": d.fecha_presentacion.strftime("%d/%m/%Y") if d.fecha_presentacion else "N/A",
            "estado": d.estado
        } for d in db.query(DeclaracionISLR).filter(DeclaracionISLR.estado == "FINALIZADA").all()
    ]
    
    return {
        "ejercicio": ejercicio,
        "ingresos_brutos": ingresos,
        "costos_ventas": costos,
        "deducciones": deducciones,
        "enriquecimiento_neto": enriquecimiento,
        "impuesto_determinado": impuesto,
        "retenciones_aplicables": 0,
        "islr_pagado": impuesto,
        "estado": "PROYECCION",
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
    from backend.models.accounting import EmpresaPerfil
    
    perfil = db.query(EmpresaPerfil).first()
    rif = perfil.rif if perfil and perfil.rif else "J-00000000-0"
    digito = int(rif[-1]) if rif[-1].isdigit() else 0
    especial = perfil.tipo_contribuyente == "ESPECIAL" if perfil else False
    
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
            
    vencimientos = [
        {
            "fecha": next_date(dia_iva).strftime("%Y-%m-%d"),
            "titulo": "Declaración y Pago de IVA",
            "descripcion": f"Correspondiente al período {m-1:02d}/{y}",
            "tipo": "IVA",
            "estado": "PENDIENTE",
            "link": "/fiscal/declaracion-iva"
        },
        {
            "fecha": next_date(dia_islr).strftime("%Y-%m-%d"),
            "titulo": "Anticipos de ISLR",
            "descripcion": f"Enteramiento quincenal/mensual",
            "tipo": "ISLR",
            "estado": "PENDIENTE",
            "link": "/fiscal/declaracion-islr"
        }
    ]
    
    # Ordenar por fecha
    vencimientos.sort(key=lambda x: x["fecha"])
    
    return {
        "vencimientos": vencimientos,
        "metricas": {
            "al_dia": True,
            "sanciones": 0
        }
    }
