from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

class AsientoDetalleResponse(BaseModel):
    id: int
    cuenta_codigo: str
    cuenta_nombre: str
    debe: Decimal
    haber: Decimal

    model_config = ConfigDict(from_attributes=True)

class AsientoContableResponse(BaseModel):
    id: int
    fecha: datetime
    concepto: str
    referencia: str
    total_debe: Decimal
    total_haber: Decimal
    detalles: List[AsientoDetalleResponse]
    
    descripcion: Optional[str] = None
    desc: Optional[str] = None
    monto: Optional[Decimal] = None
    amount: Optional[Decimal] = None
    origen: Optional[str] = None
    origin: Optional[str] = None
    estatus: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedAsientoContableResponse(BaseModel):
    total_records: int
    limit: int
    offset: int
    data: List[AsientoContableResponse]


class LibroDiarioLine(BaseModel):
    account: str
    name: str
    debit: float
    credit: float

class LibroDiarioItem(BaseModel):
    id: int
    fecha: str
    concepto: str
    referencia: str
    debe: float
    haber: float
    lines: List[LibroDiarioLine]


class PaginatedLibroDiarioResponse(BaseModel):
    total_records: int
    limit: int
    offset: int
    data: List[LibroDiarioItem]
