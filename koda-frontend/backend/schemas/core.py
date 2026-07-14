from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional

# ==========================================
# ESQUEMAS PARA USUARIO
# ==========================================

class UserBase(BaseModel):
    nombre: str = Field(..., min_length=3, max_length=100)
    email: EmailStr
    rol: str = Field(default="Operador", pattern="^(Admin|Gerente|Operador)$")

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str

import uuid

class UserResponse(BaseModel):
    id: uuid.UUID
    nombre: str
    email: EmailStr
    rol: str

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ESQUEMAS PARA TOKENS JWT
# ==========================================

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    rol: Optional[str] = None

# ==========================================
# ESQUEMAS PARA TASA DE CAMBIO
# ==========================================

class TasaCambioBase(BaseModel):
    valor_ves: float = Field(..., gt=0, description="Tasa de cambio en Bolívares por Dólar (Bs/$)")
    fuente: str = Field(default="BCV", min_length=2, max_length=100)

class TasaCambioCreate(TasaCambioBase):
    pass

class TasaCambioResponse(TasaCambioBase):
    id: int
    fecha: datetime

    model_config = ConfigDict(from_attributes=True)
