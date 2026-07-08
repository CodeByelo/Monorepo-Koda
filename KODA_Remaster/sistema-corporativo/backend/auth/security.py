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
from passlib.context import CryptContext
import bcrypt
from dotenv import load_dotenv

load_dotenv()

# CONFIGURACIÓN DE SEGURIDAD
SECRET_KEY = os.getenv("JWT_SECRET", "tu_clave_secreta_muy_segura_cambiala_en_produccion")
ALGORITHM = "HS256"

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

# ── 1. ACCESS TOKEN (15 minutos, se refresca automáticamente vía refresh_token)
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ── 2. REFRESH TOKEN FLOW (Almacenamiento en Redis para revocación) ──────────
async def create_refresh_token(user_id: str, metadata: dict) -> str:
    token = secrets.token_hex(32)
    try:
        from redis.asyncio import Redis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        r = Redis.from_url(redis_url)
        key = f"koda:refresh_token:{token}"
        val = json.dumps({"user_id": user_id, "metadata": metadata})
        # TTL de 7 días
        await r.setex(key, int(timedelta(days=7).total_seconds()), val)
        await r.close()
    except Exception as e:
        # Fallback de logs (no interrumpe el flujo principal si Redis falla temporalmente)
        import logging
        logging.getLogger("sistema_corporativo").warning(f"Error guardando refresh_token en Redis: {e}")
    return token

async def verify_refresh_token(token: str) -> Optional[dict]:
    try:
        from redis.asyncio import Redis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        r = Redis.from_url(redis_url)
        key = f"koda:refresh_token:{token}"
        val = await r.get(key)
        await r.close()
        if val:
            return json.loads(val)
    except Exception as e:
        import logging
        logging.getLogger("sistema_corporativo").warning(f"Error verificando refresh_token en Redis: {e}")
    return None

async def revoke_refresh_token(token: str):
    try:
        from redis.asyncio import Redis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
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
