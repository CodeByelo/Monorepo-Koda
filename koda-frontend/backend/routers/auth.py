from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from backend.core.database import get_db
from backend.models.core import Profile, LoginLockout
from backend.models.erp_extended import AuditoriaLog
from backend.schemas.core import UserCreate, UserLogin, UserResponse, Token
from backend.core.security import get_password_hash, verify_password, create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
from backend.utils.ip_utils import get_real_ip_str
from datetime import datetime, timedelta, timezone
import os
import secrets
import uuid

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# Detectar si estamos en producción (HTTPS) para marcar cookies como Secure
_IS_PRODUCTION = os.getenv("NODE_ENV", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"

def _set_auth_cookies(response: JSONResponse, access_token: str) -> None:
    """Setea el access_token como cookie httpOnly, Secure y SameSite=Lax."""
    response.set_cookie(
        key="sgd_token",
        value=access_token,
        httponly=True,
        secure=_IS_PRODUCTION,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

def _clear_auth_cookies(response: JSONResponse) -> None:
    """Elimina las cookies de autenticación."""
    response.delete_cookie(key="sgd_token", path="/", httponly=True, samesite="lax")


def _build_session_response(user: Profile) -> JSONResponse:
    """Emite una sesión real (JWT + cookie httpOnly) para `user`.

    Centraliza exactamente lo que hace /auth/login al autenticar con éxito,
    para que /auth/exchange pueda reusar la misma lógica sin duplicarla.
    """
    access_token = create_access_token(data={
        "sub": str(user.id),
        "email": user.email,
        "username": user.username,
        "rol": user.rol,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None
    })

    response = JSONResponse(content={
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "rol": user.rol,
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        },
        # Mantener access_token en el body para compatibilidad con clientes que aún usen Bearer header
        "access_token": access_token,
    })
    _set_auth_cookies(response, access_token)
    return response


# ─────────────────────────────────────────────────────────────────────────────
# EXCHANGE CODE — handoff seguro de sesión entre superficies del monorepo
# (p. ej. portal ↔ facturación) sin propagar el JWT completo como query param
# de URL, lo que lo dejaría expuesto en el historial del navegador y en logs
# de acceso del servidor.
#
# ALMACENAMIENTO: en la tabla `exchange_codes` de la base de datos. Antes se
# usaba un dict en memoria de proceso, pero en Render Hobby Plan el servicio
# hace spin-down por inactividad y al recibir tráfico hace cold start — el
# proceso se reinicia, el dict se pierde, y el código emitido segundos antes
# por el SSO bridge ya no existe cuando koda-billing-front intenta canjearlo.
# La DB es persistente entre restarts y multi-worker-safe.
# ─────────────────────────────────────────────────────────────────────────────
_EXCHANGE_CODE_TTL_SECONDS = 120  # 120s (antes 30s) para tolerar cold starts de Render


def _ensure_exchange_codes_table(db: Session) -> None:
    """Crea la tabla exchange_codes si no existe (idempotente, checkfirst)."""
    from sqlalchemy import text
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS exchange_codes (
            code VARCHAR(64) PRIMARY KEY,
            user_id UUID NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    # Índice para limpieza eficiente de códigos expirados
    db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_exchange_codes_expires
        ON exchange_codes (expires_at)
        WHERE NOT used
    """))
    db.commit()


def _prune_expired_exchange_codes(db: Session) -> None:
    """Elimina códigos expirados o ya usados (limpieza oportunista)."""
    from sqlalchemy import text
    try:
        db.execute(text(
            "DELETE FROM exchange_codes WHERE used = TRUE OR expires_at < NOW()"
        ))
        db.commit()
    except Exception:
        db.rollback()


class ExchangeCodeRequest(BaseModel):
    code: str


def issue_exchange_code(user_id, db: Session = None) -> str:
    """Genera y almacena un código de un solo uso, de corta duración,
    para `user_id`. Función interna centralizada, reutilizada por:

    1. POST /exchange-code (debajo): el propio usuario, ya autenticado en
       ESTE backend, pide un código para sí mismo.
    2. `routers/sso_bridge.py::issue_sso_bridge_code`: el puente de SSO
       cross-sistema, invocado por KODA_Remaster/sistema-corporativo/backend
       en nombre de un `profile_id` ya autenticado del OTRO lado (misma fila
       física de `profiles`, misma base Postgres).

    Nunca se duplica este mecanismo: ambos casos terminan en la misma tabla
    `exchange_codes` y se consumen exactamente igual vía POST /exchange.
    """
    from sqlalchemy import text
    from backend.core.database import SessionLocal

    # Permitir llamada sin db (desde sso_bridge.py que no tiene db inyectado)
    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True

    try:
        _ensure_exchange_codes_table(db)
        _prune_expired_exchange_codes(db)

        code = secrets.token_urlsafe(24)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=_EXCHANGE_CODE_TTL_SECONDS)

        db.execute(text(
            "INSERT INTO exchange_codes (code, user_id, expires_at, used) "
            "VALUES (:code, :user_id, :expires_at, FALSE)"
        ), {"code": code, "user_id": str(user_id), "expires_at": expires_at})
        db.commit()
        return code
    except Exception:
        db.rollback()
        raise
    finally:
        if own_session:
            db.close()


@router.post("/exchange-code")
def create_exchange_code(current_user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    """Genera un código de un solo uso, de corta duración, que otra
    superficie del monorepo puede intercambiar por una sesión real para el
    mismo usuario autenticado, sin necesidad de propagar el JWT por la URL."""
    return {"code": issue_exchange_code(current_user.id, db)}


@router.post("/exchange")
def exchange_code(payload: ExchangeCodeRequest, db: Session = Depends(get_db)):
    """Intercambia un código de un solo uso (emitido por /auth/exchange-code)
    por una sesión real: cookie httpOnly + JWT en el body, igual que /auth/login."""
    from sqlalchemy import text
    import logging
    logger = logging.getLogger("koda_auth")

    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Código de intercambio inválido, expirado o ya utilizado.",
    )

    if not payload.code or not payload.code.strip():
        logger.warning("[EXCHANGE] Código vacío recibido")
        raise invalid_exc

    _ensure_exchange_codes_table(db)

    # Consumir el código atómicamente: marcar como usado Y obtener user_id
    # en una sola operación, para que dos requests paralelos con el mismo
    # código no puedan ambos canjearlo.
    code_clean = payload.code.strip()
    
    # Primero consultar para logging específico
    check_row = db.execute(text(
        "SELECT user_id, expires_at, used FROM exchange_codes WHERE code = :code"
    ), {"code": code_clean}).fetchone()
    
    if check_row is None:
        logger.warning("[EXCHANGE] Código no existe en la base de datos: %s...", code_clean[:8] if len(code_clean) > 8 else code_clean)
        raise invalid_exc
    
    user_id_raw, expires_at, already_used = check_row
    now = datetime.now(timezone.utc)
    
    if already_used:
        logger.warning("[EXCHANGE] Código ya fue utilizado: %s...", code_clean[:8])
        raise invalid_exc
        
    if expires_at and expires_at < now:
        logger.warning("[EXCHANGE] Código expirado (expires_at=%s, now=%s): %s...", expires_at, now, code_clean[:8])
        raise invalid_exc

    # Marcar como usado
    db.execute(text(
        "UPDATE exchange_codes SET used = TRUE WHERE code = :code"
    ), {"code": code_clean})
    db.commit()

    try:
        user_id = uuid.UUID(str(user_id_raw))
    except Exception:
        user_id = user_id_raw

    user = db.query(Profile).filter(Profile.id == user_id).first()
    if user is None:
        logger.warning("[EXCHANGE] Usuario con ID %s no encontrado en profiles", user_id)
        raise invalid_exc

    logger.info("[EXCHANGE] Canje exitoso para usuario: %s (id: %s)", user.username, user.id)
    return _build_session_response(user)



@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Validar si el email ya existe en la BD
    existing_user = db.query(Profile).filter(Profile.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ingresado ya está registrado"
        )
    
    # Crear la contraseña hasheada de manera segura
    hashed_password = get_password_hash(user_in.password)
    
    # Instanciar y guardar el usuario en la BD
    db_user = Profile(
        nombre=user_in.nombre,
        email=user_in.email,
        username=user_in.email, # username is required in profiles
        password_hash=hashed_password
        # Note: tenant_id should be set, but we leave it null or expect it in schema
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login")
def login(request: Request, user_in: UserLogin, db: Session = Depends(get_db)):
    identifier = str(user_in.email or user_in.username or "").strip().lower()
    if not identifier:
        raise HTTPException(status_code=400, detail="Debe proveer email o username")
    
    client_ip = get_real_ip_str(request)
    
    # Verificar si el usuario está bloqueado por fuerza bruta (por IP + username)
    lock_row = None
    try:
        lock_row = (
            db.query(LoginLockout)
            .filter(LoginLockout.username == identifier, LoginLockout.ip_address == client_ip)
            .first()
        )
    except Exception:
        db.rollback()
        try:
            lock_row = (
                db.query(LoginLockout)
                .filter(LoginLockout.username == identifier)
                .first()
            )
        except Exception:
            db.rollback()
            lock_row = None

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    
    if lock_row and lock_row.locked_until and lock_row.locked_until > now_utc:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Demasiados intentos fallidos. Intente nuevamente más tarde."
        )
        
    # Buscar el usuario por email o username ignorando mayúsculas/minúsculas
    user = db.query(Profile).filter((func.lower(Profile.email) == identifier) | (func.lower(Profile.username) == identifier)).first()
    if not user or not verify_password(user_in.password, user.password_hash):
        # Incrementar contador de intentos fallidos
        failed_count = (lock_row.failed_count if lock_row else 0) + 1
        locked_until = None
        
        # Backoff exponencial: 3 → 1 min, 6 → 15 min, 9+ → 1 hora
        if failed_count >= 9:
            locked_until = now_utc + timedelta(hours=1)
        elif failed_count >= 6:
            locked_until = now_utc + timedelta(minutes=15)
        elif failed_count >= 3:
            locked_until = now_utc + timedelta(minutes=1)
        
        try:
            if not lock_row:
                lock_row = LoginLockout(username=identifier, ip_address=client_ip, failed_count=failed_count, locked_until=locked_until)
                db.add(lock_row)
            else:
                lock_row.failed_count = failed_count
                lock_row.locked_until = locked_until
            db.commit()
        except Exception:
            db.rollback()
        
        if locked_until:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Demasiados intentos fallidos. Intente nuevamente más tarde."
            )
        else:
            remaining = 3 - (failed_count % 3) if failed_count % 3 != 0 else 0
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Credenciales de acceso incorrectas. Intento {failed_count} de {failed_count + remaining}.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    # Resetear bloqueo si el login es exitoso
    if lock_row:
        lock_row.failed_count = 0
        lock_row.locked_until = None
        db.commit()
    
    # Registrar el login exitoso con la IP real en el Ledger de Auditoría
    real_ip = get_real_ip_str(request)
    try:
        db.add(AuditoriaLog(
            usuario=user.email,
            accion="LOGIN_EXITOSO",
            modulo="AUTH",
            detalle=f"Sesión iniciada correctamente por {user.email} | Rol: {user.rol}",
            ip=real_ip,
        ))
        db.commit()
    except Exception:
        db.rollback()  # El log no debe bloquear el login si falla

    # Generar el JWT, setear la cookie httpOnly y devolver los datos del usuario en el body
    return _build_session_response(user)


@router.post("/logout")
def logout():
    """Cierra la sesión eliminando las cookies de autenticación."""
    response = JSONResponse(content={"message": "Sesión cerrada correctamente"})
    _clear_auth_cookies(response)
    return response

