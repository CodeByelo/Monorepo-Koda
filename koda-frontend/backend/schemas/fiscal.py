from pydantic import BaseModel, Field, ConfigDict, field_validator
from decimal import Decimal
from datetime import datetime
import re

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


class DeclaracionIVAPayload(BaseModel):
    periodo: str = Field(..., description="Período fiscal en formato YYYY-MM")
    retenciones: Decimal = Field(default=Decimal("0"), ge=0)

    @field_validator("periodo")
    @classmethod
    def periodo_formato_valido(cls, v):
        if not re.match(r"^\d{4}-\d{2}$", v):
            raise ValueError("El período debe tener el formato YYYY-MM (ej. 2026-07)")
        return v