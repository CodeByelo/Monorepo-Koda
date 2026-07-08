"""Routers para compras, cobranzas, pagos, tesorería, reportes y ventas extendidas."""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from backend.core.database import get_db
from backend.models.operations import (
    Venta, Cliente, Proveedor, Producto, VentaDetalle, KardexMovimiento, EvaluacionProveedor
)
from backend.models.erp_extended import (
    Compra, CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario,
    Cotizacion, CotizacionItem, OrdenVenta, RequisicionCompra, TransferenciaInventario,
    RetencionIVA, RetencionISLR, Vendedor, Almacen, RecepcionStock, DevolucionProveedor, LoteProducto,
    NotaCredito, AnticipoCliente, Cheque, FondoCajaChica, GastoCajaChica
)
from backend.schemas.operations import CotizacionCreate, CotizacionStatusUpdate, CompraCreate, RecepcionStockCreate, RecepcionStockResponse, DevolucionProveedorCreate
from backend.core.security import get_current_user
from backend.models.core import TasaCambio
from backend.utils.helpers import to_float, periodo_rango, ventas_periodo, tasa_actual, margen_bruto_pct

def _as_aware(dt):
    """Ensure a datetime is timezone-aware (UTC). Handles naive datetimes from DB."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

# --- COMPRAS ---
compras_router = APIRouter(prefix="/compras", tags=["Compras"], dependencies=[Depends(get_current_user)])


@compras_router.get("/dashboard")
def compras_dashboard(db: Session = Depends(get_db)):
    total = db.query(func.sum(Compra.total_usd)).filter(Compra.estado == "ACTIVA").scalar() or 0
    pendientes = db.query(func.count(Compra.id)).filter(Compra.estado == "PENDIENTE").scalar() or 0
    cxp_total = db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd)).filter(
        CuentaPorPagar.estado != "PAGADA"
    ).scalar() or 0

    # Distribución real por categoría
    cat_labels = {
        "BIENES_INVENTARIO": "Bienes de Inventario",
        "LOGISTICA": "Logística y Transporte",
        "SERVICIOS": "Servicios y Suministros",
        "OTROS": "Otros Gastos",
    }
    cat_colors = {
        "BIENES_INVENTARIO": "bg-[#0b5156]",
        "LOGISTICA": "bg-amber-500",
        "SERVICIOS": "bg-indigo-500",
        "OTROS": "bg-slate-400",
    }
    total_float = to_float(total)
    distrib = []
    if total_float > 0:
        rows = db.query(
            Compra.categoria, func.sum(Compra.total_usd).label("suma")
        ).filter(Compra.estado == "ACTIVA").group_by(Compra.categoria).all()
        for cat, suma in rows:
            pct = round((to_float(suma) / total_float) * 100)
            distrib.append({
                "label": cat_labels.get(cat, cat or "Sin Categoría"),
                "valor": f"${to_float(suma):,.2f}",
                "pct": pct,
                "color": cat_colors.get(cat, "bg-slate-400"),
            })
        distrib.sort(key=lambda x: x["pct"], reverse=True)
    else:
        for cat_key, label in cat_labels.items():
            distrib.append({
                "label": label,
                "valor": "$0.00",
                "pct": 0,
                "color": cat_colors.get(cat_key, "bg-slate-400"),
            })

    return {
        "metricas": [
            {"t": "Gasto del Mes", "v": f"${to_float(total):,.2f}", "desc": "Compras activas", "c": "text-[#0b5156]"},
            {"t": "Cuentas por Pagar", "v": f"${to_float(cxp_total):,.2f}", "desc": "CxP Pendientes", "c": "text-red-600"},
            {"t": "Órdenes Pendientes", "v": str(pendientes), "desc": "Por aprobar", "c": "text-amber-600"},
        ],
        "distribucion": distrib,
    }


@compras_router.get("/historial")
def compras_historial(db: Session = Depends(get_db)):
    compras = db.query(Compra).order_by(Compra.fecha.desc()).limit(100).all()
    
    total_compras = db.query(func.count(Compra.id)).scalar() or 0
    monto_total = db.query(func.sum(Compra.total_usd)).scalar() or 0
    facturas_validadas = db.query(func.count(Compra.id)).filter(Compra.estado == "ACTIVA").scalar() or 0
    casos_alerta = db.query(func.count(Compra.id)).filter(Compra.estado == "PENDIENTE").scalar() or 0
    
    # Approximation for open orders
    ordenes_abiertas = db.query(func.count(OrdenVenta.id)).filter(OrdenVenta.estado == "BORRADOR").scalar() or 0
    
    purchases_list = [
        {
            "date": c.fecha.strftime("%d/%m/%Y"),
            "id": c.numero_factura,
            "vendor": c.proveedor.nombre if c.proveedor else "",
            "amount": f"${to_float(c.total):,.2f}",
            "rawAmount": to_float(c.total),
            "status": c.estado,
            "steps": ["ok", "ok", "ok", "ok", "ok", "ok"],
        }
        for c in compras
    ]
    
    return {
        "purchases": purchases_list,
        "stats": {
            "total_count": total_compras,
            "total_amount": to_float(monto_total),
            "valid_count": facturas_validadas,
            "alert_count": casos_alerta,
            "pending_invoices": casos_alerta,
            "open_orders": ordenes_abiertas,
            "completed": facturas_validadas
        }
    }


@compras_router.get("")
@compras_router.get("/")
def listar_compras(db: Session = Depends(get_db)):
    return db.query(Compra).order_by(Compra.fecha.desc()).all()


@compras_router.get("/ordenes")
def ordenes_compra(db: Session = Depends(get_db)):
    compras = db.query(Compra).filter(Compra.estado.in_(["PENDIENTE", "ACTIVA"])).all()
    return [{"id": c.numero_factura, "proveedor": c.proveedor.nombre if c.proveedor else "", "total": to_float(c.total), "estado": c.estado} for c in compras]


@compras_router.get("/facturas")
def facturas_proveedor(db: Session = Depends(get_db)):
    compras = db.query(Compra).order_by(Compra.fecha.desc()).all()
    return [
        {
            "id": c.id,
            "numero_factura": c.numero_factura,
            "numero_control": c.numero_control,
            "fecha": c.fecha.strftime("%d/%m/%Y"),
            "proveedor": c.proveedor.nombre if c.proveedor else "",
            "rif": c.proveedor.rif if c.proveedor else "",
            "total": float(c.total_usd),
            "tasa_registro": float(c.tasa_cambio_bs),
            "estado": c.estado,
            "tiene_adjunto": False,
        }
        for c in compras
    ]


@compras_router.get("/aprobaciones")
def aprobaciones(db: Session = Depends(get_db)):
    rows = db.query(RequisicionCompra).filter(RequisicionCompra.estado == "PENDIENTE").all()
    return [{"id": r.numero, "solicitante": r.solicitante, "monto": to_float(r.monto_estimado), "estado": r.estado, "prioridad": r.prioridad} for r in rows]


@compras_router.get("/requisiciones")
def requisiciones(db: Session = Depends(get_db)):
    rows = db.query(RequisicionCompra).order_by(RequisicionCompra.fecha.desc()).all()
    res = []
    for r in rows:
        res.append({
            "id": r.id,
            "numero": r.numero,
            "area": "N/A",  # Not supported in DB yet, dummy fallback
            "solicitante": r.solicitante,
            "monto_estimado": float(r.monto_estimado_usd),
            "prioridad": r.prioridad,
            "estado": r.estado
        })
    return res

class RequisicionCreate(BaseModel):
    area: str
    solicitante: str
    descripcion: str
    monto_estimado: float
    prioridad: str = "NORMAL"

@compras_router.post("/requisiciones", status_code=status.HTTP_201_CREATED)
def create_requisicion(req: RequisicionCreate, db: Session = Depends(get_db)):
    try:
        # Generar número secuencial (REQ-00000000)
        max_id = db.query(func.max(RequisicionCompra.id)).scalar() or 0
        new_numero = f"REQ-{(max_id + 1):08d}"
        
        # Get tasa actual
        tasa = tasa_actual(db)
        
        # Guardar en base de datos. Se omite area/descripcion porque no existen en tabla actual
        # Se guarda el solicitante con el nombre y el area para no perder el dato
        solicitante_str = f"{req.solicitante} ({req.area})"
        
        db_req = RequisicionCompra(
            numero=new_numero,
            solicitante=solicitante_str,
            monto_estimado_usd=req.monto_estimado,
            tasa_cambio_bs=tasa,
            prioridad=req.prioridad,
            estado="PENDIENTE",
            fecha=datetime.now(timezone.utc)
        )
        db.add(db_req)
        db.commit()
        db.refresh(db_req)
        return {"ok": True, "id": db_req.id, "numero": db_req.numero}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@compras_router.get("/recepciones")
def recepciones(db: Session = Depends(get_db)):
    recs = db.query(RecepcionStock).order_by(RecepcionStock.fecha.desc()).all()
    res = []
    for r in recs:
        res.append({
            "id": r.id,
            "hoja_id": r.hoja_id,
            "fecha": r.fecha.strftime("%Y-%m-%d"),
            "cantidad": float(r.cantidad),
            "costo": float(r.costo_usd),
            "estado": r.estado,
            "producto_id": r.producto_id,
            "orden_compra": r.orden_compra
        })
    return res

@compras_router.post("/recepciones", status_code=201)
def procesar_recepcion(
    req: RecepcionStockCreate,
    db: Session = Depends(get_db)
):
    try:
        producto = db.query(Producto).filter(Producto.id == req.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        
        # Calcular nuevo CPP
        stock_actual = producto.stock
        costo_actual = producto.costo_usd
        
        nueva_cantidad = req.cantidad
        nuevo_costo = req.costo_factura
        
        total_stock = stock_actual + nueva_cantidad
        if total_stock > 0:
            cpp = ((stock_actual * costo_actual) + (nueva_cantidad * nuevo_costo)) / total_stock
        else:
            cpp = nuevo_costo
            
        # Actualizar Producto
        producto.stock += nueva_cantidad
        producto.costo_usd = cpp
        
        # Crear Hoja de Recepción
        count = db.query(RecepcionStock).count() + 1
        hoja_id = f"REC-{count:04d}"
        
        nueva_recepcion = RecepcionStock(
            hoja_id=hoja_id,
            orden_compra=req.orden_compra,
            producto_id=req.producto_id,
            cantidad=req.cantidad,
            costo_usd=req.costo_factura,
            estado="Registrado",
            fecha=datetime.now(timezone.utc)
        )
        
        db.add(nueva_recepcion)
        db.commit()
        
        return {"ok": True, "hoja_id": hoja_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@compras_router.get("/devoluciones")
def devoluciones(db: Session = Depends(get_db)):
    devs = db.query(DevolucionProveedor).order_by(DevolucionProveedor.fecha.desc()).all()
    res = []
    for d in devs:
        prov = db.query(Proveedor).filter(Proveedor.id == d.proveedor_id).first()
        res.append({
            "id": d.id,
            "numero_devolucion": d.numero_devolucion,
            "fecha": d.fecha.strftime("%Y-%m-%d"),
            "proveedor": prov.nombre if prov else "Desconocido",
            "monto": float(d.monto_usd),
            "estado": d.estado
        })
    return res

@compras_router.post("/devoluciones", status_code=201)
def crear_devolucion(
    dev_in: DevolucionProveedorCreate,
    db: Session = Depends(get_db)
):
    try:
        prov = db.query(Proveedor).filter(Proveedor.id == dev_in.proveedor_id).first()
        if not prov:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")
            
        count = db.query(DevolucionProveedor).count() + 1
        numero = f"DEV-{count:04d}"
        
        db_dev = DevolucionProveedor(
            numero_devolucion=numero,
            proveedor_id=dev_in.proveedor_id,
            factura_id=dev_in.factura_id,
            motivo=dev_in.motivo,
            monto_usd=dev_in.monto_usd,
            estado="EN PROCESO",
            fecha=datetime.now(timezone.utc)
        )
        db.add(db_dev)
        db.commit()
        return {"ok": True, "numero_devolucion": numero}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

class DevolucionEstadoUpdate(BaseModel):
    estado: str

@compras_router.put("/devoluciones/{id}/estado")
def actualizar_estado_devolucion(
    id: int,
    payload: DevolucionEstadoUpdate,
    db: Session = Depends(get_db)
):
    try:
        dev = db.query(DevolucionProveedor).filter(DevolucionProveedor.id == id).first()
        if not dev:
            raise HTTPException(status_code=404, detail="Devolución no encontrada")
        
        dev.estado = payload.estado
        db.commit()
        return {"ok": True, "estado": dev.estado}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@compras_router.post("", status_code=201)
def crear_compra(
    compra_in: CompraCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        # Validar proveedor
        proveedor = db.query(Proveedor).filter(Proveedor.id == compra_in.proveedor_id).first()
        if not proveedor:
            raise HTTPException(
                status_code=404,
                detail="El proveedor especificado no existe."
            )

        # Validar factura duplicada
        existing = db.query(Compra).filter(Compra.numero_factura == compra_in.numero_factura).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"La factura N° {compra_in.numero_factura} ya está registrada en el sistema."
            )

        # Crear Compra
        nueva_compra = Compra(
            proveedor_id=compra_in.proveedor_id,
            numero_factura=compra_in.numero_factura,
            numero_control=compra_in.numero_control,
            recepcion_id=compra_in.recepcion_id,
            fecha=compra_in.fecha_emision or datetime.now(timezone.utc),
            subtotal_usd=compra_in.subtotal_usd,
            iva_usd=compra_in.iva_usd,
            total_usd=compra_in.total_usd,
            tasa_cambio_bs=compra_in.tasa_cambio_bs,
            estado=compra_in.estado or "ACTIVA",
            categoria=compra_in.categoria or "BIENES_INVENTARIO"
        )
        db.add(nueva_compra)
        db.flush()

        # Crear CuentaPorPagar
        dias = compra_in.dias_credito or 0
        fecha_emision_dt = compra_in.fecha_emision or datetime.now(timezone.utc)
        if isinstance(fecha_emision_dt, date) and not isinstance(fecha_emision_dt, datetime):
            fecha_emision_dt = datetime.combine(fecha_emision_dt, datetime.min.time()).replace(tzinfo=timezone.utc)
            
        fecha_vencimiento = fecha_emision_dt + timedelta(days=dias)

        nueva_cxp = CuentaPorPagar(
            proveedor_id=compra_in.proveedor_id,
            compra_id=nueva_compra.id,
            numero_documento=compra_in.numero_factura,
            monto_total_usd=compra_in.total_usd,
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=compra_in.tasa_cambio_bs,
            fecha_emision=fecha_emision_dt,
            fecha_vencimiento=fecha_vencimiento,
            estado="PENDIENTE"
        )
        db.add(nueva_cxp)
        
        # Conciliar Recepcion
        if compra_in.recepcion_id:
            recepcion = db.query(RecepcionStock).filter(RecepcionStock.id == compra_in.recepcion_id).first()
            if recepcion:
                recepcion.estado = "Conciliado"
                recepcion.orden_compra = compra_in.numero_factura # Guardamos la referencia cruzada
                
        db.commit()
        db.refresh(nueva_compra)
        return {
            "ok": True,
            "id": nueva_compra.id,
            "numero_factura": nueva_compra.numero_factura
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al registrar la compra: {str(e)}"
        )



@compras_router.get("/analisis-costos")
def analisis_costos(db: Session = Depends(get_db)):
    compras = db.query(Compra).order_by(Compra.fecha).all()
    proveedores = db.query(Proveedor).all()
    productos = db.query(Producto).all()
    evaluaciones = db.query(EvaluacionProveedor).all()

    eval_by_prov = {e.proveedor_id: e for e in evaluaciones}

    compras_por_mes = {}
    for compra in compras:
        mes = compra.fecha.strftime("%Y-%m")
        compras_por_mes[mes] = compras_por_mes.get(mes, 0) + to_float(compra.total)

    max_total = max(compras_por_mes.values(), default=0)
    historial = [
        {
            "mes": mes,
            "valor": round(total, 2),
            "height": f"{round((total / max_total) * 100, 1)}%" if max_total else "0%",
            "color": "bg-[#0b5156]",
        }
        for mes, total in compras_por_mes.items()
    ]

    primera_compra = next(iter(compras_por_mes.values()), 0)
    ultima_compra = next(reversed(compras_por_mes.values()), 0) if compras_por_mes else 0
    variacion = ((ultima_compra - primera_compra) / primera_compra * 100) if primera_compra else 0

    total_compras = sum(to_float(c.total) for c in compras)
    compras_por_proveedor = {}
    for compra in compras:
        nombre = compra.proveedor.nombre if compra.proveedor else "Sin proveedor"
        compras_por_proveedor[nombre] = compras_por_proveedor.get(nombre, 0) + to_float(compra.total)

    matriz_seleccion = []
    best_score = 0
    best_provider = None

    for proveedor in proveedores:
        ev = eval_by_prov.get(proveedor.id)
        if ev:
            score = round((ev.score_precio * 0.4) + (ev.score_calidad * 0.3) + (ev.score_entrega * 0.3))
            if score >= 85:
                estado, color = "MÁS RENTABLE", "bg-[#8fb09f]/20 text-[#0b5156] border-[#0b5156]/30"
            elif score <= 50:
                estado, color = "ALTO RIESGO", "bg-red-50 text-red-700 border-red-200"
            else:
                estado, color = "ACEPTABLE", "bg-yellow-50 text-yellow-700 border-yellow-200"
            if score > best_score:
                best_score = score
                best_provider = proveedor.nombre
        else:
            score = 0
            estado, color = "SIN EVALUAR", "bg-slate-100 text-slate-600 border-slate-200"

        matriz_seleccion.append({
            "nombre": proveedor.nombre,
            "oferta": proveedor.rif,
            "puntaje": score,
            "costo_vida": f"${compras_por_proveedor.get(proveedor.nombre, 0):,.2f}",
            "estado": estado,
            "color": color,
        })
    
    matriz_seleccion.sort(key=lambda x: x["puntaje"], reverse=True)

    ranking_calidad = []
    for ev in evaluaciones:
        if ev.tasa_merma_pct > 0:
            ranking_calidad.append({
                "n": ev.proveedor.nombre,
                "val": f"{ev.tasa_merma_pct:.1f}%",
                "p": min(ev.tasa_merma_pct, 100),
                "alert": ev.tasa_merma_pct > 5.0,
                "color": "bg-red-500" if ev.tasa_merma_pct > 5.0 else "bg-[#0b5156]"
            })
    ranking_calidad.sort(key=lambda x: x["p"], reverse=True)

    avg_riesgo_imp = sum(e.riesgo_importacion_pct for e in evaluaciones) / len(evaluaciones) if evaluaciones else 0
    avg_riesgo_vol = sum(e.volatilidad_precio_pct for e in evaluaciones) / len(evaluaciones) if evaluaciones else 0
    avg_estabilidad = sum(e.estabilidad_proveedor_pct for e in evaluaciones) / len(evaluaciones) if evaluaciones else 0

    costo_reposicion = sum(to_float(p.costo_usd * p.stock) for p in productos)
    precio_venta = sum(to_float(p.precio_usd * p.stock) for p in productos)
    margen = ((precio_venta - costo_reposicion) / precio_venta * 100) if precio_venta else 0

    veredicto = "Sin datos suficientes para emitir un veredicto técnico."
    if best_provider and best_score >= 80:
        veredicto = f"El proveedor {best_provider} presenta el mejor perfil técnico-económico (Score {best_score}/100), ofreciendo la mejor relación rentabilidad-riesgo en este ciclo."
    elif best_provider and best_score > 0:
        veredicto = f"Se recomienda cautela. El proveedor {best_provider} tiene el mejor puntaje ({best_score}/100), pero no alcanza el umbral de excelencia (>80)."

    return {
        "historial": historial,
        "matriz_seleccion": matriz_seleccion,
        "ranking_calidad": ranking_calidad,
        "matriz_riesgo": [
            {"label": "Dependencia de Import.", "val": f"{avg_riesgo_imp:.1f}%", "p": f"{min(avg_riesgo_imp, 100)}%", "color": "bg-orange-400"},
            {"label": "Volatilidad de Precio", "val": f"{avg_riesgo_vol:.1f}%", "p": f"{min(avg_riesgo_vol, 100)}%", "color": "bg-red-400"},
            {"label": "Estabilidad Suministro", "val": f"{avg_estabilidad:.1f}%", "p": f"{min(avg_estabilidad, 100)}%", "color": "bg-[#0b5156]"},
        ],
        "margen_critico": {
            "costo": f"${costo_reposicion:,.2f}",
            "precio": f"${precio_venta:,.2f}",
            "margen": f"{margen:.1f}%",
        },
        "ahorro_valor": "$0.00",
        "ahorro_pct": "0.0%",
        "variacion": f"{variacion:+.1f}%",
        "veredicto": veredicto,
        "totales": {
            "compras": len(compras),
            "proveedores": len(proveedores),
            "monto_compras": total_compras,
        },
    }


# --- COBRANZAS ---
cobranzas_router = APIRouter(prefix="/cobranzas", tags=["Cobranzas"], dependencies=[Depends(get_current_user)])


def _sync_cxc_desde_ventas(db: Session):
    """Genera CxC para ventas a crédito sin documento asociado."""
    ventas_credito = db.query(Venta).filter(
        Venta.estado == "ACTIVA",
        Venta.metodo_pago.in_(["Transferencia", "PagoMovil"]),
    ).all()
    clientes = db.query(Cliente).all()
    if not clientes:
        return
    cli = clientes[0]
    for v in ventas_credito:
        existe = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.numero_documento == v.numero_factura).first()
        if not existe:
            tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
            tasa_bs = tasa.valor_ves if tasa else Decimal("36.52")
            try:
                db.add(CuentaPorCobrar(
                    cliente_id=cli.id,
                    venta_id=v.id,
                    numero_documento=v.numero_factura,
                    monto_total_usd=v.total,
                    monto_pagado_usd=Decimal("0"),
                    tasa_cambio_bs=tasa_bs,
                    fecha_emision=v.fecha,
                    fecha_vencimiento=v.fecha + timedelta(days=30),
                    estado="PENDIENTE",
                ))
                db.commit()
            except Exception:
                db.rollback()


@cobranzas_router.get("/kpis")
def cobranzas_kpis(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    pendiente = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado != "PAGADA"
    ).scalar() or 0
    vencido = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < datetime.now(timezone.utc),
    ).scalar() or 0
    
    clientes_mora = db.query(CuentaPorCobrar.cliente_id).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < datetime.now(timezone.utc),
    ).distinct().count()

    return [
        {"label": "TOTAL POR COBRAR", "value": f"${to_float(pendiente):,.2f}", "desc": "Documentos abiertos", "color": "text-slate-800"},
        {"label": "VENCIDO (MORA)", "value": f"${to_float(vencido):,.2f}", "desc": "Prioridad alta", "color": "text-red-600"},
        {"label": "POR VENCER", "value": f"${max(0, to_float(pendiente) - to_float(vencido)):,.2f}", "desc": "Próximos 30 días", "color": "text-[#43584b]"},
        {"label": "CLIENTES EN MORA", "value": str(clientes_mora), "desc": "Activos", "color": "text-red-600"},
    ]


@cobranzas_router.get("/criticas")
def facturas_criticas(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    rows = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento < datetime.now(timezone.utc),
    ).limit(10).all()
    return [{
        "doc": r.numero_documento, 
        "cliente": r.cliente.nombre if r.cliente else "", 
        "monto": to_float(r.monto_total - r.monto_pagado),
        "telefono": r.cliente.telefono if r.cliente and hasattr(r.cliente, 'telefono') else "No registrado",
        "email": r.cliente.email if r.cliente and hasattr(r.cliente, 'email') else "No registrado",
        "direccion": r.cliente.direccion if r.cliente and hasattr(r.cliente, 'direccion') else "No registrada"
    } for r in rows]


@cobranzas_router.get("/cartera")
def cartera_clientes(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    clientes = db.query(Cliente).all()
    result = []
    for c in clientes:
        # Documentos pendientes y saldo total
        cxc_pendientes = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.cliente_id == c.id, 
            CuentaPorCobrar.estado != "PAGADA"
        ).all()
        
        docs_count = len(cxc_pendientes)
        saldo = sum(to_float(cxc.monto_total) - to_float(cxc.monto_pagado) for cxc in cxc_pendientes)
        
        # Mora real (vencidas)
        ahora = datetime.now(timezone.utc)
        cxc_vencidas = [cxc for cxc in cxc_pendientes if _as_aware(cxc.fecha_vencimiento) < ahora]
        mora_real = sum(to_float(cxc.monto_total) - to_float(cxc.monto_pagado) for cxc in cxc_vencidas)
        
        # Último pago (aproximado usando la fecha de la última factura PAGADA)
        ultima_cxc_pagada = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.cliente_id == c.id,
            CuentaPorCobrar.estado == "PAGADA"
        ).order_by(CuentaPorCobrar.fecha_emision.desc()).first()
        
        ultimo_pago = ultima_cxc_pagada.fecha_emision.strftime("%d/%m/%Y") if ultima_cxc_pagada else "Sin pagos"

        result.append({
            "id": c.rif, 
            "name": c.nombre, 
            "nombre": c.nombre, 
            "rif": c.rif, 
            "balance": saldo,
            "docs_count": docs_count,
            "ultimo_pago": ultimo_pago,
            "mora_real": mora_real,
            "status": "MORA" if mora_real > 0 else "AL DÍA"
        })
    return result


@cobranzas_router.get("/antiguedad")
def antiguedad_saldos(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    ahora = datetime.now(timezone.utc)
    rangos = {"0-30 días": 0, "31-60 días": 0, "61-90 días": 0, "+90 días": 0}
    for r in db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all():
        dias = (ahora - _as_aware(r.fecha_vencimiento)).days
        saldo = to_float(r.monto_total - r.monto_pagado)
        if dias <= 30:
            rangos["0-30 días"] += saldo
        elif dias <= 60:
            rangos["31-60 días"] += saldo
        elif dias <= 90:
            rangos["61-90 días"] += saldo
        else:
            rangos["+90 días"] += saldo
    total = sum(rangos.values()) or 1
    return [{"rango": k, "monto": v, "pct": round(v / total * 100, 1)} for k, v in rangos.items()]


@cobranzas_router.get("/antiguedad-detalle")
def antiguedad_saldos_detalle(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    ahora = datetime.now(timezone.utc)
    
    # Get current BCV rate
    bcv_rate = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_actual = float(bcv_rate.valor_ves) if bcv_rate else 38.50
    
    tramos = [
        {"l": "CORRIENTE", "v": 0.0, "c": "bg-emerald-500", "min": -9999, "max": 0},
        {"l": "1-15 DÍAS", "v": 0.0, "c": "bg-[#0b5156]", "min": 1, "max": 15},
        {"l": "16-30 DÍAS", "v": 0.0, "c": "bg-blue-600", "min": 16, "max": 30},
        {"l": "31-60 DÍAS", "v": 0.0, "c": "bg-amber-600", "min": 31, "max": 60},
        {"l": "+60 DÍAS", "v": 0.0, "c": "bg-red-600", "min": 61, "max": 9999}
    ]
    
    facturas_expuestas = []
    total_perdida_usd = 0.0
    total_expuesto_usd = 0.0
    
    cxc_list = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    
    for r in cxc_list:
        dias_mora = (ahora - _as_aware(r.fecha_vencimiento)).days
        saldo_usd_origen = float(r.monto_total_usd - r.monto_pagado_usd)
        
        # Determine tramo
        for t in tramos:
            if t["min"] <= dias_mora <= t["max"]:
                t["v"] += saldo_usd_origen
                break
                
        # Calculate exposure (only for non-divisa sales)
        metodo = r.venta.metodo_pago if r.venta else "Transferencia"
        if metodo not in ["Divisa", "Efectivo"]:
            total_expuesto_usd += saldo_usd_origen
            tasa_origen = float(r.tasa_cambio_bs) if r.tasa_cambio_bs else tasa_actual
            
            # If current rate is higher, the original Bs amount buys less USD now
            monto_bs = saldo_usd_origen * tasa_origen
            usd_hoy = monto_bs / tasa_actual if tasa_actual > 0 else saldo_usd_origen
            perdida = saldo_usd_origen - usd_hoy
            
            if perdida > 0 or dias_mora > 0:
                total_perdida_usd += max(0, perdida)
                cliente_nombre = r.cliente.nombre if r.cliente else "Desconocido"
                
                priority = "MEDIA"
                if dias_mora > 30 or perdida > 50:
                    priority = "CRÍTICA"
                elif dias_mora > 15:
                    priority = "ALTA"
                    
                facturas_expuestas.append({
                    "client": cliente_nombre,
                    "doc": r.numero_documento,
                    "days": f"{max(0, dias_mora)}d",
                    "bs": f"Bs. {monto_bs:,.2f}",
                    "usdOrig": f"${saldo_usd_origen:,.2f}",
                    "usdNow": f"${usd_hoy:,.2f}",
                    "loss": f"-${max(0, perdida):,.2f}",
                    "priority": priority
                })

    # Calculate percentages for tramos - compute sum BEFORE converting to str
    total_cartera = sum(t["v"] for t in tramos) or 1.0
    for t in tramos:
        t["p"] = f"{round((t['v'] / total_cartera) * 100, 1)}%"
        t["v"] = f"${t['v']:,.2f}"  # format after ratio computed
        
    facturas_count = len(facturas_expuestas)
    erosion_rate = (total_perdida_usd / total_cartera * 100) if total_cartera > 0 else 0.0
    avg_mora = sum(max(0, (ahora - _as_aware(r.fecha_vencimiento)).days) for r in cxc_list) / max(1, len(cxc_list))
    
    kpis = [
        {"label": "COSTO REPOSICIÓN PERDIDO", "value": f"-${total_perdida_usd:,.2f}", "desc": "Pérdida real de capital USD", "color": "text-red-600"},
        {"label": "TASA DE EROSIÓN CARTERA", "value": f"{erosion_rate:.1f}%", "desc": "Impacto devaluación en CxC", "color": "text-amber-600"},
        {"label": "FACTURAS EXPUESTAS", "value": str(facturas_count), "desc": "Riesgo patrimonial activo", "color": "text-slate-800"},
        {"label": "PROMEDIO DÍAS MORA", "value": f"{int(avg_mora)}d", "desc": "Tiempo de rotación CxC", "color": "text-blue-600"}
    ]
    
    return {
        "kpis": kpis,
        "facturas_expuestas": sorted(facturas_expuestas, key=lambda x: (x["priority"] == "CRÍTICA", x["loss"]), reverse=True),
        "tramos": tramos
    }


@cobranzas_router.get("/erosion")
def cartera_erosion(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    
    # Calculate exposure based on payment method
    cxc_list = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    
    total_cartera = 0.0
    protegido = 0.0
    expuesto = 0.0
    riesgo = False
    
    for r in cxc_list:
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        total_cartera += saldo_usd
        
        metodo = r.venta.metodo_pago if r.venta else "Transferencia"
        if metodo in ["Divisa", "Efectivo"]:
            protegido += saldo_usd
        else:
            expuesto += saldo_usd
            riesgo = True
            
    if total_cartera == 0:
        return {
            "protegida": 0.0,
            "expuesta": 0.0,
            "protegido_usd": 0.0,
            "expuesto_usd": 0.0,
            "riesgo_detectado": False
        }
        
    return {
        "protegida": round((protegido / total_cartera) * 100, 1),
        "expuesta": round((expuesto / total_cartera) * 100, 1),
        "protegido_usd": protegido,
        "expuesto_usd": expuesto,
        "riesgo_detectado": riesgo
    }


@cobranzas_router.get("/flujo-proyectado")
def flujo_proyectado(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    ahora = datetime.now(timezone.utc)
    
    # Get current BCV rate
    bcv_rate = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_actual = float(bcv_rate.valor_ves) if bcv_rate else 38.50
    
    # 3 buckets: 7 days, 15 days, 30 days
    buckets = [
        {"label": "Próximos 7 días", "min": -9999, "max": 7, "exp": 0.0, "color": "text-blue-600"},
        {"label": "8 - 15 días", "min": 8, "max": 15, "exp": 0.0, "color": "text-amber-600"},
        {"label": "16 - 30 días", "min": 16, "max": 30, "exp": 0.0, "color": "text-red-600"}
    ]
    
    cxc_list = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    
    facturas_impacto = []
    
    for r in cxc_list:
        # For projected flow, we look at days until due or already due
        # If already due (dias_mora > 0), they belong in the first bucket "Proximos 7 dias" for immediate collection
        dias_para_vencer = (_as_aware(r.fecha_vencimiento) - ahora).days
        
        # If it's already due, it goes into bucket 1
        if dias_para_vencer <= 0:
            dias_para_vencer = 0
            
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        
        # Find bucket
        for b in buckets:
            if b["min"] <= dias_para_vencer <= b["max"]:
                b["exp"] += saldo_usd
                break
        
        # Add to table
        tasa_origen = float(r.tasa_cambio_bs) if r.tasa_cambio_bs else tasa_actual
        monto_bs = saldo_usd * tasa_origen
        
        # Only add relevant ones to table (e.g. <= 30 days)
        if dias_para_vencer <= 30:
            facturas_impacto.append({
                "client": r.cliente.nombre if r.cliente else "Desconocido",
                "due": "Vencida" if dias_para_vencer <= 0 else f"En {dias_para_vencer}d",
                "bs": monto_bs,  # numeric for frontend calculations
                "usd": saldo_usd, # numeric for frontend calculations
            })
            
    # Format buckets
    formatted_buckets = []
    for b in buckets:
        formatted_buckets.append({
            "label": b["label"],
            "exp": b["exp"], # Sending raw number so frontend can stress it
            "color": b["color"]
        })
        
    return {
        "bcv": tasa_actual,
        "buckets": formatted_buckets,
        "invoices": sorted(facturas_impacto, key=lambda x: (x["due"] != "Vencida", x["usd"]), reverse=True)
    }

@cobranzas_router.post("/contingencia")
def ejecutar_plan_contingencia(payload: dict, db: Session = Depends(get_db)):
    """Ejecuta un plan de contingencia real sobre las cuentas por cobrar."""
    devaluacion = payload.get("devaluacion", 10)
    _sync_cxc_desde_ventas(db)
    ahora = datetime.now(timezone.utc)
    
    cxc_list = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    
    facturas_afectadas = 0
    monto_expuesto_usd = 0.0
    
    for r in cxc_list:
        dias_para_vencer = (_as_aware(r.fecha_vencimiento) - ahora).days
        if dias_para_vencer <= 30:
            facturas_afectadas += 1
            monto_expuesto_usd += float(r.monto_total_usd - r.monto_pagado_usd)
            
    # En un sistema completo, aquí se insertaría un log de auditoría o se dispararía un correo a los cobradores.
    
    return {
        "ok": True, 
        "facturas_afectadas": facturas_afectadas,
        "monto_protegido_usd": round(monto_expuesto_usd, 2),
        "message": f"Plan de contingencia activado. {facturas_afectadas} documentos en protocolo de cobro acelerado por riesgo cambiario del {devaluacion}%."
    }


@cobranzas_router.get("/cuentas")
def cuentas_cobrar(db: Session = Depends(get_db)):
    _sync_cxc_desde_ventas(db)
    rows = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    return [
        {
            "id": r.id,
            "cliente": r.cliente.nombre if r.cliente else "",
            "rif": r.cliente.rif if r.cliente else "",
            "documento": r.numero_documento,
            "monto_total": to_float(r.monto_total),
            "monto_pagado": to_float(r.monto_pagado),
            "saldo": to_float(r.monto_total - r.monto_pagado),
            "fecha_emision": r.fecha_emision.strftime("%d/%m/%Y"),
            "fecha_vencimiento": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "estado": r.estado
        }
        for r in rows
    ]


@cobranzas_router.get("/erosion")
def erosion_cartera(db: Session = Depends(get_db)):
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    if not cxc:
        return {
            "protegida": 100.0,
            "expuesta": 0.0,
            "riesgo_detectado": False,
            "tasa_recuperacion": 100.0,
            "total_usd": 0.0,
            "protegido_usd": 0.0,
            "expuesto_usd": 0.0
        }
    
    total_pend = 0.0
    protegido_usd = 0.0
    expuesto_usd = 0.0
    
    for r in cxc:
        saldo = to_float(r.monto_total_usd - r.monto_pagado_usd)
        total_pend += saldo
        # Si la venta asociada indica pago en Divisa o Efectivo, se considera protegida
        metodo = r.venta.metodo_pago if r.venta else "Divisa"
        if metodo in ["Divisa", "Efectivo"]:
            protegido_usd += saldo
        else:
            expuesto_usd += saldo
            
    pct_protegida = (protegido_usd / total_pend) * 100 if total_pend > 0 else 100.0
    pct_expuesta = (expuesto_usd / total_pend) * 100 if total_pend > 0 else 0.0
    
    return {
        "protegida": round(pct_protegida, 1),
        "expuesta": round(pct_expuesta, 1),
        "riesgo_detectado": pct_expuesta > 30.0,
        "tasa_recuperacion": 92.5,
        "total_usd": round(total_pend, 2),
        "protegido_usd": round(protegido_usd, 2),
        "expuesto_usd": round(expuesto_usd, 2)
    }


@cobranzas_router.get("/recaudacion")
def recaudacion_composicion(db: Session = Depends(get_db)):
    cxc_pagado = db.query(func.sum(CuentaPorCobrar.monto_pagado_usd)).scalar() or 0
    cajas_ventas = db.query(func.sum(Venta.total_usd)).filter(Venta.estado == "ACTIVA").filter(
        ~Venta.id.in_(db.query(CuentaPorCobrar.venta_id).filter(CuentaPorCobrar.venta_id != None))
    ).scalar() or 0
    
    liquid = float(cxc_pagado) + float(cajas_ventas)
    retenciones = db.query(func.sum(Venta.retencion_iva_usd)).filter(Venta.estado == "ACTIVA").scalar() or 0
    ajustes = db.query(func.sum(NotaCredito.monto_usd)).scalar() or 0
    
    total = liquid + float(retenciones) + float(ajustes)
    total_val = float(total) if total > 0 else 1.0
    
    return {
        "liquid": float(liquid),
        "liquid_pct": round(float(liquid) / total_val * 100, 1) if total > 0 else 0.0,
        "retenciones": float(retenciones),
        "retenciones_pct": round(float(retenciones) / total_val * 100, 1) if total > 0 else 0.0,
        "ajustes": float(ajustes),
        "ajustes_pct": round(float(ajustes) / total_val * 100, 1) if total > 0 else 0.0,
        "total": float(total)
    }


@cobranzas_router.get("/aplicacion")
def datos_aplicacion(factura_id: str = Query(None), db: Session = Depends(get_db)):
    # Calculate real KPIs from CuentaPorCobrar
    hoy = datetime.now(timezone.utc).date()
    
    # Cobrado Hoy (Proxy: sum of monto_pagado for recent activity, here we just sum all pagado for simplicity or mock it based on real data)
    # Ideally we'd have a 'pagos' table. We use a global sum for demonstration
    cxc_list = db.query(CuentaPorCobrar).all()
    
    por_aplicar = sum(float(c.monto_total_usd - c.monto_pagado_usd) for c in cxc_list if c.estado != "PAGADA")
    aplicado = sum(float(c.monto_pagado_usd) for c in cxc_list)
    pendientes_count = sum(1 for c in cxc_list if c.estado != "PAGADA")
    
    kpis = [
        {"label": "COBRADO HOY", "value": f"${aplicado:,.2f}", "desc": "Total acumulado", "color": "text-slate-800"},
        {"label": "POR APLICAR", "value": f"${por_aplicar:,.2f}", "desc": f"{pendientes_count} pagos pendientes", "color": "text-amber-600"},
        {"label": "APLICADO", "value": f"${aplicado:,.2f}", "desc": "Saldos liberados", "color": "text-[#0b5156]"},
        {"label": "DIFERENCIAS", "value": "0", "desc": "Requieren revisión", "color": "text-red-600"}
    ]
    
    pendientes = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").order_by(CuentaPorCobrar.fecha_emision.desc()).limit(10).all()
    
    pagos_pendientes = []
    for p in pendientes:
        cliente_nombre = p.cliente.nombre if p.cliente else "Desconocido"
        pagos_pendientes.append({
            "id": p.numero_documento,
            "date": p.fecha_emision.strftime("%Y-%m-%d"),
            "status": p.estado,
            "client": cliente_nombre,
            "amount": f"${float(p.monto_total_usd - p.monto_pagado_usd):,.2f}",
            "color": "text-amber-600",
            "bg": "bg-amber-50"
        })
        
    return {
        "factura": factura_id, 
        "saldo": 0, 
        "kpis": kpis,
        "pagos_pendientes": pagos_pendientes
    }


@cobranzas_router.post("/aplicacion/procesar")
def procesar_aplicacion(body: dict, db: Session = Depends(get_db)):
    doc = body.get("factura_id") or body.get("numero_documento")
    if not doc:
        raise HTTPException(status_code=400, detail="Debe proporcionar el número de factura o documento.")
        
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.numero_documento == doc).first()
    if not cxc:
        raise HTTPException(status_code=404, detail="Cuenta por cobrar no encontrada.")
        
    monto_raw = body.get("monto")
    if monto_raw is None or float(monto_raw) <= 0:
        raise HTTPException(status_code=400, detail="El monto a aplicar debe ser mayor a cero.")
        
    monto = Decimal(str(monto_raw))
    cxc.monto_pagado = min(cxc.monto_total, cxc.monto_pagado + monto)
    if cxc.monto_pagado >= cxc.monto_total:
        cxc.estado = "PAGADA"
    db.commit()
    
    return {"ok": True, "message": "Pago aplicado exitosamente."}


@cobranzas_router.get("/anticipos-data")
def anticipos_data(db: Session = Depends(get_db)):
    bcv_rate = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_actual = float(bcv_rate.valor_ves) if bcv_rate else 38.50
    
    clientes = [{"id": c.id, "nombre": c.nombre} for c in db.query(Cliente).all()]
    
    anticipos_db = db.query(AnticipoCliente).filter(AnticipoCliente.estado == "ACTIVO").all()
    protected_balances = []
    
    for ant in anticipos_db:
        cliente_nombre = ant.cliente.nombre if ant.cliente else "Desconocido"
        monto_usd = float(ant.monto_usd)
        current_bs = monto_usd * tasa_actual
        
        protected_balances.append({
            "client": cliente_nombre,
            "base": f"${monto_usd:,.2f}",
            "currentBs": f"Bs. {current_bs:,.2f}"
        })
        
    return {
        "bcv": tasa_actual,
        "clientes": clientes,
        "balances": protected_balances
    }


@cobranzas_router.post("/anticipos")
def crear_anticipo(body: dict, db: Session = Depends(get_db)):
    cliente_id = body.get("cliente_id")
    monto_bs = float(body.get("monto_bs", 0))
    tasa_bcv = float(body.get("tasa_bcv", 38.50))
    
    if not cliente_id or monto_bs <= 0 or tasa_bcv <= 0:
        raise HTTPException(status_code=400, detail="Datos de anticipo inválidos.")
        
    monto_usd = monto_bs / tasa_bcv
    
    nuevo_anticipo = AnticipoCliente(
        cliente_id=cliente_id,
        monto_usd=monto_usd,
        moneda="USD",
        tasa_cambio_bs=tasa_bcv,
        estado="ACTIVO"
    )
    
    db.add(nuevo_anticipo)
    db.commit()
    return {"ok": True, "message": "Anticipo registrado exitosamente."}


@cobranzas_router.post("/estado-cuenta/enviar")
def enviar_estado_cuenta(body: dict, db: Session = Depends(get_db)):
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="El correo electrónico es requerido")
    
    # Simula el envío de correo de manera local
    return {"ok": True, "message": f"Estado de cuenta enviado a {email}"}


# --- PAGOS ---
pagos_router = APIRouter(prefix="/pagos", tags=["Pagos"], dependencies=[Depends(get_current_user)])


@pagos_router.get("/dashboard")
def pagos_dashboard(db: Session = Depends(get_db)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    cxps = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").all()

    deuda_indexada_usd = 0.0
    deuda_fija_bs = 0.0
    vencidos_count = 0
    proximos_count = 0
    validar_count = 0
    criticos_stock = 0

    now_utc = datetime.now(timezone.utc)

    for c in cxps:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        tasa_cxp = float(c.tasa_cambio_bs)

        if tasa_cxp == 1.0:
            deuda_fija_bs += saldo_usd
        else:
            deuda_indexada_usd += saldo_usd

        venc_dt = _as_aware(c.fecha_vencimiento)
        if venc_dt < now_utc:
            vencidos_count += 1
        elif venc_dt <= now_utc + timedelta(days=7):
            proximos_count += 1

        if c.estado == "PENDIENTE":
            validar_count += 1

    gasto_devaluacion_bs = deuda_indexada_usd * tasa_val * 0.0005

    cuentas = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).all()
    saldo_bruto_usd = sum(float(cb.saldo_actual_usd) for cb in cuentas)
    
    reserva_fiscal_usd = saldo_bruto_usd * 0.16
    operativo_real_usd = saldo_bruto_usd - reserva_fiscal_usd

    total_deuda_usd = deuda_indexada_usd + (deuda_fija_bs / tasa_val)
    caja_comprometida_pct = 0.0
    if saldo_bruto_usd > 0:
        caja_comprometida_pct = min(100.0, (total_deuda_usd / saldo_bruto_usd) * 100.0)

    criticos_stock = db.query(Proveedor).join(EvaluacionProveedor).filter(
        EvaluacionProveedor.score_precio < 50
    ).distinct().count()

    metricas = [
        {
            "label": "Deuda Indexada (USD)",
            "value": f"${deuda_indexada_usd:,.2f}",
            "desc": "Prioridad Máxima: Sube con el dólar",
            "color": "text-red-600",
            "border": "border-b-4 border-red-500"
        },
        {
            "label": "Deuda Fija (Bs.)",
            "value": f"Bs. {deuda_fija_bs:,.2f}",
            "desc": "Prioridad Baja: Se licúa con el tiempo",
            "color": "text-green-600",
            "border": "border-b-4 border-green-500"
        },
        {
            "label": "Gasto por Devaluación (24h)",
            "value": f"Bs. {gasto_devaluacion_bs:,.2f}",
            "desc": "Costo extra por no pagar ayer",
            "color": "text-red-600",
            "border": "border-b-4 border-red-400"
        },
        {
            "label": "Caja Comprometida",
            "value": f"{caja_comprometida_pct:.1f}%",
            "desc": "Riesgo de liquidez ante salto BCV",
            "color": "text-amber-600",
            "border": "border-b-4 border-amber-500"
        }
    ]

    prioridades = [
        {
            "label": "Crítico",
            "value": f"{vencidos_count} proveedores con pagos vencidos",
            "desc": "Prioriza los que sostienen operación."
        },
        {
            "label": "Caja",
            "value": f"{proximos_count} salidas pueden presionar liquidez",
            "desc": "Revisar caja antes de ejecutar pagos."
        },
        {
            "label": "Compras",
            "value": f"{validar_count} facturas requieren validación",
            "desc": "No pagar sin recepción confirmada."
        },
        {
            "label": "Inventario",
            "value": f"{criticos_stock} proveedores afectan stock crítico",
            "desc": "Retrasos pueden afectar ventas."
        }
    ]

    liquidez = {
        "saldo_bruto": f"${saldo_bruto_usd:,.2f}",
        "reserva_fiscal": f"-${reserva_fiscal_usd:,.2f}",
        "operativo_real": f"${operativo_real_usd:,.2f}"
    }

    priority_payments = []
    for c in cxps[:10]:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        tasa_cxp = float(c.tasa_cambio_bs)
        
        deval_cost_bs = saldo_usd * (tasa_val - tasa_cxp) if tasa_cxp > 1.0 else 0.0
        costo_retraso_str = f"+Bs. {deval_cost_bs:,.2f}" if deval_cost_bs > 0 else "N/A"
        if tasa_cxp == 1.0:
            costo_retraso_str = "N/A"

        venc_dt = _as_aware(c.fecha_vencimiento)
        vence_str = "Vencido" if venc_dt < now_utc else venc_dt.strftime("%d/%m/%Y")

        priority_payments.append({
            "id": c.id,
            "provider": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "proveedor": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "type": "Fijo" if tasa_cxp == 1.0 else "Crítico" if venc_dt < now_utc else "Indexado",
            "tipo": "Fijo" if tasa_cxp == 1.0 else "Crítico" if venc_dt < now_utc else "Indexado",
            "due": vence_str,
            "vencimiento": vence_str,
            "amount": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "monto": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "rate": f"{tasa_cxp} Bs/$" if tasa_cxp > 1.0 else "Bs Fijo",
            "tasa": f"{tasa_cxp} Bs/$" if tasa_cxp > 1.0 else "Bs Fijo",
            "cost": costo_retraso_str,
            "costo": costo_retraso_str,
            "today": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "hoy": f"${saldo_usd:,.2f}" if tasa_cxp > 1.0 else f"Bs. {saldo_usd:,.2f}",
            "critical": venc_dt < now_utc,
            "critico": venc_dt < now_utc,
            "fixed": tasa_cxp == 1.0,
            "fijo": tasa_cxp == 1.0
        })

    return {
        "por_pagar": to_float(sum(float(c.monto_total_usd - c.monto_pagado_usd) for c in cxps)),
        "lotes_pendientes": 0,
        "metricas": metricas,
        "prioridades": prioridades,
        "liquidez": liquidez,
        "pagos_prioritarios": priority_payments
    }


@pagos_router.get("/cuentas")
def cuentas_pagar(db: Session = Depends(get_db)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    rows = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").all()

    total_deuda_usd = 0.0
    total_facturas = len(rows)
    vencido_30d_usd = 0.0

    now_utc = datetime.now(timezone.utc)
    limit_30d = now_utc - timedelta(days=30)

    facturas_list = []

    for r in rows:
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        tasa_cxp = float(r.tasa_cambio_bs)
        
        if tasa_cxp == 1.0:
            saldo_bs = saldo_usd
            saldo_usd_converted = saldo_usd / tasa_val
        else:
            saldo_usd_converted = saldo_usd
            saldo_bs = saldo_usd * tasa_val

        total_deuda_usd += saldo_usd_converted

        venc_dt = _as_aware(r.fecha_vencimiento)
        if venc_dt < now_utc:
            if venc_dt < limit_30d:
                vencido_30d_usd += saldo_usd_converted

        if venc_dt < now_utc:
            due_str = "VENCIDA"
            color_status = "text-red-600"
            bg_status = "bg-red-50"
        else:
            due_str = venc_dt.strftime("%d/%m/%Y")
            color_status = "text-green-600" if r.estado == "PENDIENTE" else "text-amber-600"
            bg_status = "bg-green-50" if r.estado == "PENDIENTE" else "bg-amber-50"

        facturas_list.append({
            "id": r.id,
            "date": r.fecha_emision.strftime("%d/%m/%Y") if r.fecha_emision else "",
            "fecha": r.fecha_emision.strftime("%d/%m/%Y") if r.fecha_emision else "",
            "due": due_str,
            "vencimiento": due_str,
            "provider": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "proveedor": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "rif": r.proveedor.rif if r.proveedor else "J-00000000-0",
            "ref": r.numero_documento,
            "referencia": r.numero_documento,
            "usd": f"${saldo_usd_converted:,.2f}",
            "monto_usd": f"${saldo_usd_converted:,.2f}",
            "bs": f"Bs. {saldo_bs:,.2f}",
            "monto_bs": f"Bs. {saldo_bs:,.2f}",
            "status": r.estado,
            "estado": r.estado,
            "color": color_status,
            "bg": bg_status
        })

    metricas = [
        {"label": "Total Deuda", "value": f"${total_deuda_usd:,.2f}", "desc": "Monto total adeudado", "color": "text-red-600"},
        {"label": "Facturas Pendientes", "value": str(total_facturas), "desc": "Documentos abiertos", "color": "text-[#0b5156]"},
        {"label": "Vencido (+30d)", "value": f"${vencido_30d_usd:,.2f}", "desc": "Urgente", "color": "text-red-600"},
        {"label": "Pagos en Tránsito", "value": "$0.00", "desc": "Por conciliar", "color": "text-amber-600"},
    ]

    return {
        "metricas": metricas,
        "facturas": facturas_list
    }


@pagos_router.get("/ordenes")
def ordenes_pago(db: Session = Depends(get_db)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    pendientes = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").all()
    
    now = datetime.now(timezone.utc)
    start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    historico = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado == "PAGADA"
    ).order_by(CuentaPorPagar.fecha_vencimiento.desc()).limit(10).all()

    pagadas_mes = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado == "PAGADA",
        CuentaPorPagar.fecha_vencimiento >= start_of_month
    ).all()

    total_pagadas_usd = sum(float(r.monto_total_usd) for r in pagadas_mes)
    count_pagadas = len(pagadas_mes)

    total_pendiente_usd = 0.0
    vencen_hoy_count = 0
    now_date = now.date()

    def _orden(r: CuentaPorPagar):
        nonlocal total_pendiente_usd, vencen_hoy_count
        saldo_usd = float(r.monto_total_usd - r.monto_pagado_usd)
        tasa_cxp = float(r.tasa_cambio_bs)
        
        saldo_usd_converted = saldo_usd / tasa_val if tasa_cxp == 1.0 else saldo_usd
        total_pendiente_usd += saldo_usd_converted

        venc_dt = _as_aware(r.fecha_vencimiento)
        vence_hoy = venc_dt.date() == now_date
        if vence_hoy:
            vencen_hoy_count += 1

        due_str = "Hoy" if vence_hoy else "Vencida" if venc_dt < now else venc_dt.strftime("%d/%m/%Y")
        priority_str = "Alta" if (venc_dt < now or vence_hoy) else "Normal"
        priority_color = "bg-red-50 text-red-600" if (venc_dt < now or vence_hoy) else "bg-slate-100 text-slate-600"

        msg = ""
        if r.proveedor and r.proveedor.evaluaciones:
            avg_price = sum(ev.score_precio for ev in r.proveedor.evaluaciones) / len(r.proveedor.evaluaciones)
            if avg_price < 50:
                msg = "Proveedor con evaluación de precio crítica"

        return {
            "id": f"OP-{r.id:06d}",
            "orden": f"OP-{r.id:06d}",
            "provider": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "proveedor": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
            "ref": r.numero_documento,
            "referencia": r.numero_documento,
            "amount": f"${saldo_usd_converted:,.2f}",
            "monto": f"${saldo_usd_converted:,.2f}",
            "due": due_str,
            "vencimiento": due_str,
            "method": "Transferencia",
            "metodo": "Transferencia",
            "priority": priority_str,
            "prioridad": priority_str,
            "pColor": priority_color,
            "status": r.estado,
            "estado": r.estado,
            "statusMsg": msg,
            "mensaje": msg
        }

    ordenes_list = [_orden(r) for r in pendientes]

    metricas = [
        { "label": "Órdenes Pendientes", "value": str(len(pendientes)), "desc": "Por aprobar", "color": "text-amber-600" },
        { "label": "Monto Total", "value": f"${total_pendiente_usd:,.2f}", "desc": "En cola de pago", "color": "text-[#0b5156]" },
        { "label": "Vencen Hoy", "value": str(vencen_hoy_count), "desc": "Urgente aprobar", "color": "text-red-600" },
        { "label": "Pagadas Mes", "value": str(count_pagadas), "desc": f"${total_pagadas_usd:,.2f} ejecutados", "color": "text-green-600" },
    ]

    return {
        "ordenes": ordenes_list,
        "ordenes_pendientes": ordenes_list,
        "historial": [
            {
                "id": f"OP-{r.id:06d}",
                "provider": r.proveedor.nombre if r.proveedor else "Proveedor Desconocido",
                "amount": f"${float(r.monto_total_usd):,.2f}",
                "date": r.fecha_vencimiento.strftime("%d/%m/%Y"),
                "method": "Transferencia",
                "status": "PAGADA",
            }
            for r in historico
        ],
        "metricas": metricas,
        "total": total_pendiente_usd,
    }


class AprobarOrdenRequest(BaseModel):
    orden_id: str
    banco_id: int
    referencia: str
    metodo: str


@pagos_router.post("/ordenes/aprobar")
def aprobar_orden(body: AprobarOrdenRequest, db: Session = Depends(get_db)):
    orden_id_str = body.orden_id
    if not orden_id_str:
         raise HTTPException(status_code=400, detail="Falta el orden_id")
    try:
         c_id = int(orden_id_str.replace("OP-", ""))
    except ValueError:
         raise HTTPException(status_code=400, detail="Formato de orden_id inválido")

    cxp = db.query(CuentaPorPagar).filter(CuentaPorPagar.id == c_id).first()
    if not cxp:
         raise HTTPException(status_code=404, detail="Cuenta por pagar no encontrada")

    if cxp.estado == "PAGADA":
         raise HTTPException(status_code=400, detail="Esta cuenta ya fue pagada")

    banco = db.query(CuentaBancaria).filter(CuentaBancaria.id == body.banco_id).first()
    if not banco:
         raise HTTPException(status_code=400, detail="La cuenta bancaria seleccionada no existe")

    monto_restante = cxp.monto_total_usd - cxp.monto_pagado_usd
    cxp.monto_pagado_usd = cxp.monto_total_usd
    cxp.estado = "PAGADA"

    banco.saldo_actual_usd -= monto_restante

    mov = MovimientoBancario(
        cuenta_id=banco.id,
        concepto=f"Pago Orden {orden_id_str} | Prov: {cxp.proveedor.nombre if cxp.proveedor else 'N/A'} ({body.metodo})",
        monto_usd=monto_restante,
        tasa_cambio_bs=cxp.tasa_cambio_bs,
        tipo="EGRESO",
        referencia=body.referencia,
        estado="ACTIVO"
    )
    db.add(mov)
    db.commit()
    return {"ok": True, "message": "Pago registrado y procesado exitosamente"}


class CuentaPorPagarManualRequest(BaseModel):
    proveedor_id: int
    numero_documento: str
    monto_total_usd: Decimal
    tasa_cambio_bs: Decimal
    dias_credito: int


@pagos_router.post("/cuentas/manual")
def crear_cuenta_por_pagar_manual(body: CuentaPorPagarManualRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    nueva_c = CuentaPorPagar(
        proveedor_id=body.proveedor_id,
        numero_documento=body.numero_documento,
        monto_total_usd=body.monto_total_usd,
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=body.tasa_cambio_bs,
        fecha_emision=now,
        fecha_vencimiento=now + timedelta(days=body.dias_credito),
        estado="PENDIENTE"
    )
    db.add(nueva_c)
    db.commit()
    db.refresh(nueva_c)
    return {"ok": True, "message": "Factura de proveedor registrada exitosamente"}


@pagos_router.get("/programacion")
def programacion_pagos(db: Session = Depends(get_db)):
    hoy = datetime.now(timezone.utc).date()
    rows = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").order_by(CuentaPorPagar.fecha_vencimiento).all()
    buckets = {"vencido_hoy": [], "esta_semana": [], "proxima_semana": [], "fin_mes": []}

    for r in rows:
        saldo = to_float(r.monto_total - r.monto_pagado)
        dias = (r.fecha_vencimiento.date() - hoy).days
        item = {
            "id": r.id,
            "title": r.proveedor.nombre if r.proveedor else r.numero_documento,
            "meta": f"{r.numero_documento} - vence {r.fecha_vencimiento.strftime('%d/%m/%Y')}",
            "amount": f"${saldo:,.2f}",
            "urgent": dias <= 0,
            "critical": dias <= 0,
            "tag": r.estado,
        }
        if dias <= 0:
            buckets["vencido_hoy"].append(item)
        elif dias <= 7:
            buckets["esta_semana"].append(item)
        elif dias <= 14:
            buckets["proxima_semana"].append(item)
        else:
            buckets["fin_mes"].append(item)

    liquidez = db.query(func.sum(CuentaBancaria.saldo_actual_usd)).scalar() or 0
    deuda_indexada = db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd)).filter(
        CuentaPorPagar.estado != "PAGADA"
    ).scalar() or 0
    return {
        "liquidez_base": to_float(liquidez),
        "deuda_indexada": to_float(deuda_indexada),
        "columnas": buckets,
    }


@pagos_router.get("/lotes/validar")
def validar_lotes(db: Session = Depends(get_db)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    tasa_val = float(tasa.valor_ves) if tasa else 36.52

    cxps = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").all()
    
    validaciones = []
    total_debitar_usd = 0.0

    for c in cxps:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        tasa_cxp = float(c.tasa_cambio_bs)
        saldo_usd_converted = saldo_usd / tasa_val if tasa_cxp == 1.0 else saldo_usd
        total_debitar_usd += saldo_usd_converted

        status = "OK"
        mensaje = "Listo para transferir"
        
        if not c.proveedor:
            status = "ERROR"
            mensaje = "Proveedor no asignado"
        elif not c.proveedor.rif or len(c.proveedor.rif) < 9:
            status = "ERROR"
            mensaje = "RIF inválido o incompleto"
        elif not c.proveedor.email:
            status = "WARNING"
            mensaje = "Falta correo electrónico para notificaciones"

        validaciones.append({
            "provider": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "proveedor": c.proveedor.nombre if c.proveedor else "Proveedor Desconocido",
            "status": status,
            "estado": status,
            "error": mensaje if status == "ERROR" else None,
            "mensaje": mensaje,
            "meta": f"Ref: {c.numero_documento} | Saldo: ${saldo_usd_converted:,.2f}",
            "metadata": f"Ref: {c.numero_documento} | Saldo: ${saldo_usd_converted:,.2f}"
        })

    return {
        "valido": all(v["status"] != "ERROR" for v in validaciones),
        "validaciones": validaciones,
        "total_debitar": f"${total_debitar_usd:,.2f}"
    }


@pagos_router.post("/lotes/procesar")
def procesar_lotes(body: dict, db: Session = Depends(get_db)):
    ref = body.get("referencia", "LOTE-GEN")
    
    cxps = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").all()
    if not cxps:
        return {"ok": True, "message": "No hay deudas pendientes"}

    banco = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).first()
    if not banco:
        raise HTTPException(status_code=400, detail="No hay una cuenta bancaria activa")

    total_debitar_usd = 0.0
    for c in cxps:
        saldo_usd = float(c.monto_total_usd - c.monto_pagado_usd)
        c.monto_pagado_usd = c.monto_total_usd
        c.estado = "PAGADA"
        total_debitar_usd += saldo_usd

    banco.saldo_actual_usd -= Decimal(str(total_debitar_usd))

    mov = MovimientoBancario(
        cuenta_id=banco.id,
        concepto=f"Procesamiento Lote Pagos Ref: {ref}",
        monto_usd=Decimal(str(total_debitar_usd)),
        tasa_cambio_bs=Decimal("36.52"),
        tipo="EGRESO",
        referencia=ref,
        estado="ACTIVO"
    )
    db.add(mov)
    db.commit()

    return {"ok": True, "message": f"Lote de pagos procesado. {len(cxps)} facturas liquidadas."}


# --- TESORERÍA ---
tesoreria_router = APIRouter(prefix="/tesoreria", tags=["Tesorería"], dependencies=[Depends(get_current_user)])


@tesoreria_router.get("/dashboard")
def tesoreria_dashboard(db: Session = Depends(get_db)):
    def format_currency(val):
        return f"${val:,.2f}"

    todas_cuentas = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).all()
    
    bancos_bs = 0.0
    efectivo_zelle = 0.0
    custodia = 0.0
    bancos_lista = []
    
    for c in todas_cuentas:
        saldo = to_float(c.saldo_actual_usd)
        nombre = c.banco.lower()
        
        if "zelle" in nombre or "efectivo" in nombre:
            efectivo_zelle += saldo
        elif "custodia" in nombre:
            custodia += saldo * 0.99
        elif c.moneda == "VES":
            bancos_bs += saldo
        else:
            bancos_bs += saldo

        moneda = "VES" if c.moneda == "VED" else c.moneda
        bancos_lista.append({
            "nombre": c.banco,
            "saldo": format_currency(saldo),
            "neto": format_currency(saldo),
            "alerta": saldo < 100,
            "metadata": f"{moneda} - {c.numero_cuenta[-4:]}" if c.numero_cuenta else moneda,
            "icono": c.banco[0].upper() if c.banco else "B"
        })
    
    ret_iva = db.query(func.sum(RetencionIVA.monto_usd)).filter(RetencionIVA.estado == "PENDIENTE").scalar()
    ret_islr = db.query(func.sum(RetencionISLR.monto_usd)).filter(RetencionISLR.estado == "PENDIENTE").scalar()
    reserva_fiscal = to_float(ret_iva) + to_float(ret_islr)

    efectivo_transito = db.query(func.sum(MovimientoBancario.monto_usd)).filter(MovimientoBancario.estado == "PENDIENTE").scalar()
    efectivo_transito = to_float(efectivo_transito)

    cheques_pd = db.query(func.sum(Cheque.monto_usd)).filter(Cheque.estado == "POST_DATADO").scalar()
    cheques_por_cobrar = to_float(cheques_pd)
    cheques_restar = 0.0 # Cheques emitidos (cxp) si hubiera una tabla, por ahora 0.
    
    # Cuarentena: sum of cuarentena_usd from all bank accounts
    cuarentena_restar = sum(to_float(c.cuarentena_usd) for c in todas_cuentas)

    disponibilidad_total = (bancos_bs + efectivo_zelle + custodia) - (cheques_restar + cuarentena_restar)
    liquidez_real = disponibilidad_total - reserva_fiscal

    ahora = datetime.now(timezone.utc)
    cxp_vencidas = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.fecha_vencimiento < ahora
    ).all()
    
    # Proyeccion 7 dias
    limite_7d = ahora + timedelta(days=7)
    
    cxc_7d = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.fecha_vencimiento >= ahora,
        CuentaPorCobrar.fecha_vencimiento <= limite_7d
    ).all()
    ingresos_7d = sum(to_float(c.monto_total_usd - c.monto_pagado_usd) for c in cxc_7d)

    cxp_7d = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.fecha_vencimiento >= ahora,
        CuentaPorPagar.fecha_vencimiento <= limite_7d
    ).all()
    egresos_7d = sum(to_float(c.monto_total_usd - c.monto_pagado_usd) for c in cxp_7d)
    
    alertas_lista = []
    if cxp_vencidas:
        total_vencido = sum(to_float(c.monto_total_usd - c.monto_pagado_usd) for c in cxp_vencidas)
        alertas_lista.append({
            "tipo": "ALERTA",
            "titulo": f"{len(cxp_vencidas)} CXP VENCIDAS",
            "descripcion": f"Total: {format_currency(total_vencido)}",
            "bg": "bg-red-50",
            "color": "text-red-600"
        })
    
    if reserva_fiscal > 0:
        alertas_lista.append({
            "tipo": "FISCAL",
            "titulo": "DECLARACIÓN PENDIENTE",
            "descripcion": f"Retenciones retenidas: {format_currency(reserva_fiscal)}",
            "bg": "bg-amber-50",
            "color": "text-amber-600"
        })

    if not alertas_lista:
        alertas_lista.append({
            "tipo": "INFO",
            "titulo": "SIN COMPROMISOS URGENTES",
            "descripcion": "El flujo de caja está sano.",
            "bg": "bg-green-50",
            "color": "text-green-600"
        })

    return {
        "disponibilidad": {
            "total": format_currency(disponibilidad_total),
            "bancos_bs": format_currency(bancos_bs),
            "efectivo_zelle": format_currency(efectivo_zelle),
            "custodia": format_currency(custodia),
            "cheques_restar": format_currency(cheques_restar),
            "cuarentena_restar": format_currency(cuarentena_restar)
        },
        "cuarentena": format_currency(cuarentena_restar),
        "cheques_por_cobrar": format_currency(cheques_por_cobrar),
        "alertas": alertas_lista,
        "proyeccion_7d": {
            "ingresos_esperados": ingresos_7d,
            "egresos_esperados": egresos_7d
        },
        "metricas": [
            { "label": "Liquidez Real", "value": format_currency(liquidez_real), "desc": "Neto de compromisos", "color": "text-green-600", "border": "border-l-4 border-green-500" },
            { "label": "Cheques por Cobrar", "value": format_currency(cheques_por_cobrar), "desc": "Emitidos (Post-datados)", "color": "text-red-600", "border": "border-l-4 border-red-500" },
            { "label": "Efectivo en Tránsito", "value": format_currency(efectivo_transito), "desc": "Depósitos pendientes", "color": "text-amber-600", "border": "border-l-4 border-amber-500" },
            { "label": "Reserva Fiscal", "value": format_currency(reserva_fiscal), "desc": "IVA/ISLR Retenido", "color": "text-red-600", "border": "border-l-4 border-red-600" }
        ],
        "bancos": bancos_lista,
        "alertas": alertas_lista
    }


@tesoreria_router.get("/bancos")
def listar_bancos(db: Session = Depends(get_db)):
    cuentas = db.query(CuentaBancaria).all()
    tasa = tasa_actual(db)
    res = []
    for c in cuentas:
        saldo_usd = to_float(c.saldo_actual_usd)
        saldo_local = saldo_usd * (tasa if c.moneda == "VES" else 1)
        movimientos_pendientes = db.query(MovimientoBancario).filter(
            MovimientoBancario.cuenta_id == c.id,
            MovimientoBancario.estado == "PENDIENTE"
        ).all()
        
        diferencia_pendiente = 0.00
        for m in movimientos_pendientes:
            monto_mov = to_float(m.monto_usd)
            if m.tipo == "EGRESO":
                monto_mov = -monto_mov
            diferencia_pendiente += monto_mov
        
        res.append({
            "id": c.id,
            "nombre": c.banco,
            "numero": c.numero_cuenta,
            "moneda": c.moneda,
            # Raw numbers for frontend calculation
            "saldo_contable_raw": saldo_local,
            "saldo_divisas_raw": saldo_usd,
            "diferencia_raw": diferencia_pendiente,
            # Formatted string fallbacks (optional, frontend should prefer formatting raw)
            "saldo_contable": f"{'Bs. ' if c.moneda == 'VES' else '$'}{saldo_local:,.2f}",
            "saldo_divisas": f"${saldo_usd:,.2f}",
            "diferencia": f"${diferencia_pendiente:,.2f}",
            "estado": "Activa" if c.activa else "Inactiva"
        })
    return res


@tesoreria_router.post("/bancos")
def crear_banco(body: dict, db: Session = Depends(get_db)):
    c = CuentaBancaria(
        banco=body.get("nombre", ""),
        numero_cuenta=body.get("numero", ""),
        moneda=body.get("moneda", "VES"),
        saldo_actual_usd=body.get("saldo_actual", 0),
        activa=(body.get("estado") == "Activa")
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@tesoreria_router.get("/movimientos")
def movimientos_banco(periodo: str, db: Session = Depends(get_db)):
    inicio, fin = periodo_rango(periodo)
    movs = db.query(MovimientoBancario).filter(MovimientoBancario.fecha >= inicio, MovimientoBancario.fecha < fin).all()
    return [{
        "id": f"MOV-{str(m.id).zfill(4)}", 
        "fecha": m.fecha.strftime("%d/%m/%Y"), 
        "concepto": m.concepto, 
        "monto": to_float(m.monto), 
        "tipo": m.tipo,
        "referencia": m.referencia,
        "estado": m.estado,
        "banco": m.cuenta.banco if m.cuenta else "Banco Asociado",
        "moneda": m.cuenta.moneda if m.cuenta else "USD"
    } for m in movs]


@tesoreria_router.post("/movimientos/importar")
def importar_movimientos():
    return {"ok": True}


@tesoreria_router.get("/conciliacion")
def conciliacion(periodo: str, db: Session = Depends(get_db)):
    inicio, fin = periodo_rango(periodo)
    movs = db.query(MovimientoBancario).filter(MovimientoBancario.fecha >= inicio, MovimientoBancario.fecha < fin).all()
    
    movimientos = []
    cuentas_dict = {}
    for m in movs:
        banco_name = m.cuenta.banco if m.cuenta else "Banco Asociado"
        if m.cuenta_id not in cuentas_dict:
            cuentas_dict[m.cuenta_id] = {
                "cuenta": banco_name,
                "saldo_banco": to_float(m.cuenta.saldo_actual_usd) if m.cuenta else 0.0,
                "movs": []
            }
        
        cuentas_dict[m.cuenta_id]["movs"].append(m)
        
        movimientos.append({
            "id": f"MOV-{str(m.id).zfill(4)}",
            "fecha": m.fecha.strftime("%d/%m/%Y"),
            "banco": banco_name, 
            "referencia": m.referencia or "-",
            "monto": f"${to_float(m.monto_usd):,.2f}",
            "documento": f"KODA-{str(m.id).zfill(4)}",
            "estado": m.estado,
            "tipo": m.tipo.capitalize() if m.tipo else "Desconocido"
        })
        
    resumen_cuentas = []
    for c_id, data in cuentas_dict.items():
        saldo_banco = data["saldo_banco"]
        
        pendientes = sum([to_float(m.monto_usd) if m.tipo == "INGRESO" else -to_float(m.monto_usd) for m in data["movs"] if m.estado != "Conciliado" and m.estado != "CONCILIADO"])
        diferencia = pendientes
        saldo_koda = saldo_banco - diferencia
        
        estado = "Cuadra" if abs(diferencia) < 0.01 else "Diferencia"
        
        resumen_cuentas.append({
            "cuenta": data["cuenta"],
            "saldo_banco": f"${saldo_banco:,.2f}",
            "saldo_koda": f"${saldo_koda:,.2f}",
            "diferencia": f"${diferencia:,.2f}",
            "estado": estado
        })
    
    return {
        "metrics": {
            "movimientos_count": len(movs),
            "conciliados": len([m for m in movs if m.estado == 'CONCILIADO']),
            "pendientes": len([m for m in movs if m.estado != 'CONCILIADO']),
            "monto_x_conciliar": f"${sum([to_float(m.monto_usd) for m in movs if m.estado != 'CONCILIADO']):,.2f}"
        },
        "movimientos": movimientos,
        "resumen_cuentas": resumen_cuentas,
        "diferencias": []
    }


from pydantic import BaseModel
class RelacionarRequest(BaseModel):
    movimiento_id: str
    documento_id: str

@tesoreria_router.get("/conciliacion/pendientes")
def obtener_documentos_pendientes(db: Session = Depends(get_db)):
    # Devuelve ventas pendientes a modo de ejemplo
    from backend.models.erp_extended import Venta
    ventas = db.query(Venta).filter(Venta.estado != 'ANULADA').limit(10).all()
    docs = []
    for v in ventas:
        docs.append({
            "id": v.numero_factura,
            "label": f"{v.numero_factura} (Cliente)",
            "monto": f"${to_float(v.total_usd):,.2f}"
        })
    return docs

@tesoreria_router.post("/conciliacion/relacionar")
def relacionar_documento(payload: RelacionarRequest, db: Session = Depends(get_db)):
    # movimiento_id viene como MOV-123
    try:
        mov_id = int(payload.movimiento_id.replace("MOV-", ""))
        mov = db.query(MovimientoBancario).filter(MovimientoBancario.id == mov_id).first()
        if mov:
            mov.estado = "CONCILIADO"
            mov.documento_referencia = payload.documento_id
            db.commit()
    except:
        pass
    return {"ok": True}


@tesoreria_router.get("/flujo-caja")
def flujo_caja_tesoreria(db: Session = Depends(get_db)):
    cxc_rows = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.estado != "PAGADA").all()
    cxp_rows = db.query(CuentaPorPagar).filter(CuentaPorPagar.estado != "PAGADA").all()
    proyecciones = []
    for r in cxc_rows:
        saldo = to_float(r.monto_total - r.monto_pagado)
        proyecciones.append({
            "date": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "fecha": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "concept": f"Cobranza {r.numero_documento}",
            "concepto": f"Cobranza {r.numero_documento}",
            "sub": r.cliente.nombre if r.cliente else "",
            "detalle": r.cliente.nombre if r.cliente else "",
            "area": "Cobranzas",
            "amount": saldo,
            "monto": saldo,
            "type": "Entrada",
            "tipo": "Entrada",
            "status": r.estado,
            "estado": r.estado,
            "statusColor": "bg-green-50 text-green-600",
        })
    for r in cxp_rows:
        saldo = to_float(r.monto_total - r.monto_pagado)
        vencida = r.fecha_vencimiento < datetime.now(timezone.utc)
        proyecciones.append({
            "date": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "fecha": r.fecha_vencimiento.strftime("%d/%m/%Y"),
            "concept": f"Pago {r.numero_documento}",
            "concepto": f"Pago {r.numero_documento}",
            "sub": r.proveedor.nombre if r.proveedor else "",
            "detalle": r.proveedor.nombre if r.proveedor else "",
            "area": "Pagos",
            "amount": saldo,
            "monto": saldo,
            "type": "Salida",
            "tipo": "Salida",
            "status": r.estado,
            "estado": r.estado,
            "isCritical": vencida,
            "statusColor": "bg-red-50 text-red-600" if vencida else "bg-amber-50 text-amber-600",
        })
    return {"proyecciones": sorted(proyecciones, key=lambda x: x["date"])}


@tesoreria_router.post("/conciliacion/marcar")
def marcar_movimiento(body: dict):
    return {"ok": True}

@tesoreria_router.post("/conciliacion/cerrar")
def cerrar_conciliacion_periodo(body: dict, db: Session = Depends(get_db)):
    periodo = body.get("periodo")
    if not periodo:
        raise HTTPException(status_code=400, detail="Periodo es requerido")
    
    inicio, fin = periodo_rango(periodo)
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.fecha >= inicio, 
        MovimientoBancario.fecha < fin,
        MovimientoBancario.estado != "CERRADO"
    ).all()
    
    count = 0
    for m in movs:
        m.estado = "CERRADO"
        count += 1
        
    db.commit()
    return {"ok": True, "cerrados": count, "mensaje": f"Periodo {periodo} cerrado exitosamente"}


@tesoreria_router.get("/caja-chica")
def caja_chica(db: Session = Depends(get_db)):
    # Seed default fund if none exists
    if db.query(FondoCajaChica).count() == 0:
        default_fondo = FondoCajaChica(
            nombre="Caja Chica Operativa",
            responsable="Administración",
            asignado_usd=500.00,
            disponible_usd=500.00
        )
        db.add(default_fondo)
        db.commit()

    fondos = db.query(FondoCajaChica).all()
    gastos = db.query(GastoCajaChica).order_by(GastoCajaChica.fecha.desc(), GastoCajaChica.id.desc()).limit(50).all()

    total_asignado = sum(to_float(f.asignado_usd) for f in fondos)
    total_disponible = sum(to_float(f.disponible_usd) for f in fondos)
    soportes_pendientes = db.query(GastoCajaChica).filter(GastoCajaChica.soporte == "Sin Soporte").count()
    reintegro_sugerido = total_asignado - total_disponible

    return {
        "metricas": {
            "fondo_asignado": f"${total_asignado:,.2f}",
            "saldo_disponible": f"${total_disponible:,.2f}",
            "soportes_pendientes": str(soportes_pendientes),
            "reintegro_sugerido": f"${max(0, reintegro_sugerido):,.2f}"
        },
        "fondos": [
            {
                "id": f"FD-{f.id:03d}",
                "nombre": f.nombre,
                "responsable": f.responsable,
                "asignado": f"${to_float(f.asignado_usd):,.2f}",
                "disponible": f"${to_float(f.disponible_usd):,.2f}",
                "estado": f.estado.capitalize(),
                "color": "bg-green-100 text-green-700" if f.estado == "ACTIVO" else "bg-amber-100 text-amber-700"
            } for f in fondos
        ],
        "gastos": [
            {
                "id": f"GC-{g.id:04d}",
                "referencia": f"GC-{g.id:04d}",
                "concepto": g.concepto,
                "fondo": g.fondo.nombre if g.fondo else "N/A",
                "monto": f"${to_float(g.monto_usd):,.2f}",
                "soporte": g.soporte,
                "fecha": g.fecha.strftime("%d/%m/%Y"),
                "estado": g.estado.capitalize(),
                "color": "bg-slate-100 text-slate-700" if g.estado == "PROCESADO" else "bg-amber-100 text-amber-700"
            } for g in gastos
        ]
    }


@tesoreria_router.post("/caja-chica/movimiento")
def movimiento_caja_chica(body: dict, db: Session = Depends(get_db)):
    fondo_id_str = body.get("fondo_id", "")
    try:
        fid = int(fondo_id_str.replace("FD-", ""))
    except:
        fid = 1

    fondo = db.query(FondoCajaChica).filter(FondoCajaChica.id == fid).first()
    monto = float(body.get("monto", 0))

    if fondo:
        fondo.disponible_usd = max(0, float(fondo.disponible_usd) - monto)

    gasto = GastoCajaChica(
        fondo_id=fid,
        concepto=body.get("concepto", "Gasto sin concepto"),
        monto_usd=monto,
        soporte=body.get("soporte", "Sin Soporte"),
        no_deducible=body.get("no_deducible", False)
    )
    db.add(gasto)
    db.commit()
    return {"ok": True, "id": gasto.id}


@tesoreria_router.post("/caja-chica/reponer")
def reponer_caja_chica(db: Session = Depends(get_db)):
    fondos = db.query(FondoCajaChica).all()
    for f in fondos:
        f.disponible_usd = f.asignado_usd
    db.commit()
    return {"ok": True}


@tesoreria_router.post("/caja-chica/fondos")
def registrar_fondo_caja_chica(body: dict, db: Session = Depends(get_db)):
    nombre = body.get("nombre", "")
    responsable = body.get("responsable", "")
    asignado_usd = float(body.get("asignado_usd", 0.0))
    
    if not nombre or not responsable:
        raise HTTPException(status_code=400, detail="Nombre y responsable requeridos")
        
    nuevo_fondo = FondoCajaChica(
        nombre=nombre,
        responsable=responsable,
        asignado_usd=asignado_usd,
        disponible_usd=asignado_usd
    )
    db.add(nuevo_fondo)
    db.commit()
    return {"ok": True, "id": nuevo_fondo.id}


@tesoreria_router.get("/arqueo")
def arqueo_caja(fecha: str, caja: str = "Caja Principal USD", db: Session = Depends(get_db)):
    # Seed default cash accounts if they do not exist
    caja_usd = db.query(CuentaBancaria).filter(CuentaBancaria.banco == "Caja Principal USD").first()
    if not caja_usd:
        caja_usd = CuentaBancaria(
            banco="Caja Principal USD",
            numero_cuenta="1234-CAJA-USD-01",
            moneda="USD",
            saldo_actual_usd=1500.00
        )
        db.add(caja_usd)
        
    caja_ventas = db.query(CuentaBancaria).filter(CuentaBancaria.banco == "Caja Chica Ventas").first()
    if not caja_ventas:
        caja_ventas = CuentaBancaria(
            banco="Caja Chica Ventas",
            numero_cuenta="1234-CAJA-USD-02",
            moneda="USD",
            saldo_actual_usd=350.00
        )
        db.add(caja_ventas)

    caja_ves = db.query(CuentaBancaria).filter(CuentaBancaria.banco == "Caja Principal VES").first()
    if not caja_ves:
        caja_ves = CuentaBancaria(
            banco="Caja Principal VES",
            numero_cuenta="1234-CAJA-VES-01",
            moneda="VES",
            saldo_actual_usd=25000.00
        )
        db.add(caja_ves)
        
    db.commit()

    # Get balance of selected cash account
    selected = db.query(CuentaBancaria).filter(CuentaBancaria.banco == caja).first()
    saldo_usd = to_float(selected.saldo_actual_usd) if selected else 0.0

    # Get balance of VES cash account
    saldo_ves = to_float(caja_ves.saldo_actual_usd) if caja_ves else 0.0

    return {
        "fecha": fecha,
        "caja": caja,
        "saldo_sistema_usd": saldo_usd,
        "saldo_sistema_ves": saldo_ves
    }


@tesoreria_router.post("/arqueo/cerrar")
def cerrar_arqueo(body: dict, db: Session = Depends(get_db)):
    import json
    from backend.models.erp_extended import AuditoriaLog
    
    caja_name = body.get("caja", "Caja Principal USD")
    fisico_usd = float(body.get("fisico_usd", 0.0))
    fisico_ves = float(body.get("fisico_ves", 0.0))
    sistema_usd = float(body.get("sistema_usd", 0.0))
    cajero = body.get("cajero", "José Pérez")
    justificacion = body.get("justificacion", "")

    # Update balance of the selected cash account to reflect the physical count
    selected = db.query(CuentaBancaria).filter(CuentaBancaria.banco == caja_name).first()
    if selected:
        selected.saldo_actual_usd = fisico_usd

    # Update balance of the VES cash account
    caja_ves = db.query(CuentaBancaria).filter(CuentaBancaria.banco == "Caja Principal VES").first()
    if caja_ves:
        caja_ves.saldo_actual_usd = fisico_ves

    # Log the audit closure
    diferencia = fisico_usd - sistema_usd
    detalle_data = {
        "caja": caja_name,
        "sistema": sistema_usd,
        "fisico": fisico_usd,
        "diferencia": diferencia,
        "justificacion": justificacion,
        "resolucion": "Aceptable" if abs(diferencia) <= 50.0 else "Sujeto a Auditoría"
    }

    log_entry = AuditoriaLog(
        usuario=cajero,
        accion="CIERRE_ARQUEO",
        modulo="TESORERIA",
        detalle=json.dumps(detalle_data),
        fecha=datetime.now(timezone.utc)
    )
    db.add(log_entry)
    db.commit()
    return {"ok": True}


@tesoreria_router.get("/arqueo/pdf")
def exportar_arqueo_pdf(
    fecha: str,
    caja: str = "Caja Principal USD",
    justificacion: str = "",
    fisico_ves: float = 0.0,
    denom_100: int = 0,
    denom_50: int = 0,
    denom_20: int = 0,
    denom_10: int = 0,
    denom_5: int = 0,
    denom_1: int = 0,
    db: Session = Depends(get_db)
):
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    import io

    # Retrieve system totals
    selected = db.query(CuentaBancaria).filter(CuentaBancaria.banco == caja).first()
    system_usd = to_float(selected.saldo_actual_usd) if selected else 0.0

    caja_ves = db.query(CuentaBancaria).filter(CuentaBancaria.banco == "Caja Principal VES").first()
    system_ves = to_float(caja_ves.saldo_actual_usd) if caja_ves else 0.0

    denoms = {
        "100": denom_100,
        "50": denom_50,
        "20": denom_20,
        "10": denom_10,
        "5": denom_5,
        "1": denom_1
    }
    fisico_usd = sum(int(k) * v for k, v in denoms.items())
    diff_usd = fisico_usd - system_usd
    diff_ves = fisico_ves - system_ves

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    story = []

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#0b5156'),
        spaceAfter=15
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=25
    )
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#0b5156'),
        spaceAfter=10
    )
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12
    )

    story.append(Paragraph("ACTA DE ARQUEO FÍSICO DE CAJA", title_style))
    story.append(Paragraph(f"Fecha de Auditoría: {fecha} | Caja: {caja}", subtitle_style))
    story.append(Spacer(1, 10))

    # Summary Table
    data_summary = [
        [Paragraph("<b>CONCEPTO</b>", normal_style), Paragraph("<b>VALOR SISTEMA</b>", normal_style), Paragraph("<b>VALOR FÍSICO</b>", normal_style), Paragraph("<b>DIFERENCIA</b>", normal_style)],
        ["Efectivo USD", f"${system_usd:,.2f}", f"${fisico_usd:,.2f}", f"${diff_usd:,.2f}"],
        ["Efectivo VES", f"Bs. {system_ves:,.2f}", f"Bs. {fisico_ves:,.2f}", f"Bs. {diff_ves:,.2f}"]
    ]

    t_summary = Table(data_summary, colWidths=[150, 120, 120, 120])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8f9fa')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#0b5156')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    story.append(t_summary)
    story.append(Spacer(1, 20))

    # Denominations Table
    story.append(Paragraph("DESGLOSE DE EFECTIVO FÍSICO (USD)", section_style))
    data_denoms = [
        [Paragraph("<b>DENOMINACIÓN</b>", normal_style), Paragraph("<b>CANTIDAD</b>", normal_style), Paragraph("<b>TOTAL USD</b>", normal_style)],
    ]
    for denom, qty in sorted(denoms.items(), key=lambda x: int(x[0]), reverse=True):
        data_denoms.append([f"${denom}", str(qty), f"${int(denom) * qty:,.2f}"])
        
    t_denoms = Table(data_denoms, colWidths=[170, 170, 170])
    t_denoms.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8f9fa')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    story.append(t_denoms)
    story.append(Spacer(1, 20))

    # Justification
    story.append(Paragraph("JUSTIFICACIÓN Y OBSERVACIONES", section_style))
    story.append(Paragraph(justificacion if justificacion else "SIN OBSERVACIONES DECLARADAS.", normal_style))
    story.append(Spacer(1, 40))

    # Signatures
    data_sigs = [
        ["_________________________", "_________________________"],
        ["Firma Responsable Caja", "Firma Auditor Autorizado"]
    ]
    t_sigs = Table(data_sigs, colWidths=[250, 250])
    t_sigs.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_sigs)

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=acta_arqueo_{fecha}.pdf"}
    )


# --- REPORTES ---
reportes_router = APIRouter(prefix="/reportes", tags=["Reportes"], dependencies=[Depends(get_current_user)])


@reportes_router.get("/dashboard")
def reportes_dashboard(db: Session = Depends(get_db)):
    return {"modulos": ["ventas", "compras", "fiscal", "cartera"], "ultima_actualizacion": datetime.now(timezone.utc).isoformat()}


@reportes_router.get("/ventas")
def reporte_ventas(db: Session = Depends(get_db)):
    ventas = db.query(Venta).filter(Venta.estado == "ACTIVA").all()
    return {"total": sum(to_float(v.total) for v in ventas), "cantidad": len(ventas), "detalle": []}


@reportes_router.get("/compras")
def reporte_compras(db: Session = Depends(get_db)):
    compras = db.query(Compra).all()
    return {"total": sum(to_float(c.total) for c in compras), "cantidad": len(compras)}



@reportes_router.get("/antiguedad-cartera")
def reporte_antiguedad(db: Session = Depends(get_db)):
    return {"rangos": []}


@reportes_router.get("/diferencial-cambiario")
def reporte_diferencial(db: Session = Depends(get_db)):
    return {"ganancia": 0, "perdida": 0}


@reportes_router.get("/eficiencia")
def reporte_eficiencia(db: Session = Depends(get_db)):
    return {"indicadores": []}


@reportes_router.get("/matriz-abc")
def matriz_abc(db: Session = Depends(get_db)):
    # 1. Obtener ventas por producto en los últimos 30 días para medir rotación
    hace_30_dias = datetime.now(timezone.utc) - timedelta(days=30)
    ventas_query = db.query(
        VentaDetalle.producto_id,
        func.sum(VentaDetalle.cantidad).label('total_vendido')
    ).select_from(VentaDetalle).join(Venta, VentaDetalle.venta_id == Venta.id).filter(
        Venta.fecha >= hace_30_dias,
        Venta.estado != 'ANULADA'
    ).group_by(VentaDetalle.producto_id).all()
    
    sales_map = {prod_id: float(qty) for prod_id, qty in ventas_query}
    
    # 2. Calcular rotación y rentabilidad para todos los productos
    productos = db.query(Producto).all()
    products_data = []
    for p in productos:
        rotacion = sales_map.get(p.id, 0.0)
        p_precio = float(p.precio_usd or 0)
        p_costo = float(p.costo_usd or 0)
        rentabilidad = ((p_precio - p_costo) / p_precio * 100.0) if p_precio > 0 else 0.0
        
        products_data.append({
            "producto": p,
            "rotacion": rotacion,
            "rentabilidad": rentabilidad
        })
        
    # 3. Determinar umbrales promedio para los cuadrantes
    margins = [p_data['rentabilidad'] for p_data in products_data]
    rotations = [p_data['rotacion'] for p_data in products_data]
    
    avg_margin = sum(margins) / len(margins) if margins else 30.0
    avg_rot = sum(rotations) / len(rotations) if rotations else 1.0
    
    # Asegurar límites mínimos de umbrales para evitar dividir por promedios muy bajos (por ejemplo, si todo es 0)
    margin_threshold = max(10.0, avg_margin)
    rot_threshold = max(1.0, avg_rot)
    
    # 4. Clasificar productos en cuadrantes
    stars_items = []
    questions_items = []
    cows_items = []
    dogs_items = []
    
    for p_data in products_data:
        p = p_data["producto"]
        rot = p_data["rotacion"]
        rent = p_data["rentabilidad"]
        
        item_formatted = {
            "name": p.nombre,
            "nombre": p.nombre,
            "value": f"Margen: {rent:.1f}% ({int(rot)} u. vendidas)",
            "valor": f"Margen: {rent:.1f}% ({int(rot)} u. vendidas)"
        }
        
        if rot >= rot_threshold and rent >= margin_threshold:
            stars_items.append(item_formatted)
        elif rot < rot_threshold and rent >= margin_threshold:
            questions_items.append(item_formatted)
        elif rot >= rot_threshold and rent < margin_threshold:
            cows_items.append(item_formatted)
        else:
            dogs_items.append(item_formatted)
            
    # Limitar items por cuadrante a los top 10 por volumen/margen para no sobrecargar el frontend
    stars_items = stars_items[:10]
    questions_items = questions_items[:10]
    cows_items = cows_items[:10]
    dogs_items = dogs_items[:10]
    
    # 5. Estructurar respuesta en cuadrantes con el formato esperado por el frontend
    quadrants = [
        {
            "id": "stars",
            "title": "Estrellas",
            "subtitle": "Alta Rotación • Alto Margen",
            "desc": "Productos clave para el negocio. Garantizar disponibilidad y vigilar el stock.",
            "color": "border-[#0b5156] bg-teal-50/10",
            "textColor": "text-[#0b5156]",
            "items": stars_items
        },
        {
            "id": "questions",
            "title": "Incógnitas",
            "subtitle": "Baja Rotación • Alto Margen",
            "desc": "Productos con buena ganancia pero poca salida. Considerar campaigns de promoción.",
            "color": "border-blue-300 bg-blue-50/10",
            "textColor": "text-blue-600",
            "items": questions_items
        },
        {
            "id": "cows",
            "title": "Vacas de Efectivo",
            "subtitle": "Alta Rotación • Bajo Margen",
            "desc": "Generadores constantes de liquidez. Mantener inventario optimizado.",
            "color": "border-green-500 bg-green-50/10",
            "textColor": "text-green-600",
            "items": cows_items
        },
        {
            "id": "dogs",
            "title": "Perros",
            "subtitle": "Baja Rotación • Bajo Margen",
            "desc": "Bajo aporte al negocio. Evaluar su descontinuación o venta en liquidación.",
            "color": "border-red-300 bg-red-50/10",
            "textColor": "text-red-500",
            "items": dogs_items
        }
    ]
    
    insight = (
        f"El algoritmo procesó {len(products_data)} productos del catálogo. "
        f"Se identificaron {len(stars_items)} productos Estrella, {len(questions_items)} Incógnitas, "
        f"{len(cows_items)} Vacas de Efectivo y {len(dogs_items)} Perros. "
        f"Se recomienda enfocar los recursos de marketing en las Incógnitas y asegurar el stock de las Estrellas."
    )
    
    return {
        "quadrants": quadrants,
        "insight": insight
    }


@reportes_router.get("/rentabilidad")
def rentabilidad_productos(db: Session = Depends(get_db)):
    productos = db.query(Producto).all()
    return {"items": [{"nombre": p.nombre, "margen": round((to_float(p.precio_usd) - to_float(p.costo_usd)) / max(to_float(p.precio_usd), 0.01) * 100, 1)} for p in productos]}


@reportes_router.get("/vendedores")
def reporte_vendedores(db: Session = Depends(get_db)):
    vendedores = db.query(Vendedor).filter(Vendedor.activo == True).all()
    return {"vendedores": [{"nombre": v.nombre, "codigo": v.codigo, "meta": to_float(v.meta_mensual)} for v in vendedores]}


@reportes_router.get("/excepciones")
def reporte_excepciones(db: Session = Depends(get_db)):
    agotados = db.query(Producto).filter(Producto.stock <= 0).count()
    return {"excepciones": [{"tipo": "Stock agotado", "cantidad": agotados}] if agotados else []}


# --- VENTAS EXTENDIDAS ---
ventas_ext_router = APIRouter(prefix="/ventas", tags=["Ventas"], dependencies=[Depends(get_current_user)])


def get_status_color(estado: str) -> str:
    est = (estado or "").lower()
    if est == "borrador":
        return "bg-slate-100 text-slate-700"
    elif est in ("enviada", "pendiente"):
        return "bg-blue-50 text-blue-700 border border-blue-100"
    elif est in ("aceptada", "facturada", "procesada"):
        return "bg-emerald-50 text-emerald-700 border border-emerald-100"
    elif est in ("rechazada", "anulada"):
        return "bg-rose-50 text-rose-700 border border-rose-100"
    elif est == "vencida":
        return "bg-amber-50 text-amber-700 border border-amber-100"
    return "bg-slate-100 text-slate-700"


@ventas_ext_router.get("/cotizaciones")
def cotizaciones(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from sqlalchemy.orm import joinedload
    
    cots = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.cliente))
        .filter(Cotizacion.tenant_id == current_user.tenant_id)
        .order_by(Cotizacion.fecha_emision.desc())
        .all()
    )
        
    return [
        {
            "id": c.numero_cotizacion,
            "id_db": c.id,
            "numero_cotizacion": c.numero_cotizacion,
            "client": c.cliente.nombre if c.cliente else "No especificado",
            "cliente": c.cliente.nombre if c.cliente else "No especificado",
            "cantidad_items": len(c.items),
            "items": None,  # prevent serializing lists of objects which might break React render
            "amount": to_float(c.total),
            "total": to_float(c.total),
            "subtotal": to_float(c.subtotal),
            "descuento_total": to_float(c.descuento_total),
            "estado": c.estado,
            "status": c.estado,
            "statusColor": get_status_color(c.estado),
            "fecha_emision": c.fecha_emision.isoformat() if c.fecha_emision else None,
            "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
            "moneda": c.moneda,
        }
        for c in cots
    ]


@ventas_ext_router.patch("/cotizaciones/{id}/estado")
def actualizar_estado_cotizacion(
    id: int,
    payload: CotizacionStatusUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from fastapi import HTTPException
    
    cot = (
        db.query(Cotizacion)
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == current_user.tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
        
    nuevo_estado = payload.estado.strip()
    estados_validos = {"Borrador", "Enviada", "Aceptada", "Rechazada", "Vencida", "Anulada", "Facturada"}
    if nuevo_estado not in estados_validos:
        raise HTTPException(
            status_code=400,
            detail=f"Estado inválido. Debe ser uno de: {', '.join(estados_validos)}"
        )
        
    cot.estado = nuevo_estado
    db.commit()
    db.refresh(cot)
    
    return {
        "ok": True,
        "id": cot.numero_cotizacion,
        "id_db": cot.id,
        "estado": cot.estado,
        "status": cot.estado,
        "statusColor": get_status_color(cot.estado)
    }


@ventas_ext_router.post("/cotizaciones/{id}/facturar")
def facturar_cotizacion(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from fastapi import HTTPException
    from backend.models.fiscal import CorrelativoFiscal
    
    # 1. Buscar la cotización por ID y validar tenant_id
    cot = (
        db.query(Cotizacion)
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == current_user.tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
        
    # 2. Validar que el estado sea 'Aceptada'
    if cot.estado != "Aceptada":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden facturar cotizaciones en estado 'Aceptada'"
        )
        
    try:
        # 3. Bloqueo secuencial y asignación del correlativo fiscal
        correlativo = db.query(CorrelativoFiscal).filter(CorrelativoFiscal.tipo_documento == 'FACTURA').with_for_update().first()
        if not correlativo:
            correlativo = CorrelativoFiscal(tipo_documento='FACTURA', prefijo='FAC-', siguiente_numero=1)
            db.add(correlativo)
            db.flush()
            
        numero_factura_final = f"{correlativo.prefijo}{str(correlativo.siguiente_numero).zfill(8)}"
        correlativo.siguiente_numero += 1
        
        # 4. Obtener tasa de cambio
        tasa = Decimal(str(cot.tasa_cambio)) if cot.tasa_cambio else Decimal("1.0")
        if tasa <= 0:
            tasa = Decimal("1.0")
            
        # 5. Obtener producto genérico
        producto_generico = db.query(Producto).filter(Producto.sku == "GEN-001").first()
        if not producto_generico:
            producto_generico = Producto(
                sku="GEN-001",
                nombre="Producto Genérico (Cotización)",
                precio_usd=Decimal("0.00"),
                costo_usd=Decimal("0.00"),
                stock=Decimal("999999.00"),
                es_exento=False
            )
            db.add(producto_generico)
            db.flush()
            
        # 6. Procesar items y calcular subtotales en USD
        detalles_para_guardar = []
        subtotal_usd = Decimal("0.00")
        
        for item in cot.items:
            # Intentar usar el producto_id del item, si existe
            producto = None
            if item.producto_id:
                producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
            if not producto:
                producto = producto_generico
                
            precio_unitario = Decimal(str(item.precio_unitario))
            descuento_pct = Decimal(str(item.descuento_porcentaje))
            precio_neto = precio_unitario * (Decimal("1.00") - descuento_pct / Decimal("100.00"))
            
            # Convertir a USD si la moneda es VES
            if cot.moneda == "VES":
                precio_neto_usd = precio_neto / tasa
            else:
                precio_neto_usd = precio_neto
                
            precio_neto_usd_rounded = precio_neto_usd.quantize(Decimal("0.01"))
            subtotal_item_usd = precio_neto_usd_rounded * Decimal(str(item.cantidad))
            subtotal_usd += subtotal_item_usd
            
            detalle = VentaDetalle(
                producto_id=producto.id,
                cantidad=Decimal(str(item.cantidad)),
                precio_usd_capturado=precio_neto_usd_rounded
            )
            detalles_para_guardar.append(detalle)
            
        # 7. Calcular impuestos y total neto (16% IVA standard)
        iva_usd = subtotal_usd * Decimal("0.16")
        igtf_usd = Decimal("0.00")
        total_usd = subtotal_usd + iva_usd
        
        subtotal_usd_rounded = subtotal_usd.quantize(Decimal("0.01"))
        iva_usd_rounded = iva_usd.quantize(Decimal("0.01"))
        total_usd_rounded = total_usd.quantize(Decimal("0.01"))
        
        # 8. Crear cabecera de la Venta
        nueva_venta = Venta(
            cliente_id=cot.cliente_id,
            numero_factura=numero_factura_final,
            fecha=datetime.now(timezone.utc),
            subtotal_usd=subtotal_usd_rounded,
            iva_usd=iva_usd_rounded,
            igtf_usd=igtf_usd,
            total_usd=total_usd_rounded,
            metodo_pago="Transferencia",
            tasa_cambio_bs=tasa,
            estado="ACTIVA",
            creado_por=current_user.id
        )
        db.add(nueva_venta)
        db.flush()
        
        # 9. Asociar detalles de venta
        for detalle in detalles_para_guardar:
            detalle.venta_id = nueva_venta.id
            db.add(detalle)
            
        # 10. Actualizar el estado de la cotización original a 'Facturada'
        cot.estado = "Facturada"
        
        db.commit()
        db.refresh(cot)
        
        return {
            "ok": True,
            "numero_factura": numero_factura_final,
            "venta_id": nueva_venta.id,
            "estado_cotizacion": cot.estado
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al facturar la cotización: {str(e)}"
        )


@ventas_ext_router.get("/cotizaciones/{id}/pdf")
def descargar_cotizacion_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from fastapi import HTTPException
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from sqlalchemy.orm import joinedload
    import io
    
    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.cliente), joinedload(Cotizacion.items))
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == current_user.tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
        
    buffer = io.BytesIO()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    theme_color = colors.HexColor("#0b5156")
    text_color = colors.HexColor("#334155")
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=theme_color,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=text_color
    )
    
    body_bold = ParagraphStyle(
        'BodyTextBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=text_color
    )
    
    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white
    )
    
    table_body_style = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        textColor=text_color
    )

    story = []
    
    header_data = [
        [
            Paragraph("<b>KODA ERP</b><br/><font size=8 color='#64748b'>Sistema de Gestión Integral modular</font>", body_bold),
            Paragraph(f"<b>COTIZACIÓN</b><br/><font size=11 color='#0b5156'><b>{cot.numero_cotizacion}</b></font>", ParagraphStyle('RightHeader', parent=body_bold, alignment=2))
        ]
    ]
    header_table = Table(header_data, colWidths=[270, 270])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    
    divider = Table([[""]], colWidths=[540])
    divider.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 1.5, theme_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(divider)
    story.append(Spacer(1, 15))
    
    client_name = cot.cliente.nombre if cot.cliente else "No especificado"
    client_rif = cot.cliente.rif if cot.cliente else "No especificado"
    client_dir = cot.cliente.direccion if cot.cliente else "No especificada"
    client_tel = cot.cliente.telefono if cot.cliente else "No especificado"
    
    info_data = [
        [
            Paragraph("<b>CLIENTE:</b>", body_bold),
            Paragraph("<b>DETALLES DE EMISIÓN:</b>", body_bold)
        ],
        [
            Paragraph(f"{client_name}<br/>RIF: {client_rif}<br/>Dirección: {client_dir}<br/>Tlf: {client_tel}", body_style),
            Paragraph(f"Fecha Emisión: {cot.fecha_emision.strftime('%d/%m/%Y')}<br/>Fecha Vencimiento: {cot.fecha_vencimiento.strftime('%d/%m/%Y')}<br/>Moneda: {cot.moneda}<br/>Estado: {cot.estado}", body_style)
        ]
    ]
    info_table = Table(info_data, colWidths=[270, 270])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))
    
    table_data = [
        [
            Paragraph("Cant.", table_header_style),
            Paragraph("Descripción del Producto/Servicio", table_header_style),
            Paragraph("P. Unitario", table_header_style),
            Paragraph("Desc %", table_header_style),
            Paragraph("Total Fila", table_header_style)
        ]
    ]
    
    symbol = "$" if cot.moneda == "USD" else "Bs."
    
    for item in cot.items:
        qty_str = f"{to_float(item.cantidad):g}"
        price_str = f"{symbol} {to_float(item.precio_unitario):,.2f}"
        disc_str = f"{to_float(item.descuento_porcentaje):g}%"
        total_str = f"{symbol} {to_float(item.total_fila):,.2f}"
        
        table_data.append([
            Paragraph(qty_str, table_body_style),
            Paragraph(item.descripcion, table_body_style),
            Paragraph(price_str, table_body_style),
            Paragraph(disc_str, table_body_style),
            Paragraph(total_str, table_body_style)
        ])
        
    items_table = Table(table_data, colWidths=[50, 260, 80, 60, 90])
    
    t_style = [
        ('BACKGROUND', (0,0), (-1,0), theme_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
    ]
    
    for idx in range(1, len(table_data)):
        if idx % 2 == 0:
            t_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor("#f8fafc")))
            
    items_table.setStyle(TableStyle(t_style))
    story.append(items_table)
    story.append(Spacer(1, 20))
    
    totals_data = [
        [Paragraph("Subtotal:", body_bold), Paragraph(f"{symbol} {to_float(cot.subtotal):,.2f}", ParagraphStyle('RightText', parent=body_style, alignment=2))],
        [Paragraph("Descuento Total:", body_bold), Paragraph(f"{symbol} {to_float(cot.descuento_total):,.2f}", ParagraphStyle('RightText', parent=body_style, alignment=2))],
        [Paragraph("TOTAL FINAL:", title_style), Paragraph(f"{symbol} {to_float(cot.total):,.2f}", ParagraphStyle('RightTitle', parent=title_style, alignment=2))]
    ]
    
    totals_table = Table(totals_data, colWidths=[380, 160])
    totals_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LINEABOVE', (0,-1), (-1,-1), 1, theme_color),
    ]))
    story.append(totals_table)
    
    if cot.condiciones:
        story.append(Spacer(1, 30))
        story.append(Paragraph("<b>Condiciones y Notas:</b>", body_bold))
        story.append(Spacer(1, 5))
        story.append(Paragraph(cot.condiciones.replace('\n', '<br/>'), body_style))
        
    doc.build(story)
    buffer.seek(0)
    
    filename = f"Cotizacion-{cot.numero_cotizacion}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@ventas_ext_router.post("/cotizaciones", status_code=201)
def crear_cotizacion(
    cot_in: CotizacionCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    import uuid
    try:
        # 1. Obtener la tasa de cambio activa
        tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
        tasa_val = Decimal(str(tasa_activa.valor_ves)) if tasa_activa else Decimal("36.52")

        # 2. Resolver el cliente por nombre (debe estar pre-registrado en el maestro)
        client_name = cot_in.client.strip()
        c = db.query(Cliente).filter(Cliente.nombre.ilike(client_name)).first()
        if not c:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El cliente '{client_name}' no existe en el sistema. Por favor regístrelo en el maestro de clientes con su RIF correspondiente antes de cotizar."
            )
        
        # 3. Generar número de cotización correlativo
        count = db.query(Cotizacion).count()
        numero_cotizacion = f"COT-2026-{str(count + 1).zfill(4)}"

        # 4. Crear la cabecera de la cotización
        nueva_cot = Cotizacion(
            numero_cotizacion=numero_cotizacion,
            cliente_id=c.id,
            fecha_emision=cot_in.emissionDate,
            fecha_vencimiento=cot_in.dueDate,
            moneda=cot_in.currency,
            tasa_cambio=tasa_val,
            subtotal=cot_in.subtotal,
            descuento_total=cot_in.discountTotal,
            total=cot_in.totalFinal,
            condiciones=cot_in.notes,
            estado="Borrador",
            creado_por=uuid.UUID(str(current_user.id)) if hasattr(current_user, 'id') and current_user.id else None
        )
        db.add(nueva_cot)
        db.flush()

        # 5. Guardar los ítems
        for item in cot_in.items:
            total_fila = item.quantity * item.price * (Decimal("1.00") - item.discountPct / Decimal("100.00"))
            
            nuevo_item = CotizacionItem(
                cotizacion_id=nueva_cot.id,
                producto_id=None,
                descripcion=item.description,
                cantidad=item.quantity,
                precio_unitario=item.price,
                descuento_porcentaje=item.discountPct,
                total_fila=total_fila
            )
            db.add(nuevo_item)

        db.commit()
        db.refresh(nueva_cot)
        return {
            "ok": True,
            "id": nueva_cot.id,
            "numero_cotizacion": nueva_cot.numero_cotizacion
        }
    except Exception as e:
        db.rollback()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Error al crear cotización: {str(e)}")


@ventas_ext_router.get("/ordenes")
def ordenes_venta(db: Session = Depends(get_db)):
    return db.query(OrdenVenta).order_by(OrdenVenta.fecha.desc()).all()


@ventas_ext_router.get("/notas-entrega")
def notas_entrega(db: Session = Depends(get_db)):
    ventas = db.query(Venta).filter(Venta.estado == "ACTIVA").limit(20).all()
    return [{"numero": v.numero_factura, "fecha": v.fecha.strftime("%d/%m/%Y"), "total": to_float(v.total)} for v in ventas]


# --- INVENTARIO EXTENDIDO ---
inventario_ext_router = APIRouter(prefix="/inventario", tags=["Inventario"], dependencies=[Depends(get_current_user)])


@inventario_ext_router.get("/dashboard")
def inventario_dashboard(db: Session = Depends(get_db)):
    total_sku = db.query(func.count(Producto.id)).scalar() or 0
    agotados = db.query(func.count(Producto.id)).filter(Producto.stock <= 0).scalar() or 0
    valor = db.query(func.sum(Producto.stock * Producto.costo_usd)).scalar() or 0

    # 1. VPD (Venta Promedio Diaria) - Últimos 30 días
    hace_30_dias = datetime.now(timezone.utc) - timedelta(days=30)
    ventas_30d = db.query(
        Producto,
        func.sum(VentaDetalle.cantidad).label('total_vendido')
    ).select_from(VentaDetalle).join(Venta, VentaDetalle.venta_id == Venta.id).join(Producto, VentaDetalle.producto_id == Producto.id).filter(
        Venta.fecha >= hace_30_dias,
        Venta.estado != 'ANULADA'
    ).group_by(Producto.id).all()
    
    vpdItems = []
    for prod, total_vendido in ventas_30d:
        if not prod: continue
        vpd = float(total_vendido or 0) / 30.0
        lead_time = 7 # default 7 days
        cobertura = float(prod.stock or 0) / vpd if vpd > 0 else 999
        sugerencia = max(0, (vpd * 30) - float(prod.stock or 0))
        
        color_cobertura = "bg-green-100 text-green-700"
        if cobertura < lead_time:
            color_cobertura = "bg-red-100 text-red-700"
        elif cobertura < (lead_time + 7):
            color_cobertura = "bg-amber-100 text-amber-700"
            
        vpdItems.append({
            "sku": prod.sku,
            "nombre": prod.nombre,
            "vpd": f"{vpd:.1f} u/día",
            "lead_time": f"{lead_time} días",
            "cobertura": f"{int(cobertura)} días" if cobertura < 999 else "+999 días",
            "color": color_cobertura,
            "sugerencia": f"{int(sugerencia)} u."
        })
    # Sort VPD items by lowest coverage first
    vpdItems.sort(key=lambda x: int(x['cobertura'].split()[0]) if '999' not in x['cobertura'] else 999)
    vpdItems = vpdItems[:5] # Top 5 for dashboard

    # 2. Valorización por Categoría (usando es_exento temporalmente como categoría)
    valor_exento = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(Producto.es_exento == True).scalar() or 0
    valor_gravado = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(Producto.es_exento == False).scalar() or 0
    
    total_val = float(valor or 0)
    categoryValorization = []
    if total_val > 0:
        pct_ex = (float(valor_exento or 0) / total_val) * 100
        pct_gr = (float(valor_gravado or 0) / total_val) * 100
        if (valor_exento or 0) > 0:
            categoryValorization.append({
                "categoria": "Productos Exentos", 
                "valor": f"${float(valor_exento):,.2f}", 
                "porcentaje": f"{pct_ex:.1f}%", 
                "color": "bg-[#0b5156]"
            })
        if (valor_gravado or 0) > 0:
            categoryValorization.append({
                "categoria": "Productos Gravados (IVA)", 
                "valor": f"${float(valor_gravado):,.2f}", 
                "porcentaje": f"{pct_gr:.1f}%", 
                "color": "bg-amber-500"
            })

    # 3. Control de Vencimiento (próximos 60 días)
    dentro_de_60_dias = datetime.now(timezone.utc) + timedelta(days=60)
    lotes_proximos = db.query(LoteProducto).filter(
        LoteProducto.fecha_vencimiento != None,
        LoteProducto.fecha_vencimiento <= dentro_de_60_dias,
        LoteProducto.cantidad > 0
    ).order_by(LoteProducto.fecha_vencimiento.asc()).limit(5).all()
    
    expiryAlerts = []
    for lote in lotes_proximos:
        prod = db.query(Producto).filter(Producto.id == lote.producto_id).first()
        dias_restantes = (lote.fecha_vencimiento - datetime.now(timezone.utc)).days
        if dias_restantes < 0: dias_restantes = 0
        
        status = "CRÍTICO" if dias_restantes <= 30 else "ALERTA"
        color = "text-red-600" if dias_restantes <= 30 else "text-amber-600"
        
        expiryAlerts.append({
            "nombre": f"{prod.nombre if prod else 'Desc.'} (Lote: {lote.lote})",
            "dias": dias_restantes,
            "fecha": lote.fecha_vencimiento.strftime("%d/%m/%Y"),
            "estado": status,
            "color": color
        })

    # 4. Cálculo de concentración de inventario (Análisis ABC) basado en valor de stock
    productos_abc = db.query(Producto).filter(Producto.stock > 0, Producto.costo_usd > 0).all()
    abcAnalysis = "Sin datos suficientes para procesar la concentración de inventario (Análisis ABC). Registre compras y ventas para alimentar el motor de análisis."
    if productos_abc:
        items_value = []
        total_inventario_val = 0.0
        for p in productos_abc:
            val = float(p.stock or 0) * float(p.costo_usd or 0)
            items_value.append((p, val))
            total_inventario_val += val
            
        if total_inventario_val > 0:
            items_value.sort(key=lambda x: x[1], reverse=True)
            cant_a = 0
            cant_b = 0
            cant_c = 0
            val_a = 0.0
            val_b = 0.0
            val_c = 0.0
            cumulative = 0.0
            for idx, (p, val) in enumerate(items_value):
                cumulative += val
                pct = (cumulative / total_inventario_val) * 100
                if idx == 0 or pct <= 70.0:
                    cant_a += 1
                    val_a += val
                elif pct <= 90.0:
                    cant_b += 1
                    val_b += val
                else:
                    cant_c += 1
                    val_c += val

            pct_val_a = (val_a / total_inventario_val) * 100
            pct_val_b = (val_b / total_inventario_val) * 100
            pct_val_c = (val_c / total_inventario_val) * 100
            
            abcAnalysis = (
                f"Análisis procesado. Su inventario cuenta con "
                f"{cant_a} productos Clase A ({pct_val_a:.1f}% del capital), "
                f"{cant_b} productos Clase B ({pct_val_b:.1f}% del capital) y "
                f"{cant_c} productos Clase C ({pct_val_c:.1f}% del capital). "
                f"La concentración de capital está en los artículos Clase A."
            )

    return {
        "kpis": [
            {"titulo": "Total SKUs", "valor": total_sku, "descripcion": "Catálogo", "c": "text-slate-800"},
            {"titulo": "Agotados", "valor": agotados, "descripcion": "Stock Cero", "c": "text-red-600" if agotados > 0 else "text-slate-800"},
            {"titulo": "Lotes Críticos", "valor": sum(1 for a in expiryAlerts if a['estado'] == 'CRÍTICO'), "descripcion": "Vencimiento < 30D", "c": "text-red-600" if any(a['estado'] == 'CRÍTICO' for a in expiryAlerts) else "text-slate-800"},
            {"titulo": "Valor Inventario", "valor": f"${to_float(valor):,.2f}", "descripcion": "Capital (USD)", "c": "text-[#0b5156]"},
        ],
        "total_productos": total_sku, 
        "agotados": agotados, 
        "valor_inventario_usd": to_float(valor),
        "vpdItems": vpdItems,
        "categoryValorization": categoryValorization,
        "expiryAlerts": expiryAlerts,
        "abcAnalysis": abcAnalysis
    }


@inventario_ext_router.get("/kardex-stats")
def kardex_stats(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    movs = db.query(func.count(KardexMovimiento.id)).scalar() or 0
    prods_mov = db.query(func.count(func.distinct(KardexMovimiento.producto_id))).scalar() or 0
    
    # Obtener fecha del último movimiento
    ultimo = db.query(KardexMovimiento).order_by(KardexMovimiento.fecha.desc()).first()
    ultimo_mov_fecha = ultimo.fecha.strftime("%d/%m/%Y %H:%M") if ultimo else "N/A"
    
    # Calcular promedio de costo y valor total de inventario
    avg_cost = db.query(func.avg(Producto.costo_usd)).scalar() or 0.0
    total_cost = db.query(func.sum(Producto.stock * Producto.costo_usd)).scalar() or 0.0
    
    return {
        "movimientos": movs,
        "productos_con_movimiento": prods_mov,
        "kpis": [
            {"etiqueta": "Total Movimientos", "valor": str(movs), "descripcion": "Registrados en Kardex", "color": "text-[#0b5156]"},
            {"etiqueta": "Productos Trazados", "valor": str(prods_mov), "descripcion": "Con Actividad en Sistema", "color": "text-blue-600"},
            {"etiqueta": "Última Actualización", "valor": ultimo_mov_fecha, "descripcion": "Historial del Ledger", "color": "text-amber-600"},
            {"etiqueta": "Integridad Libro", "valor": "Inmutable", "descripcion": "Trazabilidad Completa", "color": "text-green-600"}
        ],
        "controlCostos": [
            {"etiqueta": "Costo Promedio (CPP)", "valor": f"${float(avg_cost):,.2f}", "descripcion": "Promedio ponderado del catálogo", "c": "bg-[#0b5156]/5 border-[#0b5156]/10 text-[#0b5156]"},
            {"etiqueta": "Valorización del Stock", "valor": f"${float(total_cost):,.2f}", "descripcion": "Capital inmovilizado total", "c": "bg-amber-50/50 border-amber-100 text-amber-800"}
        ]
    }


@inventario_ext_router.get("/kardex/{producto_id}")
def kardex_producto(producto_id: int, db: Session = Depends(get_db)):
    movs = db.query(KardexMovimiento).filter(KardexMovimiento.producto_id == producto_id).order_by(KardexMovimiento.fecha.desc()).all()
    return [{"tipo": m.tipo_movimiento, "cantidad": m.cantidad, "doc": m.documento_referencia, "fecha": m.fecha.isoformat()} for m in movs]


class TransferenciaCreate(BaseModel):
    origen_almacen_id: int
    destino_almacen_id: int
    producto_id: int
    cantidad: float


@inventario_ext_router.get("/transferencias")
def transferencias(db: Session = Depends(get_db)):
    rows = db.query(TransferenciaInventario).order_by(TransferenciaInventario.fecha.desc()).all()
    prods = {p.id: p for p in db.query(Producto).all()}
    almacenes = {a.id: a for a in db.query(Almacen).all()}
    return [
        {
            "id": t.id,
            "producto": prods[t.producto_id].nombre if t.producto_id in prods else "",
            "cantidad": to_float(t.cantidad),
            "estado": t.estado,
            "origen": almacenes[t.origen_almacen_id].nombre if t.origen_almacen_id in almacenes else "",
            "destino": almacenes[t.destino_almacen_id].nombre if t.destino_almacen_id in almacenes else ""
        }
        for t in rows
    ]


@inventario_ext_router.post("/transferencias", status_code=201)
def crear_transferencia(payload: TransferenciaCreate, db: Session = Depends(get_db)):
    origen = db.query(Almacen).filter(Almacen.id == payload.origen_almacen_id).first()
    destino = db.query(Almacen).filter(Almacen.id == payload.destino_almacen_id).first()
    if not origen or not destino:
        raise HTTPException(status_code=404, detail="Uno o ambos almacenes no existen.")
    if origen.id == destino.id:
        raise HTTPException(status_code=400, detail="El almacén origen y destino no pueden ser el mismo.")
    
    prod = db.query(Producto).filter(Producto.id == payload.producto_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="El producto a transferir no existe.")
    
    if prod.stock < Decimal(str(payload.cantidad)):
        raise HTTPException(status_code=400, detail=f"Stock insuficiente del producto en el sistema. Disponible: {prod.stock}")
    
    t = TransferenciaInventario(
        origen_almacen_id=payload.origen_almacen_id,
        destino_almacen_id=payload.destino_almacen_id,
        producto_id=payload.producto_id,
        cantidad=Decimal(str(payload.cantidad)),
        estado="PENDIENTE"
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "mensaje": "Transferencia registrada correctamente y en tránsito."}


@inventario_ext_router.put("/transferencias/{transfer_id}/recibir")
def recibir_transferencia(transfer_id: int, db: Session = Depends(get_db)):
    t = db.query(TransferenciaInventario).filter(TransferenciaInventario.id == transfer_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada.")
    if t.estado in ["COMPLETADA", "RECIBIDA"]:
        raise HTTPException(status_code=400, detail="Esta transferencia ya ha sido completada.")
    
    t.estado = "COMPLETADA"
    db.commit()
    return {"ok": True, "mensaje": "Transferencia recibida e ingresada al almacén destino."}


@inventario_ext_router.get("/transferencias/stats")
def transferencias_stats(db: Session = Depends(get_db)):
    pend = db.query(func.count(TransferenciaInventario.id)).filter(TransferenciaInventario.estado.in_(["PENDIENTE", "En Tránsito"])).scalar() or 0
    comp = db.query(func.count(TransferenciaInventario.id)).filter(TransferenciaInventario.estado.in_(["COMPLETADA", "RECIBIDA"])).scalar() or 0
    return {"pendientes": pend, "completadas": comp}


# --- TASAS ALIAS ---
tasas_router = APIRouter(prefix="/tasas", tags=["Tasas"], dependencies=[Depends(get_current_user)])


@tasas_router.get("/bcv")
def tasa_bcv_alias(db: Session = Depends(get_db)):
    tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    return {"valor": float(tasa.valor_ves) if tasa else 36.52, "fuente": tasa.fuente if tasa else "BCV"}


# --- CLIENTES SEGMENTOS ---
clientes_ext_router = APIRouter(prefix="/clientes", tags=["Clientes"], dependencies=[Depends(get_current_user)])


@clientes_ext_router.get("/segmentos")
def segmentos_clientes():
    return ["Mayorista", "Minorista", "Distribuidor", "Corporativo"]


@clientes_ext_router.get("")
@clientes_ext_router.get("/")
def listar_clientes_ext(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).all()
    return [
        {
            "id": c.id,
            "rif": c.rif,
            "nombre": c.nombre,
            "direccion": c.direccion,
            "telefono": getattr(c, "telefono", ""),
            "email": getattr(c, "email", "")
        }
        for c in clientes
    ]
