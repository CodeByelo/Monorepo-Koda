from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
"""Modelos extendidos para módulos ERP (cobranzas, compras, tesorería, empresa)."""
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.core.database import Base
from backend.models.operations import Cliente, Proveedor
from backend.models.accounting import AsientoContable, AsientoDetalle

# Alias de compatibilidad solicitado
DetalleAsiento = AsientoDetalle


class Empresa(Base):
    __tablename__ = "empresa"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    rif = Column(String(50), unique=True, nullable=False)
    razon_social = Column(String(200), nullable=False)
    nombre_comercial = Column(String(200), nullable=True)
    email = Column(String(150), nullable=True)
    telefono = Column(String(50), nullable=True)
    direccion = Column(String(255), nullable=True)
    tipo_contribuyente = Column(String(20), default="ORDINARIO", nullable=False)
    estado_suscripcion = Column(String(20), default="Activo", nullable=False)
    limite_usuarios = Column(Integer, default=5, nullable=False)
    modulos_activos = Column(String(255), default='["admin","facturacion"]', nullable=True)


class Sucursal(Base):
    __tablename__ = "sucursales"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    ciudad = Column(String(100), nullable=True)
    estado = Column(String(20), default="Activo", nullable=False)


class CuentaContable(Base):
    __tablename__ = "cuentas_contables"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(200), nullable=False)
    tipo = Column(String(30), nullable=False)  # ACTIVO, PASIVO, PATRIMONIO, INGRESO, EGRESO
    naturaleza = Column(String(20), nullable=False, default="DEUDORA")
    nivel = Column(Integer, default=1, nullable=False)
    activa = Column(Boolean, default=True, nullable=False)
    padre_codigo = Column(String(50), nullable=True)


class CuentaPorCobrar(Base):
    __tablename__ = "cuentas_por_cobrar"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), index=True, nullable=False)
    venta_id = Column(Integer, ForeignKey("public.ventas.id"), index=True, nullable=True)
    numero_documento = Column(String(50), nullable=False)
    monto_total_usd = Column(Numeric(15, 2), nullable=False)
    monto_pagado_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    fecha_emision = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    fecha_vencimiento = Column(DateTime, nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)

    cliente = relationship("Cliente")
    venta = relationship("Venta", back_populates="cuenta_por_cobrar")

    # Backward-compat aliases used by routers
    @property
    def monto_total(self):
        return self.monto_total_usd

    @monto_total.setter
    def monto_total(self, value):
        self.monto_total_usd = value

    @property
    def monto_pagado(self):
        return self.monto_pagado_usd

    @monto_pagado.setter
    def monto_pagado(self, value):
        self.monto_pagado_usd = value


class CuentaPorPagar(Base):
    __tablename__ = "cuentas_por_pagar"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("public.proveedores.id"), nullable=False)
    compra_id = Column(Integer, ForeignKey("public.compras.id"), nullable=True)
    numero_documento = Column(String(50), nullable=False)
    monto_total_usd = Column(Numeric(15, 2), nullable=False)
    monto_pagado_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    fecha_emision = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    fecha_vencimiento = Column(DateTime, nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)

    proveedor = relationship("Proveedor")

    # Backward-compat aliases used by routers
    @property
    def monto_total(self):
        return self.monto_total_usd

    @monto_total.setter
    def monto_total(self, value):
        self.monto_total_usd = value

    @property
    def monto_pagado(self):
        return self.monto_pagado_usd

    @monto_pagado.setter
    def monto_pagado(self, value):
        self.monto_pagado_usd = value


class Compra(Base):
    __tablename__ = "compras"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("public.proveedores.id"), nullable=False)
    numero_factura = Column(String(50), unique=True, index=True, nullable=False)
    numero_control = Column(String(50), nullable=True)
    recepcion_id = Column(Integer, ForeignKey("public.recepciones_stock.id"), nullable=True)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    subtotal_usd = Column(Numeric(15, 2), nullable=False)
    iva_usd = Column(Numeric(15, 2), nullable=False)
    total_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    estado = Column(String(20), default="ACTIVA", nullable=False)
    categoria = Column(String(30), default="BIENES_INVENTARIO", nullable=False)

    proveedor = relationship("Proveedor")

    # Backward-compat aliases used by routers
    @property
    def subtotal(self):
        return self.subtotal_usd

    @subtotal.setter
    def subtotal(self, value):
        self.subtotal_usd = value

    @property
    def iva(self):
        return self.iva_usd

    @iva.setter
    def iva(self, value):
        self.iva_usd = value

    @property
    def total(self):
        return self.total_usd

    @total.setter
    def total(self, value):
        self.total_usd = value


class CuentaBancaria(Base):
    __tablename__ = "cuentas_bancarias"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    banco = Column(String(100), nullable=False)
    numero_cuenta = Column(String(50), unique=True, nullable=False)
    moneda = Column(String(3), default="USD", nullable=False)
    saldo_actual_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    cuarentena_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    activa = Column(Boolean, default=True)

    @property
    def saldo_actual(self):
        return self.saldo_actual_usd

    @saldo_actual.setter
    def saldo_actual(self, value):
        self.saldo_actual_usd = value


class Cheque(Base):
    __tablename__ = "cheques"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), nullable=True)
    banco_emisor = Column(String(100), nullable=False)
    numero_cheque = Column(String(50), unique=True, nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    fecha_emision = Column(Date, default=lambda: datetime.now(timezone.utc).date(), nullable=False)
    fecha_cobro = Column(Date, nullable=False)
    estado = Column(String(20), default="POST_DATADO", nullable=False) # POST_DATADO, COBRADO, DEVUELTO
    creado_por = Column(UUID(as_uuid=True), nullable=True)

    cliente = relationship("Cliente")


class MovimientoBancario(Base):
    __tablename__ = "movimientos_bancarios"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cuenta_id = Column(Integer, ForeignKey("public.cuentas_bancarias.id"), nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    concepto = Column(String(255), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    tipo = Column(String(20), nullable=False)  # INGRESO, EGRESO
    referencia = Column(String(100), nullable=True)
    estado = Column(String(20), default="ACTIVO", nullable=False)

    cuenta = relationship("CuentaBancaria")

    @property
    def monto(self):
        return self.monto_usd


class Cotizacion(Base):
    __tablename__ = "cotizaciones"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    numero_cotizacion = Column(String(50), unique=True, nullable=False)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), nullable=True)
    fecha_emision = Column(Date, default=lambda: datetime.now(timezone.utc).date(), nullable=False)
    fecha_vencimiento = Column(Date, nullable=False)
    moneda = Column(String(3), default="USD", nullable=False)
    tasa_cambio = Column(Numeric(10, 4), nullable=False)
    subtotal = Column(Numeric(15, 2), default=0.00, nullable=False)
    descuento_total = Column(Numeric(15, 2), default=0.00, nullable=False)
    total = Column(Numeric(15, 2), default=0.00, nullable=False)
    condiciones = Column(Text, nullable=True)
    estado = Column(String(20), default="Borrador", nullable=False)
    creado_por = Column(UUID(as_uuid=True), nullable=True)

    cliente = relationship("Cliente")
    items = relationship("CotizacionItem", back_populates="cotizacion", cascade="all, delete-orphan")


class CotizacionItem(Base):
    __tablename__ = "cotizacion_items"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    cotizacion_id = Column(Integer, ForeignKey("public.cotizaciones.id", ondelete="CASCADE"), nullable=False)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), nullable=True)
    descripcion = Column(Text, nullable=False)
    cantidad = Column(Numeric(15, 2), default=1.00, nullable=False)
    precio_unitario = Column(Numeric(15, 2), default=0.00, nullable=False)
    descuento_porcentaje = Column(Numeric(5, 2), default=0.00, nullable=False)
    total_fila = Column(Numeric(15, 2), default=0.00, nullable=False)

    cotizacion = relationship("Cotizacion", back_populates="items")



class OrdenVenta(Base):
    __tablename__ = "ordenes_venta"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), unique=True, nullable=False)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), nullable=True)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    total_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)


class DeclaracionIVA(Base):
    __tablename__ = "declaraciones_iva"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    periodo = Column(String(7), unique=True, index=True, nullable=False)
    debito_fiscal_usd = Column(Numeric(15, 2), default=0)
    credito_fiscal_mes_usd = Column(Numeric(15, 2), default=0)
    retenciones_usd = Column(Numeric(15, 2), default=0)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    estado = Column(String(20), default="BORRADOR", nullable=False)
    fecha_cierre = Column(DateTime, nullable=True)

    @property
    def debito_fiscal(self):
        return self.debito_fiscal_usd

    @debito_fiscal.setter
    def debito_fiscal(self, value):
        self.debito_fiscal_usd = value

    @property
    def credito_fiscal_mes(self):
        return self.credito_fiscal_mes_usd

    @credito_fiscal_mes.setter
    def credito_fiscal_mes(self, value):
        self.credito_fiscal_mes_usd = value

    @property
    def retenciones(self):
        return self.retenciones_usd

    @retenciones.setter
    def retenciones(self, value):
        self.retenciones_usd = value


class Almacen(Base):
    __tablename__ = "almacenes"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    responsable = Column(String(100), default="Sin asignar", nullable=True)
    direccion = Column(String(250), default="Dirección no especificada", nullable=True)
    activo = Column(Boolean, default=True, nullable=False)


class TransferenciaInventario(Base):
    __tablename__ = "transferencias_inventario"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    origen_almacen_id = Column(Integer, ForeignKey("public.almacenes.id"), nullable=False)
    destino_almacen_id = Column(Integer, ForeignKey("public.almacenes.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), nullable=False)
    cantidad = Column(Numeric(15, 2), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class RequisicionCompra(Base):
    __tablename__ = "requisiciones_compra"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), unique=True, nullable=False)
    solicitante = Column(String(100), nullable=False)
    monto_estimado_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    prioridad = Column(String(20), default="NORMAL", nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def monto_estimado(self):
        return self.monto_estimado_usd


class RecepcionStock(Base):
    __tablename__ = "recepciones_stock"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    hoja_id = Column(String(50), unique=True, nullable=False)
    orden_compra = Column(String(50), nullable=True)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), nullable=False)
    cantidad = Column(Numeric(15, 2), nullable=False)
    costo_usd = Column(Numeric(15, 2), nullable=False)
    estado = Column(String(20), default="Registrado", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def costo(self):
        return self.costo_usd



class NotaCredito(Base):
    __tablename__ = "notas_credito"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), unique=True, nullable=False)
    venta_id = Column(Integer, ForeignKey("public.ventas.id"), nullable=True)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    motivo = Column(String(255), nullable=True)
    tipo = Column(String(20), default="CREDITO", nullable=False)  # CREDITO, DEBITO
    estado = Column(String(20), default="BORRADOR", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def monto(self):
        return self.monto_usd


class AnticipoCliente(Base):
    __tablename__ = "anticipos_cliente"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    moneda = Column(String(3), default="USD", nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class Vendedor(Base):
    __tablename__ = "vendedores"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    codigo = Column(String(20), unique=True, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    meta_mensual_usd = Column(Numeric(15, 2), default=0, nullable=False)

    @property
    def meta_mensual(self):
        return self.meta_mensual_usd


class CentroCosto(Base):
    __tablename__ = "centros_costo"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)


class AuditoriaLog(Base):
    __tablename__ = "auditoria_logs"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    usuario = Column(String(100), nullable=False)
    accion = Column(String(100), nullable=False)
    modulo = Column(String(50), nullable=False)
    detalle = Column(Text, nullable=True)
    ip = Column(String(45), nullable=True)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class NumeracionSerie(Base):
    __tablename__ = "numeracion_series"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    modulo = Column(String(50), nullable=False)
    prefijo = Column(String(20), nullable=False)
    ultimo_numero = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)


class NotificacionRegla(Base):
    __tablename__ = "notificaciones_reglas"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    canal = Column(String(30), default="EMAIL", nullable=False)
    activa = Column(Boolean, default=True, nullable=False)
    plantilla = Column(Text, nullable=True)


class ImportacionJob(Base):
    __tablename__ = "importacion_jobs"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(50), nullable=False)
    archivo = Column(String(255), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)
    registros_ok = Column(Integer, default=0, nullable=False)
    registros_error = Column(Integer, default=0, nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class LoteProducto(Base):
    __tablename__ = "lotes_producto"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), nullable=False)
    lote = Column(String(50), nullable=False)
    fecha_vencimiento = Column(DateTime, nullable=True)
    cantidad = Column(Numeric(15, 2), nullable=False)


class ConteoFisico(Base):
    __tablename__ = "conteos_fisicos"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    almacen_id = Column(Integer, ForeignKey("public.almacenes.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), nullable=False)
    cantidad_sistema = Column(Numeric(15, 2), nullable=False)
    cantidad_fisica = Column(Numeric(15, 2), nullable=False)
    diferencia = Column(Numeric(15, 2), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TransferenciaTesoreria(Base):
    __tablename__ = "transferencias_tesoreria"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cuenta_origen_id = Column(Integer, ForeignKey("public.cuentas_bancarias.id"), nullable=False)
    cuenta_destino_id = Column(Integer, ForeignKey("public.cuentas_bancarias.id"), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    concepto = Column(String(255), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    origen = relationship("CuentaBancaria", foreign_keys=[cuenta_origen_id])
    destino = relationship("CuentaBancaria", foreign_keys=[cuenta_destino_id])


class PrestamoUVC(Base):
    __tablename__ = "prestamos_uvc"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    descripcion = Column(String(255), nullable=False)
    monto_uvc = Column(Numeric(15, 2), nullable=False)
    tasa = Column(Numeric(10, 4), nullable=False)
    saldo_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)
    fecha_inicio = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class ColocacionInversion(Base):
    __tablename__ = "colocaciones_inversiones"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    plazo_dias = Column(Integer, nullable=False)
    capital_bs = Column(Numeric(15, 2), nullable=False)
    tasa_interes_anual = Column(Numeric(10, 2), nullable=False)
    tasa_cambio_inicial = Column(Numeric(10, 4), nullable=False)
    fecha_inicio = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)


class PresupuestoPartida(Base):
    __tablename__ = "presupuesto_partidas"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    centro_costo = Column(String(50), nullable=False)
    concepto = Column(String(200), nullable=False)
    presupuestado_usd = Column(Numeric(15, 2), nullable=False)
    ejecutado_usd = Column(Numeric(15, 2), default=0, nullable=False)
    periodo = Column(String(7), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)


class RetencionIVA(Base):
    __tablename__ = "retenciones_iva"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(20), nullable=False, default="PRACTICADA") # PRACTICADA o RECIBIDA
    agente_rif = Column(String(50), nullable=False)
    agente_nombre = Column(String(200), nullable=False)
    numero_factura = Column(String(50), nullable=False)
    numero_comprobante = Column(String(50), nullable=True)
    fecha_comprobante = Column(DateTime, nullable=True)
    base_usd = Column(Numeric(15, 2), nullable=False)
    alicuota = Column(Numeric(10, 4), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    periodo = Column(String(7), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)

    @property
    def base(self):
        return self.base_usd

    @property
    def monto(self):
        return self.monto_usd


class RetencionISLR(Base):
    __tablename__ = "retenciones_islr"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    proveedor_rif = Column(String(50), nullable=False)
    proveedor_nombre = Column(String(200), nullable=False)
    numero_factura = Column(String(50), nullable=False)
    numero_control = Column(String(50), nullable=True)
    base_usd = Column(Numeric(15, 2), nullable=False)
    concepto_codigo = Column(String(10), nullable=False) # e.g. "001"
    alicuota = Column(Numeric(10, 4), nullable=False) # e.g. 0.0300 (3%)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    periodo = Column(String(7), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False)

    @property
    def base(self):
        return self.base_usd

    @property
    def monto(self):
        return self.monto_usd


class DeclaracionISLR(Base):
    __tablename__ = "declaracion_islr"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    ejercicio = Column(String(4), nullable=False) # e.g. "2026"
    ingresos_brutos = Column(Numeric(15, 2), default=0)
    costos_ventas = Column(Numeric(15, 2), default=0)
    deducciones = Column(Numeric(15, 2), default=0)
    enriquecimiento_neto = Column(Numeric(15, 2), default=0)
    impuesto_determinado = Column(Numeric(15, 2), default=0)
    retenciones_aplicables = Column(Numeric(15, 2), default=0)
    islr_pagado = Column(Numeric(15, 2), default=0)
    estado = Column(String(20), default="BORRADOR") # BORRADOR, FINALIZADA
    fecha_presentacion = Column(DateTime, nullable=True)


class DevolucionProveedor(Base):
    __tablename__ = "devoluciones_proveedor"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    numero_devolucion = Column(String(50), unique=True, index=True, nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    proveedor_id = Column(Integer, ForeignKey("public.proveedores.id"), nullable=False)
    factura_id = Column(Integer, ForeignKey("public.compras.id"), nullable=True)
    motivo = Column(String(500), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    estado = Column(String(50), default="EN PROCESO", nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO LOGÍSTICA — Flota, Choferes, Turnos de Despacho y Mantenimiento
# ─────────────────────────────────────────────────────────────────────────────

class Vehiculo(Base):
    """Registro de todos los vehículos de la flota (camiones, carros, motos, etc.)."""
    __tablename__ = "vehiculos"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True))
    nombre = Column(String(100), nullable=False)
    placa = Column(String(20), unique=True, nullable=False, index=True)
    tipo = Column(String(50), nullable=False, default="CAMION")  # CAMION, CARRO, MOTO, FURGON, AVION, BARCO, OTRO
    marca = Column(String(80), nullable=True)
    modelo = Column(String(80), nullable=True)
    anio = Column(Integer, nullable=True)
    color = Column(String(40), nullable=True)
    capacidad_kg = Column(Numeric(10, 2), nullable=True)
    estado = Column(String(30), default="DISPONIBLE", nullable=False)  # DISPONIBLE, EN_RUTA, EN_MANTENIMIENTO, INACTIVO
    km_actuales = Column(Numeric(12, 2), default=0)
    proximo_servicio_km = Column(Numeric(12, 2), nullable=True)
    ultimo_servicio = Column(DateTime, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    turnos = relationship("TurnoDespacho", back_populates="vehiculo")
    mantenimientos = relationship("RegistroMantenimiento", back_populates="vehiculo")


class Chofer(Base):
    """Directorio de choferes/conductores con vinculación a Telegram."""
    __tablename__ = "choferes"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True))
    nombre = Column(String(100), nullable=False)
    cedula = Column(String(20), nullable=True, unique=True)
    telefono = Column(String(20), nullable=True)
    telegram_chat_id = Column(String(30), nullable=True)  # chat_id del bot de Telegram
    licencia_tipo = Column(String(10), nullable=True)  # 3, 4, 5, A, B, etc.
    licencia_vence = Column(Date, nullable=True)
    estado = Column(String(20), default="DISPONIBLE", nullable=False)  # DISPONIBLE, EN_RUTA, DE_REPOSO, INACTIVO
    foto_url = Column(String(500), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    turnos = relationship("TurnoDespacho", back_populates="chofer")


class TurnoDespacho(Base):
    """Hoja de ruta diaria: asignación de vehículo + chofer + destino."""
    __tablename__ = "turnos_despacho"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True))
    numero_turno = Column(String(20), unique=True, index=True, nullable=False)
    vehiculo_id = Column(Integer, ForeignKey("public.vehiculos.id"), nullable=False)
    chofer_id = Column(Integer, ForeignKey("public.choferes.id"), nullable=False)
    venta_id = Column(Integer, ForeignKey("public.ventas.id"), nullable=True) # Enlace directo con venta/factura
    nota_entrega_ref = Column(String(50), nullable=True)  # Número de nota de entrega (referencia blanda o heredado de venta)
    fecha_salida = Column(DateTime, nullable=False)
    ruta_descripcion = Column(String(255), nullable=True)
    destino = Column(String(300), nullable=False)
    observaciones = Column(Text, nullable=True)
    estado = Column(String(30), default="PROGRAMADO", nullable=False)  # PROGRAMADO, EN_RUTA, ENTREGADO, CANCELADO
    telegram_notificado = Column(Boolean, default=False)
    fecha_retorno = Column(DateTime, nullable=True)
    km_retorno = Column(Numeric(12, 2), nullable=True)  # Kilometraje de retorno registrado al liquidar
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehiculo = relationship("Vehiculo", back_populates="turnos")
    chofer = relationship("Chofer", back_populates="turnos")
    venta = relationship("Venta")
    ventas_asociadas = relationship("TurnoVentaAsociacion", back_populates="turno", cascade="all, delete-orphan")
    gastos = relationship("TurnoGasto", back_populates="turno", cascade="all, delete-orphan")


class RegistroMantenimiento(Base):
    """Historial de servicios y mantenimientos por vehículo."""
    __tablename__ = "registros_mantenimiento"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True))
    vehiculo_id = Column(Integer, ForeignKey("public.vehiculos.id"), nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    tipo = Column(String(50), nullable=False)  # ACEITE, NEUMATICOS, FRENOS, REVISION, OTRO
    descripcion = Column(Text, nullable=True)
    costo_usd = Column(Numeric(10, 2), nullable=True)
    km_al_servicio = Column(Numeric(12, 2), nullable=True)
    proximo_km = Column(Numeric(12, 2), nullable=True)

    vehiculo = relationship("Vehiculo", back_populates="mantenimientos")


class TurnoVentaAsociacion(Base):
    """Asociación de múltiples ventas/facturas a un turno de despacho (Multi-parada)."""
    __tablename__ = "turnos_despacho_ventas"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    turno_id = Column(Integer, ForeignKey("public.turnos_despacho.id", ondelete="CASCADE"), nullable=False)
    venta_id = Column(Integer, ForeignKey("public.ventas.id", ondelete="CASCADE"), nullable=False)
    orden_parada = Column(Integer, default=1, nullable=False)
    estado_entrega = Column(String(30), default="PENDIENTE", nullable=False)  # PENDIENTE, ENTREGADO, RECHAZADO
    evidencia_foto_url = Column(String(500), nullable=True)
    motivo_rechazo = Column(Text, nullable=True)

    turno = relationship("TurnoDespacho", back_populates="ventas_asociadas")
    venta = relationship("Venta")


class TurnoGasto(Base):
    """Gastos operativos liquidados por viaje/turno (Combustible, Peajes, Viáticos)."""
    __tablename__ = "turnos_gastos"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    turno_id = Column(Integer, ForeignKey("public.turnos_despacho.id", ondelete="CASCADE"), nullable=False)
    categoria = Column(String(50), nullable=False)  # COMBUSTIBLE, PEAJES, VIATICOS, OTRO
    monto_usd = Column(Numeric(12, 2), nullable=False)
    litros_combustible = Column(Numeric(10, 2), nullable=True)  # Si aplica
    descripcion = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    turno = relationship("TurnoDespacho", back_populates="gastos")


class LogisticaLedger(Base):
    """Libro mayor inmutable para auditoría y trazabilidad de eventos logísticos."""
    __tablename__ = "logistica_ledger"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    turno_id = Column(Integer, ForeignKey("public.turnos_despacho.id", ondelete="CASCADE"), nullable=False)
    estado_anterior = Column(String(30), nullable=True)
    estado_nuevo = Column(String(30), nullable=False)
    fecha_cambio = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    usuario = Column(String(100), nullable=False)
    motivo = Column(Text, nullable=True)
    hash_seguridad = Column(String(64), nullable=False)  # SHA-256 encadenado

    turno = relationship("TurnoDespacho")


class CuarentenaLogistica(Base):
    """Manejo de logística inversa estricta para inventario devuelto o rechazado."""
    __tablename__ = "cuarentena_logistica"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    turno_id = Column(Integer, ForeignKey("public.turnos_despacho.id", ondelete="CASCADE"), nullable=False)
    producto_id = Column(Integer, ForeignKey("public.productos.id", ondelete="CASCADE"), nullable=False)
    cantidad = Column(Numeric(15, 2), nullable=False)
    motivo = Column(Text, nullable=False)
    estado = Column(String(30), default="PENDIENTE_REVISION", nullable=False)  # PENDIENTE_REVISION, APROBADO_REINGRESO, DESECHADO
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    turno = relationship("TurnoDespacho")
    producto = relationship("Producto")


class FondoCajaChica(Base):
    __tablename__ = "fondos_caja_chica"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    responsable = Column(String(100), nullable=False)
    asignado_usd = Column(Numeric(15, 2), nullable=False)
    disponible_usd = Column(Numeric(15, 2), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)


class GastoCajaChica(Base):
    __tablename__ = "gastos_caja_chica"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    fondo_id = Column(Integer, ForeignKey("public.fondos_caja_chica.id"), nullable=False)
    concepto = Column(String(200), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    soporte = Column(String(100), nullable=False)
    no_deducible = Column(Boolean, default=False)
    fecha = Column(Date, default=lambda: datetime.now(timezone.utc).date(), nullable=False)
    estado = Column(String(20), default="PROCESADO", nullable=False)

    fondo = relationship("FondoCajaChica")
