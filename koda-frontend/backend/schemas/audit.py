from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class AuditorSessionCreate(BaseModel):
    tenant_id: str
    auditor_name: str
    organization: str
    scope: str
    start_date: datetime
    end_date: datetime
    expires_in_hours: int = 8

class AuditorSessionResponse(BaseModel):
    id: int
    tenant_id: str
    auditor_name: str
    organization: str
    scope: str
    start_date: datetime
    end_date: datetime
    expires_at: datetime
    is_active: bool
    access_token: str  # Solo se mostrará una vez durante la creación

    model_config = ConfigDict(from_attributes=True)

class AuditLogResponse(BaseModel):
    id: int
    session_id: int
    endpoint_accessed: str
    timestamp: datetime
    ip_address: Optional[str]
    
    model_config = ConfigDict(from_attributes=True)

# Simulación de respuesta para el libro mayor (Ledger)
class LedgerEntry(BaseModel):
    date: datetime
    account_code: str
    account_name: str
    concept: str
    debit: float
    credit: float
    balance: float
