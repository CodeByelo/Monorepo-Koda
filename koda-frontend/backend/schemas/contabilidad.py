import re
from pydantic import BaseModel, Field, field_validator


class CierrePeriodoPayload(BaseModel):
    periodo: str = Field(..., description="Período fiscal en formato YYYY-MM")

    @field_validator("periodo")
    @classmethod
    def periodo_formato_valido(cls, v):
        if not re.match(r"^\d{4}-\d{2}$", v):
            raise ValueError("El período debe tener el formato YYYY-MM (ej. 2026-07)")
        return v


class ReaperturaPeriodoPayload(CierrePeriodoPayload):
    justificacion: str = Field(..., min_length=10, max_length=500,
                                description="Justificación técnica obligatoria, mínimo 10 caracteres")
