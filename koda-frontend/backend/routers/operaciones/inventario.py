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

inventario_ext_router = APIRouter(prefix="/inventario", tags=["Inventario"], dependencies=[Depends(get_current_user)])


@inventario_ext_router.get("/dashboard")
def inventario_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    total_sku = db.query(func.count(Producto.id)).filter(Producto.tenant_id == current_user.tenant_id).scalar() or 0
    agotados = db.query(func.count(Producto.id)).filter(Producto.stock <= 0, Producto.tenant_id == current_user.tenant_id).scalar() or 0
    valor = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(Producto.tenant_id == current_user.tenant_id).scalar() or 0

    # 1. VPD (Venta Promedio Diaria) - Últimos 30 días
    hace_30_dias = datetime.now(timezone.utc) - timedelta(days=30)
    ventas_30d = db.query(
        Producto,
        func.sum(VentaDetalle.cantidad).label('total_vendido')
    ).select_from(VentaDetalle).join(Venta, VentaDetalle.venta_id == Venta.id).join(Producto, VentaDetalle.producto_id == Producto.id).filter(
        Venta.fecha >= hace_30_dias,
        Venta.estado != 'ANULADA',
        Producto.tenant_id == current_user.tenant_id
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
    valor_exento = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(Producto.es_exento == True, Producto.tenant_id == current_user.tenant_id).scalar() or 0
    valor_gravado = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(Producto.es_exento == False, Producto.tenant_id == current_user.tenant_id).scalar() or 0
    
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
        LoteProducto.cantidad > 0,
        LoteProducto.tenant_id == current_user.tenant_id
    ).order_by(LoteProducto.fecha_vencimiento.asc()).limit(5).all()
    
    expiryAlerts = []
    for lote in lotes_proximos:
        prod = db.query(Producto).filter(Producto.id == lote.producto_id, Producto.tenant_id == current_user.tenant_id).first()
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
    productos_abc = db.query(Producto).filter(Producto.stock > 0, Producto.costo_usd > 0, Producto.tenant_id == current_user.tenant_id).all()
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
    movs = db.query(func.count(KardexMovimiento.id)).filter(KardexMovimiento.tenant_id == current_user.tenant_id).scalar() or 0
    prods_mov = db.query(func.count(func.distinct(KardexMovimiento.producto_id))).filter(KardexMovimiento.tenant_id == current_user.tenant_id).scalar() or 0
    
    # Obtener fecha del último movimiento
    ultimo = db.query(KardexMovimiento).filter(KardexMovimiento.tenant_id == current_user.tenant_id).order_by(KardexMovimiento.fecha.desc()).first()
    ultimo_mov_fecha = ultimo.fecha.strftime("%d/%m/%Y %H:%M") if ultimo else "N/A"
    
    # Calcular promedio de costo y valor total de inventario
    avg_cost = db.query(func.avg(Producto.costo_usd)).filter(Producto.tenant_id == current_user.tenant_id).scalar() or 0.0
    total_cost = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(Producto.tenant_id == current_user.tenant_id).scalar() or 0.0
    
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


# NOTA: esta es la implementación ACTIVA de GET /inventario/kardex/{producto_id}.
# Existe una segunda definición del mismo path en routers/inventory.py
# (obtener_kardex_producto) bajo un router distinto con el mismo prefix
# "/inventario"; como inventario_ext_router (este archivo) se registra en
# main.py ANTES que inventory.router, FastAPI siempre matchea esta función y
# la de inventory.py queda muerta (shadowed). Ver comentario en ese archivo.
@inventario_ext_router.get("/kardex/{producto_id}")
def kardex_producto(producto_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    prod = db.query(Producto).filter(Producto.id == producto_id, Producto.tenant_id == current_user.tenant_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    movs = db.query(KardexMovimiento).filter(
        KardexMovimiento.producto_id == producto_id,
        KardexMovimiento.tenant_id == current_user.tenant_id
    ).order_by(KardexMovimiento.fecha.desc()).all()
    return [{"tipo": m.tipo_movimiento, "cantidad": m.cantidad, "doc": m.documento_referencia, "fecha": m.fecha.isoformat()} for m in movs]


@inventario_ext_router.get("/kardex/{producto_id}/almacenes")
def kardex_producto_por_almacen(producto_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Desglose de stock actual por almacén para un producto.

    Contrato de respuesta (estable, lo consume una sección nueva del
    frontend en Kardex.tsx): lista de objetos, uno por cada almacén ACTIVO
    del tenant, con la forma:

        {
            "almacen_id": int,
            "codigo": str,
            "nombre": str,
            "cantidad": float,   # StockPorAlmacen.cantidad; 0.0 si no tiene fila
            "es_principal": bool  # True para el almacén activo de menor id
                                    # del tenant (ver get_almacen_principal_id)
        }

    Incluye TODOS los almacenes activos del tenant, no sólo los que ya
    tienen movimientos, para que el frontend pueda mostrar "0" en los
    almacenes donde el producto simplemente no tiene stock todavía.
    """
    prod = db.query(Producto).filter(Producto.id == producto_id, Producto.tenant_id == current_user.tenant_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    principal_id = get_almacen_principal_id(db, current_user.tenant_id)

    almacenes = db.query(Almacen).filter(
        Almacen.tenant_id == current_user.tenant_id,
        Almacen.activo == True  # noqa: E712
    ).order_by(Almacen.id.asc()).all()

    stocks_por_almacen = {
        s.almacen_id: s.cantidad
        for s in db.query(StockPorAlmacen).filter(
            StockPorAlmacen.producto_id == producto_id,
            StockPorAlmacen.tenant_id == current_user.tenant_id
        ).all()
    }

    return [
        {
            "almacen_id": a.id,
            "codigo": a.codigo,
            "nombre": a.nombre,
            "cantidad": to_float(stocks_por_almacen.get(a.id, 0)),
            "es_principal": a.id == principal_id
        }
        for a in almacenes
    ]


class TransferenciaCreate(BaseModel):
    origen_almacen_id: int
    destino_almacen_id: int
    producto_id: int
    cantidad: float


@inventario_ext_router.get("/transferencias")
def transferencias(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rows = db.query(TransferenciaInventario).filter(TransferenciaInventario.tenant_id == current_user.tenant_id).order_by(TransferenciaInventario.fecha.desc()).all()
    prods = {p.id: p for p in db.query(Producto).filter(Producto.tenant_id == current_user.tenant_id).all()}
    almacenes = {a.id: a for a in db.query(Almacen).filter(Almacen.tenant_id == current_user.tenant_id).all()}
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
def crear_transferencia(payload: TransferenciaCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    origen = db.query(Almacen).filter(Almacen.id == payload.origen_almacen_id, Almacen.tenant_id == current_user.tenant_id).first()
    destino = db.query(Almacen).filter(Almacen.id == payload.destino_almacen_id, Almacen.tenant_id == current_user.tenant_id).first()
    if not origen or not destino:
        raise HTTPException(status_code=404, detail="Uno o ambos almacenes no existen.")
    if origen.id == destino.id:
        raise HTTPException(status_code=400, detail="El almacén origen y destino no pueden ser el mismo.")
    
    prod = db.query(Producto).filter(Producto.id == payload.producto_id, Producto.tenant_id == current_user.tenant_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="El producto a transferir no existe.")
    
    if prod.stock < Decimal(str(payload.cantidad)):
        raise HTTPException(status_code=400, detail=f"Stock insuficiente del producto en el sistema. Disponible: {prod.stock}")
    
    t = TransferenciaInventario(
        origen_almacen_id=payload.origen_almacen_id,
        destino_almacen_id=payload.destino_almacen_id,
        producto_id=payload.producto_id,
        cantidad=Decimal(str(payload.cantidad)),
        estado="PENDIENTE",
        tenant_id=current_user.tenant_id
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "mensaje": "Transferencia registrada correctamente y en tránsito."}


@inventario_ext_router.put("/transferencias/{transfer_id}/recibir")
def recibir_transferencia(transfer_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    t = db.query(TransferenciaInventario).filter(
        TransferenciaInventario.id == transfer_id,
        TransferenciaInventario.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not t:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada.")
    if t.estado in ["COMPLETADA", "RECIBIDA"]:
        raise HTTPException(status_code=400, detail="Esta transferencia ya ha sido completada.")

    # Bloqueamos la fila de stock de origen para evitar condiciones de carrera
    # entre recepciones concurrentes de la misma transferencia/producto.
    origen_stock = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == t.producto_id,
        StockPorAlmacen.almacen_id == t.origen_almacen_id,
        StockPorAlmacen.tenant_id == current_user.tenant_id
    ).with_for_update().first()

    disponible = origen_stock.cantidad if origen_stock else Decimal("0.00")
    if disponible < t.cantidad:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente en el almacén de origen para completar la transferencia. Disponible: {disponible}, Requerido: {t.cantidad}"
        )

    origen_stock.cantidad -= t.cantidad

    destino_stock = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == t.producto_id,
        StockPorAlmacen.almacen_id == t.destino_almacen_id,
        StockPorAlmacen.tenant_id == current_user.tenant_id
    ).with_for_update().first()

    if destino_stock:
        destino_stock.cantidad += t.cantidad
    else:
        destino_stock = StockPorAlmacen(
            producto_id=t.producto_id,
            almacen_id=t.destino_almacen_id,
            cantidad=t.cantidad,
            tenant_id=current_user.tenant_id
        )
        db.add(destino_stock)

    t.estado = "COMPLETADA"

    # Grabar en Libro Mayor de Inventario (Kardex): una transferencia mueve
    # stock real entre dos almacenes pero hasta ahora no dejaba rastro en el
    # Kardex. Se registran DOS movimientos (salida en origen, entrada en
    # destino) en vez de uno neto, para que el Kardex de cada almacén sea
    # auditable de forma independiente.
    doc_ref = f"TRF-{str(t.id).zfill(6)}"
    movimiento_salida = KardexMovimiento(
        producto_id=t.producto_id,
        tipo_movimiento="Transferencia_Salida",
        cantidad=-t.cantidad,
        almacen_id=t.origen_almacen_id,
        documento_referencia=doc_ref,
        tenant_id=current_user.tenant_id
    )
    movimiento_entrada = KardexMovimiento(
        producto_id=t.producto_id,
        tipo_movimiento="Transferencia_Entrada",
        cantidad=t.cantidad,
        almacen_id=t.destino_almacen_id,
        documento_referencia=doc_ref,
        tenant_id=current_user.tenant_id
    )
    db.add(movimiento_salida)
    db.add(movimiento_entrada)

    db.commit()
    return {"ok": True, "mensaje": "Transferencia recibida e ingresada al almacén destino."}


@inventario_ext_router.get("/transferencias/stats")
def transferencias_stats(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    pend = db.query(func.count(TransferenciaInventario.id)).filter(
        TransferenciaInventario.estado.in_(["PENDIENTE", "En Tránsito"]),
        TransferenciaInventario.tenant_id == current_user.tenant_id
    ).scalar() or 0
    comp = db.query(func.count(TransferenciaInventario.id)).filter(
        TransferenciaInventario.estado.in_(["COMPLETADA", "RECIBIDA"]),
        TransferenciaInventario.tenant_id == current_user.tenant_id
    ).scalar() or 0
    return {"pendientes": pend, "completadas": comp}


# --- TASAS ALIAS ---
