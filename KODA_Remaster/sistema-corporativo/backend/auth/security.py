import os
import secrets
import hmac
import hashlib
import time
import struct
import base64
import json
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from fastapi import Header, HTTPException, status
from passlib.context import CryptContext
import bcrypt
from dotenv import load_dotenv

load_dotenv()

# CONFIGURACIÓN DE SEGURIDAD
# JWT_SECRET es obligatorio: sin fallback hardcodeado. Falla al importar si falta o es débil.
SECRET_KEY = os.getenv("JWT_SECRET", "")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
    )
ALGORITHM = "HS256"

# ==========================================
# CLAVE DE SERVICIO (SINCRONIZACIÓN DE NOMBRE DE ORGANIZACIÓN — service-to-service)
# ==========================================
# koda-frontend/backend (el ERP, un despliegue de Render COMPLETAMENTE
# SEPARADO de este backend) es quien INICIA la llamada saliente hacia
# `PUT /internal/organizations/{tenant_id}/name` (ver routers/internal_router.py)
# cuando un Admin/CEO de un tenant actualiza el "Nombre Comercial Público" en
# la pantalla Perfil de Empresa del ERP. Ese endpoint nunca usa
# `require_developer`/JWT de usuario: es un límite de confianza distinto
# (llamada servidor-a-servidor con una clave compartida), igual patrón que
# BOT_INTERNAL_API_KEY pero en la dirección inversa (aquí este backend es el
# RECEPTOR, no el emisor).
#
# CRÍTICO: sin fallback hardcodeado, igual que JWT_SECRET.
ORG_SYNC_API_KEY = os.getenv("ORG_SYNC_API_KEY", "").strip()
if not ORG_SYNC_API_KEY or len(ORG_SYNC_API_KEY) < 32:
    raise RuntimeError(
        "ORG_SYNC_API_KEY no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
    )


def verify_org_sync_api_key(x_internal_api_key: Optional[str] = Header(default=None, alias="X-Internal-Api-Key")) -> bool:
    """
    Dependencia de FastAPI para el endpoint interno de sincronización de
    nombre de organización (`routers/internal_router.py`). Deliberadamente
    NUNCA se combina con `require_developer`/JWT: es un límite de confianza
    distinto (llamada servidor-a-servidor con una clave compartida, no una
    sesión de usuario de Desarrollador ni de tenant).
    """
    if not x_internal_api_key or not hmac.compare_digest(x_internal_api_key, ORG_SYNC_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key de servicio inválida o ausente.",
        )
    return True

# Acepta hashes legacy bcrypt y genera hashes nuevos con pbkdf2_sha256.
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        if not hashed_password or not isinstance(hashed_password, str):
            return False
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            try:
                return bcrypt.checkpw(
                    plain_password.encode("utf-8"),
                    hashed_password.encode("utf-8"),
                )
            except Exception:
                return False
        return False

def get_password_hash(password):
    return pwd_context.hash(password)

# ── 1. ACCESS TOKEN (12 horas de validez por defecto para evitar desconexiones prematuras)
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=12))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Cache en memoria como respaldo cuando Redis no está disponible en producción
_MEMORY_REFRESH_TOKENS: dict = {}

# ── 2. REFRESH TOKEN FLOW (Redis con fallback en memoria) ──────────────────
async def create_refresh_token(user_id: str, metadata: dict) -> str:
    token = secrets.token_hex(32)
    payload = {"user_id": user_id, "metadata": metadata}
    exp_timestamp = time.time() + timedelta(days=7).total_seconds()
    
    # 1. Guardar en fallback de memoria siempre
    _MEMORY_REFRESH_TOKENS[token] = {
        "payload": payload,
        "exp": exp_timestamp
    }

    # 2. Intentar guardar en Redis si está disponible
    try:
        from redis.asyncio import Redis
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            r = Redis.from_url(redis_url)
            key = f"koda:refresh_token:{token}"
            val = json.dumps(payload)
            await r.setex(key, int(timedelta(days=7).total_seconds()), val)
            await r.close()
    except Exception as e:
        import logging
        logging.getLogger("sistema_corporativo").warning(f"Warning guardando refresh_token en Redis: {e}")
        
    return token

async def verify_refresh_token(token: str) -> Optional[dict]:
    # 1. Intentar desde Redis
    try:
        from redis.asyncio import Redis
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            r = Redis.from_url(redis_url)
            key = f"koda:refresh_token:{token}"
            val = await r.get(key)
            await r.close()
            if val:
                return json.loads(val)
    except Exception as e:
        import logging
        logging.getLogger("sistema_corporativo").warning(f"Warning verificando refresh_token en Redis: {e}")

    # 2. Fallback a memoria local
    if token in _MEMORY_REFRESH_TOKENS:
        entry = _MEMORY_REFRESH_TOKENS[token]
        if time.time() < entry["exp"]:
            return entry["payload"]
        else:
            del _MEMORY_REFRESH_TOKENS[token]

    return None

async def revoke_refresh_token(token: str):
    if token in _MEMORY_REFRESH_TOKENS:
        del _MEMORY_REFRESH_TOKENS[token]
    try:
        from redis.asyncio import Redis
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            r = Redis.from_url(redis_url)
            key = f"koda:refresh_token:{token}"
            await r.delete(key)
            await r.close()
    except Exception as e:
        import logging
        logging.getLogger("sistema_corporativo").warning(f"Error revocando refresh_token: {e}")

# ── 3. VALIDACIÓN TOTP PURA (RFC-6238 sin librerías externas) ───────────────
def generate_totp_secret() -> str:
    # 80 bits de entropía Base32 (16 caracteres legibles)
    return base64.b32encode(secrets.token_bytes(10)).decode('utf-8')

def get_hotp(secret: str, intervals_no: int) -> int:
    try:
        key = base64.b32decode(secret, casefold=True)
    except Exception:
        # Manejo robusto de errores de decodificación
        key = secret.encode()
    msg = struct.pack(">Q", intervals_no)
    hmac_result = hmac.new(key, msg, hashlib.sha1).digest()
    o = hmac_result[19] & 15
    token = (struct.unpack(">I", hmac_result[o:o+4])[0] & 0x7fffffff) % 1000000
    return token

def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    if not secret or not code:
        return False
    try:
        code_int = int(code)
    except ValueError:
        return False
    current_time = int(time.time() // 30)
    # Comprobar ventana de tiempo (drift) para prevenir fallas de red
    for i in range(-window, window + 1):
        if get_hotp(secret, current_time + i) == code_int:
            return True
    return False
