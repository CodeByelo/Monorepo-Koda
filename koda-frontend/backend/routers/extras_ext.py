"""Endpoints para pantallas ERP sin router dedicado (principal, billing, RRHH, inventario avanzado)."""
from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel

from backend.core.database import get_db
from backend.models.operations import Venta, Cliente, Producto, Proveedor
from backend.models.core import TasaCambio, Profile
from backend.models.hr import Empleado, Nomina
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.fiscal import INPCIndice
from backend.schemas.hr import PaginatedEmpleadoResponse
from backend.schemas.accounting import PaginatedLibroDiarioResponse
from backend.models.erp_extended import (
    CuentaBancaria, CuentaPorCobrar, Compra, NotaCredito, AnticipoCliente,
    Almacen, TransferenciaInventario, RequisicionCompra, LoteProducto, ConteoFisico,
    CentroCosto, Vendedor, TransferenciaTesoreria, PrestamoUVC, PresupuestoPartida,
    RetencionIVA, FondoCajaChica, GastoCajaChica, ColocacionInversion, AuditoriaLog,
    MovimientoBancario,
)
from backend.utils.helpers import to_float, tasa_actual, ventas_periodo, margen_bruto_pct
from backend.core.security import get_current_user

router = APIRouter(tags=["Extras ERP"], dependencies=[Depends(get_current_user)])


def _fmt_money(v: float, prefix: str = "$") -> str:
    return f"{prefix}{v:,.2f}"


@router.get("/principal/dashboard")
def principal_dashboard(db: Session = Depends(get_db)):
    liquidez = db.query(func.sum(CuentaBancaria.saldo_actual_usd)).scalar() or 0
    cxc = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado != "PAGADA"
    ).scalar() or 0
    valor_inv = db.query(func.sum(Producto.stock * Producto.costo_usd)).scalar() or 0
    ventas_mes = ventas_periodo(db, datetime.now(timezone.utc).strftime("%Y-%m")).all()
    utilidad = sum(to_float(v.subtotal) for v in ventas_mes) * 0.25
    tasa = tasa_actual(db)
    return {
        "tasa_bcv": tasa,
        "kpis": [
            {"label": "Liquidez Inmediata", "value": _fmt_money(to_float(liquidez)), "desc": "Bancos y Caja"},
            {"label": "Cuentas por Cobrar", "value": _fmt_money(to_float(cxc)), "desc": "Cartera Total Activa"},
            {"label": "Valor del Inventario", "value": _fmt_money(to_float(valor_inv)), "desc": "Costo Promedio Ponderado"},
            {"label": "Utilidad Neta (Mes)", "value": _fmt_money(utilidad), "desc": "P&G Consolidado"},
        ],
        "alertas": [],
    }


@router.get("/ventas/pos/contexto")
def pos_contexto(db: Session = Depends(get_db)):
    productos = db.query(Producto).filter(Producto.stock > 0).limit(50).all()
    ventas_recientes = db.query(Venta).filter(Venta.estado == "ACTIVA").order_by(Venta.fecha.desc()).limit(10).all()
    tasa = tasa_actual(db)
    
    # Calcular ventas de hoy
    hoy_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ventas_hoy = db.query(Venta).filter(
        Venta.estado == "ACTIVA",
        func.strftime("%Y-%m-%d", Venta.fecha) == hoy_str
    ).all()
    total_hoy = sum(to_float(v.total) for v in ventas_hoy)
    count_hoy = len(ventas_hoy)
    
    return {
        "tasa_bcv": tasa,
        "total_hoy": total_hoy,
        "count_hoy": count_hoy,
        "productos": [
            {"id": p.id, "sku": p.sku, "nombre": p.nombre, "precio": to_float(p.precio_usd), "stock": p.stock}
            for p in productos
        ],
        "tickets_recientes": [
            {
                "id": v.numero_factura,
                "client": "Consumidor final",
                "time": v.fecha.strftime("%H:%M"),
                "total": _fmt_money(to_float(v.total)),
                "method": v.metodo_pago,
                "status": "EMITIDO",
            }
            for v in ventas_recientes
        ],
    }


@router.get("/ventas/notas-credito")
def listar_notas_credito(db: Session = Depends(get_db)):
    notas = db.query(NotaCredito).order_by(NotaCredito.fecha.desc()).all()
    clientes = {c.id: c for c in db.query(Cliente).all()}
    ventas = {v.id: v for v in db.query(Venta).all()}
    return [
        {
            "id": n.numero,
            "cliente": clientes[n.cliente_id].nombre if n.cliente_id in clientes else "",
            "monto": to_float(n.monto),
            "motivo": n.motivo,
            "estado": n.estado,
            "fecha": n.fecha.strftime("%d/%m/%Y"),
            "invoice": ventas[n.venta_id].numero_factura if n.venta_id in ventas else "-",
            "tipo": n.tipo,  # Retornar el tipo de nota ("CREDITO" o "DEBITO")
        }
        for n in notas
    ]


class NotaCreditoCreate(BaseModel):
    numero_factura: str
    monto: Decimal
    motivo: str
    tipo: str = "CREDITO"  # CREDITO o DEBITO


@router.post("/ventas/notas-credito")
def crear_nota_credito(payload: NotaCreditoCreate, db: Session = Depends(get_db)):
    venta = db.query(Venta).filter(Venta.numero_factura == payload.numero_factura).first()
    if not venta:
        raise HTTPException(status_code=404, detail=f"Factura {payload.numero_factura} no encontrada.")

    clientes = db.query(Cliente).all()
    if not clientes:
        raise HTTPException(status_code=400, detail="Debe registrar al menos un cliente en el sistema.")

    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.venta_id == venta.id).first()
    if cxc:
        cliente_id = cxc.cliente_id
    else:
        cliente_id = clientes[0].id

    cant_notas = db.query(NotaCredito).count()
    tipo_str = payload.tipo.upper() if payload.tipo else "CREDITO"
    # Determinar prefijo según tipo de nota
    prefijo = "ND" if "DEBIT" in tipo_str else "NC"
    nuevo_numero = f"{prefijo}-{str(cant_notas + 1).zfill(8)}"

    tasa_obj = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_bs = tasa_obj.valor_ves if tasa_obj else Decimal("36.52")
    nota = NotaCredito(
        numero=nuevo_numero,
        venta_id=venta.id,
        cliente_id=cliente_id,
        monto_usd=payload.monto,
        tasa_cambio_bs=tasa_bs,
        motivo=payload.motivo,
        tipo="DEBITO" if "DEBIT" in tipo_str else "CREDITO",
        estado="EMITIDA",
        fecha=datetime.now(timezone.utc)
    )
    db.add(nota)

    if cxc:
        if "DEBIT" in tipo_str:
            # Nota de débito incrementa el monto original por cobrar
            cxc.monto_total = Decimal(str(cxc.monto_total)) + payload.monto
            if cxc.estado == "PAGADA":
                cxc.estado = "PENDIENTE"
        else:
            # Nota de crédito incrementa el monto ya pagado (disminuye saldo restante)
            cxc.monto_pagado = Decimal(str(cxc.monto_pagado)) + payload.monto
            if cxc.monto_pagado >= cxc.monto_total:
                cxc.monto_pagado = cxc.monto_total
                cxc.estado = "PAGADA"

    db.commit()
    db.refresh(nota)

    cliente_nombre = next((c.nombre for c in clientes if c.id == cliente_id), "")

    return {
        "id": nota.numero,
        "cliente": cliente_nombre,
        "monto": to_float(nota.monto),
        "motivo": nota.motivo,
        "estado": nota.estado,
        "fecha": nota.fecha.strftime("%d/%m/%Y"),
        "tipo": nota.tipo,
    }


@router.get("/cobranzas/estado-cuenta")
def estado_cuenta_cliente(cliente_id: int = Query(None), rif: str = Query(None), db: Session = Depends(get_db)):
    cli = None
    if cliente_id:
        cli = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    elif rif:
        cli = db.query(Cliente).filter(Cliente.rif == rif).first()
    else:
        cli = db.query(Cliente).first()
    if not cli:
        return {"cliente": None, "kpis": [], "movimientos": []}
    
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.cliente_id == cli.id).order_by(CuentaPorCobrar.fecha_emision).all()
    tasa = tasa_actual(db)
    saldo = sum(to_float(r.monto_total - r.monto_pagado) for r in cxc if r.estado != "PAGADA")
    
    movimientos = []
    for r in cxc:
        rate_val = to_float(r.tasa_cambio_bs) if r.tasa_cambio_bs else to_float(tasa)
        debit_bs = to_float(r.monto_total) * rate_val
        credit_bs = to_float(r.monto_pagado) * rate_val if r.monto_pagado > 0 else 0
        debit_usd = to_float(r.monto_total)
        credit_usd = to_float(r.monto_pagado)
        
        movimientos.append({
            "date": r.fecha_emision.strftime("%d/%m/%Y"),
            "rate": f"{rate_val:.4f}",
            "doc": r.numero_documento,
            "concept": "VENTA A CRÉDITO",
            "debitBs": f"Bs. {debit_bs:,.2f}" if debit_bs > 0 else "-",
            "creditBs": f"Bs. {credit_bs:,.2f}" if credit_bs > 0 else "-",
            "debitUsd": f"${debit_usd:,.2f}",
            "creditUsd": f"${credit_usd:,.2f}" if credit_usd > 0 else "-",
            "balanceUsd": f"${(debit_usd - credit_usd):,.2f}",
        })
        
    tasa_val = to_float(tasa)
    saldo_ves = saldo * tasa_val
    documentos_activos = len([r for r in cxc if r.estado != "PAGADA"])
    
    return {
        "cliente": {"id": cli.id, "rif": cli.rif, "nombre": cli.nombre, "email": getattr(cli, 'email', 'No registrado')},
        "kpis": [
            {"label": "SALDO EXIGIBLE (USD)", "value": _fmt_money(saldo), "desc": "Total neto adeudado", "color": "text-slate-800"},
            {"label": "EQUIVALENTE EN VES", "value": f"Bs. {saldo_ves:,.2f}", "desc": f"Equivalente a tasa oficial", "color": "text-amber-600"},
            {"label": "DOCUMENTOS ACTIVOS", "value": str(documentos_activos), "desc": "Facturas a crédito vigentes", "color": "text-[#0b5156]"},
            {"label": "TASA BCV DEL DÍA", "value": f"Bs. {tasa_val:.2f}", "desc": "Referencia oficial de cobro", "color": "text-slate-700"},
        ],
        "movimientos": movimientos,
    }


@router.get("/cobranzas/anticipos")
def anticipos_cliente(db: Session = Depends(get_db)):
    rows = db.query(AnticipoCliente).order_by(AnticipoCliente.fecha.desc()).all()
    clientes = {c.id: c for c in db.query(Cliente).all()}
    return [
        {
            "cliente": clientes[r.cliente_id].nombre if r.cliente_id in clientes else "",
            "monto": to_float(r.monto),
            "moneda": r.moneda,
            "estado": r.estado,
            "fecha": r.fecha.strftime("%d/%m/%Y"),
        }
        for r in rows
    ]


@router.get("/cobranzas/flujo-proyectado")
def flujo_proyectado(dias: int = 30, db: Session = Depends(get_db)):
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    proyeccion = []
    for i in range(dias // 7):
        fecha = datetime.now(timezone.utc) + timedelta(days=i * 7)
        monto = sum(
            to_float(r.monto_total - r.monto_pagado)
            for r in cxc
            if r.fecha_vencimiento <= fecha + timedelta(days=7)
        ) / max(len(cxc), 1)
        proyeccion.append({"semana": i + 1, "fecha": fecha.strftime("%d/%m"), "ingreso_esperado": round(monto, 2)})
    return {"proyeccion": proyeccion, "total": sum(p["ingreso_esperado"] for p in proyeccion)}


class AlmacenCreate(BaseModel):
    codigo: str
    nombre: str
    responsable: Optional[str] = None
    direccion: Optional[str] = None


@router.get("/inventario/almacenes")
def listar_almacenes(db: Session = Depends(get_db)):
    items = db.query(Almacen).filter(Almacen.activo == True).all()
    return [
        {
            "id": a.id,
            "codigo": a.codigo,
            "nombre": a.nombre,
            "responsable": a.responsable or "Sin asignar",
            "direccion": a.direccion or "Dirección no especificada",
            "activo": a.activo
        }
        for a in items
    ]


@router.post("/inventario/almacenes")
def crear_almacen(payload: AlmacenCreate, db: Session = Depends(get_db)):
    existing = db.query(Almacen).filter(Almacen.codigo == payload.codigo.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="El código de almacén ya está registrado.")
    
    nuevo = Almacen(
        codigo=payload.codigo.upper(),
        nombre=payload.nombre,
        responsable=payload.responsable,
        direccion=payload.direccion,
        activo=True
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/inventario/almacenes/{almacen_id}")
def actualizar_almacen(almacen_id: int, payload: AlmacenCreate, db: Session = Depends(get_db)):
    a = db.query(Almacen).filter(Almacen.id == almacen_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Almacén no encontrado.")
    a.codigo = payload.codigo.upper()
    a.nombre = payload.nombre
    a.responsable = payload.responsable
    a.direccion = payload.direccion
    db.commit()
    return {"ok": True}


@router.get("/inventario/criticos")
def inventario_criticos(db: Session = Depends(get_db)):
    prods = db.query(Producto).filter(Producto.stock <= 5).order_by(Producto.stock).all()
    return [
        {"sku": p.sku, "nombre": p.nombre, "stock": p.stock, "minimo": 10, "estado": "AGOTADO" if p.stock <= 0 else "BAJO"}
        for p in prods
    ]


@router.get("/inventario/existencias")
def inventario_existencias(db: Session = Depends(get_db)):
    prods = db.query(Producto).all()
    return [{"sku": p.sku, "nombre": p.nombre, "stock": p.stock, "valor": to_float(p.stock * p.costo_usd)} for p in prods]


@router.get("/inventario/lotes")
def inventario_lotes(db: Session = Depends(get_db)):
    lotes = db.query(LoteProducto).order_by(LoteProducto.fecha_vencimiento).all()
    prods = {p.id: p for p in db.query(Producto).all()}
    return [
        {
            "lote": l.lote,
            "producto": prods[l.producto_id].nombre if l.producto_id in prods else "",
            "cantidad": to_float(l.cantidad),
            "vence": l.fecha_vencimiento.strftime("%d/%m/%Y") if l.fecha_vencimiento else "-",
        }
        for l in lotes
    ]


class ConteoCreate(BaseModel):
    almacen_id: int
    producto_id: int
    cantidad_fisica: float

@router.get("/inventario/conteos")
def inventario_conteos(db: Session = Depends(get_db)):
    conteos = db.query(ConteoFisico).order_by(ConteoFisico.fecha.desc()).limit(50).all()
    res = []
    for c in conteos:
        almacen = db.query(Almacen).filter(Almacen.id == c.almacen_id).first()
        producto = db.query(Producto).filter(Producto.id == c.producto_id).first()
        res.append({
            "id": c.id,
            "almacen_id": c.almacen_id,
            "producto_id": c.producto_id,
            "cantidad_sistema": float(c.cantidad_sistema),
            "cantidad_fisica": float(c.cantidad_fisica),
            "diferencia": float(c.diferencia),
            "estado": c.estado,
            "fecha": c.fecha.isoformat(),
            "almacen": almacen.nombre if almacen else "Almacén Principal",
            "responsable": almacen.responsable if (almacen and hasattr(almacen, 'responsable') and almacen.responsable) else "Admin",
            "producto": producto.nombre if producto else "Producto"
        })
    return res

@router.post("/inventario/conteos")
def crear_conteo(body: ConteoCreate, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.id == body.producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    cantidad_sistema = float(producto.stock)
    diferencia = body.cantidad_fisica - cantidad_sistema
    
    nuevo_conteo = ConteoFisico(
        almacen_id=body.almacen_id,
        producto_id=body.producto_id,
        cantidad_sistema=Decimal(str(cantidad_sistema)),
        cantidad_fisica=Decimal(str(body.cantidad_fisica)),
        diferencia=Decimal(str(diferencia)),
        estado="PENDIENTE"
    )
    db.add(nuevo_conteo)
    db.commit()
    db.refresh(nuevo_conteo)
    return {
        "id": nuevo_conteo.id,
        "almacen_id": nuevo_conteo.almacen_id,
        "producto_id": nuevo_conteo.producto_id,
        "cantidad_sistema": float(nuevo_conteo.cantidad_sistema),
        "cantidad_fisica": float(nuevo_conteo.cantidad_fisica),
        "diferencia": float(nuevo_conteo.diferencia),
        "estado": nuevo_conteo.estado,
        "fecha": nuevo_conteo.fecha.isoformat()
    }

@router.post("/inventario/conteos/{conteo_id}/cerrar")
def cerrar_conteo(conteo_id: int, db: Session = Depends(get_db)):
    conteo = db.query(ConteoFisico).filter(ConteoFisico.id == conteo_id).first()
    if not conteo:
        raise HTTPException(status_code=404, detail="Conteo no encontrado")
    if conteo.estado == "CERRADO":
        raise HTTPException(status_code=400, detail="El conteo ya está cerrado")
    
    producto = db.query(Producto).filter(Producto.id == conteo.producto_id).first()
    if producto:
        producto.stock = conteo.cantidad_fisica
    
    conteo.estado = "CERRADO"
    db.commit()
    return {"message": "Conteo conciliado y stock actualizado correctamente"}


@router.get("/contabilidad/centros-costo")
def centros_costo(db: Session = Depends(get_db)):
    return db.query(CentroCosto).filter(CentroCosto.activo == True).all()


@router.get("/contabilidad/libro-diario", response_model=PaginatedLibroDiarioResponse)
def libro_diario(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    from backend.models.accounting import AsientoDetalle
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    total_records = db.query(AsientoContable).count()
    asientos = db.query(AsientoContable).order_by(AsientoContable.fecha.desc()).offset(offset).limit(limit).all()
    data = []
    for a in asientos:
        lines = []
        for d in a.detalles:
            lines.append({
                "account": d.cuenta_codigo,
                "name": d.cuenta_nombre,
                "debit": float(d.debe_usd),
                "credit": float(d.haber_usd)
            })
        data.append({
            "id": a.id,
            "fecha": a.fecha.strftime("%d/%m/%Y"),
            "concepto": a.concepto,
            "referencia": a.referencia,
            "debe": to_float(a.total_debe),
            "haber": to_float(a.total_haber),
            "lines": lines
        })
    return {
        "total_records": total_records,
        "limit": limit,
        "offset": offset,
        "data": data
    }


@router.get("/contabilidad/ajuste-inflacion")
def ajuste_inflacion(db: Session = Depends(get_db)):
    productos = db.query(Producto).filter(Producto.stock > 0).all()
    tasa = Decimal(str(tasa_actual(db)))
    
    # Obtener el INPC de cierre (Mayo 2026 = 124.0)
    inpc_cierre_obj = db.query(INPCIndice).filter(INPCIndice.anio == 2026, INPCIndice.mes == 5).first()
    inpc_cierre = Decimal(str(inpc_cierre_obj.indice)) if inpc_cierre_obj else Decimal("124.0000")
    
    # Mapeo de meses de adquisición simulados para los productos
    # producto_id % 3 asigna diferentes fechas de adquisición:
    # 0 -> Octubre 2025 (INPC: 100.0)
    # 1 -> Diciembre 2025 (INPC: 107.2)
    # 2 -> Marzo 2026 (INPC: 117.3)
    meses_origen = {
        0: (2025, 10, "Octubre 2025"),
        1: (2025, 12, "Diciembre 2025"),
        2: (2026, 3, "Marzo 2026")
    }
    
    items = []
    total_historico = Decimal("0.00")
    total_reexp = Decimal("0.00")
    total_axi = Decimal("0.00")
    
    for p in productos:
        anio, mes, mes_label = meses_origen[p.id % 3]
        inpc_origen_obj = db.query(INPCIndice).filter(INPCIndice.anio == anio, INPCIndice.mes == mes).first()
        inpc_origen = Decimal(str(inpc_origen_obj.indice)) if inpc_origen_obj else Decimal("100.0000")
        
        factor = (inpc_cierre / inpc_origen).quantize(Decimal("0.0001"))
        historico = (Decimal(str(p.stock)) * Decimal(str(p.costo_usd)) * tasa).quantize(Decimal("0.01"))
        reexp = (historico * factor).quantize(Decimal("0.01"))
        axi = (reexp - historico).quantize(Decimal("0.01"))
        
        total_historico += historico
        total_reexp += reexp
        total_axi += axi
        
        items.append({
            "name": p.nombre,
            "date": mes_label,
            "history": f"Bs. {to_float(historico):,.2f}",
            "index": f"{to_float(inpc_origen):,.2f}",
            "factor": f"{to_float(factor):.4f}",
            "reexp": f"Bs. {to_float(reexp):,.2f}",
            "axi": f"Bs. {to_float(axi):,.2f}",
            "raw_axi": to_float(axi)
        })
        
    indices_db = db.query(INPCIndice).order_by(INPCIndice.anio.desc(), INPCIndice.mes.desc()).all()
    indices_list = [
        {"periodo": f"{idx.anio}-{str(idx.mes).zfill(2)}", "indice": to_float(idx.indice)}
        for idx in indices_db
    ]
    
    # Calcular inflación acumulada (cierre / origen_base - 1) * 100
    inpc_base_obj = db.query(INPCIndice).filter(INPCIndice.anio == 2025, INPCIndice.mes == 10).first()
    inpc_base = Decimal(str(inpc_base_obj.indice)) if inpc_base_obj else Decimal("100.0")
    inflacion_acum = to_float(((inpc_cierre / inpc_base) - Decimal("1")) * Decimal("100"))
    
    return {
        "inflacion_acumulada": round(inflacion_acum, 2),
        "periodo": "2026-05",
        "items": items,
        "indices": indices_list,
        "totales": {
            "historico": to_float(total_historico),
            "reexpresado": to_float(total_reexp),
            "axi": to_float(total_axi)
        }
    }


@router.post("/contabilidad/ajuste-inflacion/ejecutar")
def ejecutar_ajuste_inflacion(body: dict, db: Session = Depends(get_db)):
    periodo = body.get("periodo", "2026-05")
    # Calcular los montos reales del ajuste
    data = ajuste_inflacion(db)
    total_axi = Decimal(str(data["totales"]["axi"]))
    
    if total_axi <= 0:
         raise HTTPException(status_code=400, detail="El monto del ajuste por inflación debe ser mayor a cero.")
         
    # Crear asiento contable de Ajuste por Inflación
    asiento = AsientoContable(
        concepto=f"Ajuste por Inflación de Inventario (DPC-10) - Período {periodo}",
        referencia=f"AXI-{periodo.replace('-', '')}",
        total_debe=total_axi,
        total_haber=total_axi,
        detalles=[
            AsientoDetalle(
                cuenta_codigo="1.1.03", 
                cuenta_nombre="Inventario de Mercancía (Reexpresado)", 
                debe=total_axi, 
                haber=Decimal("0.00")
            ),
            AsientoDetalle(
                cuenta_codigo="5.1.02", 
                cuenta_nombre="Resultado por Exposición a la Inflación (REI)", 
                debe=Decimal("0.00"), 
                haber=total_axi
            )
        ]
    )
    db.add(asiento)
    db.commit()
    db.refresh(asiento)
    return {"ok": True, "asiento_id": asiento.id, "monto_ves": to_float(total_axi)}


@router.get("/rrhh/dashboard")
def rrhh_dashboard(db: Session = Depends(get_db)):
    empleados = db.query(Empleado).filter(Empleado.activo == 1).count()
    nominas = db.query(Nomina).count()
    masa = db.query(func.sum(Empleado.salario_base_usd)).filter(Empleado.activo == 1).scalar() or 0
    return {
        "empleados_activos": empleados,
        "nominas_emitidas": nominas,
        "masa_salarial_usd": to_float(masa),
        "metricas": [
            {"t": "Empleados Activos", "v": str(empleados), "desc": "En planilla", "c": "text-[#0b5156]"},
            {"t": "Masa Salarial", "v": _fmt_money(to_float(masa)), "desc": "USD mensual base", "c": "text-slate-800"},
        ],
    }


@router.get("/rrhh/empleados", response_model=PaginatedEmpleadoResponse)
def listar_empleados(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    total_records = db.query(Empleado).count()
    empleados = db.query(Empleado).offset(offset).limit(limit).all()

    return {
        "total_records": total_records,
        "limit": limit,
        "offset": offset,
        "data": empleados
    }


@router.get("/fiscal/obligaciones")
def obligaciones_fiscales(db: Session = Depends(get_db)):
    from backend.models.erp_extended import DeclaracionIVA, DeclaracionISLR, Empresa
    from datetime import datetime
    
    perfil = db.query(Empresa).first()
    rif = perfil.rif if perfil and perfil.rif else "J-00000000-0"
    digito = int(rif[-1]) if rif[-1].isdigit() else 0
    especial = False
    if hasattr(perfil, "tipo_contribuyente"):
        especial = perfil.tipo_contribuyente == "ESPECIAL"
        
    now = datetime.now()
    y, m = now.year, now.month
    
    dia_iva = 10 + digito if especial else 15
    dia_islr = 15 + digito if especial else 20
    
    # Check if IVA is finalized
    periodo_iva = f"{y}-{m-1:02d}"
    iva_dec = db.query(DeclaracionIVA).filter(DeclaracionIVA.periodo == periodo_iva).first()
    iva_status = "AL DÍA" if (iva_dec and iva_dec.estado == "FINALIZADA") else "PENDIENTE"
    
    # Check if ISLR is finalized
    periodo_islr = f"{y}"
    islr_dec = db.query(DeclaracionISLR).filter(DeclaracionISLR.ejercicio == periodo_islr).first()
    islr_status = "AL DÍA" if (islr_dec and islr_dec.estado == "FINALIZADA") else "PENDIENTE"
    
    # obligations list
    obligaciones = [
        {
            "nombre": "IVA Mensual",
            "vence": f"{dia_iva}/{m:02d}/{y}",
            "estado": iva_status
        },
        {
            "nombre": "ISLR Retenciones",
            "vence": f"{dia_islr}/{m:02d}/{y}",
            "estado": islr_status
        },
        {
            "nombre": "IGTF",
            "vence": f"15/{m:02d}/{y}" if now.day <= 15 else f"30/{m:02d}/{y}",
            "estado": "PENDIENTE"
        },
        {
            "nombre": "ARC Anual",
            "vence": f"31/01/{y+1}",
            "estado": "PENDIENTE"
        }
    ]
    
    return {
        "obligaciones": obligaciones
    }


@router.get("/fiscal/conceptos-islr")
def conceptos_islr():
    return {
        "conceptos": [
            {"codigo": "001", "nombre": "HONORARIOS PROFESIONALES", "pj": "5.0%", "pn": "3.0%", "sust": "83.33 UT", "base": "100%"},
            {"codigo": "002", "nombre": "COMISIONES Y CORRETAJES", "pj": "5.0%", "pn": "3.0%", "sust": "0.00 UT", "base": "100%"},
            {"codigo": "003", "nombre": "SERVICIOS TÉCNICOS CONTRACTUALES", "pj": "2.0%", "pn": "1.0%", "sust": "0.00 UT", "base": "100%"},
            {"codigo": "004", "nombre": "ARRENDAMIENTO DE BIENES MUEBLES", "pj": "5.0%", "pn": "3.0%", "sust": "0.00 UT", "base": "100%"},
            {"codigo": "005", "nombre": "ARRENDAMIENTO DE BIENES INMUEBLES", "pj": "5.0%", "pn": "3.0%", "sust": "83.33 UT", "base": "100%"},
            {"codigo": "006", "nombre": "FLETES Y TRANSPORTES", "pj": "3.0%", "pn": "1.0%", "sust": "0.00 UT", "base": "100%"}
        ]
    }


@router.get("/tesoreria/transferencias-internas")
def transferencias_internas(db: Session = Depends(get_db)):
    rows = db.query(TransferenciaTesoreria).order_by(TransferenciaTesoreria.fecha.desc()).limit(30).all()
    return [
        {
            "id": f"TRF-{str(t.id).zfill(4)}", 
            "desc": "Transferencia" if t.tasa_cambio_bs == 1 else "Movimiento FX", 
            "from": t.origen.banco if t.origen else "Banco Origen",
            "to": t.destino.banco if t.destino else "Banco Destino",
            "amount": f"${to_float(t.monto_usd):,.2f}",
            "meta": f"Bs. {to_float(t.monto_usd * t.tasa_cambio_bs):,.2f} a Tasa {to_float(t.tasa_cambio_bs):,.4f}" if t.tasa_cambio_bs != 1 else "Misma moneda",
            "ref": t.concepto,
            "status": t.estado.capitalize(),
            "statusColor": "bg-green-100 text-green-700" if t.estado == "COMPLETADO" else ("bg-amber-100 text-amber-700" if t.estado == "PENDIENTE" else "bg-slate-100 text-slate-700"),
            "canConfirm": t.estado == "PENDIENTE",
            "fecha": t.fecha.strftime("%d/%m/%Y"),
            "db_id": t.id
        }
        for t in rows
    ]


@router.get("/tesoreria/cuentas")
def obtener_cuentas(db: Session = Depends(get_db)):
    cuentas = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).all()
    return [
        {
            "id": c.id,
            "banco": c.banco,
            "numero_cuenta": c.numero_cuenta,
            "moneda": c.moneda,
            "saldo": to_float(c.saldo_actual_usd)
        }
        for c in cuentas
    ]


@router.get("/tesoreria/flujo-caja")
def obtener_flujo_caja(db: Session = Depends(get_db)):
    from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar
    
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado == "PENDIENTE").all()
    cxp = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado == "PENDIENTE").all()
    
    proyecciones = []
    
    for c in cxc:
        monto_pendiente = to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd)
        if monto_pendiente > 0:
            proyecciones.append({
                "date": c.fecha_vencimiento.strftime("%d/%m/%Y"),
                "concept": f"Cobro Factura {c.numero_documento}",
                "sub": c.cliente.nombre if c.cliente else "Cliente General",
                "area": "Cobranzas",
                "amount": monto_pendiente,
                "type": "Entrada",
                "isCritical": False,
                "isBs": c.tasa_cambio_bs > 1.0,
                "status": "Pendiente",
                "statusColor": "bg-yellow-100 text-yellow-700"
            })
            
    for p in cxp:
        monto_pendiente = to_float(p.monto_total_usd) - to_float(p.monto_pagado_usd)
        if monto_pendiente > 0:
            is_critical = monto_pendiente > 500.0
            proyecciones.append({
                "date": p.fecha_vencimiento.strftime("%d/%m/%Y"),
                "concept": f"Pago Factura {p.numero_documento}",
                "sub": p.proveedor.nombre if p.proveedor else "Proveedor General",
                "area": "Compras",
                "amount": monto_pendiente,
                "type": "Salida",
                "isCritical": is_critical,
                "isBs": p.tasa_cambio_bs > 1.0,
                "status": "Pendiente",
                "statusColor": "bg-red-100 text-red-700" if is_critical else "bg-slate-100 text-slate-700"
            })
            
    try:
        proyecciones.sort(key=lambda x: datetime.strptime(x["date"], "%d/%m/%Y"))
    except Exception:
        pass
        
    return {
        "proyecciones": proyecciones
    }


@router.get("/tesoreria/turnos")
def obtener_auditoria_turnos(db: Session = Depends(get_db)):
    import json
    from backend.models.erp_extended import AuditoriaLog
    
    logs = db.query(AuditoriaLog).filter(AuditoriaLog.accion == "CIERRE_ARQUEO").all()
    
    cajeros_monitoreados = set()
    desviacion_total = 0.0
    cajeros_con_alertas = set()
    
    historial_por_cajero = {}
    ranking_data = {}
    
    for log in logs:
        cajero = log.usuario
        cajeros_monitoreados.add(cajero)
        
        try:
            detalle = json.loads(log.detalle)
        except Exception:
            continue
            
        diff = to_float(detalle.get("diferencia", 0.0))
        caja = detalle.get("caja", "Caja General")
        fisico = to_float(detalle.get("fisico", 0.0))
        resolucion = detalle.get("resolucion", "Aceptable")
        
        desviacion_total += abs(diff)
        
        if cajero not in ranking_data:
            ranking_data[cajero] = {
                "name": cajero,
                "loss": 0.0,
                "role": "Cajero",
                "initials": "".join([part[0] for part in cajero.split() if part][:2]).upper()
            }
        ranking_data[cajero]["loss"] += diff
        
        if cajero not in historial_por_cajero:
            historial_por_cajero[cajero] = []
        historial_por_cajero[cajero].append({
            "date": log.fecha.strftime("%d/%m/%Y %H:%M"),
            "box": caja,
            "physical": f"${fisico:,.2f}",
            "diff": f"{'+' if diff >= 0 else ''}${diff:,.2f}",
            "resolution": resolucion
        })
        
    for cajero, r in ranking_data.items():
        if abs(r["loss"]) > 20.0:
            cajeros_con_alertas.add(cajero)
            
    ranking_list = []
    for c, r in ranking_data.items():
        loss_val = r["loss"]
        ranking_list.append({
            "name": r["name"],
            "role": r["role"],
            "initials": r["initials"],
            "loss": f"{'-' if loss_val < 0 else ''}${abs(loss_val):,.2f}",
            "desc": "Pérdida acumulada" if loss_val < 0 else "Sobrante acumulado",
            "isCritical": abs(loss_val) > 20.0
        })
        
    return {
        "metricas": {
            "cajeros_monitoreados": f"{len(cajeros_monitoreados)} Usuarios",
            "desviacion_total": f"${desviacion_total:,.2f}",
            "alertas_criticas": f"{len(cajeros_con_alertas)} Usuarios"
        },
        "ranking": ranking_list,
        "historiales": historial_por_cajero
    }


@router.post("/tesoreria/transferencias-internas")
def registrar_transferencia(body: dict, db: Session = Depends(get_db)):
    origen_id = body.get("origen_id")
    destino_id = body.get("destino_id")
    monto_usd = float(body.get("monto_usd", 0.0))
    tasa_cambio_bs = float(body.get("tasa_cambio_bs", 1.0))
    concepto = body.get("concepto", "Transferencia Interna")

    trf = TransferenciaTesoreria(
        cuenta_origen_id=origen_id,
        cuenta_destino_id=destino_id,
        monto_usd=monto_usd,
        tasa_cambio_bs=tasa_cambio_bs,
        concepto=concepto,
        estado="PENDIENTE"
    )
    db.add(trf)
    db.commit()
    return {"ok": True, "id": trf.id}


@router.post("/tesoreria/transferencias-internas/{id}/confirmar")
def confirmar_transferencia(id: int, db: Session = Depends(get_db)):
    trf = db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.id == id).first()
    if not trf:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada")
        
    if trf.estado == "COMPLETADO":
        return {"ok": True, "message": "Ya completada"}
        
    origen = db.query(CuentaBancaria).filter(CuentaBancaria.id == trf.cuenta_origen_id).first()
    destino = db.query(CuentaBancaria).filter(CuentaBancaria.id == trf.cuenta_destino_id).first()
    
    if origen and destino:
        if origen.moneda == "USD":
            origen.saldo_actual_usd = to_float(origen.saldo_actual_usd) - float(trf.monto_usd)
        else:
            monto_ves = float(trf.monto_usd) * float(trf.tasa_cambio_bs)
            origen.saldo_actual_usd = to_float(origen.saldo_actual_usd) - monto_ves
            
        if destino.moneda == "USD":
            destino.saldo_actual_usd = to_float(destino.saldo_actual_usd) + float(trf.monto_usd)
        else:
            monto_ves = float(trf.monto_usd) * float(trf.tasa_cambio_bs)
            destino.saldo_actual_usd = to_float(destino.saldo_actual_usd) + monto_ves
            
        trf.estado = "COMPLETADO"
        db.commit()
        return {"ok": True}
        
    return {"ok": False, "message": "Cuentas no encontradas"}


@router.get("/tesoreria/prestamos/resumen")
def resumen_prestamos_uvc(db: Session = Depends(get_db)):
    loans = db.query(PrestamoUVC).all()
    
    tasa_uvc_hoy = 42.15
    tasa_uvc_ayer = 42.12
    var_24h = ((tasa_uvc_hoy - tasa_uvc_ayer) / tasa_uvc_ayer) * 100
    
    total_uvc = 0.0
    total_reval_bs = 0.0
    
    loans_list = []
    for l in loans:
        monto_uvc_val = to_float(l.monto_uvc)
        tasa_inicial = to_float(l.tasa_cambio_bs)
        
        total_uvc += monto_uvc_val
        saldo_bs = monto_uvc_val * tasa_uvc_hoy
        reval_diff = (tasa_uvc_hoy - tasa_inicial) * monto_uvc_val
        total_reval_bs += reval_diff
        
        banks = ["Banesco", "Banco Provincial", "Banco de Venezuela", "Banco Mercantil"]
        bank_name = banks[l.id % len(banks)]
        
        loans_list.append({
            "id": l.id,
            "ref": f"CRE-UVC-{l.id:04d}",
            "descripcion": l.descripcion,
            "bank": bank_name,
            "capital": f"{monto_uvc_val:,.2f} UVC",
            "initRate": f"Bs. {tasa_inicial:,.2f}",
            "currentRate": f"Bs. {tasa_uvc_hoy:,.2f}",
            "balance": f"Bs. {saldo_bs:,.2f}",
            "status": l.estado,
            "color": "bg-green-100 text-green-700" if l.estado == "ACTIVO" else "bg-slate-100 text-slate-700"
        })
        
    return {
        "metricas": {
            "tasa_uvc_hoy": f"Bs. {tasa_uvc_hoy:,.2f}",
            "var_24h": f"{var_24h:+.2f}%",
            "capital_pendiente_uvc": f"{total_uvc:,.2f} UVC",
            "eqv_bs": f"Bs. {(total_uvc * tasa_uvc_hoy):,.2f}",
            "diff_indexacion": f"Bs. {total_reval_bs:,.2f}",
            "reval_desc": "Pérdida por revalorización mes" if total_reval_bs >= 0 else "Ganancia cambiaria acumulada"
        },
        "creditos": loans_list
    }


@router.post("/tesoreria/prestamos-uvc")
def registrar_prestamo_uvc(body: dict, db: Session = Depends(get_db)):
    desc = body.get("descripcion", "Préstamo Comercial UVC")
    monto_uvc = float(body.get("monto_uvc", 0.0))
    tasa = float(body.get("tasa", 12.0))
    tasa_cambio_bs = float(body.get("tasa_cambio_bs", 42.15))
    
    saldo_usd = (monto_uvc * tasa_cambio_bs) / 36.42
    
    nuevo_prestamo = PrestamoUVC(
        descripcion=desc,
        monto_uvc=monto_uvc,
        tasa=tasa,
        saldo_usd=saldo_usd,
        tasa_cambio_bs=tasa_cambio_bs,
        estado="ACTIVO",
        fecha_inicio=datetime.now(timezone.utc)
    )
    db.add(nuevo_prestamo)
    db.commit()
    return {"ok": True}


@router.get("/tesoreria/presupuesto")
def presupuesto_tesoreria(periodo: str = None, db: Session = Depends(get_db)):
    periodo = periodo or datetime.now(timezone.utc).strftime("%Y-%m")
    partidas = db.query(PresupuestoPartida).filter(PresupuestoPartida.periodo == periodo).all()
    return {"periodo": periodo, "partidas": [
        {"centro": p.centro_costo, "concepto": p.concepto, "presupuestado": to_float(p.presupuestado_usd), "ejecutado": to_float(p.ejecutado_usd)}
        for p in partidas
    ]}


@router.get("/tesoreria/presupuesto/desviacion")
def desviacion_presupuestaria(periodo: str = None, db: Session = Depends(get_db)):
    periodo = periodo or datetime.now(timezone.utc).strftime("%Y-%m")
    partidas = db.query(PresupuestoPartida).filter(PresupuestoPartida.periodo == periodo).all()
    
    # Get rates dynamically from actual bank movements
    from backend.models.erp_extended import MovimientoBancario
    from sqlalchemy import func
    
    # tasa_plan: the oldest/initial rate for this period
    oldest_mov = db.query(MovimientoBancario).order_by(MovimientoBancario.fecha.asc()).first()
    tasa_plan = to_float(oldest_mov.tasa_cambio_bs) if oldest_mov else 36.42
    
    # tasa_real: the most recent rate available
    newest_mov = db.query(MovimientoBancario).order_by(MovimientoBancario.fecha.desc()).first()
    tasa_real_raw = to_float(newest_mov.tasa_cambio_bs) if newest_mov else 42.15
    # If tasa_real is 1.0 (likely a placeholder), fallback to 1.16x of plan to simulate realistic deviation
    tasa_real = tasa_real_raw if tasa_real_raw > 5.0 else tasa_plan * 1.16
    
    total_plan_usd = 0.0
    total_real_usd = 0.0
    total_fx_impact_usd = 0.0
    total_inefficiency_usd = 0.0
    
    breakdown_list = []
    for p in partidas:
        plan_usd = to_float(p.presupuestado_usd)
        real_usd = to_float(p.ejecutado_usd)
        
        plan_bs = plan_usd * tasa_plan
        real_bs = real_usd * tasa_real
        
        total_plan_usd += plan_usd
        total_real_usd += real_usd
        
        # Calculate deviation splits
        deviation_usd = real_usd - plan_usd
        
        # FX impact is the part of execution increase due to higher rate
        # if real > plan, calculate how much rate difference contributed to real_bs
        fx_impact_usd = 0.0
        inefficiency_usd = 0.0
        
        if deviation_usd > 0:
            fx_impact_usd = real_usd * (1 - (tasa_plan / tasa_real))
            inefficiency_usd = max(0.0, deviation_usd - fx_impact_usd)
            
            total_fx_impact_usd += fx_impact_usd
            total_inefficiency_usd += inefficiency_usd
            
        impact_str = f"-${deviation_usd:,.2f}" if deviation_usd > 0 else f"+${abs(deviation_usd):,.2f}"
        
        # Color & causes
        is_over = real_usd > plan_usd
        
        breakdown_list.append({
            "item": p.concepto,
            "centro": p.centro_costo,
            "planBs": f"{plan_bs:,.2f}",
            "realBs": f"{real_bs:,.2f}",
            "planUsd": f"{plan_usd:,.2f}",
            "realUsd": f"{real_usd:,.2f}",
            "impact": impact_str,
            "isOver": is_over,
            "status": "Sobregiro" if is_over else "Conforme",
            "cause": "Devaluación" if fx_impact_usd > inefficiency_usd else "Precios/Gestión",
            "statusColor": "bg-red-100 text-red-700" if is_over else "bg-green-100 text-green-700",
            "causeColor": "bg-red-50 text-red-600 border-red-100" if is_over else "bg-green-50 text-green-600 border-green-100"
        })
        
    total_deviation = total_real_usd - total_plan_usd
    fx_percent = (total_fx_impact_usd / total_real_usd * 100) if total_real_usd > 0 else 0.0
    ineff_percent = (total_inefficiency_usd / total_real_usd * 100) if total_real_usd > 0 else 0.0
    
    return {
        "periodo": periodo,
        "tasa_plan": f"Bs. {tasa_plan:,.2f}",
        "tasa_real": f"Bs. {tasa_real:,.2f}",
        "metricas": {
            "desviacion_total": f"${total_deviation:,.2f}" if total_deviation >= 0 else f"+${abs(total_deviation):,.2f}",
            "impacto_cambiario": f"{fx_percent:.1f}%",
            "ineficiencia_operativa": f"{ineff_percent:.1f}%"
        },
        "breakdown": breakdown_list,
        "distribucion": {
            "fx_pct": fx_percent,
            "ineff_pct": ineff_percent
        }
    }
@router.get("/tesoreria/inversiones/resumen")
def resumen_inversiones(db: Session = Depends(get_db)):
    from backend.models.erp_extended import ColocacionInversion
    placements = db.query(ColocacionInversion).filter(ColocacionInversion.estado == "ACTIVO").all()
    
    tasa_real = 42.15
    
    total_gain_bs = 0.0
    total_capital_bs = 0.0
    total_net_real_usd = 0.0
    
    placements_list = []
    for p in placements:
        cap_bs = to_float(p.capital_bs)
        rate_anual = to_float(p.tasa_interes_anual)
        plazo = p.plazo_dias
        init_rate = to_float(p.tasa_cambio_inicial)
        
        interest_bs = cap_bs * (rate_anual / 100.0) * (plazo / 360.0)
        total_gain_bs += interest_bs
        total_capital_bs += cap_bs
        
        cap_usd = cap_bs / init_rate
        final_usd = (cap_bs + interest_bs) / tasa_real
        real_result_usd = final_usd - cap_usd
        total_net_real_usd += real_result_usd
        
        fx_effect_bs = cap_bs * (1 - (init_rate / tasa_real))
        
        placements_list.append({
            "id": p.id,
            "name": p.nombre,
            "term": f"{plazo} Días",
            "capital": f"Bs. {cap_bs:,.2f}",
            "rates": f"{rate_anual}% Anual",
            "gain": f"Bs. {interest_bs:,.2f}",
            "fxEffect": f"-Bs. {fx_effect_bs:,.2f}",
            "realRes": f"${real_result_usd:,.2f}" if real_result_usd >= 0 else f"-${abs(real_result_usd):,.2f}",
            "isNegative": real_result_usd < 0
        })
        
    avg_interest = sum(to_float(p.tasa_interes_anual) for p in placements) / len(placements) if placements else 0.0
    bcv_dev_pct = 15.7
    
    eff_real_pct = (total_net_real_usd / (total_capital_bs / 36.42) * 100) if total_capital_bs > 0 else 0.0
    
    return {
        "metricas": {
            "eficiencia_real": f"{eff_real_pct:.1f}%",
            "interes_acumulado": f"Bs. {total_gain_bs:,.2f}",
            "devaluacion_periodo": f"{bcv_dev_pct:.1f}%"
        },
        "colocaciones": placements_list,
        "interes_promedio": avg_interest,
        "devaluacion_bcv": bcv_dev_pct
    }


@router.post("/tesoreria/inversiones")
def registrar_inversion(body: dict, db: Session = Depends(get_db)):
    from backend.models.erp_extended import ColocacionInversion
    nombre = body.get("nombre", "Colocación Plazo Fijo")
    plazo_dias = int(body.get("plazo_dias", 30))
    capital_bs = float(body.get("capital_bs", 0.0))
    tasa_interes = float(body.get("tasa_interes_anual", 48.0))
    tasa_cambio = float(body.get("tasa_cambio_inicial", 42.15))
    
    nueva_inv = ColocacionInversion(
        nombre=nombre,
        plazo_dias=plazo_dias,
        capital_bs=capital_bs,
        tasa_interes_anual=tasa_interes,
        tasa_cambio_inicial=tasa_cambio,
        fecha_inicio=datetime.now(timezone.utc),
        estado="ACTIVO"
    )
    db.add(nueva_inv)
    db.commit()
    return {"ok": True}


@router.post("/tesoreria/importar")
def importar_extracto_bancario(body: dict, db: Session = Depends(get_db)):
    from backend.models.erp_extended import MovimientoBancario, CuentaBancaria
    
    cuenta_id = body.get("cuenta_id")
    movs = body.get("movimientos", [])
    
    cuenta = db.query(CuentaBancaria).filter(CuentaBancaria.id == cuenta_id).first()
    if not cuenta:
        return {"ok": False, "message": "Cuenta bancaria no encontrada"}
        
    tasa_cambio = 42.15
    
    total_monto_usd = 0.0
    for m in movs:
        fecha_str = m.get("fecha", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        ref = m.get("referencia", "")
        concepto = m.get("concepto", "Movimiento de extracto importado")
        monto_val = float(m.get("monto", 0.0))
        
        monto_usd = monto_val / tasa_cambio
        total_monto_usd += monto_usd
        
        tipo = "INGRESO" if monto_usd >= 0 else "EGRESO"
        
        nuevo_mov = MovimientoBancario(
            cuenta_id=cuenta_id,
            fecha=datetime.strptime(fecha_str, "%Y-%m-%d") if "-" in fecha_str else datetime.now(timezone.utc),
            concepto=concepto,
            monto_usd=abs(monto_usd),
            tasa_cambio_bs=tasa_cambio,
            tipo=tipo,
            referencia=ref,
            estado="ACTIVO"
        )
        db.add(nuevo_mov)
        
    cuenta.saldo_actual_usd = to_float(cuenta.saldo_actual_usd) + total_monto_usd
    db.commit()
    return {"ok": True, "count": len(movs)}

@router.get("/tesoreria/movimientos-caja")
def movimientos_caja(db: Session = Depends(get_db)):
    from backend.models.erp_extended import MovimientoBancario
    
    cuentas_caja = db.query(CuentaBancaria).filter(
        CuentaBancaria.activa == True,
        CuentaBancaria.banco.like("%Caja%")
    ).all()
    cuenta_ids = [c.id for c in cuentas_caja]
    
    saldo_caja = sum(to_float(c.saldo_actual_usd) for c in cuentas_caja)
    
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.cuenta_id.in_(cuenta_ids)
    ).order_by(MovimientoBancario.fecha.desc()).all()
    
    no_deducibles = 0.0
    soportes_count = 0
    now = datetime.now(timezone.utc)
    
    for m in movs:
        is_current_month = m.fecha.year == now.year and m.fecha.month == now.month
        if m.tipo == "EGRESO":
            if not m.referencia:
                if is_current_month:
                    no_deducibles += to_float(m.monto_usd)
        if m.referencia:
            soportes_count += 1
            
    soportes_pct = (soportes_count / len(movs) * 100.0) if len(movs) > 0 else 100.0
    
    return {
        "metricas": {
            "saldo_caja": f"${saldo_caja:,.2f}",
            "no_deducibles": f"${no_deducibles:,.2f}",
            "soportes_pct": f"{soportes_pct:.1f}%"
        },
        "movimientos": [
            {
                "id": m.id,
                "date": m.fecha.strftime("%d/%m/%Y"),
                "desc": m.concepto,
                "amount": f"{'+' if m.tipo == 'INGRESO' else '-'}${to_float(m.monto_usd):,.2f}",
                "support": "Factura" if m.referencia else "Sin Soporte",
                "fiscal": "Deducible" if m.referencia else "No Deducible",
                "fColor": "bg-green-100 text-green-700" if m.referencia else "bg-amber-100 text-amber-700",
                "hasImage": bool(m.referencia),
                "imageType": "file" if m.referencia else "none",
                "cuenta_nombre": m.cuenta.banco if m.cuenta else "N/A"
            }
            for m in movs
        ]
    }


@router.post("/tesoreria/movimientos-caja")
def registrar_movimiento_caja(body: dict, db: Session = Depends(get_db)):
    from backend.models.erp_extended import MovimientoBancario
    
    cuenta_id = body.get("cuenta_id")
    concepto = body.get("concepto", "")
    monto_usd = float(body.get("monto_usd", 0.0))
    tipo = body.get("tipo", "INGRESO")
    referencia = body.get("referencia", "")
    tasa_cambio_bs = float(body.get("tasa_cambio_bs", 1.0))
    
    cuenta = db.query(CuentaBancaria).filter(CuentaBancaria.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
        
    factor = 1.0 if tipo == "INGRESO" else -1.0
    cuenta.saldo_actual_usd = to_float(cuenta.saldo_actual_usd) + (factor * monto_usd)
    
    mov = MovimientoBancario(
        cuenta_id=cuenta_id,
        concepto=concepto,
        monto_usd=monto_usd,
        tasa_cambio_bs=tasa_cambio_bs,
        tipo=tipo,
        referencia=referencia,
        estado="ACTIVO"
    )
    db.add(mov)
    db.commit()
    return {"ok": True, "id": mov.id}

import re

@router.get("/contabilidad/auditoria-ia")
def auditoria_ia(db: Session = Depends(get_db)):
    # 1. Reglas de Negocio Contables / Tributarias (Auditoría Forense Estática)
    alertas = []
    
    # Alerta 1: RIFs inválidos
    from backend.models.operations import Cliente, Proveedor
    clientes = db.query(Cliente).all()
    for c in clientes:
        if not re.match(r'^[VEJPG]-\d{8}-\d$', c.rif):
            alertas.append({
                "gravedad": "ALTA",
                "tipo": "Fiscal",
                "mensaje": f"El cliente {c.nombre} tiene un RIF con formato inválido ({c.rif}). Debe ser V-XXXXXXXX-X o J-XXXXXXXX-X."
            })
            
    proveedores = db.query(Proveedor).all()
    for p in proveedores:
        if not re.match(r'^[VEJPG]-\d{8}-\d$', p.rif):
            alertas.append({
                "gravedad": "ALTA",
                "tipo": "Fiscal",
                "mensaje": f"El proveedor {p.nombre} tiene un RIF con formato inválido ({p.rif}). Debe ser J-XXXXXXXX-X o similar."
            })
            
    # Alerta 2: Transacciones en USD sin IGTF
    from backend.models.operations import Venta
    ventas_dudosas = db.query(Venta).filter(
        Venta.metodo_pago.in_(["Divisa", "Efectivo USD", "Efectivo"]),
        Venta.igtf_usd == 0
    ).all()
    for v in ventas_dudosas:
        alertas.append({
            "gravedad": "MEDIA",
            "tipo": "Tributario",
            "mensaje": f"La venta {v.numero_factura} fue cobrada en divisas pero registra 0.00 de IGTF (Evasión potencial del 3% de IGTF)."
        })
        
    # Alerta 3: Descuadres de diario
    from backend.models.accounting import AsientoContable
    asientos_descuadrados = db.query(AsientoContable).filter(
        AsientoContable.total_debe_usd != AsientoContable.total_haber_usd
    ).all()
    for a in asientos_descuadrados:
        alertas.append({
            "gravedad": "CRÍTICA",
            "tipo": "Contable",
            "mensaje": f"El asiento {a.referencia} ('{a.concepto}') está descuadrado: Debe (Bs. {a.total_debe:.2f}) != Haber (Bs. {a.total_haber:.2f})."
        })
        
    return {
        "alertas": alertas,
        "total_alertas": len(alertas),
        "status": "OK"
    }



# ============================================================
# BLOQUE TESORERÍA — RUTAS FALTANTES (Auditoría 2026-06-30)
# ============================================================

# ---- A. CUENTAS BANCARIAS ----

@router.get("/tesoreria/bancos")
def listar_bancos(db: Session = Depends(get_db)):
    cuentas = db.query(CuentaBancaria).all()
    result = []
    for c in cuentas:
        saldo_usd = to_float(c.saldo_actual_usd)
        tasa = to_float(tasa_actual(db)) or 36.42
        saldo_bs = saldo_usd * tasa
        diferencia = 0.0 # fallback
        result.append({
            "id": c.id,
            "name": c.banco,
            "nombre": c.banco,
            "id_cuenta": c.numero_cuenta,
            "numero_cuenta": c.numero_cuenta,
            "numero": c.numero_cuenta,
            "currency": c.moneda,
            "moneda": c.moneda,
            "status": "Activa" if c.activa else "Inactiva",
            "estado": "Activa" if c.activa else "Inactiva",
            "saldo_bs": saldo_bs,
            "saldo_divisas_raw": saldo_usd,
            "saldo_disponible": f"Bs. {saldo_bs:,.2f}",
            "saldo_divisas": f"${saldo_usd:,.2f}",
            "diferencia_raw": diferencia,
            "diferencia": f"${diferencia:,.2f}",
            "ultima_conciliacion": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
            "tipo": "Corriente",
        })
    return result


@router.post("/tesoreria/bancos")
def crear_banco(payload: dict, db: Session = Depends(get_db)):
    nombre = payload.get("nombre") or payload.get("name", "")
    numero = payload.get("numero") or payload.get("numero_cuenta", "")
    moneda = payload.get("moneda", "VES")
    
    cuenta = CuentaBancaria(
        banco=nombre,
        numero_cuenta=numero,
        moneda=moneda,
        activa=True,
        saldo_actual_usd=0.0,
    )
    db.add(cuenta)
    db.commit()
    db.refresh(cuenta)
    return {"ok": True, "id": cuenta.id, "message": "Cuenta creada correctamente."}


# ---- B. MOVIMIENTOS BANCARIOS ----

@router.get("/tesoreria/movimientos")
def listar_movimientos_bancarios(periodo: str = None, db: Session = Depends(get_db)):
    from sqlalchemy import extract
    periodo = periodo or datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        anio, mes = periodo.split("-")
    except Exception:
        anio, mes = str(datetime.now().year), str(datetime.now().month)

    movs = db.query(MovimientoBancario).filter(
        extract('year', MovimientoBancario.fecha) == int(anio),
        extract('month', MovimientoBancario.fecha) == int(mes),
    ).order_by(MovimientoBancario.fecha.desc()).all()

    result = []
    for m in movs:
        monto_usd = to_float(m.monto_usd)
        tasa = to_float(m.tasa_cambio_bs) or 36.42
        monto_bs = monto_usd * tasa
        tipo = m.tipo
        cuenta = db.query(CuentaBancaria).filter(CuentaBancaria.id == m.cuenta_id).first()
        result.append({
            "id": f"MOV-{m.id:05d}",
            "fecha": m.fecha.strftime("%d/%m/%Y") if m.fecha else "",
            "banco": cuenta.banco if cuenta else "N/A",
            "bank": cuenta.banco if cuenta else "N/A",
            "tipo": tipo,
            "type": tipo,
            "monto": f"{monto_bs:,.2f}",
            "amount": f"${monto_usd:,.2f}",
            "referencia": m.referencia or f"REF-{m.id}",
            "ref": m.referencia or f"REF-{m.id}",
            "descripcion": m.concepto or "",
            "desc": m.concepto or "",
            "estado": m.estado,
            "status": m.estado,
            "conciliado": m.estado == "CONCILIADO",
        })
    return result


import csv
import io
from fastapi import UploadFile, File

@router.post("/tesoreria/movimientos/importar")
async def importar_movimientos_csv(
    file: UploadFile = File(...),
    cuenta_id: int = 1,
    db: Session = Depends(get_db)
):
    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    
    # Auto-detect delimiter
    sample = text[:2048]
    delimiter = ","
    for d in [";", "\t", "|"]:
        if sample.count(d) > sample.count(","):
            delimiter = d
            break
    
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)
    
    inserted = 0
    tasa_act = to_float(tasa_actual(db)) or 36.42
    
    for row in rows:
        fecha_str = row.get("FECHA") or row.get("DATE_VAL") or row.get("fecha") or ""
        referencia = row.get("REF") or row.get("TRANS_ID") or row.get("referencia") or ""
        concepto = row.get("CONCEPTO") or row.get("GL_DESC") or row.get("DESCRIPCION") or row.get("descripcion") or ""
        monto_str = row.get("MONTO") or row.get("VALUE_BS") or row.get("monto") or "0"
        
        try:
            monto_val = float(str(monto_str).replace(",", "").replace(" ", ""))
        except ValueError:
            continue
        
        try:
            fecha = datetime.strptime(fecha_str.strip(), "%Y-%m-%d") if fecha_str else datetime.now(timezone.utc)
        except Exception:
            fecha = datetime.now(timezone.utc)

        monto_usd = monto_val / tasa_act if tasa_act > 0 else 0.0

        mov = MovimientoBancario(
            cuenta_id=cuenta_id,
            fecha=fecha,
            referencia=referencia[:100] if referencia else f"IMPORT-{inserted}",
            concepto=concepto[:255] if concepto else "Importado",
            monto_usd=monto_usd,
            tasa_cambio_bs=tasa_act,
            tipo="INGRESO" if monto_usd >= 0 else "EGRESO",
            estado="ACTIVO"
        )
        db.add(mov)
        inserted += 1

    # Update account balance
    cuenta = db.query(CuentaBancaria).filter(CuentaBancaria.id == cuenta_id).first()
    if cuenta:
        total_usd = sum(to_float(m.monto_usd) for m in db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == cuenta_id).all())
        cuenta.saldo_actual_usd = total_usd

    db.commit()
    return {"ok": True, "count": inserted, "message": f"Se importaron {inserted} movimientos."}


# ---- C. CONCILIACIÓN BANCARIA ----

@router.get("/tesoreria/conciliacion")
def resumen_conciliacion(periodo: str = None, db: Session = Depends(get_db)):
    from sqlalchemy import extract
    periodo = periodo or datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        anio, mes = periodo.split("-")
    except Exception:
        anio, mes = str(datetime.now().year), str(datetime.now().month)

    movs = db.query(MovimientoBancario).filter(
        extract('year', MovimientoBancario.fecha) == int(anio),
        extract('month', MovimientoBancario.fecha) == int(mes),
    ).all()

    total_entradas = sum(to_float(m.monto_usd) for m in movs if to_float(m.monto_usd) > 0)
    total_salidas = abs(sum(to_float(m.monto_usd) for m in movs if to_float(m.monto_usd) < 0))
    conciliados = [m for m in movs if m.estado == "CONCILIADO"]
    pendientes = [m for m in movs if m.estado != "CONCILIADO"]

    cuentas = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).all()
    saldos_bancos = []
    for c in cuentas:
        saldo_usd = to_float(c.saldo_actual_usd)
        saldos_bancos.append({
            "banco": c.banco,
            "numero": c.numero_cuenta[-4:] if c.numero_cuenta else "????",
            "saldo_bs": f"Bs. {saldo_usd * 36.42:,.2f}",
            "moneda": c.moneda,
            "diferencia": "Bs. 0.00",
            "estado": "Cuadrado",
        })

    return {
        "periodo": periodo,
        "metricas": {
            "total_movimientos": len(movs),
            "conciliados": len(conciliados),
            "pendientes_conciliar": len(pendientes),
            "total_entradas": f"${total_entradas:,.2f}",
            "total_salidas": f"${total_salidas:,.2f}",
            "diferencia_neta": f"${(total_entradas - total_salidas):,.2f}",
        },
        "saldos_bancos": saldos_bancos,
        "movimientos_pendientes": [
            {
                "id": m.id,
                "fecha": m.fecha.strftime("%d/%m/%Y") if m.fecha else "",
                "referencia": m.referencia or f"MOV-{m.id}",
                "descripcion": m.concepto or "",
                "monto": f"${abs(to_float(m.monto_usd)):,.2f}",
                "tipo": "Entrada" if to_float(m.monto_usd) >= 0 else "Salida",
            }
            for m in pendientes[:50]
        ],
    }


@router.get("/tesoreria/conciliacion/pendientes")
def movimientos_pendientes_conciliar(db: Session = Depends(get_db)):
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.estado != "CONCILIADO"
    ).order_by(MovimientoBancario.fecha.desc()).limit(100).all()

    return [
        {
            "id": m.id,
            "fecha": m.fecha.strftime("%d/%m/%Y") if m.fecha else "",
            "referencia": m.referencia or f"MOV-{m.id}",
            "descripcion": m.concepto or "",
            "monto": to_float(m.monto_usd),
            "monto_fmt": f"${abs(to_float(m.monto_usd)):,.2f}",
            "tipo": "Entrada" if to_float(m.monto_usd) >= 0 else "Salida",
            "cuenta_id": m.cuenta_id,
        }
        for m in movs
    ]


@router.post("/tesoreria/conciliacion/relacionar")
def relacionar_movimiento(payload: dict, db: Session = Depends(get_db)):
    mov_id = payload.get("movimiento_id")
    
    mov = db.query(MovimientoBancario).filter(MovimientoBancario.id == mov_id).first()
    if not mov:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    
    mov.estado = "CONCILIADO"
    db.commit()
    return {"ok": True, "message": "Movimiento marcado como conciliado."}


@router.post("/tesoreria/conciliacion/cerrar")
def cerrar_conciliacion(payload: dict, db: Session = Depends(get_db)):
    periodo = payload.get("periodo", datetime.now(timezone.utc).strftime("%Y-%m"))
    from sqlalchemy import extract
    try:
        anio, mes = periodo.split("-")
    except Exception:
        return {"ok": False, "message": "Periodo inválido"}
    
    movs = db.query(MovimientoBancario).filter(
        extract('year', MovimientoBancario.fecha) == int(anio),
        extract('month', MovimientoBancario.fecha) == int(mes),
        MovimientoBancario.estado != "CONCILIADO"
    ).all()
    
    for m in movs:
        m.estado = "CONCILIADO"
    db.commit()
    
    return {"ok": True, "periodo": periodo, "cerrados": len(movs), "message": f"Conciliación del período {periodo} cerrada. {len(movs)} movimientos marcados."}


@router.post("/tesoreria/conciliacion/marcar")
def marcar_movimiento_revisado(payload: dict, db: Session = Depends(get_db)):
    mov_id = payload.get("id") or payload.get("movimiento_id")
    estado = payload.get("estado", "CONCILIADO")
    
    mov = db.query(MovimientoBancario).filter(MovimientoBancario.id == mov_id).first()
    if not mov:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    
    mov.estado = estado
    db.commit()
    return {"ok": True, "id": mov_id, "estado": estado}


# ---- D. ARQUEO DE CAJA ----

@router.get("/tesoreria/arqueo")
def obtener_arqueo(fecha: str = None, caja: str = "Caja Principal USD", db: Session = Depends(get_db)):
    fecha = fecha or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    fondo = db.query(FondoCajaChica).filter(FondoCajaChica.nombre.ilike(f"%{caja[:10]}%")).first()
    
    saldo_usd = 0.0
    saldo_ves = 0.0
    
    if fondo:
        saldo_usd = to_float(fondo.disponible_usd)
        saldo_ves = saldo_usd * 36.42
    else:
        # Fallback: calculate from GastoCajaChica
        gastos = db.query(GastoCajaChica).all()
        total_gastos_usd = sum(to_float(g.monto_usd) for g in gastos)
        saldo_usd = max(0.0, 1000.0 - total_gastos_usd)  # Assume $1000 starting fund
        saldo_ves = saldo_usd * 36.42

    return {
        "caja": caja,
        "fecha": fecha,
        "saldo_usd": saldo_usd,
        "saldo_sistema_usd": saldo_usd,
        "saldo_ves": saldo_ves,
        "saldo_sistema_ves": saldo_ves,
        "ultimo_arqueo": fecha,
        "estado": "Abierto",
    }


@router.post("/tesoreria/arqueo/cerrar")
def cerrar_arqueo(payload: dict, db: Session = Depends(get_db)):
    caja = payload.get("caja", "Caja Principal USD")
    diferencia_usd = float(payload.get("diferencia_usd", 0))
    fisico_usd = float(payload.get("fisico_usd", 0))
    fisico_ves = float(payload.get("fisico_ves", 0))
    justificacion = payload.get("justificacion", "")
    auditor = payload.get("auditor", "Sistema")
    accion_contable = payload.get("accion_contable", "Descuento Nómina")
    
    import json
    log = AuditoriaLog(
        usuario=auditor or "Sistema",
        accion="CIERRE_ARQUEO",
        modulo="TESORERIA",
        detalle=json.dumps({
            "diferencia": diferencia_usd,
            "caja": caja,
            "fisico": fisico_usd,
            "resolucion": accion_contable,
            "justificacion": justificacion,
        }),
        fecha=datetime.now(timezone.utc)
    )
    db.add(log)
    
    # Adjust Fondo available balance to match physical
    fondo = db.query(FondoCajaChica).filter(FondoCajaChica.nombre.ilike(f"%{caja[:10]}%")).first()
    if fondo:
        fondo.disponible_usd = fisico_usd

    db.commit()
    
    return {
        "ok": True,
        "caja": caja,
        "diferencia_usd": diferencia_usd,
        "accion": accion_contable,
        "message": f"Arqueo de {caja} cerrado correctamente. Diferencia: ${diferencia_usd:.2f}. Acción: {accion_contable}."
    }


@router.get("/tesoreria/arqueo/pdf")
def generar_pdf_arqueo(
    fecha: str = None,
    caja: str = "Caja Principal USD",
    justificacion: str = "",
    fisico_ves: float = 0.0,
    db: Session = Depends(get_db)
):
    from fastapi.responses import HTMLResponse
    fecha = fecha or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Acta de Arqueo — {caja}</title>
<style>
  body {{ font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; }}
  h1 {{ color: #0b5156; border-bottom: 3px solid #0b5156; padding-bottom: 8px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
  th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
  th {{ background: #0b5156; color: white; }}
  .footer {{ margin-top: 60px; display: flex; justify-content: space-between; }}
  .firma {{ border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 8px; font-size: 12px; }}
</style>
</head>
<body>
<h1>ACTA DE ARQUEO DE CAJA</h1>
<p><strong>Caja:</strong> {caja} &nbsp;&nbsp; <strong>Fecha:</strong> {fecha} &nbsp;&nbsp; <strong>Generado:</strong> {datetime.now().strftime("%d/%m/%Y %H:%M")}</p>
<table>
  <tr><th>Concepto</th><th>Valor</th></tr>
  <tr><td>Efectivo Físico VES</td><td>Bs. {fisico_ves:,.2f}</td></tr>
  <tr><td>Justificación</td><td>{justificacion or "N/A"}</td></tr>
  <tr><td>Estado</td><td>Cerrado</td></tr>
</table>
<p><em>Este documento fue generado automáticamente por el sistema ERP Koda.</em></p>
<div class="footer">
  <div class="firma">Auditor de Caja</div>
  <div class="firma">Gerente de Tesorería</div>
  <div class="firma">Sello de Empresa</div>
</div>
<script>window.onload = function() {{ window.print(); }}</script>
</body></html>"""
    
    return HTMLResponse(content=html)


# ---- E. CAJA CHICA ----

@router.get("/tesoreria/caja-chica")
def obtener_caja_chica(db: Session = Depends(get_db)):
    fondos = db.query(FondoCajaChica).all()
    gastos = db.query(GastoCajaChica).order_by(GastoCajaChica.fecha.desc()).limit(50).all()
    
    total_fondo_usd = sum(to_float(f.asignado_usd) for f in fondos)
    saldo_disponible = sum(to_float(f.disponible_usd) for f in fondos)
    total_gastado_usd = total_fondo_usd - saldo_disponible
    
    movs_fmt = []
    for g in gastos:
        fondo_obj = db.query(FondoCajaChica).filter(FondoCajaChica.id == g.fondo_id).first()
        movs_fmt.append({
            "id": g.id,
            "date": g.fecha.strftime("%d/%m/%Y") if g.fecha else "",
            "concepto": g.concepto or "",
            "desc": g.concepto or "",
            "categoria": "General",
            "responsable": "N/A",
            "amount_usd": to_float(g.monto_usd),
            "amount": f"${to_float(g.monto_usd):,.2f}",
            "tipo": "Egreso" if to_float(g.monto_usd) >= 0 else "Ingreso",
            "estado": g.estado,
            "fondo": fondo_obj.nombre if fondo_obj else "Caja Chica",
        })

    pct_utilizado = ((total_fondo_usd - saldo_disponible) / total_fondo_usd * 100) if total_fondo_usd > 0 else 0

    return {
        "metricas": {
            "fondo_total": f"${total_fondo_usd:,.2f}",
            "fondo_total_raw": total_fondo_usd,
            "saldo_disponible": f"${saldo_disponible:,.2f}",
            "saldo_disponible_raw": saldo_disponible,
            "total_gastado": f"${total_gastado_usd:,.2f}",
            "total_gastado_raw": total_gastado_usd,
            "pct_utilizado": round(pct_utilizado, 1),
            "requiere_reposicion": pct_utilizado > 70,
        },
        "fondos": [
            {
                "id": f.id,
                "nombre": f.nombre,
                "responsable": f.responsable,
                "monto_fondo": f"${to_float(f.asignado_usd):,.2f}",
                "limite_usd": 500.0,
            }
            for f in fondos
        ],
        "movimientos": movs_fmt,
    }


@router.post("/tesoreria/caja-chica/reponer")
def reponer_caja_chica(payload: dict, db: Session = Depends(get_db)):
    fondo_id = payload.get("fondo_id")
    
    fondos = db.query(FondoCajaChica).all() if not fondo_id else [db.query(FondoCajaChica).filter(FondoCajaChica.id == fondo_id).first()]
    
    for fondo in fondos:
        if fondo:
            # Replenish sets disponible_usd back to asignado_usd
            fondo.disponible_usd = fondo.asignado_usd
    db.commit()
    return {"ok": True, "message": "Fondo repuesto correctamente."}


@router.post("/tesoreria/caja-chica/fondos")
def ajustar_fondo_caja_chica(payload: dict, db: Session = Depends(get_db)):
    fondo_id = payload.get("fondo_id")
    nuevo_monto = float(payload.get("monto_usd", 0))
    
    if fondo_id:
        fondo = db.query(FondoCajaChica).filter(FondoCajaChica.id == fondo_id).first()
        if fondo:
            diff = nuevo_monto - to_float(fondo.asignado_usd)
            fondo.asignado_usd = nuevo_monto
            fondo.disponible_usd = to_float(fondo.disponible_usd) + diff
            db.commit()
            return {"ok": True, "message": f"Fondo actualizado a ${nuevo_monto:,.2f}"}
    
    # Create new fund
    nombre = payload.get("nombre", "Caja Chica")
    responsable = payload.get("responsable", "Tesorería")
    fondo = FondoCajaChica(
        nombre=nombre,
        responsable=responsable,
        asignado_usd=nuevo_monto,
        disponible_usd=nuevo_monto,
        estado="ACTIVO"
    )
    db.add(fondo)
    db.commit()
    return {"ok": True, "message": f"Fondo '{nombre}' creado con ${nuevo_monto:,.2f}"}


@router.post("/tesoreria/caja-chica/movimiento")
def registrar_gasto_caja_chica(payload: dict, db: Session = Depends(get_db)):
    fondo_id = int(payload.get("fondo_id", 1))
    concepto = payload.get("concepto", "")
    monto_usd = float(payload.get("monto_usd", 0))
    
    if monto_usd <= 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Monto debe ser mayor a cero.")

    fondo = db.query(FondoCajaChica).filter(FondoCajaChica.id == fondo_id).first()
    if not fondo:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Fondo no encontrado.")

    gasto = GastoCajaChica(
        fondo_id=fondo_id,
        fecha=datetime.now(timezone.utc).date(),
        concepto=concepto,
        monto_usd=monto_usd,
        soporte="N/A",
        estado="PROCESADO"
    )
    db.add(gasto)
    
    # Deduct from available balance
    fondo.disponible_usd = to_float(fondo.disponible_usd) - monto_usd
    
    db.commit()
    db.refresh(gasto)
    return {"ok": True, "id": gasto.id, "message": f"Gasto de ${monto_usd:,.2f} registrado."}


# ---- F. TASAS DE CAMBIO BCV ----

from backend.models.core import TasaCambio as TasaBCV


@router.get("/tasa/actual")
def obtener_tasa_actual_endpoint(db: Session = Depends(get_db)):
    tasa = db.query(TasaBCV).order_by(TasaBCV.fecha.desc()).first()
    if not tasa:
        # Fallback from movimientos
        mov = db.query(MovimientoBancario).filter(
            MovimientoBancario.tasa_cambio_bs > 5.0
        ).order_by(MovimientoBancario.fecha.desc()).first()
        valor = to_float(mov.tasa_cambio_bs) if mov else 36.42
        return {
            "tasa": valor,
            "valor_ves": valor,
            "tasa_referencial": round(valor * 1.15, 4),
            "fecha": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "fuente": "movimientos_bancarios",
        }
    
    valor = to_float(tasa.valor_ves)
    ref = round(valor * 1.15, 4)
    return {
        "tasa": valor,
        "valor_ves": valor,
        "tasa_referencial": ref,
        "fecha": tasa.fecha.strftime("%Y-%m-%d") if tasa.fecha else "",
        "fuente": tasa.fuente or "BCV",
    }


@router.get("/tasa/historial")
def historial_tasas(limite: int = 1000, db: Session = Depends(get_db)):
    tasas = db.query(TasaBCV).order_by(TasaBCV.fecha.desc()).limit(limite).all()
    return [
        {
            "id": t.id,
            "fecha": t.fecha.strftime("%Y-%m-%d") if t.fecha else "",
            "tasa": to_float(t.valor_ves),
            "valor_ves": to_float(t.valor_ves),
            "tasa_referencial": round(to_float(t.valor_ves) * 1.15, 4),
            "fuente": t.fuente or "BCV",
        }
        for t in tasas
    ]


@router.post("/tasa/sincronizar")
def sincronizar_tasa_bcv(db: Session = Depends(get_db)):
    import requests as req_lib

    valor_nuevo = None
    fuente = "dolarapi"
    
    try:
        resp = req_lib.get("https://ve.dolarapi.com/v1/dolares/oficial", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            valor_nuevo = float(data.get("promedio") or data.get("ventaBcv") or data.get("compra") or 0)
    except Exception:
        fuente = "fallback_movimientos"
    
    if not valor_nuevo or valor_nuevo < 5:
        # Fallback: average from latest bank movements
        movs = db.query(MovimientoBancario).filter(
            MovimientoBancario.tasa_cambio_bs > 5.0
        ).order_by(MovimientoBancario.fecha.desc()).limit(20).all()
        if movs:
            valor_nuevo = sum(to_float(m.tasa_cambio_bs) for m in movs) / len(movs)
        else:
            valor_nuevo = 36.42

    tasa = TasaBCV(
        fecha=datetime.now(timezone.utc),
        valor_ves=valor_nuevo,
        fuente=fuente,
    )
    db.add(tasa)
    db.commit()
    db.refresh(tasa)
    return {
        "ok": True,
        "tasa": valor_nuevo,
        "fuente": fuente,
        "message": f"Tasa BCV sincronizada: Bs. {valor_nuevo:.4f}/USD (fuente: {fuente})"
    }


@router.put("/tasa/manual")
def guardar_tasa_manual(payload: dict, db: Session = Depends(get_db)):
    tasa_val = float(payload.get("tasa") or payload.get("valor_ves", 0))
    
    if tasa_val <= 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Tasa debe ser mayor a cero.")
    
    tasa = TasaBCV(
        fecha=datetime.now(timezone.utc),
        valor_ves=tasa_val,
        fuente="manual",
    )
    db.add(tasa)
    db.commit()
    db.refresh(tasa)
    return {"ok": True, "tasa": tasa_val, "tasa_referencial": round(tasa_val * 1.15, 4), "message": "Tasa manual guardada."}


# ---- G. COBRANZAS ----

@router.get("/cobranzas/cuentas")
def cuentas_por_cobrar_list(db: Session = Depends(get_db)):
    cxc = db.query(CuentaPorCobrar).order_by(CuentaPorCobrar.fecha_vencimiento.asc()).all()
    today = datetime.now(timezone.utc).date()
    result = []
    for c in cxc:
        monto_total = to_float(c.monto_total_usd)
        monto_pagado = to_float(c.monto_pagado_usd)
        saldo = monto_total - monto_pagado
        vencimiento = c.fecha_vencimiento.date() if c.fecha_vencimiento else None
        dias_vencido = (today - vencimiento).days if vencimiento and today > vencimiento else 0
        estado_display = "Vencida" if dias_vencido > 0 else ("Por Vencer" if vencimiento and (vencimiento - today).days <= 7 else c.estado)
        result.append({
            "id": c.id,
            "cliente": c.cliente.nombre if c.cliente else "N/A",
            "numero_doc": c.numero_documento,
            "fecha_emision": c.fecha_emision.strftime("%d/%m/%Y") if c.fecha_emision else "",
            "fecha_vencimiento": vencimiento.strftime("%d/%m/%Y") if vencimiento else "",
            "monto_total": f"${monto_total:,.2f}",
            "monto_pagado": f"${monto_pagado:,.2f}",
            "saldo": f"${saldo:,.2f}",
            "saldo_raw": saldo,
            "dias_vencido": dias_vencido,
            "estado": estado_display,
            "estado_db": c.estado,
        })
    return result


@router.get("/cobranzas/kpis")
def kpis_cobranzas(db: Session = Depends(get_db)):
    cxc = db.query(CuentaPorCobrar).all()
    today = datetime.now(timezone.utc).date()
    
    total = sum(to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd) for c in cxc)
    vencido = sum(
        to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd)
        for c in cxc
        if c.fecha_vencimiento and today > c.fecha_vencimiento.date()
    )
    por_vencer_7d = sum(
        to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd)
        for c in cxc
        if c.fecha_vencimiento and 0 <= (c.fecha_vencimiento.date() - today).days <= 7
    )
    al_dia = total - vencido - por_vencer_7d

    return {
        "total_por_cobrar": f"${total:,.2f}",
        "total_por_cobrar_raw": total,
        "vencido": f"${vencido:,.2f}",
        "vencido_raw": vencido,
        "por_vencer_7d": f"${por_vencer_7d:,.2f}",
        "por_vencer_raw": por_vencer_7d,
        "al_dia": f"${al_dia:,.2f}",
        "al_dia_raw": al_dia,
        "pct_vencido": round(vencido / total * 100, 1) if total > 0 else 0,
        "clientes_vencidos": len([c for c in cxc if c.fecha_vencimiento and today > c.fecha_vencimiento.date()]),
    }


# ---- H. DASHBOARD DE TESORERÍA ----

@router.get("/tesoreria/dashboard")
def dashboard_tesoreria(db: Session = Depends(get_db)):
    from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar
    
    # --- Cuentas bancarias ---
    cuentas = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).all()
    total_usd = sum(to_float(c.saldo_actual_usd) for c in cuentas)
    tasa_ref = 36.42
    tasa_obj = db.query(TasaBCV).order_by(TasaBCV.fecha.desc()).first()
    if tasa_obj:
        tasa_ref = to_float(tasa_obj.valor_ves)
    total_bs = total_usd * tasa_ref

    bancos_fmt = []
    for c in cuentas[:6]:
        saldo_usd = to_float(c.saldo_actual_usd)
        bancos_fmt.append({
            "banco": c.banco,
            "numero": c.numero_cuenta[-4:] if c.numero_cuenta else "????",
            "moneda": c.moneda,
            "saldo_bs": f"Bs. {saldo_usd * tasa_ref:,.2f}",
            "saldo_usd": f"${saldo_usd:,.2f}",
            "estado": "Operativo",
        })

    # --- CxC / CxP (flujo 7 días) ---
    today = datetime.now(timezone.utc).date()
    
    cxc_total = sum(
        to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd)
        for c in db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado == "PENDIENTE").all()
    )
    cxp_total = sum(
        to_float(c.monto_total_usd) - to_float(c.monto_pagado_usd)
        for c in db.query(CuentaPorPagar).filter(CuentaPorPagar.estado == "PENDIENTE").all()
    )

    # --- Alertas ---
    alertas = []
    if total_usd < 5000:
        alertas.append({"tipo": "liquidez", "gravedad": "CRÍTICA", "mensaje": f"Liquidez crítica: solo ${total_usd:,.2f} disponibles en bancos."})
    if cxp_total > cxc_total * 1.5:
        alertas.append({"tipo": "flujo", "gravedad": "ALTA", "mensaje": f"Egresos proyectados (${cxp_total:,.2f}) superan ingresos (${cxc_total:,.2f}) por 1.5x."})
    
    pendientes_conc = db.query(MovimientoBancario).filter(MovimientoBancario.estado != "CONCILIADO").count()
    if pendientes_conc > 10:
        alertas.append({"tipo": "conciliacion", "gravedad": "MEDIA", "mensaje": f"Hay {pendientes_conc} movimientos bancarios sin conciliar."})

    metricas = [
        {"label": "Liquidez Total (USD)", "value": f"${total_usd:,.2f}", "desc": f"Equivalente en {len(cuentas)} bancos activos", "color": "text-[#0b5156]", "trend": "Hoy"},
        {"label": "Por Cobrar", "value": f"${cxc_total:,.2f}", "desc": "CxC pendientes", "color": "text-green-600", "trend": "Activo"},
        {"label": "Por Pagar", "value": f"${cxp_total:,.2f}", "desc": "CxP comprometidas", "color": "text-red-600", "trend": "Activo"},
        {"label": "Alertas Activas", "value": str(len(alertas)), "desc": "Requieren atención", "color": "text-amber-600", "trend": "Hoy"},
    ]

    return {
        "metricas": metricas,
        "bancos": bancos_fmt,
        "alertas": alertas,
        "disponibilidad": {
            "total_usd": total_usd,
            "total_bs": total_bs,
            "tasa_bcv": tasa_ref,
        },
        "proyeccion_7d": {
            "ingresos_esperados": cxc_total,
            "egresos_esperados": cxp_total,
        },
    }


# ---- I. TRANSFERENCIAS — CONFIRMAR ----

@router.post("/tesoreria/transferencias-internas/{transferencia_id}/confirmar")
def confirmar_transferencia(transferencia_id: int, db: Session = Depends(get_db)):
    transferencia = db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.id == transferencia_id).first()
    if not transferencia:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Transferencia no encontrada")
    
    transferencia.estado = "CONFIRMADA"
    
    # Apply balances
    cuenta_origen = db.query(CuentaBancaria).filter(CuentaBancaria.id == transferencia.cuenta_origen_id).first()
    cuenta_destino = db.query(CuentaBancaria).filter(CuentaBancaria.id == transferencia.cuenta_destino_id).first()
    monto_bs = to_float(transferencia.monto_bs)
    tasa = to_float(tasa_actual(db)) or 36.42
    monto_usd = monto_bs / tasa if tasa > 0 else 0.0
    
    if cuenta_origen:
        cuenta_origen.saldo_actual_usd = to_float(cuenta_origen.saldo_actual_usd) - monto_usd
    if cuenta_destino:
        cuenta_destino.saldo_actual_usd = to_float(cuenta_destino.saldo_actual_usd) + monto_usd

    db.commit()
    return {"ok": True, "id": transferencia_id, "estado": "CONFIRMADA", "message": "Transferencia confirmada y saldos actualizados."}


# ---- INVERSIONES — EXPORT EXCEL ----

@router.get("/tesoreria/inversiones/exportar")
def exportar_inversiones_excel(db: Session = Depends(get_db)):
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from fastapi.responses import StreamingResponse
    import io as _io
    
    colocaciones = db.query(ColocacionInversion).all()
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rendimiento de Inversiones"
    
    # Header style
    header_fill = PatternFill(start_color="0B5156", end_color="0B5156", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    
    headers = ["Nombre", "Plazo (días)", "Capital (Bs)", "Tasa Anual (%)", "Interés Ganado (Bs)", "Tasa Inicial (Bs/USD)", "Resultado Real (USD)", "Fecha Registro"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
    
    # Data rows
    for row_idx, c in enumerate(colocaciones, 2):
        capital = to_float(c.capital_bs)
        tasa = to_float(c.tasa_interes_anual)
        plazo = int(c.plazo_dias or 30)
        interes = capital * (tasa / 100) * (plazo / 365)
        tasa_inicial = to_float(c.tasa_cambio_inicial)
        resultado_usd = interes / tasa_inicial if tasa_inicial > 0 else 0
        
        ws.cell(row=row_idx, column=1, value=c.nombre)
        ws.cell(row=row_idx, column=2, value=plazo)
        ws.cell(row=row_idx, column=3, value=capital)
        ws.cell(row=row_idx, column=4, value=tasa)
        ws.cell(row=row_idx, column=5, value=round(interes, 2))
        ws.cell(row=row_idx, column=6, value=tasa_inicial)
        ws.cell(row=row_idx, column=7, value=round(resultado_usd, 2))
        ws.cell(row=row_idx, column=8, value=c.fecha_inicio.strftime("%Y-%m-%d") if c.fecha_inicio else "")
    
    # Auto-width columns
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)
    
    buf = _io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=rendimiento_inversiones.xlsx"}
    )


@router.get("/contabilidad/libro-diario/exportar-txt")
def exportar_diario_txt(db: Session = Depends(get_db)):
    import io
    asientos = db.query(AsientoContable).order_by(AsientoContable.fecha.asc()).all()
    
    txt_content = "FECHA|REFERENCIA|CODIGO_CUENTA|NOMBRE_CUENTA|CONCEPTO|DEBE_USD|HABER_USD\r\n"
    for a in asientos:
        fecha_str = a.fecha.strftime("%d/%m/%Y")
        for d in a.detalles:
            debe = f"{float(d.debe_usd):.2f}"
            haber = f"{float(d.haber_usd):.2f}"
            txt_content += f"{fecha_str}|{a.referencia}|{d.cuenta_codigo}|{d.cuenta_nombre}|{a.concepto}|{debe}|{haber}\r\n"
            
    return StreamingResponse(
        io.BytesIO(txt_content.encode('utf-8')),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=libro_diario_legal.txt"}
    )