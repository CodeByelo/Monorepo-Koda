from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
import uuid

from backend.core.database import get_db
from backend.models.operations import Producto, Venta, VentaDetalle, KardexMovimiento, Cliente
from backend.models.erp_extended import CuentaPorCobrar
from backend.models.fiscal import ReglaFiscal, CorrelativoFiscal
from backend.models.core import TasaCambio
from backend.schemas.operations import VentaCreate, VentaResponse, VentaReporteResponse
from backend.core.security import get_current_user, require_role
from backend.utils.idempotency import require_idempotency
from backend.services.contabilidad import ContabilidadService

router = APIRouter(prefix="/ventas", tags=["Ventas e Inventario"])

# Constante para forzar redondeo contable a 2 decimales exactos en cada operación
TWO_PLACES = Decimal("0.01")

@router.post("/facturar", response_model=VentaResponse, status_code=status.HTTP_201_CREATED)
@require_idempotency
def registrar_venta_y_cxc(
    request: Request,
    venta_in: VentaCreate, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra una nueva Venta (Factura), sus detalles y genera 
    automáticamente la Cuenta por Cobrar asociada (Transacción Atómica y Segura).
    Calcula todos los subtotales, IVA (16%), IGTF (3%) y tasas BCV internamente en el backend.
    """
    try:
        # 1. Obtener tasa BCV activa desde la DB
        tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
        if not tasa_activa:
            raise HTTPException(
                status_code=400, 
                detail="No hay tasa de cambio registrada en la base de datos para valorar la factura."
            )
        tasa_bs = Decimal(str(tasa_activa.valor_ves))

        # 1.5 Validar Cliente
        cliente = db.query(Cliente).filter(Cliente.id == venta_in.cliente_id, Cliente.tenant_id == current_user.tenant_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        # 2. Inicializar acumuladores de cálculo (Decimal)
        subtotal_gravado = Decimal("0.00")
        subtotal_exento = Decimal("0.00")
        
        # Guardaremos detalles y movimientos para guardarlos después
        detalles_para_guardar = []
        movimientos_kardex = []
        
        # Generar número de factura temporal y fecha de la venta
        temp_factura = f"TEMP-{uuid.uuid4().hex[:8]}"
        fecha_venta = datetime.now()

        # 3. Procesar y calcular cada ítem de venta, consultando el precio oficial en la BD
        producto_ids = [detalle_in.producto_id for detalle_in in venta_in.detalles]
        unique_producto_ids = list(set(producto_ids))
        
        # Bloquear todos los productos requeridos en una sola consulta
        productos = db.query(Producto).filter(
            Producto.id.in_(unique_producto_ids),
            Producto.tenant_id == current_user.tenant_id
        ).with_for_update().all()
        productos_dict = {p.id: p for p in productos}
        
        for detalle_in in venta_in.detalles:
            producto = productos_dict.get(detalle_in.producto_id)
            if not producto:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Producto con ID {detalle_in.producto_id} no encontrado en inventario de su empresa."
                )
            
            # Validar stock disponible
            if producto.stock < detalle_in.cantidad:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Stock insuficiente para el producto '{producto.nombre}'. Disponible: {producto.stock}, Solicitado: {detalle_in.cantidad}"
                )
            
            # Descontar stock del producto
            producto.stock -= detalle_in.cantidad
            
            # Obtener precio oficial
            precio_oficial = Decimal(str(producto.precio_usd))
            
            # Clasificar y acumular el subtotal según corresponda
            if producto.es_exento:
                subtotal_exento += precio_oficial * detalle_in.cantidad
            else:
                subtotal_gravado += precio_oficial * detalle_in.cantidad
            
            # Instanciar detalle de venta capturando el precio oficial
            nuevo_detalle = VentaDetalle(
                producto_id=detalle_in.producto_id,
                cantidad=detalle_in.cantidad,
                precio_usd_capturado=precio_oficial,
                tenant_id=current_user.tenant_id
            )
            detalles_para_guardar.append(nuevo_detalle)

            # Instanciar movimiento en Kardex
            nuevo_movimiento = KardexMovimiento(
                producto_id=producto.id,
                tipo_movimiento="Venta",
                cantidad=-detalle_in.cantidad,
                documento_referencia=temp_factura,  # Temporalmente, se actualizará tras obtener el FAC_ID definitivo
                tenant_id=current_user.tenant_id
            )
            movimientos_kardex.append(nuevo_movimiento)

        # 4. Calcular impuestos y total neto
        subtotal_total = subtotal_gravado + subtotal_exento
        iva_usd = subtotal_gravado * Decimal("0.16")
        
        # IGTF (3%) aplica si el método es Divisa o moneda es USD
        igtf_usd = Decimal("0.00")
        if venta_in.metodo_pago == "Divisa" or venta_in.moneda_pago == "USD":
            igtf_usd = (subtotal_total + iva_usd) * Decimal("0.03")
            
        retencion_iva_usd = iva_usd * Decimal("0.75") if getattr(cliente, 'es_contribuyente_especial', False) else Decimal("0.00")
        total_usd = subtotal_total + iva_usd + igtf_usd

        # Redondear con precisión contable de dos decimales
        subtotal_usd_rounded = subtotal_total.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        iva_usd_rounded = iva_usd.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        igtf_usd_rounded = igtf_usd.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        retencion_iva_usd_rounded = retencion_iva_usd.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        total_usd_rounded = total_usd.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        # 5. Crear e insertar la cabecera de la Venta
        nueva_venta = Venta(
            cliente_id=venta_in.cliente_id,
            numero_factura=temp_factura,
            fecha=fecha_venta,
            subtotal_usd=subtotal_usd_rounded,
            iva_usd=iva_usd_rounded,
            igtf_usd=igtf_usd_rounded,
            retencion_iva_usd=retencion_iva_usd_rounded,
            total_usd=total_usd_rounded,
            metodo_pago=venta_in.metodo_pago,
            tasa_cambio_bs=tasa_bs,
            estado="ACTIVA",
            creado_por=current_user.id,
            tenant_id=current_user.tenant_id
        )
        db.add(nueva_venta)
        db.flush()

        # ---------------------------------------------------------
        # BLOQUEO SECUENCIAL Y ASIGNACIÓN DE CORRELATIVO FISCAL
        # ---------------------------------------------------------
        correlativo = db.query(CorrelativoFiscal).filter(CorrelativoFiscal.tipo_documento == 'FACTURA').with_for_update().first()
        if not correlativo:
            # Auto-inicializar si no existe
            correlativo = CorrelativoFiscal(tipo_documento='FACTURA', prefijo='FAC-', siguiente_numero=1)
            db.add(correlativo)
            db.flush()
            
        numero_factura_final = f"{correlativo.prefijo}{str(correlativo.siguiente_numero).zfill(8)}"
        correlativo.siguiente_numero += 1
        
        nueva_venta.numero_factura = numero_factura_final

        # 6. Guardar los detalles y asociar la venta
        for detalle in detalles_para_guardar:
            detalle.venta_id = nueva_venta.id
        db.add_all(detalles_para_guardar)

        # 7. Guardar movimientos del Kardex actualizando referencia fiscal final
        for mov in movimientos_kardex:
            mov.documento_referencia = numero_factura_final
        db.add_all(movimientos_kardex)

        # 8. Crear y guardar Cuenta por Cobrar (CxC)
        from datetime import timedelta
        fecha_venc = fecha_venta + timedelta(days=venta_in.dias_credito)
        
        # El monto de la cuenta por cobrar NO incluye la retención, ya que el cliente
        # entrega un comprobante físico o digital como pago de esa porción.
        monto_neto_cxc = total_usd_rounded - retencion_iva_usd_rounded
        nueva_cxc = CuentaPorCobrar(
            venta_id=nueva_venta.id,
            cliente_id=venta_in.cliente_id,
            numero_documento=numero_factura_final,
            monto_total_usd=monto_neto_cxc,
            monto_pagado_usd=Decimal('0.00'),
            monto_restante_usd=monto_neto_cxc,
            tasa_cambio_bs=tasa_bs,
            fecha_emision=fecha_venta,
            fecha_vencimiento=fecha_venc,
            estado="PENDIENTE",
            tenant_id=current_user.tenant_id
        )
        db.add(nueva_cxc)

        # Generar Asiento Contable Automático de Ventas y de Costo de Ventas (COGS)
        ContabilidadService.generar_asiento_venta(nueva_venta, db, tenant_id=current_user.tenant_id)
        ContabilidadService.generar_asiento_costo_ventas(nueva_venta, detalles_para_guardar, db, tenant_id=current_user.tenant_id)

        # Confirmación de la transacción atómica
        db.commit()
        db.refresh(nueva_venta)
        return nueva_venta

    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error al procesar la factura. Transacción revertida. Detalle: {str(e)}"
        )

@router.get("/reporte", response_model=VentaReporteResponse)
def obtener_reporte_ventas(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Endpoint para obtener agregaciones del total de ventas registradas.
    Alimenta los gráficos e indicadores de Business Intelligence (BI).
    """
    resultado = db.query(
        func.count(Venta.id).label("cantidad"),
        func.sum(Venta.subtotal_usd).label("subtotal"),
        func.sum(Venta.iva_usd).label("iva"),
        func.sum(Venta.igtf_usd).label("igtf"),
        func.sum(Venta.total_usd).label("total")
    ).filter(Venta.estado == "ACTIVA").first()
    
    # Manejar caso cuando no hay registros aún
    cantidad = resultado.cantidad or 0
    subtotal = Decimal(str(resultado.subtotal or "0.00"))
    iva = Decimal(str(resultado.iva or "0.00"))
    igtf = Decimal(str(resultado.igtf or "0.00"))
    total = Decimal(str(resultado.total or "0.00"))
    
    return {
        "ventas_totales_cantidad": cantidad,
        "subtotal_acumulado_usd": subtotal,
        "iva_acumulado_usd": iva,
        "igtf_acumulado_usd": igtf,
        "total_acumulado_usd": total
    }

@router.get("", response_model=List[VentaResponse])
def listar_ventas(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Lista todas las facturas registradas.
    """
    return db.query(Venta).options(joinedload(Venta.cliente)).order_by(Venta.fecha.desc()).all()


@router.get("/{numero_factura}", response_model=VentaResponse)
def obtener_venta_por_numero(
    numero_factura: str,
    db: Session = Depends(get_db)
):
    """
    Busca una factura por su correlativo fiscal (ej: FAC-00000001).
    """
    venta = db.query(Venta).filter(Venta.numero_factura == numero_factura).first()
    if not venta:
        raise HTTPException(
            status_code=404,
            detail=f"Factura {numero_factura} no encontrada"
        )
    return venta

@router.post("/{venta_id}/anular", response_model=VentaResponse)
def anular_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"]))
):
    """
    Anula una factura existente de forma atómica.
    Devuelve el stock al almacén y deja un registro inmutable (positivo) en el Kardex.
    """
    # Bloqueamos la factura para evitar que dos gerentes la anulen al mismo tiempo
    venta = db.query(Venta).filter(Venta.id == venta_id).with_for_update().first()
    
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")
        
    if venta.estado == "ANULADA":
        raise HTTPException(status_code=400, detail="Esta factura ya se encuentra anulada.")
        
    try:
        # 1. Revertir el estado de la factura
        venta.estado = "ANULADA"
        
        # 2. Devolver el stock a cada producto y registrar en Kardex Inmutable
        producto_ids = [detalle.producto_id for detalle in venta.detalles]
        unique_producto_ids = list(set(producto_ids))
        productos = db.query(Producto).filter(Producto.id.in_(unique_producto_ids)).with_for_update().all()
        productos_dict = {p.id: p for p in productos}
        
        movimientos_reversos = []
        for detalle in venta.detalles:
            producto = productos_dict.get(detalle.producto_id)
            if producto:
                producto.stock += detalle.cantidad
            
            movimiento_reverso = KardexMovimiento(
                producto_id=detalle.producto_id,
                tipo_movimiento="Anulacion_Venta",
                cantidad=detalle.cantidad, # Es positivo porque la mercancía vuelve a entrar
                documento_referencia=f"REV-{venta.numero_factura}"
            )
            movimientos_reversos.append(movimiento_reverso)
            
        db.add_all(movimientos_reversos)
            
        db.commit()
        db.refresh(venta)
        return venta
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error interno al anular la factura. Operación revertida.")
