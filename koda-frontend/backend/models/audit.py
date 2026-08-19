from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from datetime import datetime, timezone
from backend.core.database import Base

class AuditorSession(Base):
    __tablename__ = "auditor_sessions"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(50), nullable=False, index=True)
    auditor_name = Column(String(100), nullable=False)
    organization = Column(String(100), nullable=False)  # Ej: SENIAT
    scope = Column(String(100), nullable=False)  # Ej: 'finance', 'inventory', 'all'
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    token_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = {'schema': 'public'}
    tenant_id = Column(UUID(as_uuid=True))

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("public.auditor_sessions.id"), nullable=False, index=True)
    endpoint_accessed = Column(String(255), nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    ip_address = Column(String(50), nullable=True)
    row_signature = Column(String(64), nullable=False)  # SHA-256 HMAC para detectar alteraciones
