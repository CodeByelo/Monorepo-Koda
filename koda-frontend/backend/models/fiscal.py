from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime
from datetime import datetime, timezone
from backend.core.database import Base

class ReglaFiscal(Base):
    __tablename__ = "reglas_fiscales"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))
    
    id = Column(Integer, primary_key=True, index=True)
    # Nombre del impuesto. Ej: "IVA", "IGTF", "ISLR"
    # Quitamos el unique=True para permitir guardar el historial de tasas pasadas (Versionamiento)
    nombre = Column(String(50), index=True, nullable=False)
    # Tasa en formato decimal. Ej: 0.1600 para 16%
    tasa = Column(Numeric(10, 4), nullable=False)
    # Control de vigencia: permite desactivar impuestos obsoletos
    activa = Column(Boolean, default=True)
    fecha_vigencia = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class INPCIndice(Base):
    __tablename__ = "inpc_indices"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))
    
    id = Column(Integer, primary_key=True, index=True)
    anio = Column(Integer, index=True, nullable=False)
    mes = Column(Integer, index=True, nullable=False)
    indice = Column(Numeric(15, 4), nullable=False)
    fecha_registro = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class CorrelativoFiscal(Base):
    """
    Controlador central de correlativos para evitar gaps (saltos) en la facturación.
    Se utilizará con SELECT FOR UPDATE para garantizar que no se pierdan números
    si una transacción falla.
    """
    __tablename__ = "correlativos_fiscales"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    tipo_documento = Column(String(50), index=True, nullable=False) # Ej: 'FACTURA', 'NOTA_CREDITO'
    prefijo = Column(String(10), nullable=False) # Ej: 'FAC-'
    siguiente_numero = Column(Integer, default=1, nullable=False)
