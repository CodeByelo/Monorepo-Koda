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
# NOTA DE ARQUITECTURA: el almacén de códigos vive en memoria de proceso.
# Es adecuado para este uso (volumen bajo, vida útil de 30s), pero en un
# despliegue multi-proceso/multi-worker se necesitaría un almacén compartido
# (p. ej. Redis) para que el código sea visible entre procesos/instancias.
# ─────────────────────────────────────────────────────────────────────────────
_EXCHANGE_CODE_TTL_SECONDS = 30
_exchange_codes: dict[str, dict] = {}


class ExchangeCodeRequest(BaseModel):
    code: str


def _prune_expired_exchange_codes(now: datetime) -> None:
    expired = [c for c, entry in _exchange_codes.items() if entry["expires_at"] < now or entry["used"]]
    for c in expired:
        _exchange_codes.pop(c, None)


@router.post("/exchange-code")
def create_exchange_code(current_user: Profile = Depends(get_current_user)):
    """Genera un código de un solo uso, de corta duración (30s), que otra
    superficie del monorepo puede intercambiar por una sesión real para el
    mismo usuario autenticado, sin necesidad de propagar el JWT por la URL."""
    now = datetime.now(timezone.utc)
    _prune_expired_exchange_codes(now)

    code = secrets.token_urlsafe(24)
    _exchange_codes[code] = {
        "user_id": str(current_user.id),
        "expires_at": now + timedelta(seconds=_EXCHANGE_CODE_TTL_SECONDS),
        "used": False,
    }
    return {"code": code}


@router.post("/exchange")
def exchange_code(payload: ExchangeCodeRequest, db: Session = Depends(get_db)):
    """Intercambia un código de un solo uso (emitido por /auth/exchange-code)
    por una sesión real: cookie httpOnly + JWT en el body, igual que /auth/login."""
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Código de intercambio inválido, expirado o ya utilizado.",
    )

    entry = _exchange_codes.get(payload.code)
    if entry is None:
        raise invalid_exc

    now = datetime.now(timezone.utc)
    already_used = entry["used"]
    expired = entry["expires_at"] < now

    # Invalidar de inmediato — de un solo uso — se encuentre válido o no,
    # para impedir reintentos (replay) sobre el mismo código.
    entry["used"] = True

    if already_used or expired:
        raise invalid_exc

    user_id = entry["user_id"]
    try:
        user_id = uuid.UUID(user_id)
    except Exception:
        pass

    user = db.query(Profile).filter(Profile.id == user_id).first()
    if user is None:
        raise invalid_exc

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

