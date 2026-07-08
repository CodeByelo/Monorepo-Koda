from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.core.database import Base

class Empleado(Base):
    """Registro maestro de trabajadores"""
    __tablename__ = "empleados"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    cedula = Column(String(20), unique=True, index=True, nullable=False)
    nombre_completo = Column(String(150), nullable=False)
    cargo = Column(String(100), nullable=False)
    salario_base_usd = Column(Numeric(15, 2), nullable=False)
    bono_alimentacion_usd = Column(Numeric(15, 2), default=40.00, nullable=False) # Cestaticket (No remunerativo)
    activo = Column(Integer, default=1) # 1 = Activo, 0 = Inactivo

class Nomina(Base):
    """Cabecera de la emisión de nómina"""
    __tablename__ = "nominas"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    periodo = Column(String(100), nullable=False) # Ej. Quincena 1 - Mayo 2026
    fecha_emision = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    total_asignaciones_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    total_bonos_usd = Column(Numeric(15, 2), default=0.00, nullable=False) # Bonos no sujetos a deducción
    total_deducciones_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    total_inces_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    total_neto_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    asiento_id = Column(Integer, nullable=True) # Conexión directa al Libro Diario
    estado = Column(String(20), default="PROCESADA", nullable=False)


class RHEmployee(Base):
    """Maestro de empleados para la nómina dinámica multi-tenant."""
    __tablename__ = "rh_employees"
    __table_args__ = (
        UniqueConstraint("tenant_id", "cedula", name="unique_cedula_tenant"),
        {"schema": "public"},
    )

    id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    cedula = Column(String(20), nullable=False, index=True)
    nombres = Column(String(150), nullable=False)
    cargo = Column(String(100), nullable=False)
    fecha_ingreso = Column(Date, nullable=False)
    sueldo_base_mensual = Column(Numeric(15, 2), nullable=False)
    tipo_cuenta_bancaria = Column(String(50), nullable=False)
    numero_cuenta = Column(String(50), nullable=False)
    status = Column(String(20), default="activo", nullable=False)

    payroll_details = relationship("RHPayrollDetail", back_populates="employee", cascade="all, delete-orphan")

    @property
    def profile_id(self):
        return self.id


class RHConcept(Base):
    """Catálogo de conceptos variables de asignación y deducción."""
    __tablename__ = "rh_concepts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "nombre", name="unique_concept_name_tenant"),
        {"schema": "public"},
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    tipo = Column(String(20), nullable=False)
    nombre = Column(String(100), nullable=False)
    afecta_salario_base = Column(Boolean, default=False, nullable=False)

    payroll_details = relationship("RHPayrollDetail", back_populates="concept", cascade="all, delete-orphan")


class RHPayrollPeriod(Base):
    """Períodos de control para pre-nómina y procesamiento."""
    __tablename__ = "rh_payroll_periods"
    __table_args__ = (
        UniqueConstraint("tenant_id", "nombre_periodo", name="unique_period_name_tenant"),
        {"schema": "public"},
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    nombre_periodo = Column(String(100), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    status = Column(String(20), default="abierto", nullable=False)

    payroll_details = relationship("RHPayrollDetail", back_populates="period", cascade="all, delete-orphan")


class RHPayrollDetail(Base):
    """Valores variables capturados por empleado, período y concepto."""
    __tablename__ = "rh_payroll_details"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "period_id", "concept_id", name="unique_employee_period_concept"),
        {"schema": "public"},
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("public.rh_employees.id", ondelete="CASCADE"), nullable=False)
    period_id = Column(Integer, ForeignKey("public.rh_payroll_periods.id", ondelete="CASCADE"), nullable=False)
    concept_id = Column(Integer, ForeignKey("public.rh_concepts.id", ondelete="CASCADE"), nullable=False)
    monto = Column(Numeric(15, 2), nullable=False)
    cantidad_horas_dias = Column(Numeric(10, 2), default=0.00, nullable=False)

    employee = relationship("RHEmployee", back_populates="payroll_details")
    period = relationship("RHPayrollPeriod", back_populates="payroll_details")
    concept = relationship("RHConcept", back_populates="payroll_details")
