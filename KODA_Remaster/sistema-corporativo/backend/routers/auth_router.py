from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import uuid
import hashlib
from database.async_db import get_db_connection
from auth.security import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_totp
from auth.supabase_auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/auth", tags=["auth"])


async def _log_security_event(
    conn, *, tenant_id, user_id, username, evento,
    detalles=None, estado="info", page=None, ip_origen=None, gerencia_id=None
):
    """INSERT a security audit record. The security_events table is managed via
    SQL migrations — never created inline here."""
    try:
        await conn.execute(
            """
            INSERT INTO security_events
                (tenant_id, user_id, username, evento, event_type, detalles, estado, page, ip_origen, gerencia_id)
            VALUES ($1::uuid, $2::uuid, $3, $4, $4, $5, $6, $7, $8, $9)
            """,
            tenant_id,
            user_id,
            username or "anon",
            evento,
            detalles,
            estado,
            page,
            ip_origen,
            gerencia_id,
        )
    except Exception as _log_err:
        # Log errors must never crash an endpoint
        import logging
        logging.getLogger("sistema_corporativo").warning("_log_security_event failed: %s", _log_err)


def _extract_client_ip(request: Request) -> Optional[str]:
    candidates = [
        request.headers.get("cf-connecting-ip"),
        request.headers.get("x-real-ip"),
    ]
    xff = request.headers.get("x-forwarded-for")
    if xff:
        candidates.extend([part.strip() for part in xff.split(",") if part.strip()])
    if request.client and request.client.host:
        candidates.append(request.client.host)
    for raw in candidates:
        if not raw:
            continue
        ip = raw
        if ":" in ip and "." not in ip:
            ip = ip.split("%")[0]
        return ip
    return None

@router.get("/me")
async def get_user_profile(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        query = """
            SELECT p.id, p.username, p.nombre, p.apellido, p.email, g.nombre as gerencia_nombre, p.rol_id, r.nombre_rol as role,
                   p.tenant_id, o.nombre as tenant_name, o.config, sp.allowed_modules as plan_allowed_modules
            FROM profiles p
            LEFT JOIN gerencias g ON p.gerencia_id = g.id
            LEFT JOIN roles r ON p.rol_id = r.id
            LEFT JOIN organizations o ON p.tenant_id = o.id
            LEFT JOIN subscription_plans sp ON o.plan_id = sp.id
            WHERE p.id = $1
        """
        profile = await conn.fetchrow(query, uuid.UUID(user_id))

        if not profile:
             raise HTTPException(status_code=404, detail="Profile not found")

        result = dict(profile)

        # Resolve allowed_modules
        allowed_modules = ["all"] # Default for backwards compatibility or dev
        if result.get("plan_allowed_modules") is not None:
            import json
            if isinstance(result["plan_allowed_modules"], str):
                allowed_modules = json.loads(result["plan_allowed_modules"])
            else:
                allowed_modules = result["plan_allowed_modules"]
        elif result.get("config"):
            import json
            cfg = result["config"]
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            allowed_modules = cfg.get("allowed_modules", ["all"])

        result["allowed_modules"] = allowed_modules

        # Clean up internal fields
        result.pop("config", None)
        result.pop("plan_allowed_modules", None)

        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching profile: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener perfil")

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    apellido: str
    username: str
    gerencia_nombre: str

class UserLogin(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: str

@router.post("/register")
async def register(user_data: UserRegister, request: Request, conn = Depends(get_db_connection)):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="El registro público está deshabilitado en este entorno corporativo."
    )

@router.post("/login")
async def login(login_data: UserLogin, request: Request, conn = Depends(get_db_connection)):
    query = """
        SELECT p.id, p.username, p.nombre, p.apellido, p.password_hash, p.email,
               p.rol_id, r.nombre_rol, p.tenant_id, o.nombre as tenant_name, p.gerencia_id, g.nombre as gerencia_nombre,
               p.mfa_enabled, p.totp_secret
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        LEFT JOIN organizations o ON p.tenant_id = o.id
        WHERE (p.email = $1 OR p.username = $1) AND p.estado = TRUE
    """
    identifier = login_data.email or login_data.username
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or Username required")

    user = await conn.fetchrow(query, identifier)

    if not user or not verify_password(login_data.password, user['password_hash']):
        await _log_security_event(
            conn,
            tenant_id=None,
            user_id=None,
            username=identifier,
            evento="LOGIN_FAILED",
            detalles="Credenciales incorrectas",
            estado="warning",
            page="/auth/login",
            ip_origen=_extract_client_ip(request),
            gerencia_id=user["gerencia_id"] if user else None,
        )
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    role_norm = user["nombre_rol"].lower().strip() if user["nombre_rol"] else ""
    is_dev = role_norm in {"desarrollador", "dev", "developer"}

    # Si tiene MFA y NO es desarrollador, devolver token MFA temporal
    if user.get("mfa_enabled") and not is_dev:
        mfa_token = create_access_token(
            data={
                "sub": str(user["id"]),
                "mfa_required": True,
                "role": user["nombre_rol"]
            },
            expires_delta=timedelta(minutes=3)
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
            "username": user["username"]
        }

    # Flujo normal o desarrollador (MFA bypass)
    expires = timedelta(hours=12) if is_dev else None
    access_token = create_access_token(
        data={
            "sub": str(user['id']),
            "role": user['nombre_rol'],
            "tenant_id": str(user['tenant_id']) if user['tenant_id'] else None,
            "tenant_name": user['tenant_name'],
            "gerencia_id": user['gerencia_id'],
            "username": user["username"],
            "email": user["email"],
        },
        expires_delta=expires
    )

    refresh_token = await create_refresh_token(
        user_id=str(user["id"]),
        metadata={
            "role": user["nombre_rol"],
            "tenant_id": str(user["tenant_id"]) if user["tenant_id"] else None,
            "tenant_name": user["tenant_name"],
            "gerencia_id": user["gerencia_id"],
            "username": user["username"],
            "email": user["email"],
        }
    )

    # Actualizar última conexión
    await conn.execute("UPDATE profiles SET ultima_conexion = NOW() WHERE id = $1", user['id'])

    await _log_security_event(
        conn,
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        username=user["username"],
        evento="LOGIN",
        detalles=f"Login exitoso ({user['username']})",
        estado="success",
        page="/auth/login",
        ip_origen=_extract_client_ip(request),
        gerencia_id=user["gerencia_id"],
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user['id']),
            "username": user['username'],
            "nombre": user['nombre'],
            "apellido": user['apellido'],
            "email": user['email'],
            "role": user['nombre_rol'],
            "gerencia_id": user['gerencia_id'],
            "gerencia_depto": user['gerencia_nombre'],
            "tenant_id": str(user['tenant_id']) if user['tenant_id'] else None,
            "tenant_name": user['tenant_name']
        }
    }

@router.post("/logout")
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    try:
        await _log_security_event(
            conn,
            tenant_id=current_user.get("tenant_id"),
            user_id=current_user.get("sub"),
            username=current_user.get("username") or current_user.get("email"),
            evento="LOGOUT",
            detalles="Logout de usuario",
            estado="info",
            page="/auth/logout",
            ip_origen=_extract_client_ip(request),
            gerencia_id=current_user.get("gerencia_id"),
        )
    except Exception:
        pass
    return {"message": "Logged out successfully"}


class AccountClaim(BaseModel):
    token_plano: str
    username: str
    password: str
    nombre: str
    apellido: str
    email: EmailStr


@router.post("/claim-account")
async def claim_account(payload: AccountClaim, request: Request, conn = Depends(get_db_connection)):
    try:
        # 1. Hashear el token_plano
        token_hash = hashlib.sha256(payload.token_plano.encode()).hexdigest()

        # 2. Buscar el token en provisioning_tokens
        token_row = await conn.fetchrow(
            """
            SELECT id, tenant_id, max_users, expires_at, is_used
            FROM provisioning_tokens
            WHERE token_hash = $1 AND is_used = FALSE AND expires_at > NOW()
            """,
            token_hash
        )
        if not token_row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El token de aprovisionamiento no es válido, ya ha sido utilizado o ha expirado."
            )

        tenant_id = token_row["tenant_id"]
        max_users = token_row["max_users"]

        # Establecer el tenant_id en la sesión de base de datos para satisfacer las políticas RLS
        await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id))

        # 3. Validar si el usuario o email ya existe
        existing = await conn.fetchrow(
            "SELECT id FROM profiles WHERE username = $1 OR email = $2",
            payload.username, payload.email
        )
        if existing:
            raise HTTPException(status_code=400, detail="Usuario o Email ya registrado")

        hashed_pw = get_password_hash(payload.password)

        # 4. Iniciar transacción atómica
        async with conn.transaction():
            # Obtener el ID del rol maestro (CEO o id 1)
            rol_id = await conn.fetchval(
                "SELECT id FROM roles WHERE nombre_rol = 'CEO' OR nombre_rol = 'Administrador General' ORDER BY id LIMIT 1"
            )
            if not rol_id:
                rol_id = 1

            # Crear gerencia por defecto para el tenant si no existe
            g_id = await conn.fetchval(
                "SELECT id FROM gerencias WHERE nombre = 'Tecnología' AND tenant_id = $1::uuid",
                tenant_id
            )
            if not g_id:
                g_id = await conn.fetchval(
                    "INSERT INTO gerencias (nombre, tenant_id) VALUES ('Tecnología', $1::uuid) RETURNING id",
                    tenant_id
                )

            # Crear perfil de usuario
            user_id = await conn.fetchval(
                """
                INSERT INTO profiles (username, nombre, apellido, email, password_hash, rol_id, gerencia_id, estado, tenant_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid)
                RETURNING id
                """,
                payload.username,
                payload.nombre,
                payload.apellido,
                payload.email,
                hashed_pw,
                rol_id,
                g_id,
                True,
                tenant_id
            )

            # Asociar el usuario a la organización
            await conn.execute(
                """
                INSERT INTO user_organizations (user_id, organization_id, role)
                VALUES ($1::uuid, $2::uuid, 'owner')
                ON CONFLICT (user_id, organization_id) DO NOTHING
                """,
                user_id,
                tenant_id
            )

            # Actualizar el límite de usuarios de la organización si corresponde
            await conn.execute(
                """
                UPDATE organizations
                SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{max_users}', to_jsonb($1::int))
                WHERE id = $2::uuid
                """,
                max_users,
                tenant_id
            )

            # Marcar token como utilizado
            await conn.execute(
                "UPDATE provisioning_tokens SET is_used = TRUE WHERE id = $1::uuid",
                token_row["id"]
            )

        await _log_security_event(
            conn,
            tenant_id=tenant_id,
            user_id=user_id,
            username=payload.username,
            evento="ACCOUNT_CLAIMED",
            detalles=f"Cuenta reclamada exitosamente para tenant_id={tenant_id}",
            estado="success",
            page="/auth/claim-account",
            ip_origen=_extract_client_ip(request),
            gerencia_id=g_id,
        )

        return {
            "message": "Cuenta reclamada exitosamente. Ahora puedes iniciar sesión.",
            "user_id": str(user_id),
            "tenant_id": str(tenant_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error reclamando cuenta: {e}")
        raise HTTPException(status_code=500, detail="Error interno al reclamar la cuenta")
