from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from decimal import Decimal

from backend.core.database import get_db
from backend.models.operations import Producto, Venta, KardexMovimiento, Cliente
from backend.schemas.operations import VentaCreate, VentaResponse, VentaReporteResponse
from backend.core.security import get_current_user, require_role
from backend.utils.idempotency import require_idempotency
from backend.services.facturacion_service import LineaFactura, procesar_emision_factura

router = APIRouter(prefix="/ventas", tags=["Ventas e Inventario"])

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

    Este endpoint no es utilizado actualmente por ningún frontend (confirmado
    por búsqueda en el repositorio); se mantiene como wrapper delgado sobre
    `backend.services.facturacion_service.procesar_emision_factura`, la misma
    lógica de negocio que usa `/v1/facturacion/emitir`, para que ambos puntos
    de entrada nunca diverjan en el cálculo de impuestos, correlativos o
    asientos contables.
    """
    tenant_id = current_user.tenant_id

    try:
        # 1. Validar Cliente (aislado por tenant)
        cliente = db.query(Cliente).filter(
            Cliente.id == venta_in.cliente_id,
            Cliente.tenant_id == tenant_id,
        ).first()
        if not cliente:
            cliente = db.query(Cliente).filter(Cliente.tenant_id == tenant_id).first()
        if not cliente:
            cliente = Cliente(
                rif="J-00000000-0",
                nombre="Consumidor Final",
                telefono="+58 212 000-0000",
                email="consumidor@koda.com",
                direccion="Caracas, Venezuela",
                es_contribuyente_especial=False,
                tenant_id=tenant_id,
            )
            db.add(cliente)
            db.flush()

        # 2. Resolver productos, validar/descontar stock, consultando el precio oficial
        producto_ids = [detalle_in.producto_id for detalle_in in venta_in.detalles]
        unique_producto_ids = list(set(producto_ids))

        # Bloquear todos los productos requeridos en una sola consulta
        productos = db.query(Producto).filter(
            Producto.id.in_(unique_producto_ids),
            Producto.tenant_id == tenant_id
        ).with_for_update().all()
        productos_dict = {p.id: p for p in productos}

        lineas = []
        for detalle_in in venta_in.detalles:
            producto = productos_dict.get(detalle_in.producto_id)
            if not producto:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto con ID {detalle_in.producto_id} no encontrado en inventario de su empresa."
                )

            if producto.stock < detalle_in.cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente para el producto '{producto.nombre}'. Disponible: {producto.stock}, Solicitado: {detalle_in.cantidad}"
                )

            producto.stock -= detalle_in.cantidad

            lineas.append(LineaFactura(
                producto_id=producto.id,
                cantidad=Decimal(str(detalle_in.cantidad)),
                precio_unitario=Decimal(str(producto.precio_usd)),
                es_exento=bool(producto.es_exento),
            ))

        # 3. Calcular impuestos, correlativo, persistencia y asientos contables
        resultado = procesar_emision_factura(
            db=db,
            current_user=current_user,
            cliente=cliente,
            lineas=lineas,
            metodo_pago=venta_in.metodo_pago,
            moneda_documento=venta_in.moneda_pago,
            dias_credito=venta_in.dias_credito,
            vendedor_id=venta_in.vendedor_id,
        )

        # Confirmación de la transacción atómica
        db.commit()
        db.refresh(resultado.venta)
        return resultado.venta

    except HTTPException as he:
        db.rollback()
        raise he
    except ValueError as e:
        # Errores de validación de negocio (p.ej. vendedor_id inválido/ajeno
        # al tenant): son un error del cliente, no una falla del servidor.
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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
    Lista todas las facturas registradas del tenant actual.
    """
    return db.query(Venta).options(joinedload(Venta.cliente)).filter(
        Venta.tenant_id == current_user.tenant_id
    ).order_by(Venta.fecha.desc()).all()


RESERVED_VENTAS_SUBPATHS = {
    "cotizaciones", "ordenes", "notas-entrega", "notas-credito",
    "facturar", "clientes", "reporte", "pos", "documentos", "precios",
    "entregas", "cuentas", "historial", "dashboard", "analisis-costos",
    "requisiciones", "aprobaciones", "recepciones", "facturas"
}

@router.get("/{numero_factura}", response_model=VentaResponse)
def obtener_venta_por_numero(
    numero_factura: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Busca una factura por su correlativo fiscal (ej: FAC-00000001).
    """
    if numero_factura.lower() in RESERVED_VENTAS_SUBPATHS:
        raise HTTPException(
            status_code=404,
            detail=f"La sub-ruta '{numero_factura}' no es un número de factura"
        )
    venta = db.query(Venta).filter(
        Venta.numero_factura == numero_factura,
        Venta.tenant_id == current_user.tenant_id,
    ).first()
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
    venta = db.query(Venta).filter(
        Venta.id == venta_id,
        Venta.tenant_id == current_user.tenant_id,
    ).with_for_update().first()

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
        productos = db.query(Producto).filter(
            Producto.id.in_(unique_producto_ids),
            Producto.tenant_id == current_user.tenant_id,
        ).with_for_update().all()
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
