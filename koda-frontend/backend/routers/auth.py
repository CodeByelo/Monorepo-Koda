from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.core.database import get_db
from backend.models.core import Profile, LoginLockout
from backend.models.erp_extended import AuditoriaLog
from backend.schemas.core import UserCreate, UserLogin, UserResponse, Token
from backend.core.security import get_password_hash, verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from backend.utils.ip_utils import get_real_ip_str
from datetime import datetime, timedelta, timezone
import os

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
    lock_row = (
        db.query(LoginLockout)
        .filter(LoginLockout.username == identifier, LoginLockout.ip_address == client_ip)
        .first()
    )
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
        
        if not lock_row:
            lock_row = LoginLockout(username=identifier, ip_address=client_ip, failed_count=failed_count, locked_until=locked_until)
            db.add(lock_row)
        else:
            lock_row.failed_count = failed_count
            lock_row.locked_until = locked_until
            
        db.commit()
        
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
    
    # Generar el Token JWT con email, rol y tenant_id
    access_token = create_access_token(data={
        "sub": str(user.id), 
        "email": user.email,
        "username": user.username,
        "rol": user.rol,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None
    })

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

    # Setear cookie httpOnly con el token y devolver datos del usuario en el body
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


@router.post("/logout")
def logout():
    """Cierra la sesión eliminando las cookies de autenticación."""
    response = JSONResponse(content={"message": "Sesión cerrada correctamente"})
    _clear_auth_cookies(response)
    return response

