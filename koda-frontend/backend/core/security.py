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
    if not hashed_password or not isinstance(hashed_password, str):
        return False
    try:
        if pwd_context.verify(plain_password, hashed_password):
            return True
    except Exception:
        pass

    # Fallback para hashes bcrypt ($2a$, $2b$, $2y$)
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except Exception:
            pass

    # Fallback para hashes sha256 planos
    try:
        sha_candidate = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        if hmac.compare_digest(sha_candidate, hashed_password):
            return True
    except Exception:
        pass

    return False

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


# ==========================================
# CLAVE DE SERVICIO (SINCRONIZACIÓN DE NOMBRE DE ORGANIZACIÓN — service-to-service)
# ==========================================
# Este backend (koda-frontend) es quien INICIA la llamada saliente hacia
# KODA_Remaster/sistema-corporativo/backend (`PUT
# /internal/organizations/{tenant_id}/name`, ver
# `backend.services.org_sync_client`) para propagar el "Nombre Comercial
# Público" configurado en Perfil de Empresa (`routers/entidades.py::
# actualizar_perfil`) hacia `organizations.name` de ESE backend, de modo que
# el nombre mostrado justo después del login en `frontend-enterprise` quede
# consistente con el del ERP. Mismo patrón que BOT_INTERNAL_API_KEY pero en
# la dirección inversa (aquí este backend es el EMISOR, no el receptor).
#
# CRÍTICO: sin fallback hardcodeado, igual que SECRET_KEY/AUDIT_LOG_SECRET/BOT_INTERNAL_API_KEY.
ORG_SYNC_API_KEY = os.getenv("ORG_SYNC_API_KEY", "").strip()
if not ORG_SYNC_API_KEY or len(ORG_SYNC_API_KEY) < 32:
    raise RuntimeError(
        "ORG_SYNC_API_KEY no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
    )


# ==========================================
# CLAVE DE SERVICIO (REENVÍO INTERNO DEL WEBHOOK DE TELEGRAM DE LOGÍSTICA — service-to-service)
# ==========================================
# El endpoint POST /api/logistica/telegram-webhook (routers/logistica.py) NO
# registra su propio webhook con la API de Telegram: no existe ningún
# setWebhook/ensure_telegram_webhook en este backend (koda-frontend). Recibe
# ÚNICAMENTE updates ya reenviados por
# KODA_Remaster/sistema-corporativo/backend/routers/telegram_router.py, que
# es quien SÍ tiene el webhook registrado con Telegram y quien ya validó
# TELEGRAM_WEBHOOK_SECRET (X-Telegram-Bot-Api-Secret-Token) antes de reenviar
# el update.dict() validado hacia LOGISTICS_WEBHOOK_URL.
#
# Por lo tanto esto NO es un secret_token de Telegram (no aplica: este
# backend nunca llama a la API de Telegram para registrar webhook), sino una
# clave compartida de servicio-a-servicio — mismo patrón que
# BOT_INTERNAL_API_KEY, pero en la dirección inversa (aquí ESTE backend es el
# RECEPTOR del reenvío, no el emisor).
#
# Sin esta validación, cualquiera en internet puede hacer POST directo a
# /api/logistica/telegram-webhook con un chat_id inventado (el de un chofer o
# "admin" ya vinculado) y falsificar confirmaciones de despacho, marcar
# entregas como ENTREGADO o reportar incidencias falsas, sin pasar nunca por
# Telegram ni por la validación de KODA_Remaster.
#
# CRÍTICO: sin fallback hardcodeado, igual que SECRET_KEY/AUDIT_LOG_SECRET/
# BOT_INTERNAL_API_KEY/ORG_SYNC_API_KEY. Debe configurarse con el MISMO valor
# en ambos backends (koda-frontend y KODA_Remaster/sistema-corporativo).
LOGISTICS_INTERNAL_FORWARD_KEY = os.getenv("LOGISTICS_INTERNAL_FORWARD_KEY", "").strip()
if not LOGISTICS_INTERNAL_FORWARD_KEY or len(LOGISTICS_INTERNAL_FORWARD_KEY) < 32:
    raise RuntimeError(
        "LOGISTICS_INTERNAL_FORWARD_KEY no configurado o inseguro: debe definirse como "
        "variable de entorno con un valor de al menos 32 caracteres. No existe valor por "
        "defecto. Debe coincidir EXACTAMENTE con el valor configurado en "
        "KODA_Remaster/sistema-corporativo/backend (mismo secreto compartido en ambos lados)."
    )


def verify_logistics_forward_key(
    x_internal_forward_key: Optional[str] = Header(default=None, alias="X-Internal-Forward-Key")
) -> bool:
    """
    Dependencia de FastAPI para el webhook de Telegram de logística
    (`routers/logistica.py::telegram_webhook`). Igual que
    `verify_bot_api_key`: un límite de confianza servidor-a-servidor, NUNCA
    combinado con JWT de usuario. Solo KODA_Remaster (que ya validó el
    secret_token real de Telegram) conoce esta clave y puede reenviar updates
    aquí.
    """
    if not x_internal_forward_key or not hmac.compare_digest(x_internal_forward_key, LOGISTICS_INTERNAL_FORWARD_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clave de reenvío interno inválida o ausente.",
        )
    return True


# ==========================================
# CLAVE DE SERVICIO (PUENTE DE SSO — service-to-service, AUTENTICACIÓN)
# ==========================================
# KODA_Remaster/sistema-corporativo/backend (el sistema institucional donde
# el usuario ya inició sesión) llama a
# POST /internal/auth/sso-bridge/issue (routers/sso_bridge.py) para emitir,
# en nombre de un `profile_id` ya autenticado del OTRO lado, un
# exchange_code de un solo uso que el "Módulo de Facturación" embebido
# (BillingModule.tsx de frontend-enterprise) usa para iniciar sesión real en
# ESTE backend (ver routers/auth.py::exchange_code, /auth/exchange).
#
# Deliberadamente un secreto PROPIO, distinto de BOT_INTERNAL_API_KEY y
# ORG_SYNC_API_KEY: aquellos sincronizan datos (ventas/stock/nombre de
# organización); este endpoint mintea sesiones de usuario real -- un límite
# de confianza de mínimo privilegio, tratado con el mismo cuidado que un
# endpoint de login.
#
# CRÍTICO: sin fallback hardcodeado, igual que el resto de las claves de
# servicio de este backend. Debe configurarse con el MISMO valor en las
# variables de entorno de Render de AMBOS backends.
SSO_BRIDGE_INTERNAL_KEY = os.getenv("SSO_BRIDGE_INTERNAL_KEY", "").strip()
if not SSO_BRIDGE_INTERNAL_KEY or len(SSO_BRIDGE_INTERNAL_KEY) < 32:
    raise RuntimeError(
        "SSO_BRIDGE_INTERNAL_KEY no configurado o inseguro: debe definirse como "
        "variable de entorno con un valor de al menos 32 caracteres. No existe valor "
        "por defecto. Debe coincidir EXACTAMENTE con el valor configurado en "
        "KODA_Remaster/sistema-corporativo/backend (mismo secreto compartido en ambos lados)."
    )


def verify_sso_bridge_key(
    x_sso_bridge_key: Optional[str] = Header(default=None, alias="X-SSO-Bridge-Key")
) -> bool:
    """
    Dependencia de FastAPI para `routers/sso_bridge.py`. Igual que
    `verify_bot_api_key`/`verify_logistics_forward_key`: un límite de
    confianza servidor-a-servidor, NUNCA combinado con JWT de usuario. Solo
    KODA_Remaster (que ya autenticó al usuario de su propio lado) conoce
    esta clave y puede pedir la emisión de un exchange_code en su nombre.
    """
    if not x_sso_bridge_key or not hmac.compare_digest(x_sso_bridge_key, SSO_BRIDGE_INTERNAL_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clave de puente SSO inválida o ausente.",
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

