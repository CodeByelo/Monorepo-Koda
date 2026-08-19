from pydantic import BaseModel, ConfigDict
from datetime import datetime
from decimal import Decimal
from typing import Optional

class NominaResponse(BaseModel):
    id: int
    periodo: str
    fecha_emision: datetime
    total_asignaciones_usd: Decimal
    total_bonos_usd: Decimal
    total_deducciones_usd: Decimal
    total_neto_usd: Decimal
    asiento_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


from uuid import UUID

class EmpleadoResponse(BaseModel):
    id: int
    cedula: str
    nombre_completo: str
    cargo: str
    salario_base_usd: Decimal
    bono_alimentacion_usd: Decimal
    activo: Optional[int] = 1
    gerencia_id: Optional[int] = None
    tenant_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedEmpleadoResponse(BaseModel):
    total_records: int
    limit: int
    offset: int
    data: list[EmpleadoResponse]