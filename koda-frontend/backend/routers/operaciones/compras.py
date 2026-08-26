from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from typing import Optional, List

from backend.core.database import get_db
from backend.models.operations import (
    Venta, Cliente, Proveedor, Producto, VentaDetalle, KardexMovimiento, EvaluacionProveedor
)
from backend.models.erp_extended import (
    Compra, CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario,
    Cotizacion, CotizacionItem, OrdenVenta, RequisicionCompra, TransferenciaInventario,
    RetencionIVA, RetencionISLR, Vendedor, Almacen, RecepcionStock, DevolucionProveedor, LoteProducto,
    NotaCredito, AnticipoCliente, Cheque, FondoCajaChica, GastoCajaChica, StockPorAlmacen,
    NotaEntrega, NotaEntregaItem
)
from backend.schemas.operations import (
    CotizacionCreate, CotizacionStatusUpdate, CompraCreate, RecepcionStockCreate, RecepcionStockResponse,
    DevolucionProveedorCreate, NotaEntregaCreate, NotaEntregaEstadoUpdate
)
from backend.core.security import get_current_user, require_role
from backend.models.core import TasaCambio
from backend.utils.helpers import to_float, periodo_rango, ventas_periodo, tasa_actual, margen_bruto_pct, get_almacen_principal_id, verificar_periodo_abierto
from backend.services.contabilidad import ContabilidadService
from backend.routers.operaciones._shared import _as_aware, ISLR_WITHHOLDING_TABLE, _resolver_islr_automatico, calcular_reserva_fiscal

compras_router = APIRouter(prefix="/compras", tags=["Compras"], dependencies=[Depends(get_current_user)])


@compras_router.get("/dashboard")
def compras_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    total = db.query(func.sum(Compra.total_usd)).filter(
        Compra.estado == "ACTIVA",
        Compra.tenant_id == current_user.tenant_id
    ).scalar() or 0
    pendientes = db.query(func.count(Compra.id)).filter(
        Compra.estado == "PENDIENTE",
        Compra.tenant_id == current_user.tenant_id
    ).scalar() or 0
    cxp_total = db.query(func.sum(CuentaPorPagar.monto_total_usd - CuentaPorPagar.monto_pagado_usd)).filter(
        CuentaPorPagar.estado != "PAGADA",
        CuentaPorPagar.tenant_id == current_user.tenant_id
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
        ).filter(
            Compra.estado == "ACTIVA",
            Compra.tenant_id == current_user.tenant_id
        ).group_by(Compra.categoria).all()
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
def compras_historial(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    compras = db.query(Compra).filter(Compra.tenant_id == current_user.tenant_id).order_by(Compra.fecha.desc()).limit(100).all()
    
    total_compras = db.query(func.count(Compra.id)).filter(Compra.tenant_id == current_user.tenant_id).scalar() or 0
    monto_total = db.query(func.sum(Compra.total_usd)).filter(Compra.tenant_id == current_user.tenant_id).scalar() or 0
    facturas_validadas = db.query(func.count(Compra.id)).filter(
        Compra.estado == "ACTIVA",
        Compra.tenant_id == current_user.tenant_id
    ).scalar() or 0
    casos_alerta = db.query(func.count(Compra.id)).filter(
        Compra.estado == "PENDIENTE",
        Compra.tenant_id == current_user.tenant_id
    ).scalar() or 0
    
    # Approximation for open orders
    ordenes_abiertas = db.query(func.count(OrdenVenta.id)).filter(
        OrdenVenta.estado == "BORRADOR",
        OrdenVenta.tenant_id == current_user.tenant_id
    ).scalar() or 0
    
    purchases_list = [
        {
            "date": c.fecha.strftime("%d/%m/%Y") if c.fecha else "",
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
def listar_compras(skip: int = 0, limit: int = 500, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Compra).filter(Compra.tenant_id == current_user.tenant_id).order_by(Compra.fecha.desc()).offset(skip).limit(limit).all()


@compras_router.get("/ordenes")
def ordenes_compra(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # "Historial de Órdenes de Compra" (PurchaseOrders.tsx) necesita ver
    # también las ANULADA para ser un historial real, no solo las abiertas.
    compras = db.query(Compra).filter(
        Compra.tenant_id == current_user.tenant_id
    ).order_by(Compra.fecha.desc()).all()
    return [
        {
            # "id" se mantiene como numero_factura por compatibilidad de
            # visualización (columna N° Orden); "compra_id" es el id numérico
            # real de la fila, necesario para autorizar/recibir.
            "id": c.numero_factura,
            "compra_id": c.id,
            "date": c.fecha.strftime("%d/%m/%Y") if c.fecha else "",
            "vendor": {"nombre": c.proveedor.nombre if c.proveedor else "", "rif": c.proveedor.rif if c.proveedor else ""},
            "proveedor": c.proveedor.nombre if c.proveedor else "",
            "amount": to_float(c.total_usd),
            "total": to_float(c.total_usd),
            "status": c.estado,
            "estado": c.estado,
        }
        for c in compras
    ]


@compras_router.get("/facturas")
def facturas_proveedor(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    compras = db.query(Compra).filter(Compra.tenant_id == current_user.tenant_id).order_by(Compra.fecha.desc()).all()
    return [
        {
            "id": c.id,
            "numero_factura": c.numero_factura,
            "numero_control": c.numero_control,
            "fecha": c.fecha.strftime("%d/%m/%Y") if c.fecha else "",
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
def aprobaciones(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rows = db.query(RequisicionCompra).filter(
        RequisicionCompra.estado == "PENDIENTE",
        RequisicionCompra.tenant_id == current_user.tenant_id
    ).all()
    # "id" se mantiene como el numero (REQ-xxxxxxxx) por compatibilidad con
    # el display existente en el frontend; "requisicion_id" es el id numérico
    # real de la fila, necesario para invocar aprobar/rechazar.
    return [{
        "id": r.numero,
        "requisicion_id": r.id,
        "numero": r.numero,
        "solicitante": r.solicitante,
        "monto": to_float(r.monto_estimado),
        "estado": r.estado,
        "prioridad": r.prioridad
    } for r in rows]


@compras_router.get("/requisiciones")
def requisiciones(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rows = db.query(RequisicionCompra).filter(RequisicionCompra.tenant_id == current_user.tenant_id).order_by(RequisicionCompra.fecha.desc()).all()
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
def create_requisicion(req: RequisicionCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        # Generar número secuencial (REQ-00000000)
        max_id = db.query(func.max(RequisicionCompra.id)).filter(RequisicionCompra.tenant_id == current_user.tenant_id).scalar() or 0
        new_numero = f"REQ-{(max_id + 1):08d}"
        
        # Get tasa actual
        tasa = tasa_actual(db, current_user.tenant_id)
        
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
            fecha=datetime.now(timezone.utc),
            tenant_id=current_user.tenant_id
        )
        db.add(db_req)
        db.commit()
        db.refresh(db_req)
        return {"ok": True, "id": db_req.id, "numero": db_req.numero}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


class RequisicionRechazoInput(BaseModel):
    motivo: Optional[str] = None


@compras_router.post("/requisiciones/{requisicion_id}/aprobar")
def aprobar_requisicion(
    requisicion_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"]))  # CHECKER: maker-checker, ver aprobar_ajuste en inventory.py
):
    """
    Paso 2 (Checker) del flujo maker-checker de requisiciones: cualquier
    usuario puede registrar una requisición (create_requisicion, "maker"),
    pero solo Admin/Gerente puede aprobarla. Deja rastro de auditoría
    (decidido_por/fecha_decision) de quién tomó la decisión y cuándo.
    """
    req = db.query(RequisicionCompra).filter(
        RequisicionCompra.id == requisicion_id,
        RequisicionCompra.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    if req.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail=f"La requisición ya fue procesada (estado actual: {req.estado}).")

    req.estado = "APROBADA"
    req.decidido_por = current_user.id
    req.fecha_decision = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "id": req.id, "numero": req.numero, "estado": req.estado}


@compras_router.post("/requisiciones/{requisicion_id}/rechazar")
def rechazar_requisicion(
    requisicion_id: int,
    payload: RequisicionRechazoInput,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"]))  # CHECKER
):
    """Paso 2 (Checker) alternativo: rechaza la requisición con motivo opcional."""
    req = db.query(RequisicionCompra).filter(
        RequisicionCompra.id == requisicion_id,
        RequisicionCompra.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    if req.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail=f"La requisición ya fue procesada (estado actual: {req.estado}).")

    req.estado = "RECHAZADA"
    req.decidido_por = current_user.id
    req.fecha_decision = datetime.now(timezone.utc)
    req.motivo_rechazo = payload.motivo
    db.commit()
    return {"ok": True, "id": req.id, "numero": req.numero, "estado": req.estado}


@compras_router.get("/recepciones")
def recepciones(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    recs = db.query(RecepcionStock).filter(RecepcionStock.tenant_id == current_user.tenant_id).order_by(RecepcionStock.fecha.desc()).all()
    res = []
    for r in recs:
        res.append({
            "id": r.id,
            "hoja_id": r.hoja_id,
            "fecha": r.fecha.strftime("%Y-%m-%d") if r.fecha else "",
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
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        # Bloqueamos la fila del producto para evitar condiciones de carrera
        # entre recepciones concurrentes del mismo producto (mismo patrón que
        # recibir_transferencia).
        producto = db.query(Producto).filter(
            Producto.id == req.producto_id,
            Producto.tenant_id == current_user.tenant_id
        ).with_for_update().first()
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        # Almacén que recibe la mercancía: el indicado explícitamente, o el
        # almacén "principal" del tenant como fallback para no dejar
        # StockPorAlmacen sin actualizar.
        almacen_id = req.almacen_id or get_almacen_principal_id(db, current_user.tenant_id)
        if not almacen_id:
            raise HTTPException(
                status_code=400,
                detail="No hay ningún almacén configurado para el tenant. Cree un almacén antes de registrar recepciones."
            )

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

        # Reflejar la entrada en StockPorAlmacen para el almacén receptor
        # (mismo patrón de lock+update-o-create que recibir_transferencia).
        destino_stock = db.query(StockPorAlmacen).filter(
            StockPorAlmacen.producto_id == req.producto_id,
            StockPorAlmacen.almacen_id == almacen_id,
            StockPorAlmacen.tenant_id == current_user.tenant_id
        ).with_for_update().first()

        if destino_stock:
            destino_stock.cantidad += nueva_cantidad
        else:
            destino_stock = StockPorAlmacen(
                producto_id=req.producto_id,
                almacen_id=almacen_id,
                cantidad=nueva_cantidad,
                tenant_id=current_user.tenant_id
            )
            db.add(destino_stock)

        # Crear Hoja de Recepción
        count = db.query(RecepcionStock).filter(RecepcionStock.tenant_id == current_user.tenant_id).count() + 1
        hoja_id = f"REC-{count:04d}"

        nueva_recepcion = RecepcionStock(
            hoja_id=hoja_id,
            orden_compra=req.orden_compra,
            producto_id=req.producto_id,
            cantidad=req.cantidad,
            costo_usd=req.costo_factura,
            estado="Registrado",
            fecha=datetime.now(timezone.utc),
            tenant_id=current_user.tenant_id
        )

        db.add(nueva_recepcion)

        # Grabar en Libro Mayor de Inventario (Kardex): la recepción de
        # compra modifica stock real igual que una venta o un ajuste, pero
        # hasta ahora no dejaba rastro en el Kardex. Cantidad positiva
        # porque es una entrada; mismo documento (hoja_id) que ya identifica
        # la recepción en el resto del flujo.
        movimiento = KardexMovimiento(
            producto_id=req.producto_id,
            tipo_movimiento="Compra",
            cantidad=nueva_cantidad,
            almacen_id=almacen_id,
            documento_referencia=hoja_id,
            tenant_id=current_user.tenant_id
        )
        db.add(movimiento)

        db.commit()

        return {"ok": True, "hoja_id": hoja_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@compras_router.get("/devoluciones")
def devoluciones(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    devs = db.query(DevolucionProveedor).filter(DevolucionProveedor.tenant_id == current_user.tenant_id).order_by(DevolucionProveedor.fecha.desc()).all()
    res = []
    for d in devs:
        prov = db.query(Proveedor).filter(
            Proveedor.id == d.proveedor_id,
            Proveedor.tenant_id == current_user.tenant_id
        ).first()
        producto = db.query(Producto).filter(
            Producto.id == d.producto_id,
            Producto.tenant_id == current_user.tenant_id
        ).first() if d.producto_id else None
        res.append({
            "id": d.id,
            "numero_devolucion": d.numero_devolucion,
            "fecha": d.fecha.strftime("%Y-%m-%d") if d.fecha else "",
            "proveedor": prov.nombre if prov else "Desconocido",
            "monto": float(d.monto_usd),
            "estado": d.estado,
            "producto_id": d.producto_id,
            "producto": producto.nombre if producto else None,
            "cantidad": float(d.cantidad) if d.cantidad is not None else None
        })
    return res

@compras_router.post("/devoluciones", status_code=201)
def crear_devolucion(
    dev_in: DevolucionProveedorCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        prov = db.query(Proveedor).filter(
            Proveedor.id == dev_in.proveedor_id,
            Proveedor.tenant_id == current_user.tenant_id
        ).first()
        if not prov:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

        # Si se indica producto/cantidad, la devolución sí representa una
        # salida física de mercancía: se bloquea la fila del producto (mismo
        # patrón que aprobar_ajuste/procesar_recepcion) y se descuenta el
        # stock, validando que no quede negativo.
        producto = None
        if dev_in.producto_id is not None:
            if not dev_in.cantidad or dev_in.cantidad <= 0:
                raise HTTPException(status_code=400, detail="Debe indicar una cantidad mayor a cero cuando se especifica un producto.")
            producto = db.query(Producto).filter(
                Producto.id == dev_in.producto_id,
                Producto.tenant_id == current_user.tenant_id
            ).with_for_update().first()
            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            if producto.stock - dev_in.cantidad < 0:
                raise HTTPException(status_code=400, detail="La devolución dejaría el stock del producto en negativo.")

        count = db.query(DevolucionProveedor).filter(DevolucionProveedor.tenant_id == current_user.tenant_id).count() + 1
        numero = f"DEV-{count:04d}"

        db_dev = DevolucionProveedor(
            numero_devolucion=numero,
            proveedor_id=dev_in.proveedor_id,
            factura_id=dev_in.factura_id,
            motivo=dev_in.motivo,
            monto_usd=dev_in.monto_usd,
            producto_id=dev_in.producto_id,
            cantidad=dev_in.cantidad,
            estado="EN PROCESO",
            fecha=datetime.now(timezone.utc),
            tenant_id=current_user.tenant_id
        )
        db.add(db_dev)

        if producto is not None:
            producto.stock -= dev_in.cantidad

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
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        dev = db.query(DevolucionProveedor).filter(
            DevolucionProveedor.id == id,
            DevolucionProveedor.tenant_id == current_user.tenant_id
        ).first()
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
        proveedor = db.query(Proveedor).filter(
            Proveedor.id == compra_in.proveedor_id,
            Proveedor.tenant_id == current_user.tenant_id
        ).first()
        if not proveedor:
            raise HTTPException(
                status_code=404,
                detail="El proveedor especificado no existe."
            )

        # Validar factura duplicada
        existing = db.query(Compra).filter(
            Compra.numero_factura == compra_in.numero_factura,
            Compra.tenant_id == current_user.tenant_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"La factura N° {compra_in.numero_factura} ya está registrada en el sistema."
            )

        # Bloqueo de período: no permitir registrar compras con fecha_emision
        # dentro de un período contable ya cerrado (mismo chequeo que usa la
        # creación manual de asientos en contabilidad_ext.py).
        verificar_periodo_abierto(db, current_user.tenant_id, compra_in.fecha_emision, contexto="compras")

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
            categoria=compra_in.categoria or "BIENES_INVENTARIO",
            tenant_id=current_user.tenant_id
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
            estado="PENDIENTE",
            tenant_id=current_user.tenant_id
        )
        db.add(nueva_cxp)

        # Retención de ISLR automática (si la categoría tiene una regla confirmada)
        islr_rule = _resolver_islr_automatico(nueva_compra.categoria)
        if islr_rule:
            concepto_codigo, alicuota = islr_rule
            base_usd = nueva_compra.subtotal_usd
            monto_usd = (Decimal(str(base_usd)) * Decimal(str(alicuota))).quantize(Decimal("0.01"))
            periodo = fecha_emision_dt.strftime("%Y-%m")
            nueva_retencion_islr = RetencionISLR(
                proveedor_rif=proveedor.rif,
                proveedor_nombre=proveedor.nombre,
                numero_factura=compra_in.numero_factura,
                numero_control=compra_in.numero_control,
                base_usd=base_usd,
                concepto_codigo=concepto_codigo,
                alicuota=alicuota,
                monto_usd=monto_usd,
                tasa_cambio_bs=compra_in.tasa_cambio_bs,
                periodo=periodo,
                estado="PENDIENTE",
                tenant_id=current_user.tenant_id,
            )
            db.add(nueva_retencion_islr)

        # Conciliar Recepcion
        if compra_in.recepcion_id:
            recepcion = db.query(RecepcionStock).filter(
                RecepcionStock.id == compra_in.recepcion_id,
                RecepcionStock.tenant_id == current_user.tenant_id
            ).first()
            if recepcion:
                recepcion.estado = "Conciliado"
                recepcion.orden_compra = compra_in.numero_factura # Guardamos la referencia cruzada

        # Generar Asiento Contable Automático de Compra
        ContabilidadService.generar_asiento_compra(nueva_compra, db, tenant_id=current_user.tenant_id)
                
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


@compras_router.post("/{compra_id}/autorizar")
def autorizar_compra(
    compra_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"]))  # CHECKER: mismo criterio que aprobar_ajuste
):
    """
    Autoriza una orden de compra que quedó en estado PENDIENTE (por ejemplo,
    importada o registrada manualmente sin autorización previa), pasándola a
    ACTIVA. No aplica a compras ya ACTIVA/ANULADA.
    """
    compra = db.query(Compra).filter(
        Compra.id == compra_id,
        Compra.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not compra:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    if compra.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail=f"Solo se pueden autorizar órdenes PENDIENTE (estado actual: {compra.estado}).")

    compra.estado = "ACTIVA"
    db.commit()
    return {"ok": True, "id": compra.id, "estado": compra.estado}


@compras_router.get("/analisis-costos")
def analisis_costos(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    compras = db.query(Compra).filter(Compra.tenant_id == current_user.tenant_id).order_by(Compra.fecha).all()
    proveedores = db.query(Proveedor).filter(Proveedor.tenant_id == current_user.tenant_id).all()
    productos = db.query(Producto).filter(Producto.tenant_id == current_user.tenant_id).all()
    evaluaciones = db.query(EvaluacionProveedor).filter(EvaluacionProveedor.tenant_id == current_user.tenant_id).all()

    eval_by_prov = {e.proveedor_id: e for e in evaluaciones}

    compras_por_mes = {}
    for compra in compras:
        mes = compra.fecha.strftime("%Y-%m") if compra.fecha else "N/A"
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
