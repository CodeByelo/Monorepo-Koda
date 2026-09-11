from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from typing import Optional, List

from backend.core.database import get_db
from backend.models.operations import (
    Venta, Cliente, Proveedor, Producto, VentaDetalle, KardexMovimiento, EvaluacionProveedor, AjusteInventario
)
from backend.models.erp_extended import (
    Compra, CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario,
    Cotizacion, CotizacionItem, OrdenVenta, RequisicionCompra, TransferenciaInventario,
    RetencionIVA, RetencionISLR, Vendedor, Almacen, RecepcionStock, DevolucionProveedor, LoteProducto,
    NotaCredito, AnticipoCliente, Cheque, FondoCajaChica, GastoCajaChica, StockPorAlmacen,
    NotaEntrega, NotaEntregaItem, DevolucionCliente, CuarentenaLogistica, TurnoDespacho, ConteoFisico, Garantia
)
from backend.models.fiscal import CorrelativoFiscal
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
        dias_restantes = (_as_aware(lote.fecha_vencimiento) - datetime.now(timezone.utc)).days
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
def kardex_producto(
    producto_id: int,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    prod = db.query(Producto).filter(Producto.id == producto_id, Producto.tenant_id == current_user.tenant_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    movs = db.query(KardexMovimiento).filter(
        KardexMovimiento.producto_id == producto_id,
        KardexMovimiento.tenant_id == current_user.tenant_id
    ).order_by(KardexMovimiento.fecha.desc()).offset(skip).limit(limit).all()
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
    cantidad: float = Field(gt=0, description="Cantidad a transferir (debe ser estrictamente positiva)")


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
    
    origen_stock = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == payload.producto_id,
        StockPorAlmacen.almacen_id == payload.origen_almacen_id,
        StockPorAlmacen.tenant_id == current_user.tenant_id
    ).first()
    stock_disponible_origen = origen_stock.cantidad if origen_stock else Decimal("0")

    if stock_disponible_origen < Decimal(str(payload.cantidad)):
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente en el almacén de origen. Disponible: {stock_disponible_origen}, Solicitado: {payload.cantidad}"
        )
    
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

    # Adquirir locks en orden canónico (ordenando por almacen_id ascendente)
    # para prevenir deadlocks en transferencias concurrentes cruzadas (A->B y B->A).
    almacen_ids_ordenados = sorted([t.origen_almacen_id, t.destino_almacen_id])
    stocks_locked = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == t.producto_id,
        StockPorAlmacen.almacen_id.in_(almacen_ids_ordenados),
        StockPorAlmacen.tenant_id == current_user.tenant_id
    ).order_by(StockPorAlmacen.almacen_id.asc()).with_for_update().all()

    stocks_dict = {s.almacen_id: s for s in stocks_locked}
    origen_stock = stocks_dict.get(t.origen_almacen_id)

    disponible = origen_stock.cantidad if origen_stock else Decimal("0.00")
    if disponible < t.cantidad:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente en el almacén de origen para completar la transferencia. Disponible: {disponible}, Requerido: {t.cantidad}"
        )

    nueva_cant_origen = origen_stock.cantidad - t.cantidad
    origen_stock.cantidad = nueva_cant_origen if nueva_cant_origen > Decimal("0") else Decimal("0")

    destino_stock = stocks_dict.get(t.destino_almacen_id)

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


# ==============================================================================
# DEVOLUCIONES DE CLIENTE (MOSTRADOR / POS) & FICHA 360 DE PRODUCTO
# ==============================================================================

class DevolucionClienteCreate(BaseModel):
    venta_id: int
    producto_id: int
    cantidad: Decimal = Field(..., gt=0)
    motivo: str = Field(..., min_length=1, max_length=255)
    condicion: str = Field("BUENO", description="BUENO o DAÑADO")
    almacen_id: Optional[int] = None


@inventario_ext_router.post("/devoluciones-cliente", status_code=201)
def crear_devolucion_cliente(
    payload: DevolucionClienteCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra la devolución de un producto vendido por mostrador / POS.
    - condicion == 'BUENO': reingresa al stock del almacén y suma al stock global del producto
      mediante KardexMovimiento(tipo_movimiento='Devolucion_Cliente').
    - condicion == 'DAÑADO': NO altera stock ni crea movimiento en Kardex, pero queda registrado
      en devoluciones_cliente para trazabilidad completa en la Ficha 360.
    """
    condicion_clean = payload.condicion.strip().upper()
    if condicion_clean not in ["BUENO", "DAÑADO"]:
        raise HTTPException(status_code=400, detail="La condición debe ser 'BUENO' o 'DAÑADO'.")

    # 1. Validar producto
    producto = db.query(Producto).filter(
        Producto.id == payload.producto_id,
        Producto.tenant_id == current_user.tenant_id
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    # 2. Validar venta
    venta = db.query(Venta).filter(
        Venta.id == payload.venta_id,
        Venta.tenant_id == current_user.tenant_id
    ).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")

    # 3. Generar número correlativo
    correlativo = (
        db.query(CorrelativoFiscal)
        .filter(
            CorrelativoFiscal.tipo_documento == "DEVOLUCION_CLIENTE",
            CorrelativoFiscal.tenant_id == current_user.tenant_id
        )
        .with_for_update()
        .first()
    )
    if not correlativo:
        correlativo = CorrelativoFiscal(
            tipo_documento="DEVOLUCION_CLIENTE",
            prefijo="DEV-CLI-",
            siguiente_numero=1,
            tenant_id=current_user.tenant_id
        )
        db.add(correlativo)
        db.flush()

    num_seq = correlativo.siguiente_numero
    correlativo.siguiente_numero += 1
    numero_dev = f"{correlativo.prefijo}{str(num_seq).zfill(5)}"

    # 4. Crear registro DevolucionCliente
    dev_cliente = DevolucionCliente(
        tenant_id=current_user.tenant_id,
        numero_devolucion=numero_dev,
        venta_id=payload.venta_id,
        producto_id=payload.producto_id,
        cantidad=payload.cantidad,
        motivo=payload.motivo.strip(),
        condicion=condicion_clean,
        fecha=datetime.now(timezone.utc)
    )
    db.add(dev_cliente)
    db.flush()

    # 5. Si es BUENO, reingresa a stock vía Kardex y StockPorAlmacen
    if condicion_clean == "BUENO":
        almacen_dest_id = payload.almacen_id or get_almacen_principal_id(db, current_user.tenant_id)
        if not almacen_dest_id:
            alm = db.query(Almacen).filter(Almacen.tenant_id == current_user.tenant_id, Almacen.activo == True).first()
            if alm:
                almacen_dest_id = alm.id

        # Kardex
        kardex = KardexMovimiento(
            tenant_id=current_user.tenant_id,
            producto_id=payload.producto_id,
            tipo_movimiento="Devolucion_Cliente",
            cantidad=payload.cantidad,
            documento_referencia=numero_dev,
            almacen_id=almacen_dest_id,
            estado="ACTIVO",
            fecha=datetime.now(timezone.utc)
        )
        db.add(kardex)

        # Actualizar stock global del producto
        producto.stock = (producto.stock or Decimal("0.00")) + payload.cantidad

        # Actualizar stock por almacén
        if almacen_dest_id:
            spa = db.query(StockPorAlmacen).filter(
                StockPorAlmacen.producto_id == payload.producto_id,
                StockPorAlmacen.almacen_id == almacen_dest_id,
                StockPorAlmacen.tenant_id == current_user.tenant_id
            ).first()
            if spa:
                spa.cantidad = (spa.cantidad or Decimal("0.00")) + payload.cantidad
            else:
                spa = StockPorAlmacen(
                    tenant_id=current_user.tenant_id,
                    producto_id=payload.producto_id,
                    almacen_id=almacen_dest_id,
                    cantidad=payload.cantidad
                )
                db.add(spa)

    db.commit()
    db.refresh(dev_cliente)

    return {
        "ok": True,
        "id": dev_cliente.id,
        "numero_devolucion": dev_cliente.numero_devolucion,
        "condicion": dev_cliente.condicion,
        "cantidad": float(dev_cliente.cantidad),
        "mensaje": "Devolución registrada exitosamente."
    }


@inventario_ext_router.get("/productos/{id}/ficha-360")
def obtener_ficha_360_producto(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Ficha 360 del producto — Consulta unificada de las 13 fuentes de datos del ERP.
    """
    producto = db.query(Producto).filter(
        Producto.id == id,
        Producto.tenant_id == current_user.tenant_id
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    # 1. Rotación y analítica de ventas (Últimos 30 días, reusando el cálculo estándar de analítica de inventario)
    hace_30_dias = datetime.now(timezone.utc) - timedelta(days=30)
    ventas_30d_qty = db.query(func.sum(VentaDetalle.cantidad)).select_from(VentaDetalle).join(
        Venta, VentaDetalle.venta_id == Venta.id
    ).filter(
        Venta.tenant_id == current_user.tenant_id,
        VentaDetalle.producto_id == id,
        Venta.fecha >= hace_30_dias,
        Venta.estado != "ANULADA"
    ).scalar() or Decimal("0.00")

    precio_usd = float(producto.precio_usd or 0.0)
    costo_usd = float(producto.costo_usd or 0.0)
    rentabilidad_bruta = ((precio_usd - costo_usd) / precio_usd * 100.0) if precio_usd > 0 else 0.0
    rotacion_unidades = float(ventas_30d_qty)

    # Clasificación de cuadrante
    if rotacion_unidades >= 1.0 and rentabilidad_bruta >= 10.0:
        cuadrante = "Estrellas (Alta Rotación / Alto Margen)"
        cuadrante_badge = "bg-teal-50 text-[#0b5156] border-[#0b5156]"
    elif rotacion_unidades < 1.0 and rentabilidad_bruta >= 10.0:
        cuadrante = "Incógnitas (Baja Rotación / Alto Margen)"
        cuadrante_badge = "bg-blue-50 text-blue-700 border-blue-200"
    elif rotacion_unidades >= 1.0 and rentabilidad_bruta < 10.0:
        cuadrante = "Vacas de Efectivo (Alta Rotación / Bajo Margen)"
        cuadrante_badge = "bg-emerald-50 text-emerald-700 border-emerald-200"
    else:
        cuadrante = "Perros (Baja Rotación / Bajo Margen)"
        cuadrante_badge = "bg-rose-50 text-rose-700 border-rose-200"

    # Fuente #6: StockPorAlmacen
    almacenes_rows = db.query(
        StockPorAlmacen.id,
        StockPorAlmacen.almacen_id,
        StockPorAlmacen.cantidad,
        Almacen.nombre.label("almacen_nombre"),
        Almacen.codigo.label("almacen_codigo"),
        Almacen.tipo.label("almacen_tipo")
    ).join(
        Almacen, StockPorAlmacen.almacen_id == Almacen.id
    ).filter(
        StockPorAlmacen.producto_id == id,
        StockPorAlmacen.tenant_id == current_user.tenant_id
    ).all()

    stock_almacenes = [
        {
            "id": r.id,
            "almacen_id": r.almacen_id,
            "nombre": r.almacen_nombre,
            "codigo": r.almacen_codigo,
            "tipo": r.almacen_tipo,
            "es_principal": (r.almacen_tipo == "LOCAL"),
            "cantidad": float(r.cantidad)
        }
        for r in almacenes_rows
    ]

    # Fuente #9: LoteProducto
    lotes_rows = db.query(LoteProducto).filter(
        LoteProducto.producto_id == id,
        LoteProducto.tenant_id == current_user.tenant_id
    ).order_by(LoteProducto.fecha_vencimiento.asc().nullslast()).all()

    lotes = [
        {
            "id": l.id,
            "lote": l.lote,
            "fecha_vencimiento": l.fecha_vencimiento.strftime("%Y-%m-%d") if l.fecha_vencimiento else None,
            "cantidad": float(l.cantidad)
        }
        for l in lotes_rows
    ]

    # Historial de Movimientos Unificado:
    # Fuente #2: KardexMovimiento
    # Fuente #3: AjusteInventario
    # Fuente #5: TransferenciaInventario
    # Fuente #7: RecepcionStock
    movimientos = []

    kardex_rows = db.query(
        KardexMovimiento.id,
        KardexMovimiento.fecha,
        KardexMovimiento.tipo_movimiento,
        KardexMovimiento.cantidad,
        KardexMovimiento.documento_referencia,
        Almacen.nombre.label("almacen_nombre")
    ).outerjoin(
        Almacen, KardexMovimiento.almacen_id == Almacen.id
    ).filter(
        KardexMovimiento.producto_id == id,
        KardexMovimiento.tenant_id == current_user.tenant_id
    ).order_by(KardexMovimiento.fecha.desc()).limit(200).all()

    for k in kardex_rows:
        movimientos.append({
            "origen": "Kardex",
            "id": f"KDX-{k.id}",
            "fecha": k.fecha.isoformat() if k.fecha else "",
            "tipo": k.tipo_movimiento,
            "cantidad": float(k.cantidad),
            "referencia": k.documento_referencia,
            "almacen": k.almacen_nombre or "General",
            "estado": "REGISTRADO"
        })

    ajustes_rows = db.query(
        AjusteInventario.id,
        AjusteInventario.fecha_solicitud,
        AjusteInventario.cantidad,
        AjusteInventario.motivo,
        AjusteInventario.estado,
        Almacen.nombre.label("almacen_nombre")
    ).outerjoin(
        Almacen, AjusteInventario.almacen_id == Almacen.id
    ).filter(
        AjusteInventario.producto_id == id,
        AjusteInventario.tenant_id == current_user.tenant_id
    ).order_by(AjusteInventario.fecha_solicitud.desc()).limit(100).all()

    for a in ajustes_rows:
        movimientos.append({
            "origen": "Ajuste",
            "id": f"AJU-{a.id}",
            "fecha": a.fecha_solicitud.isoformat() if a.fecha_solicitud else "",
            "tipo": f"Ajuste ({a.estado})",
            "cantidad": float(a.cantidad),
            "referencia": a.motivo,
            "almacen": a.almacen_nombre or "Almacén Principal",
            "estado": a.estado
        })

    transferencias_rows = db.query(
        TransferenciaInventario.id,
        TransferenciaInventario.fecha,
        TransferenciaInventario.cantidad,
        TransferenciaInventario.estado,
        Almacen.nombre.label("origen_nombre")
    ).outerjoin(
        Almacen, TransferenciaInventario.origen_almacen_id == Almacen.id
    ).filter(
        TransferenciaInventario.producto_id == id,
        TransferenciaInventario.tenant_id == current_user.tenant_id
    ).order_by(TransferenciaInventario.fecha.desc()).limit(100).all()

    for tr in transferencias_rows:
        movimientos.append({
            "origen": "Transferencia",
            "id": f"TRF-{tr.id}",
            "fecha": tr.fecha.isoformat() if tr.fecha else "",
            "tipo": f"Transferencia ({tr.estado})",
            "cantidad": float(tr.cantidad),
            "referencia": f"Desde {tr.origen_nombre or 'Almacén'}",
            "almacen": tr.origen_nombre or "General",
            "estado": tr.estado
        })

    recepciones_rows = db.query(RecepcionStock).filter(
        RecepcionStock.producto_id == id,
        RecepcionStock.tenant_id == current_user.tenant_id
    ).order_by(RecepcionStock.fecha.desc()).limit(100).all()

    for rec in recepciones_rows:
        movimientos.append({
            "origen": "Recepción Stock",
            "id": f"REC-{rec.id}",
            "fecha": rec.fecha.isoformat() if rec.fecha else "",
            "tipo": "Recepción de Mercancía",
            "cantidad": float(rec.cantidad),
            "referencia": f"Hoja {rec.hoja_id} / OC: {rec.orden_compra or 'S/N'}",
            "almacen": "Almacén Recepción",
            "estado": rec.estado
        })

    # Ordenar cronológicamente descendente
    movimientos.sort(key=lambda m: m["fecha"] or "", reverse=True)

    # Devoluciones y Condición:
    # Fuente #11: DevolucionProveedor
    dev_prov_rows = db.query(
        DevolucionProveedor.id,
        DevolucionProveedor.numero_devolucion,
        DevolucionProveedor.fecha,
        DevolucionProveedor.cantidad,
        DevolucionProveedor.motivo,
        DevolucionProveedor.estado,
        DevolucionProveedor.monto_usd,
        Proveedor.nombre.label("proveedor_nombre")
    ).join(
        Proveedor, DevolucionProveedor.proveedor_id == Proveedor.id
    ).filter(
        DevolucionProveedor.producto_id == id,
        DevolucionProveedor.tenant_id == current_user.tenant_id
    ).order_by(DevolucionProveedor.fecha.desc()).all()

    devoluciones_proveedor = [
        {
            "id": dp.id,
            "numero": dp.numero_devolucion,
            "fecha": dp.fecha.isoformat() if dp.fecha else "",
            "proveedor": dp.proveedor_nombre,
            "cantidad": float(dp.cantidad) if dp.cantidad is not None else 0.0,
            "monto_usd": float(dp.monto_usd),
            "motivo": dp.motivo,
            "estado": dp.estado
        }
        for dp in dev_prov_rows
    ]

    # Fuente #13: DevolucionCliente
    dev_cli_rows = db.query(
        DevolucionCliente.id,
        DevolucionCliente.numero_devolucion,
        DevolucionCliente.fecha,
        DevolucionCliente.cantidad,
        DevolucionCliente.motivo,
        DevolucionCliente.condicion,
        DevolucionCliente.venta_id,
        Venta.numero_factura.label("factura_numero")
    ).join(
        Venta, DevolucionCliente.venta_id == Venta.id
    ).filter(
        DevolucionCliente.producto_id == id,
        DevolucionCliente.tenant_id == current_user.tenant_id
    ).order_by(DevolucionCliente.fecha.desc()).all()

    devoluciones_cliente = [
        {
            "id": dc.id,
            "numero": dc.numero_devolucion,
            "fecha": dc.fecha.isoformat() if dc.fecha else "",
            "venta_id": dc.venta_id,
            "factura": dc.factura_numero,
            "cantidad": float(dc.cantidad),
            "motivo": dc.motivo,
            "condicion": dc.condicion,
            "reingreso_stock": (dc.condicion == "BUENO")
        }
        for dc in dev_cli_rows
    ]

    # Fuente #12: CuarentenaLogistica (filtrando por producto_id cruzando TurnoDespacho)
    cuarentena_rows = db.query(
        CuarentenaLogistica.id,
        CuarentenaLogistica.cantidad,
        CuarentenaLogistica.motivo,
        CuarentenaLogistica.estado,
        CuarentenaLogistica.created_at,
        TurnoDespacho.numero_turno.label("turno_numero"),
        TurnoDespacho.destino.label("turno_destino")
    ).join(
        TurnoDespacho, CuarentenaLogistica.turno_id == TurnoDespacho.id
    ).filter(
        CuarentenaLogistica.producto_id == id,
        TurnoDespacho.tenant_id == current_user.tenant_id
    ).order_by(CuarentenaLogistica.created_at.desc()).all()

    cuarentena_logistica = [
        {
            "id": q.id,
            "turno": q.turno_numero,
            "destino": q.turno_destino,
            "cantidad": float(q.cantidad),
            "motivo": q.motivo,
            "estado": q.estado,
            "fecha": q.created_at.isoformat() if q.created_at else ""
        }
        for q in cuarentena_rows
    ]

    # Fuente #8: Garantia
    garantias_rows = db.query(
        Garantia.id,
        Garantia.fecha_inicio,
        Garantia.fecha_vencimiento,
        Garantia.duracion_meses,
        Garantia.estado,
        Garantia.notas,
        Cliente.nombre.label("cliente_nombre"),
        Cliente.rif.label("cliente_rif"),
        Venta.numero_factura.label("factura_numero")
    ).join(
        Cliente, Garantia.cliente_id == Cliente.id
    ).outerjoin(
        Venta, Garantia.venta_id == Venta.id
    ).filter(
        Garantia.producto_id == id,
        Garantia.tenant_id == current_user.tenant_id
    ).order_by(Garantia.fecha_inicio.desc()).all()

    now_utc = datetime.now(timezone.utc)
    garantias = []
    for g in garantias_rows:
        # Comparación timezone-aware
        fv_aware = g.fecha_vencimiento
        if fv_aware and fv_aware.tzinfo is None:
            fv_aware = fv_aware.replace(tzinfo=timezone.utc)
        vigente = (g.estado == "VIGENTE") and (fv_aware >= now_utc if fv_aware else True)
        garantias.append({
            "id": g.id,
            "cliente": g.cliente_nombre,
            "rif": g.cliente_rif,
            "factura": g.factura_numero or "Garantía de Fábrica / Directa",
            "fecha_inicio": g.fecha_inicio.strftime("%Y-%m-%d") if g.fecha_inicio else "",
            "fecha_vencimiento": g.fecha_vencimiento.strftime("%Y-%m-%d") if g.fecha_vencimiento else "",
            "duracion_meses": g.duracion_meses,
            "estado": g.estado,
            "esta_vigente": vigente,
            "notas": g.notas
        })

    # Fuente #4: CotizacionItem (en qué cotizaciones ha aparecido)
    cotizaciones_rows = db.query(
        CotizacionItem.id,
        CotizacionItem.cantidad,
        CotizacionItem.precio_unitario,
        CotizacionItem.total_fila,
        Cotizacion.numero_cotizacion,
        Cotizacion.fecha_emision,
        Cotizacion.estado.label("cotizacion_estado"),
        Cliente.nombre.label("cliente_nombre")
    ).join(
        Cotizacion, CotizacionItem.cotizacion_id == Cotizacion.id
    ).outerjoin(
        Cliente, Cotizacion.cliente_id == Cliente.id
    ).filter(
        CotizacionItem.producto_id == id,
        Cotizacion.tenant_id == current_user.tenant_id
    ).order_by(Cotizacion.fecha_emision.desc()).all()

    cotizaciones = [
        {
            "id": c.id,
            "numero_cotizacion": c.numero_cotizacion,
            "fecha": c.fecha_emision.strftime("%Y-%m-%d") if c.fecha_emision else "",
            "cliente": c.cliente_nombre or "Cliente General",
            "cantidad": float(c.cantidad),
            "precio_unitario": float(c.precio_unitario),
            "total": float(c.total_fila),
            "estado": c.cotizacion_estado
        }
        for c in cotizaciones_rows
    ]

    # Fuente #10: ConteoFisico (Auditoría de conteo)
    conteos_rows = db.query(
        ConteoFisico.id,
        ConteoFisico.fecha,
        ConteoFisico.cantidad_sistema,
        ConteoFisico.cantidad_fisica,
        ConteoFisico.diferencia,
        ConteoFisico.estado,
        Almacen.nombre.label("almacen_nombre")
    ).join(
        Almacen, ConteoFisico.almacen_id == Almacen.id
    ).filter(
        ConteoFisico.producto_id == id,
        ConteoFisico.tenant_id == current_user.tenant_id
    ).order_by(ConteoFisico.fecha.desc()).all()

    auditorias_conteo = [
        {
            "id": cf.id,
            "fecha": cf.fecha.strftime("%Y-%m-%d %H:%M") if cf.fecha else "",
            "almacen": cf.almacen_nombre,
            "cantidad_sistema": float(cf.cantidad_sistema),
            "cantidad_fisica": float(cf.cantidad_fisica),
            "diferencia": float(cf.diferencia),
            "estado": cf.estado
        }
        for cf in conteos_rows
    ]

    return {
        "producto": {
            "id": producto.id,
            "sku": producto.sku,
            "nombre": producto.nombre,
            "precio_usd": precio_usd,
            "precio_detal": float(producto.precio_detal or producto.precio_usd or 0.0),
            "precio_mayor": float(producto.precio_mayor or 0.0),
            "costo_usd": costo_usd,
            "stock_total": float(producto.stock or 0.0),
            "stock_minimo": float(producto.stock_minimo or 0.0),
            "es_exento": bool(producto.es_exento),
            "imagen_url": producto.imagen_url,
            "rentabilidad_pct": round(rentabilidad_bruta, 2),
            "rotacion_30d": rotacion_unidades,
            "cuadrante": cuadrante,
            "cuadrante_badge": cuadrante_badge
        },
        "stock_almacenes": stock_almacenes,
        "lotes": lotes,
        "movimientos": movimientos,
        "devoluciones": {
            "proveedor": devoluciones_proveedor,
            "cliente": devoluciones_cliente,
            "cuarentena": cuarentena_logistica
        },
        "garantias": garantias,
        "cotizaciones": cotizaciones,
        "auditorias_conteo": auditorias_conteo
    }
