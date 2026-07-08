from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.core.database import get_db
from backend.models.core import Profile, LoginLockout
from backend.models.erp_extended import AuditoriaLog
from backend.schemas.core import UserCreate, UserLogin, UserResponse, Token
from backend.core.security import get_password_hash, verify_password, create_access_token
from backend.utils.ip_utils import get_real_ip_str
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/auth", tags=["Autenticación"])

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

@router.post("/login", response_model=Token)
def login(request: Request, user_in: UserLogin, db: Session = Depends(get_db)):
    identifier = str(user_in.email or user_in.username or "").strip().lower()
    if not identifier:
        raise HTTPException(status_code=400, detail="Debe proveer email o username")
    
    # Verificar si el usuario está bloqueado por fuerza bruta
    lock_row = db.query(LoginLockout).filter(LoginLockout.username == identifier).first()
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    
    if lock_row and lock_row.locked_until and lock_row.locked_until > now_utc:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Usuario bloqueado contacte a un administrador"
        )
        
    # Buscar el usuario por email o username ignorando mayúsculas/minúsculas
    user = db.query(Profile).filter((func.lower(Profile.email) == identifier) | (func.lower(Profile.username) == identifier)).first()
    if not user or not verify_password(user_in.password, user.password_hash):
        # Incrementar contador de intentos fallidos
        failed_count = (lock_row.failed_count if lock_row else 0) + 1
        is_locked = False
        locked_until = None
        
        if failed_count >= 6:
            is_locked = True
            locked_until = now_utc + timedelta(days=3650)  # Bloqueo permanente
        elif failed_count == 3:
            is_locked = True
            locked_until = now_utc + timedelta(minutes=15) # Bloqueo de 15 min en el primer strike
        
        if not lock_row:
            lock_row = LoginLockout(username=identifier, failed_count=failed_count, locked_until=locked_until)
            db.add(lock_row)
        else:
            lock_row.failed_count = failed_count
            lock_row.locked_until = locked_until
            
        db.commit()
        
        if is_locked:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Usuario bloqueado contacte a un administrador"
            )
        else:
            if failed_count <= 3:
                msg = f"Credenciales de acceso incorrectas. Intento {failed_count} de 3."
            else:
                msg = f"Credenciales de acceso incorrectas. Segundo strike: Intento {failed_count - 3} de 3 antes de bloqueo permanente."
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=msg,
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

    return {"access_token": access_token, "token_type": "bearer"}
