from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.core.database import Base
from backend.models.erp_extended import Vehiculo

class Crew(Base):
    """Hoja de tripulación: vehículo + chofer (crews)."""
    __tablename__ = "crews"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    nombre = Column(String(100), nullable=False)
    vehiculo_id = Column(Integer, ForeignKey("public.vehiculos.id"), nullable=False)
    chofer_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehiculo = relationship("Vehiculo")
    chofer = relationship("Profile")
    members = relationship("CrewMember", back_populates="crew", cascade="all, delete-orphan")

class CrewMember(Base):
    """Ayudantes asociados a una tripulación específica (crew_members)."""
    __tablename__ = "crew_members"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    crew_id = Column(Integer, ForeignKey("public.crews.id", ondelete="CASCADE"), nullable=False)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=False)
    rol = Column(String(30), nullable=False, default="AYUDANTE")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    crew = relationship("Crew", back_populates="members")
    profile = relationship("Profile")

class LogisticsPlan(Base):
    """Plan logístico diario o semanal (logistics_plans)."""
    __tablename__ = "logistics_plans"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    fecha_planificacion = Column(Date, nullable=False)
    estado = Column(String(20), default="BORRADOR", nullable=False)  # BORRADOR, APROBADO
    creado_por = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=True)
    aprobado_por = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    creado_por_user = relationship("Profile", foreign_keys=[creado_por])
    aprobado_por_user = relationship("Profile", foreign_keys=[aprobado_por])
    dispatches = relationship("DispatchRecord", back_populates="plan", cascade="all, delete-orphan")

class DispatchRecord(Base):
    """Hojas de ruta / despachos individuales vinculados a un plan (dispatch_records)."""
    __tablename__ = "dispatch_records"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    plan_id = Column(Integer, ForeignKey("public.logistics_plans.id", ondelete="CASCADE"), nullable=False)
    crew_id = Column(Integer, ForeignKey("public.crews.id"), nullable=False)
    ruta = Column(String(255), nullable=False)
    estado = Column(String(30), default="PENDIENTE", nullable=False)  # PENDING, EN_RUTA, DELIVERED, CANCELLED
    detalles = Column(String(500))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    plan = relationship("LogisticsPlan", back_populates="dispatches")
    crew = relationship("Crew")

class NotificationJob(Base):
    """Cola de trabajos de envío de notificaciones Telegram (notification_jobs)."""
    __tablename__ = "notification_jobs"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    dispatch_id = Column(Integer, ForeignKey("public.dispatch_records.id", ondelete="CASCADE"), nullable=True)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=True)
    telegram_chat_id = Column(String(50))
    mensaje = Column(String, nullable=False)
    estado = Column(String(20), default="PENDING", nullable=False)  # PENDING, PROCESSING, SENT, FAILED
    intentos = Column(Integer, default=0, nullable=False)
    error_log = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    dispatch = relationship("DispatchRecord")
    profile = relationship("Profile")
