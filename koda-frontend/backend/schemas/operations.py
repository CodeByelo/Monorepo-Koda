from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional, Union
import uuid

# ==========================================
# ESQUEMAS PARA CLIENTE
# ==========================================

class ClienteBase(BaseModel):
    rif: str = Field(..., min_length=3, max_length=50)
    nombre: str = Field(..., min_length=3, max_length=150)
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    es_contribuyente_especial: bool = False

class ClienteCreate(ClienteBase):
    pass

class ClienteResponse(ClienteBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ESQUEMAS PARA PRODUCTO
# ==========================================

class ProductoBase(BaseModel):
    sku: str = Field(..., min_length=3, max_length=50)
    nombre: str = Field(..., min_length=3, max_length=150)
    precio_usd: Decimal = Field(..., gt=0, decimal_places=2)
    costo_usd: Decimal = Field(..., ge=0, decimal_places=2)
    stock: int = Field(..., ge=0)
    es_exento: bool = Field(default=False)

class ProductoCreate(ProductoBase):
    pass

class ProductoResponse(ProductoBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ESQUEMAS PARA DETALLE DE VENTA
# ==========================================

class VentaDetalleCreate(BaseModel):
    producto_id: int
    cantidad: Decimal = Field(..., gt=0, decimal_places=2)

class VentaDetalleResponse(BaseModel):
    id: int
    producto_id: int
    cantidad: Decimal
    precio_usd_capturado: Decimal

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ESQUEMAS PARA VENTA
# ==========================================

class VentaCreate(BaseModel):
    cliente_id: int
    metodo_pago: str = Field(..., pattern="^(Efectivo|Divisa|Transferencia|PagoMovil)$")
    moneda_pago: str = Field(..., pattern="^(Bs|USD)$")
    dias_credito: int = Field(default=0, ge=0)
    detalles: List[VentaDetalleCreate] = Field(..., min_length=1)

class FacturaDetalleRequest(BaseModel):
    producto_id: Union[str, int]
    cantidad: Decimal = Field(..., gt=0, decimal_places=2)
    precio_unitario: Decimal = Field(..., ge=0, decimal_places=2)
    descripcion: Optional[str] = ""

class FacturaEmisionRequest(BaseModel):
    cliente_id: Union[str, int]
    metodo_pago: str = Field(..., pattern="^(Efectivo|Divisa|Transferencia|PagoMovil)$")
    aplica_igtf: Optional[bool] = False
    moneda_documento: Optional[str] = "USD"
    detalles: List[FacturaDetalleRequest] = Field(..., min_length=1)

class VentaResponse(BaseModel):
    id: int
    numero_factura: str
    fecha: datetime
    subtotal_usd: Decimal
    iva_usd: Decimal
    igtf_usd: Decimal
    retencion_iva_usd: Decimal
    total_usd: Decimal
    metodo_pago: str
    tasa_cambio_bs: Decimal
    estado: str
    detalles: List[VentaDetalleResponse]
    creado_por: Optional[uuid.UUID] = None
    cliente: Optional[ClienteResponse] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ESQUEMAS PARA REPORTE DE BUSINESS INTELLIGENCE
# ==========================================

class VentaReporteResponse(BaseModel):
    ventas_totales_cantidad: int
    subtotal_acumulado_usd: Decimal
    iva_acumulado_usd: Decimal
    igtf_acumulado_usd: Decimal
    total_acumulado_usd: Decimal

# ==========================================
# ESQUEMAS PARA INVENTARIO Y KARDEX
# ==========================================

class AjusteInventarioCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(..., description="Cantidad a ajustar (positiva para entradas, negativa para salidas/mermas)")
    motivo: str = Field(..., min_length=5)

class AjusteInventarioResponse(BaseModel):
    id: int
    producto_id: int
    cantidad: int
    motivo: str
    estado: str
    fecha_solicitud: datetime
    fecha_aprobacion: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class KardexMovimientoResponse(BaseModel):
    id: int
    producto_id: int
    tipo_movimiento: str
    cantidad: int
    documento_referencia: str
    fecha: datetime

    model_config = ConfigDict(from_attributes=True)



# ==========================================
# ESQUEMAS PARA PROVEEDOR
# ==========================================

class ProveedorBase(BaseModel):
    rif: str = Field(..., min_length=3, max_length=50)
    nombre: str = Field(..., min_length=3, max_length=150)
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None

class ProveedorCreate(ProveedorBase):
    pass

class ProveedorResponse(ProveedorBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS PARA COTIZACIÓN
# ==========================================

class CotizacionItemCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: Decimal = Field(..., gt=0)
    price: Decimal = Field(..., ge=0)
    discountPct: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)

class CotizacionCreate(BaseModel):
    client: str = Field(..., min_length=1)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    emissionDate: date
    dueDate: date
    items: List[CotizacionItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = None
    subtotal: Decimal
    discountTotal: Decimal
    totalFinal: Decimal


class CotizacionStatusUpdate(BaseModel):
    estado: str = Field(..., min_length=1)

# ==========================================
# ESQUEMAS PARA COMPRAS
# ==========================================

class CompraCreate(BaseModel):
    proveedor_id: int
    numero_factura: str = Field(..., min_length=1, max_length=50)
    numero_control: Optional[str] = None
    recepcion_id: Optional[int] = None
    fecha_emision: Optional[date] = None
    subtotal_usd: Decimal = Field(..., ge=0)
    iva_usd: Decimal = Field(..., ge=0)
    total_usd: Decimal = Field(..., ge=0)
    tasa_cambio_bs: Decimal = Field(..., gt=0)
    dias_credito: Optional[int] = Field(default=0, ge=0)
    estado: Optional[str] = Field(default="ACTIVA")
    categoria: Optional[str] = Field(default="BIENES_INVENTARIO")

class RecepcionStockCreate(BaseModel):
    orden_compra: Optional[str] = None
    producto_id: int
    cantidad: Decimal = Field(..., gt=0)
    costo_factura: Decimal = Field(..., ge=0)

class RecepcionStockResponse(BaseModel):
    id: int
    hoja_id: str
    orden_compra: Optional[str] = None
    producto_id: int
    cantidad: Decimal
    costo_usd: Decimal
    estado: str
    fecha: datetime
    
    class Config:
        orm_mode = True

class DevolucionProveedorCreate(BaseModel):
    proveedor_id: int
    factura_id: Optional[int] = None
    motivo: str
    monto_usd: Decimal
