from datetime import date
from decimal import Decimal
from typing import List, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


ConceptType = Literal["asignacion", "deduccion"]
PeriodStatus = Literal["abierto", "procesado"]


class EmployeeResponse(BaseModel):
    id: UUID
    profile_id: UUID | None = None
    cedula: str
    nombres: str
    cargo: str
    fecha_ingreso: date
    sueldo_base_mensual: Decimal
    tipo_cuenta_bancaria: str
    numero_cuenta: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class EmployeeUpdate(BaseModel):
    sueldo_base_mensual: Decimal = Field(ge=0)


class ConceptCreate(BaseModel):
    tipo: ConceptType
    nombre: str = Field(min_length=2, max_length=100)
    afecta_salario_base: bool = False


class ConceptResponse(ConceptCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class PayrollPeriodCreate(BaseModel):
    nombre_periodo: str = Field(min_length=2, max_length=100)
    fecha_inicio: date
    fecha_fin: date
    status: PeriodStatus = "abierto"

    @model_validator(mode="after")
    def validate_dates(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("fecha_fin debe ser mayor o igual a fecha_inicio")
        return self


class PayrollPeriodResponse(PayrollPeriodCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class PayrollDetailCreate(BaseModel):
    employee_id: UUID
    period_id: int
    concept_id: int
    monto: Decimal = Field(ge=0)
    cantidad_horas_dias: Decimal = Field(default=Decimal("0.00"), ge=0)


class PayrollDetailBulkSave(BaseModel):
    period_id: int
    details: List[PayrollDetailCreate]


class PayrollDetailResponse(PayrollDetailCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class PrePayrollProcessEmployeeItem(BaseModel):
    employee_id: UUID
    cedula: str
    nombres: str
    cargo: str
    sueldo_base: Decimal
    asignaciones: Decimal
    deducciones: Decimal
    neto: Decimal


class PrePayrollProcessResponse(BaseModel):
    period_id: int
    nombre_periodo: str
    dias_periodo: int
    tipo_periodo: Literal["quincenal", "mensual"]
    total_base: Decimal
    total_asignaciones: Decimal
    total_deducciones: Decimal
    total_neto: Decimal
    employees: List[PrePayrollProcessEmployeeItem]
