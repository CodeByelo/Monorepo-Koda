from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class UsuarioBase(BaseModel):
    username: str
    nombre: str
    apellido: str
    email: EmailStr
    rol_id: Optional[int] = 3
    gerencia_nombre: Optional[str] = None
    gerencia_id: Optional[int] = None

class UsuarioCreate(UsuarioBase):
    password: str

class UsuarioResponse(UsuarioBase):
    id: UUID
    estado: bool
    tenant_id: Optional[UUID]

    class Config:
        from_attributes = True

class SwitchOrgRequest(BaseModel):
    organization_id: UUID

class UsuarioListResponse(BaseModel):
    id: UUID
    username: str
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    email: EmailStr
    rol_id: Optional[int] = None
    role: Optional[str] = None
    estado: bool

    class Config:
        from_attributes = True

class GerenciaResponse(BaseModel):
    id: int
    nombre: str
    siglas: Optional[str] = None
    categoria: Optional[str] = None

    class Config:
        from_attributes = True

class TelegramSessionResponse(BaseModel):
    id: UUID
    telegram_chat_id: int
    user_id: UUID
    tenant_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class BotCommandBase(BaseModel):
    trigger_command: str
    response_text: str
    internal_action: Optional[str] = None
    is_active: bool = True

class BotCommandCreate(BotCommandBase):
    tenant_id: UUID

class BotCommandResponse(BotCommandBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True