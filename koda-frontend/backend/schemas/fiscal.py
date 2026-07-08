from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal
from datetime import datetime

class ReglaFiscalBase(BaseModel):
    nombre: str = Field(..., description="Nombre del impuesto. Ej: IVA, IGTF")
    tasa: Decimal = Field(..., description="Tasa en formato decimal. Ej: 0.1600 para 16%")
    activa: bool = Field(default=True)

class ReglaFiscalCreate(ReglaFiscalBase):
    pass

class ReglaFiscalResponse(ReglaFiscalBase):
    id: int
    fecha_vigencia: datetime

    model_config = ConfigDict(from_attributes=True)