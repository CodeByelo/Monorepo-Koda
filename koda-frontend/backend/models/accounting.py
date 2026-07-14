from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.core.database import Base

class AsientoContable(Base):
    """Cabecera del Asiento en el Libro Diario"""
    __tablename__ = "asientos_contables"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    concepto = Column(String(255), nullable=False)
    referencia = Column(String(100), nullable=False) # Ej. AJU-000001, FAC-000001
    total_debe_usd = Column(Numeric(15, 2), nullable=False)
    total_haber_usd = Column(Numeric(15, 2), nullable=False)
    tasa_cambio_bs = Column(Numeric(10, 4), nullable=False)
    estado = Column(String(20), default="ACTIVO", nullable=False)

    detalles = relationship("AsientoDetalle", back_populates="asiento", cascade="all, delete-orphan")

    @property
    def total_debe(self):
        return self.total_debe_usd

    @total_debe.setter
    def total_debe(self, value):
        self.total_debe_usd = value

    @property
    def total_haber(self):
        return self.total_haber_usd

    @total_haber.setter
    def total_haber(self, value):
        self.total_haber_usd = value

    @property
    def descripcion(self):
        return self.concepto

    @property
    def desc(self):
        return self.concepto

    @property
    def monto(self):
        return self.total_debe_usd

    @property
    def amount(self):
        return self.total_debe_usd

    @property
    def estatus(self):
        return "Mayorizado" if self.estado == "ACTIVO" else "Borrador"

    @property
    def status(self):
        return "Mayorizado" if self.estado == "ACTIVO" else "Borrador"

    @property
    def origen(self):
        if self.referencia and self.referencia.startswith("FAC-"):
            return "Ventas"
        return "General"

    @property
    def origin(self):
        if self.referencia and self.referencia.startswith("FAC-"):
            return "Ventas"
        return "General"


class AsientoDetalle(Base):
    """Cuentas afectadas y montos correspondientes en el Asiento"""
    __tablename__ = "asiento_detalles"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    asiento_id = Column(Integer, ForeignKey("public.asientos_contables.id"), nullable=False)
    cuenta_codigo = Column(String(50), nullable=False)
    cuenta_nombre = Column(String(150), nullable=False)
    debe_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    haber_usd = Column(Numeric(15, 2), default=0.00, nullable=False)
    centro_costo = Column(String(50), nullable=True)

    asiento = relationship("AsientoContable", back_populates="detalles")

    @property
    def debe(self):
        return self.debe_usd

    @debe.setter
    def debe(self, value):
        self.debe_usd = value

    @property
    def haber(self):
        return self.haber_usd

    @haber.setter
    def haber(self, value):
        self.haber_usd = value


class CierrePeriodo(Base):
    """Registro de cierres mensuales de periodos contables"""
    __tablename__ = "cierres_periodos"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    periodo = Column(String(7), unique=True, nullable=False) # YYYY-MM
    fecha_cierre = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    usuario = Column(String(100), nullable=True)
