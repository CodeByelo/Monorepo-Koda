import os
import redis
import jwt
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.core.security import oauth2_scheme, SECRET_KEY, ALGORITHM
from backend.models.core import Profile, Tenant

# Configurar Cliente Redis (Síncrono para compatibilidad rápida con auth, en prod usar redis.asyncio si la app es fully async)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

def is_token_blacklisted(jti: str) -> bool:
    """Verifica si el identificador único del token (JTI) está en la lista negra."""
    if not jti:
        return False
    return redis_client.exists(f"blacklist:{jti}") > 0

def blacklist_token(jti: str, expires_in_seconds: int):
    """Añade el token a la lista negra hasta que expire naturalmente."""
    if jti and expires_in_seconds > 0:
        redis_client.setex(f"blacklist:{jti}", expires_in_seconds, "revoked")

def get_current_user_from_token(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Profile:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales de autenticación inválidas o expiradas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        jti = payload.get("jti")  # Identificador único del JWT

        # 1. Verificar Redis Blacklist (JTI, User Level, Tenant Level)
        if is_token_blacklisted(jti) or redis_client.exists(f"blacklist:user:{user_id}"):
            print(f"[AUTH ERROR] Token is blacklisted. jti: {jti} | user_id: {user_id}", flush=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token revocado o sesión cerrada.",
            )
        if tenant_id and redis_client.exists(f"blacklist:tenant:{tenant_id}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="El acceso para esta empresa ha sido suspendido temporalmente.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user_id:
            print("[AUTH ERROR] Missing user_id in token payload", flush=True)
            raise credentials_exception

    except jwt.PyJWTError as e:
        safe_token = token[:20] if token else "None"
        print(f"[AUTH ERROR] PyJWTError: {str(e)} | Token prefix: {safe_token}...", flush=True)
        raise credentials_exception

    query = db.query(Profile).filter(Profile.id == user_id)
    user = query.first()

    if user is None:
        print(f"[AUTH ERROR] User not found in DB. user_id: {user_id}", flush=True)
        raise credentials_exception

    # Identificar si es un Desarrollador
    is_developer = False
    token_role = payload.get("rol") or payload.get("role")
    
    # 1. Check token role
    if token_role and str(token_role).strip().lower() in ["desarrollador", "dev", "developer"]:
        is_developer = True
    # 2. Check DB user.rol
    elif getattr(user, "rol", "") and str(user.rol).strip().lower() in ["desarrollador", "dev", "developer"]:
        is_developer = True
    # 3. Check DB user.rol_id
    elif getattr(user, "rol_id", None) == 4:
        is_developer = True

    # Log Auth details for debugging
    print(f"[AUTH CHECK] Email: {user.email} | ID: {user.id} | TokenRole: {token_role} | DBRoleID: {getattr(user, 'rol_id', None)} | is_developer: {is_developer}", flush=True)

    # 2. Control Multi-Tenant
    if not is_developer:
        # Los usuarios normales ESTÁN atados a su tenant.
        if str(user.tenant_id) != str(tenant_id):
            print(f"[AUTH FORBIDDEN] Tenant mismatch. User: {user.tenant_id} | Token: {tenant_id}", flush=True)
            raise credentials_exception

        # Verificar estado de la licencia del Tenant
        if user.tenant_id:
            tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
            if not tenant or tenant.estado_licencia != "ACTIVA":
                estado = tenant.estado_licencia if tenant else 'NO REGISTRADA'
                print(f"[AUTH FORBIDDEN] Inactive license for Tenant {user.tenant_id}: {estado}", flush=True)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"La licencia de su empresa se encuentra: {estado}."
                )

    # 3. Inyectar el Tenant ID globalmente (Excepto si es Dev haciendo query transversal)
    from backend.core.database import current_tenant_id_var
    if user.tenant_id:
        current_tenant_id_var.set(user.tenant_id)
        from sqlalchemy import text
        db.execute(text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"), {"tenant_id": str(user.tenant_id)})

    return user

def role_required(roles_permitidos: list[str]):
    """
    Dependencia de FastAPI que asegura que el usuario actual
    tenga uno de los roles permitidos en `roles_permitidos`.
    El Desarrollador SIEMPRE tiene bypass.
    """
    def role_checker(
        current_user: Profile = Depends(get_current_user_from_token)
    ):
        # El bypass global ya se verifica en la extracción del token, pero lo re-verificamos por seguridad extra
        user_role = getattr(current_user, "rol", "")
        if user_role and str(user_role).strip().lower() in ["desarrollador", "dev", "developer"]:
            return current_user

        if user_role not in roles_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permisos insuficientes. Se requiere: {', '.join(roles_permitidos)}"
            )
        return current_user
    return role_checker

get_current_user = get_current_user_from_token
