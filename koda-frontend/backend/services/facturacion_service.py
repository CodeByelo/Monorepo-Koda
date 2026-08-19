"""
Servicio compartido de emisión de facturas.

Contiene la lógica de negocio común a los dos puntos de entrada de
facturación existentes (`routers/facturacion.py` y `routers/sales.py`)
para que ambos calculen impuestos, correlativos fiscales y asientos
contables de la misma forma, en vez de mantener dos implementaciones
que puedan divergir.

Responsabilidades de este módulo:
  1. Clasificar cada línea en gravada/exenta (según `Producto.es_exento`)
     y calcular el IVA únicamente sobre la porción gravada.
  2. Derivar server-side si aplica IGTF (nunca confiar en un flag del cliente).
  3. Asignar el correlativo fiscal (`CorrelativoFiscal`) de forma atómica
     y estrictamente aislada por `tenant_id`.
  4. Persistir Venta, VentaDetalle, KardexMovimiento y CuentaPorCobrar.
  5. Generar los asientos contables (venta + costo de ventas) en la
     MISMA transacción, para que una factura nunca quede sin su asiento.

Este módulo NO hace commit: el router que lo invoca controla el límite
transaccional (así puede añadir su propio log de auditoría u otros
efectos y confirmar todo o nada de forma atómica).
"""

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from sqlalchemy.orm import Session

from backend.models.core import TasaCambio
from backend.models.fiscal import ReglaFiscal, CorrelativoFiscal
from backend.models.operations import Venta, VentaDetalle, KardexMovimiento
from backend.models.erp_extended import CuentaPorCobrar, Vendedor
from backend.services.contabilidad import ContabilidadService

TWO_PLACES = Decimal("0.01")


@dataclass
class LineaFactura:
    """Línea de factura ya resuelta contra el catálogo (producto real, con
    su tenant y stock ya validados/descontados por el router llamante)."""
    producto_id: int
    cantidad: Decimal
    precio_unitario: Decimal
    es_exento: bool


@dataclass
class ResultadoFactura:
    venta: Venta
    cuenta_por_cobrar: CuentaPorCobrar
    numero_factura: str
    numero_control: str
    subtotal_gravado: Decimal
    subtotal_exento: Decimal
    base_imponible: Decimal
    monto_iva: Decimal
    monto_igtf: Decimal
    monto_total: Decimal
    retencion_iva: Decimal
    aplica_igtf: bool
    tasa_bs: Decimal
    comision_usd: Decimal


def resolver_precio_unitario(producto) -> Decimal:
    """
    Deriva el precio unitario de una línea de factura EXCLUSIVAMENTE desde el
    catálogo del servidor (`Producto.precio_usd`), nunca desde el precio que
    el cliente envía en el request. Aplica el mismo principio que
    `derivar_aplica_igtf`: nunca confiar en un valor del cliente para un dato
    que determina impuestos y montos legales de la factura.

    Punto único usado por todos los routers que arman `LineaFactura`
    (`sales.py`, `facturacion.py`) para que ninguno pueda divergir y volver a
    confiar en un precio enviado por el cliente.
    """
    return Decimal(str(producto.precio_usd))


def derivar_aplica_igtf(metodo_pago: str, moneda: Optional[str]) -> bool:
    """
    Deriva si aplica IGTF (3%) EXCLUSIVAMENTE a partir de datos del servidor
    (método de pago y moneda del documento). Nunca se debe confiar en un
    flag booleano enviado por el cliente para esta decisión fiscal.

    Regla: aplica si el pago es en divisas (metodo_pago == "Divisa") o si la
    moneda es USD, salvo que el documento esté denominado en VED (Bolívares),
    caso en el cual el IGTF nunca aplica.
    """
    moneda_norm = (moneda or "").upper()
    if moneda_norm == "VED":
        return False
    return metodo_pago == "Divisa" or moneda_norm == "USD"


def _obtener_tasa_bs(db: Session, current_user) -> Decimal:
    tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    if not tasa_activa:
        tasa_activa = TasaCambio(
            valor_ves=Decimal("36.52"),
            fuente="BCV (Por defecto)",
            tenant_id=getattr(current_user, "tenant_id", None),
        )
        db.add(tasa_activa)
        db.flush()
    return Decimal(str(tasa_activa.valor_ves))


def _obtener_tasas_fiscales(db: Session) -> tuple[Decimal, Decimal]:
    regla_iva = db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IVA", ReglaFiscal.activa == True).first()
    tasa_iva = Decimal(str(regla_iva.tasa)) if regla_iva else Decimal("0.16")

    regla_igtf = db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IGTF", ReglaFiscal.activa == True).first()
    tasa_igtf = Decimal(str(regla_igtf.tasa)) if regla_igtf else Decimal("0.03")
    return tasa_iva, tasa_igtf


def procesar_emision_factura(
    db: Session,
    current_user,
    cliente,
    lineas: List[LineaFactura],
    metodo_pago: str,
    moneda_documento: Optional[str],
    dias_credito: int = 0,
    vendedor_id: Optional[int] = None,
) -> ResultadoFactura:
    if not lineas:
        raise ValueError("La factura debe tener al menos un detalle.")

    tenant_id = current_user.tenant_id

    tasa_bs = _obtener_tasa_bs(db, current_user)
    tasa_iva, tasa_igtf = _obtener_tasas_fiscales(db)

    # --- Clasificación gravado/exento (sin redondear por línea, para no
    # arrastrar error de redondeo acumulado; se redondea solo al final) ---
    subtotal_gravado = Decimal("0.00")
    subtotal_exento = Decimal("0.00")
    for linea in lineas:
        importe = linea.precio_unitario * linea.cantidad
        if linea.es_exento:
            subtotal_exento += importe
        else:
            subtotal_gravado += importe

    subtotal_total = subtotal_gravado + subtotal_exento
    monto_iva = subtotal_gravado * tasa_iva

    # --- IGTF: derivado en el servidor, nunca confiado del cliente ---
    aplica_igtf = derivar_aplica_igtf(metodo_pago, moneda_documento)
    monto_igtf = (subtotal_total + monto_iva) * tasa_igtf if aplica_igtf else Decimal("0.00")

    retencion_iva = (
        monto_iva * Decimal("0.75") if getattr(cliente, "es_contribuyente_especial", False) else Decimal("0.00")
    )
    monto_total = subtotal_total + monto_iva + monto_igtf

    # --- Redondeo contable final a 2 decimales ---
    subtotal_total_r = subtotal_total.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    monto_iva_r = monto_iva.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    monto_igtf_r = monto_igtf.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    retencion_iva_r = retencion_iva.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    monto_total_r = monto_total.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    # Monto neto de la CxC (lo que efectivamente se espera cobrar de esta
    # factura). Se calcula aquí, antes de crear la Venta, porque es también
    # la base de la comisión del vendedor (ver más abajo): es la cifra que,
    # una vez cobrada en su totalidad, coincidirá con el "monto cobrado" que
    # usa `reporte_vendedores` para su cálculo de comisión — así el valor
    # congelado en `Venta.comision_usd` queda alineado con esa misma
    # convención (comisión sobre el monto que el vendedor efectivamente
    # generará a cobrar), en vez de usar el total bruto o la base imponible.
    monto_neto_cxc = (monto_total_r - retencion_iva_r).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    # --- Vendedor y comisión (congelada a la tasa vigente del vendedor en
    # el momento de la emisión) ---
    vendedor = None
    if vendedor_id is not None:
        vendedor = (
            db.query(Vendedor)
            .filter(Vendedor.id == vendedor_id, Vendedor.tenant_id == tenant_id)
            .first()
        )
        if not vendedor:
            # Nunca ignorar en silencio un vendedor_id inválido/ajeno al tenant:
            # mejor rechazar la operación que asociar la venta a un vendedor
            # equivocado o dejarla "huérfana" sin que nadie se entere.
            raise ValueError(
                f"El vendedor {vendedor_id} no existe o no pertenece a esta empresa."
            )

    if vendedor is not None:
        tasa_comision = Decimal(str(vendedor.porcentaje_comision)) / Decimal("100")
        comision_usd = (monto_neto_cxc * tasa_comision).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    else:
        # Venta deliberadamente sin vendedor asignado: 0.00, NO NULL.
        # NULL en `Venta.comision_usd` está reservado exclusivamente para
        # ventas anteriores a la migración de esta columna, cuyo valor real
        # se desconoce (ver comentario en el modelo `Venta`). Una venta nueva
        # sin vendedor es un hecho conocido: su comisión es cero.
        comision_usd = Decimal("0.00")

    fecha_venta = datetime.now(timezone.utc)

    # --- Correlativo fiscal: SIEMPRE aislado por tenant (SENIAT exige
    # numeración consecutiva por empresa/RIF, nunca compartida entre tenants) ---
    correlativo = (
        db.query(CorrelativoFiscal)
        .filter(
            CorrelativoFiscal.tipo_documento == "FACTURA",
            CorrelativoFiscal.tenant_id == tenant_id,
        )
        .with_for_update()
        .first()
    )
    if not correlativo:
        correlativo = CorrelativoFiscal(
            tipo_documento="FACTURA",
            prefijo="FAC-",
            siguiente_numero=1,
            tenant_id=tenant_id,
        )
        db.add(correlativo)
        db.flush()

    numero_seq = correlativo.siguiente_numero
    correlativo.siguiente_numero += 1
    numero_factura = f"{correlativo.prefijo}{str(numero_seq).zfill(8)}"
    numero_control = f"00-{str(numero_seq).zfill(8)}"

    # --- Cabecera de la Venta ---
    nueva_venta = Venta(
        cliente_id=cliente.id,
        numero_factura=numero_factura,
        fecha=fecha_venta,
        subtotal_usd=subtotal_total_r,
        iva_usd=monto_iva_r,
        igtf_usd=monto_igtf_r,
        retencion_iva_usd=retencion_iva_r,
        total_usd=monto_total_r,
        metodo_pago=metodo_pago,
        tasa_cambio_bs=tasa_bs,
        estado="ACTIVA",
        creado_por=current_user.id,
        vendedor_id=vendedor.id if vendedor is not None else None,
        comision_usd=comision_usd,
        tenant_id=tenant_id,
    )
    db.add(nueva_venta)
    db.flush()

    detalles_orm = []
    for linea in lineas:
        detalle = VentaDetalle(
            venta_id=nueva_venta.id,
            producto_id=linea.producto_id,
            cantidad=linea.cantidad,
            precio_usd_capturado=linea.precio_unitario,
            tenant_id=tenant_id,
        )
        db.add(detalle)
        detalles_orm.append(detalle)

        db.add(KardexMovimiento(
            producto_id=linea.producto_id,
            tipo_movimiento="Venta",
            cantidad=-linea.cantidad,
            documento_referencia=numero_factura,
            tenant_id=tenant_id,
        ))

    # --- Cuenta por Cobrar ---
    fecha_venc = fecha_venta + timedelta(days=dias_credito)
    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        venta_id=nueva_venta.id,
        numero_documento=numero_factura,
        monto_total_usd=monto_neto_cxc,
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=tasa_bs,
        estado="PENDIENTE",
        fecha_emision=fecha_venta,
        fecha_vencimiento=fecha_venc,
        tenant_id=tenant_id,
    )
    db.add(cxc)
    db.flush()

    # --- Asientos contables (venta + costo de ventas), misma transacción ---
    ContabilidadService.generar_asiento_venta(nueva_venta, db, tenant_id=tenant_id)
    ContabilidadService.generar_asiento_costo_ventas(nueva_venta, detalles_orm, db, tenant_id=tenant_id)

    return ResultadoFactura(
        venta=nueva_venta,
        cuenta_por_cobrar=cxc,
        numero_factura=numero_factura,
        numero_control=numero_control,
        subtotal_gravado=subtotal_gravado.quantize(TWO_PLACES, rounding=ROUND_HALF_UP),
        subtotal_exento=subtotal_exento.quantize(TWO_PLACES, rounding=ROUND_HALF_UP),
        base_imponible=subtotal_total_r,
        monto_iva=monto_iva_r,
        monto_igtf=monto_igtf_r,
        monto_total=monto_total_r,
        retencion_iva=retencion_iva_r,
        aplica_igtf=aplica_igtf,
        tasa_bs=tasa_bs,
        comision_usd=comision_usd,
    )
