import os
import redis
import jwt
import logging
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.core.security import oauth2_scheme, SECRET_KEY, ALGORITHM
from backend.models.core import Profile, Tenant

logger = logging.getLogger("koda_auth")

# Configurar Cliente Redis (Síncrono para compatibilidad rápida con auth, en prod usar redis.asyncio si la app es fully async)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

def is_token_blacklisted(jti: str) -> bool:
    """Verifica si el identificador único del token (JTI) está en la lista negra."""
    if not jti:
        return False
    try:
        return redis_client.exists(f"blacklist:{jti}") > 0
    except Exception as e:
        logger.warning("Redis not available for token blacklist check: %s", str(e))
        return False

def blacklist_token(jti: str, expires_in_seconds: int):
    """Añade el token a la lista negra hasta que expire naturalmente."""
    if jti and expires_in_seconds > 0:
        try:
            redis_client.setex(f"blacklist:{jti}", expires_in_seconds, "revoked")
        except Exception as e:
            logger.warning("Redis not available for blacklisting token: %s", str(e))

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
        try:
            if is_token_blacklisted(jti) or (user_id and redis_client.exists(f"blacklist:user:{user_id}")):
                logger.warning("Token is blacklisted. jti: %s | user_id: %s", jti, user_id)
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
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("Redis connection error in get_current_user_from_token: %s", str(e))

        if not user_id:
            logger.warning("Missing user_id in token payload")
            raise credentials_exception

    except jwt.PyJWTError as e:
        safe_token = token[:20] if token else "None"
        logger.warning("PyJWTError: %s | Token prefix: %s...", str(e), safe_token)
        raise credentials_exception

    import uuid
    user_id_query = user_id
    if isinstance(user_id, str):
        try:
            user_id_query = uuid.UUID(user_id)
        except Exception:
            user_id_query = user_id

    query = db.query(Profile).filter(Profile.id == user_id_query)
    user = query.first()

    if user is None:
        logger.warning("User not found in DB. user_id: %s", user_id)
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

    # Log Auth details for debugging (debug level — not shown in production)
    logger.debug("Auth check — Email: %s | ID: %s | TokenRole: %s | DBRoleID: %s | is_developer: %s",
                 user.email, user.id, token_role, getattr(user, 'rol_id', None), is_developer)

    # 2. Control Multi-Tenant
    if not is_developer:
        # Los usuarios normales ESTÁN atados a su tenant.
        if str(user.tenant_id) != str(tenant_id):
            logger.warning("Tenant mismatch. User: %s | Token: %s", user.tenant_id, tenant_id)
            raise credentials_exception

        # Verificar estado de la licencia del Tenant
        if user.tenant_id:
            tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
            if not tenant or tenant.estado_licencia != "ACTIVA":
                estado = tenant.estado_licencia if tenant else 'NO REGISTRADA'
                logger.warning("Inactive license for Tenant %s: %s", user.tenant_id, estado)
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
