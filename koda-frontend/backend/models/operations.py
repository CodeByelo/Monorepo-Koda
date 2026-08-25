from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.core.database import Base

class Producto(Base):
    __tablename__ = "productos"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    precio_usd = Column(Numeric(15, 2), nullable=False)
    # Precios por tarifa fija (3 tiers de negocio: Mayor / Detal / Gran Mayor).
    # Nullable a propósito: un producto puede no tener todavía configurada una
    # tarifa mayorista, en cuyo caso la facturación/POS deben caer de vuelta a
    # `precio_usd` (ver NuevaFactura.tsx/POS.tsx). `precio_detal` es la única
    # excepción práctica: se puebla siempre (migración + endpoints de
    # productos) con el valor de `precio_usd` cuando no se especifica, para
    # que el tier "Detal" nunca quede vacío en productos nuevos.
    precio_detal = Column(Numeric(15, 2), nullable=True)
    precio_mayor = Column(Numeric(15, 2), nullable=True)
    precio_gran_mayor = Column(Numeric(15, 2), nullable=True)
    costo_usd = Column(Numeric(15, 2), nullable=False)
    # Total global de stock. Legacy: sigue siendo la fuente de verdad para
    # ventas/facturación/valorización (routers/sales.py, facturacion.py,
    # inventory.py, logistica.py, modulos_ext.py), ninguno de los cuales es
    # todavía consciente de almacén. El detalle real por almacén vive en
    # StockPorAlmacen (models/erp_extended.py). Las transferencias entre
    # almacenes son de suma neta cero y no tocan esta columna. Sales/compras
    # SÍ pueden desincronizar este total respecto a sum(StockPorAlmacen) hasta
    # que esos flujos se rediseñen para ser conscientes de almacén (fuera de
    # alcance de esta fase).
    stock = Column(Numeric(15, 2), default=0.00, nullable=False)
    stock_minimo = Column(Numeric(15, 2), default=10.00, nullable=False)  # Umbral de reposición por producto (antes hardcodeado a 10 en el frontend)
    es_exento = Column(Boolean, default=False, nullable=False)  # Indica si está exento de IVA (0%)
    imagen_url = Column(String(500), nullable=True)

class Venta(Base):
    __tablename__ = "ventas"
    __table_args__ = (
        UniqueConstraint('tenant_id', 'numero_factura', name='_tenant_ventas_numero_factura_uc'),
        {'schema': 'public'}
    )
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("public.clientes.id"), index=True, nullable=True)
    numero_factura = Column(String(50), index=True, nullable=False)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    subtotal_usd = Column(Numeric(15, 2), nullable=False)
    iva_usd = Column(Numeric(15, 2), nullable=False)  # IVA 16% sobre productos no exentos
    igtf_usd = Column(Numeric(15, 2), default=0.00, nullable=False)  # IGTF 3% sobre pago en divisa
    retencion_iva_usd = Column(Numeric(15, 2), default=0.00, nullable=False) # Retencion IVA aplicable
    total_usd = Column(Numeric(15, 2), nullable=False)
    metodo_pago = Column(String(50), nullable=False)  # Efectivo, Divisa, Transferencia, PagoMovil
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)  # Se congela la tasa (ej. BCV) al momento exacto de la venta
    estado = Column(String(20), default="ACTIVA", nullable=False) # ACTIVA, ANULADA
    creado_por = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=True)
    vendedor_id = Column(Integer, ForeignKey("public.vendedores.id"), nullable=True)
    # Comisión calculada y congelada al momento de la emisión (según la tasa
    # del vendedor vigente en ese momento). NULL = venta previa a esta
    # migración, para la cual no se conoce el valor real (ver reporte_vendedores).
    comision_usd = Column(Numeric(15, 2), nullable=True)
    moneda_documento = Column(String(20), nullable=True, default="BIMONETARIO")  # BIMONETARIO / SOLO_USD / SOLO_VES — formato de moneda elegido en el POS para IMPRIMIR la factura

    # Relación uno-a-muchos con los detalles de la venta
    cliente = relationship("Cliente")
    vendedor = relationship("Vendedor")
    detalles = relationship("VentaDetalle", back_populates="venta", cascade="all, delete-orphan")
    cuenta_por_cobrar = relationship("CuentaPorCobrar", back_populates="venta", uselist=False)

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

class VentaDetalle(Base):
    __tablename__ = "venta_detalles"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    venta_id = Column(Integer, ForeignKey("public.ventas.id"), index=True, nullable=False)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), index=True, nullable=False)
    cantidad = Column(Numeric(15, 2), nullable=False)
    precio_usd_capturado = Column(Numeric(15, 2), nullable=False)  # Se captura el precio histórico al momento de la venta

    # Relaciones de retroalimentación
    venta = relationship("Venta", back_populates="detalles")
    producto = relationship("Producto")

class KardexMovimiento(Base):
    """
    Libro Mayor de Inventario (Append-Only Ledger).
    Garantiza que ningún producto cambie de stock sin dejar un rastro forense.
    Es el núcleo del sistema anti-robos de KODA ERP.
    """
    __tablename__ = "kardex_movimientos"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), index=True, nullable=False)
    # Ej: 'Venta', 'Compra', 'Ajuste_Salida', 'Ajuste_Entrada', 'Transferencia'
    tipo_movimiento = Column(String(50), nullable=False) 
    # Cantidad exacta que se movió. Negativo para salidas, positivo para entradas.
    cantidad = Column(Numeric(15, 2), nullable=False) 
    # Documento que justifica el movimiento. Ej: FAC-00000001, AJU-2026-001
    documento_referencia = Column(String(100), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)
    # Almacén donde ocurrió físicamente el movimiento. Nullable por
    # compatibilidad con filas existentes y con flujos que todavía no son
    # conscientes de almacén; cuando el llamador no informa almacen_id
    # explícito, se resuelve el almacén "principal" del tenant como fallback
    # (ver backend.utils.helpers.get_almacen_principal_id), mismo patrón que
    # AjusteInventario.almacen_id.
    almacen_id = Column(Integer, ForeignKey("public.almacenes.id"), nullable=True)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class AjusteInventario(Base):
    """
    Tabla de tránsito para el flujo Maker-Checker.
    """
    __tablename__ = "ajustes_inventario"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("public.productos.id"), index=True, nullable=False)
    cantidad = Column(Numeric(15, 2), nullable=False)  # Positivo (Entrada) o Negativo (Merma/Salida)
    motivo = Column(String(255), nullable=False)
    estado = Column(String(20), default="PENDIENTE", nullable=False) # PENDIENTE, APROBADO, RECHAZADO
    # Almacén donde se aplica físicamente el ajuste (StockPorAlmacen). Nullable
    # por compatibilidad con filas existentes y solicitudes que no lo indican;
    # en ese caso aprobar_ajuste() resuelve el almacén "principal" del tenant
    # al momento de aprobar (ver backend.utils.helpers.get_almacen_principal_id).
    almacen_id = Column(Integer, ForeignKey("public.almacenes.id"), nullable=True)
    fecha_solicitud = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    fecha_aprobacion = Column(DateTime, nullable=True)


class Cliente(Base):
    __tablename__ = "clientes"
    __table_args__ = (
        UniqueConstraint('tenant_id', 'rif', name='_tenant_rif_uc'),
        {'schema': 'public'}
    )
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    rif = Column(String(50), index=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    telefono = Column(String(50), nullable=True)
    email = Column(String(150), nullable=True)
    direccion = Column(String(255), nullable=True)
    es_contribuyente_especial = Column(Boolean, default=False, nullable=False)


class Proveedor(Base):
    __tablename__ = "proveedores"
    __table_args__ = (
        UniqueConstraint('tenant_id', 'rif', name='_tenant_proveedores_rif_uc'),
        {'schema': 'public'}
    )
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    rif = Column(String(50), index=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    telefono = Column(String(50), nullable=True)
    email = Column(String(150), nullable=True)
    direccion = Column(String(255), nullable=True)
    
    evaluaciones = relationship("EvaluacionProveedor", back_populates="proveedor", cascade="all, delete-orphan")

class EvaluacionProveedor(Base):
    __tablename__ = "evaluaciones_proveedor"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey('public.proveedores.id'), nullable=False)
    fecha_evaluacion = Column(DateTime(timezone=True), server_default=func.now())
    
    # Ponderaciones Score
    score_precio = Column(Integer, default=0)
    score_calidad = Column(Integer, default=0)
    score_entrega = Column(Integer, default=0)
    
    # Matriz de Riesgo (%)
    riesgo_importacion_pct = Column(Float, default=0.0)
    volatilidad_precio_pct = Column(Float, default=0.0)
    estabilidad_proveedor_pct = Column(Float, default=100.0)
    
    # Ranking de Calidad
    tasa_merma_pct = Column(Float, default=0.0)

    proveedor = relationship("Proveedor", back_populates="evaluaciones")
