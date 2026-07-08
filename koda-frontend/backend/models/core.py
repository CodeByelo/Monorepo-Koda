from sqlalchemy import Column, Integer, String, Numeric, DateTime
from datetime import datetime, timezone
from backend.core.database import Base

import uuid
from sqlalchemy.dialects.postgresql import UUID

class Tenant(Base):
    """
    Maestro de Empresas (Multi-Tenant).
    Administra el estado y licenciamiento global de una cuenta corporativa.
    """
    __tablename__ = "tenants"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    nombre_empresa = Column(String(150), nullable=False)
    estado_licencia = Column(String(50), default="ACTIVA", nullable=False) # ACTIVA, SUSPENDIDA, EXPIRADA
    fecha_vencimiento = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    username = Column(String(100), unique=True, nullable=False)
    nombre = Column(String(100))
    apellido = Column(String(100))
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255))
    rol_id = Column(Integer, default=3)
    gerencia_id = Column(Integer)
    estado = Column(Integer, default=1)
    from sqlalchemy import ForeignKey
    tenant_id = Column(UUID(as_uuid=True), ForeignKey('public.tenants.id'), nullable=True)
    permisos = Column(String)
    ultima_conexion = Column(DateTime)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def rol(self):
        # Helper to map rol_id to names based on roles table
        role_map = {
            1: "CEO",
            2: "Admin",
            3: "Usuario",
            4: "Desarrollador",
            5: "Gerente"
        }
        return role_map.get(self.rol_id, "Usuario")

class TasaCambio(Base):
    __tablename__ = "tasas_cambio"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    valor_ves = Column(Numeric(10, 4), nullable=False)  # Valor en Bolívares por Dólar (Bs/$)
    fecha = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    fuente = Column(String(100), default="BCV", nullable=False)


class LoginLockout(Base):
    __tablename__ = "login_lockouts"
    __table_args__ = {'schema': 'public'}

    username = Column(String(150), primary_key=True, index=True)
    failed_count = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
