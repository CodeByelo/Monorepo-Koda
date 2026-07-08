import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import hmac
import hashlib
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv

import logging as _logging

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.audit import AuditorSession
from backend.schemas.core import TokenData

load_dotenv()

_sec_logger = _logging.getLogger("koda_security")

# Configuraciones de Seguridad desde Variables de Entorno
# CRÍTICO: El sistema NO debe arrancar sin claves secretas reales.
SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY:
    raise RuntimeError(
        "FATAL: La variable de entorno SECRET_KEY no está configurada. "
        "El sistema no puede arrancar sin una clave secreta para firmar tokens JWT."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 horas por defecto

# Contexto de Hasheo con Passlib + Bcrypt y PBKDF2
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

# Esquema OAuth2 para extraer el token Bearer (auto_error=False para bypass en dev)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

# ==========================================
# FUNCIONES DE HASHEO DE CONTRASEÑAS
# ==========================================

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# ==========================================
# MANEJO DE TOKENS JWT
# ==========================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ==========================================
# DEPENDENCIAS DE AUTENTICACIÓN
# ==========================================

from backend.services.auth import get_current_user_from_token, role_required as auth_role_required

def get_current_user(db: Session = Depends(get_db)):
    # Mantener compatibilidad exportando la función
    pass # Will be injected by fastapi but it's better to just use get_current_user_from_token directly in depends.

get_current_user = get_current_user_from_token
require_role = auth_role_required

# ==========================================
# AUDITORÍA (SENIAT / EXTERNOS)
# ==========================================

# Clave secreta dedicada a los logs para evitar colisiones si se compromete el SECRET_KEY principal
AUDIT_LOG_SECRET = os.getenv("AUDIT_LOG_SECRET", "").strip()
if not AUDIT_LOG_SECRET:
    raise RuntimeError(
        "FATAL: La variable de entorno AUDIT_LOG_SECRET no está configurada. "
        "El sistema no puede arrancar sin una clave secreta para firmar los logs de auditoría."
    )

def generate_log_signature(session_id: int, endpoint: str, timestamp: datetime, ip_address: str) -> str:
    """Genera una firma SHA-256 para garantizar la inmutabilidad de los logs."""
    data = f"{session_id}|{endpoint}|{timestamp.isoformat()}|{ip_address}"
    signature = hmac.new(
        AUDIT_LOG_SECRET.encode(),
        data.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature

def verify_log_signature(session_id: int, endpoint: str, timestamp: datetime, ip_address: str, expected_signature: str) -> bool:
    """Verifica si la firma de un log coincide con los datos (para auditorías de integridad)."""
    calculated = generate_log_signature(session_id, endpoint, timestamp, ip_address)
    return hmac.compare_digest(calculated, expected_signature)

def get_current_auditor(request: Request, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> AuditorSession:
    """
    Dependencia de seguridad que valida que la petición proviene de un auditor válido:
    1. Token debe ser válido.
    2. Sesión debe existir y estar activa.
    3. Sesión no debe haber expirado.
    (El tenant_id se validará dentro del endpoint o aquí si se pasa por header).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales de auditoría",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        auditor_session_id = payload.get("sub")
        if not auditor_session_id:
            raise credentials_exception
        auditor_session_id = str(auditor_session_id)
    except jwt.PyJWTError:
        raise credentials_exception

    session = db.query(AuditorSession).filter(AuditorSession.id == int(auditor_session_id)).first()
    
    if session is None:
        raise credentials_exception
        
    if not session.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La sesión de auditoría ha sido revocada o desactivada.")
        
    if datetime.now(timezone.utc) > session.expires_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La sesión de auditoría ha expirado.")

    # Puedes agregar aquí lógica para extraer 'tenant-id' de los headers de 'request'
    # y compararlo contra session.tenant_id si la app es estrictamente multi-tenant por headers.
    
    return session

