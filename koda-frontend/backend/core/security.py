import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import hmac
import hashlib
from fastapi import Depends, Header, HTTPException, status, Request
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
# CRÍTICO: El sistema NO debe arrancar sin claves secretas reales. Sin fallback hardcodeado.
SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
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

def get_token_from_request(request: Request) -> Optional[str]:
    """
    Extrae el token JWT de la petición con la siguiente prioridad:
    1. Cookie httpOnly 'sgd_token' (más segura, no accesible por JS)
    2. Header 'Authorization: Bearer <token>' (fallback para APIs externas)
    Retorna None si no se encuentra token en ninguna fuente.
    """
    # 1. Cookie httpOnly (prioridad máxima — no vulnerable a XSS)
    cookie_token = request.cookies.get("sgd_token")
    if cookie_token:
        return cookie_token

    # 2. Header Authorization Bearer (fallback)
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    # 3. Query Parameter 'token' (?token=...)
    token_param = request.query_params.get("token")
    if token_param:
        return token_param

    return None

# Definición de dependencias con importación perezosa para romper la dependencia circular en tiempo de carga
def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from backend.services.auth import get_current_user_from_token
    resolved_token = get_token_from_request(request) or token
    return get_current_user_from_token(resolved_token, db)

def require_role(roles_permitidos: list[str]):
    from backend.services.auth import role_required
    return role_required(roles_permitidos)

# ==========================================
# AUDITORÍA (SENIAT / EXTERNOS)
# ==========================================

# Clave secreta dedicada a los logs para evitar colisiones si se compromete el SECRET_KEY principal
# Sin fallback hardcodeado: falla al importar si falta o es débil.
AUDIT_LOG_SECRET = os.getenv("AUDIT_LOG_SECRET", "").strip()
if not AUDIT_LOG_SECRET or len(AUDIT_LOG_SECRET) < 32:
    raise RuntimeError(
        "AUDIT_LOG_SECRET no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
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

# ==========================================
# CLAVE DE SERVICIO (BOT DE TELEGRAM — service-to-service)
# ==========================================
# El bot de Telegram vive en un backend COMPLETAMENTE SEPARADO
# (KODA_Remaster/sistema-corporativo/backend), con su propio JWT y su propia
# sesión de usuario (tabla `telegram_sessions` de ESE backend). No comparte
# sesión de usuario con este ERP: en vez de federar login, este backend
# expone un pequeño conjunto de endpoints de servicio (`routers/bot_api.py`)
# protegidos por una clave compartida fija, nunca por un JWT de usuario.
#
# CRÍTICO: sin fallback hardcodeado, igual que SECRET_KEY/AUDIT_LOG_SECRET.
BOT_INTERNAL_API_KEY = os.getenv("BOT_INTERNAL_API_KEY", "").strip()
if not BOT_INTERNAL_API_KEY or len(BOT_INTERNAL_API_KEY) < 32:
    raise RuntimeError(
        "BOT_INTERNAL_API_KEY no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
    )


def verify_bot_api_key(x_bot_api_key: Optional[str] = Header(default=None, alias="X-Bot-Api-Key")) -> bool:
    """
    Dependencia de FastAPI para los endpoints de servicio del bot de
    Telegram (`routers/bot_api.py`). Deliberadamente NUNCA se combina con
    `get_current_user`/JWT: es un límite de confianza distinto (llamada
    servidor-a-servidor con una clave compartida, no una sesión de usuario).

    No deriva ningún tenant: cada endpoint que dependa de esta función debe
    exigir explícitamente un `tenant_id` en la petición y aplicarlo a todas
    sus consultas, ya que aquí no existe sesión de usuario de la cual
    inferirlo.
    """
    if not x_bot_api_key or not hmac.compare_digest(x_bot_api_key, BOT_INTERNAL_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key de servicio inválida o ausente.",
        )
    return True


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

    resolved_token = get_token_from_request(request) or token
    if not resolved_token:
        raise credentials_exception

    try:
        payload = jwt.decode(resolved_token, SECRET_KEY, algorithms=[ALGORITHM])
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

