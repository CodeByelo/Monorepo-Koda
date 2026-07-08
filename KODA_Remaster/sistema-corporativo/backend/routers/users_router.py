import os
import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr

from fastapi import APIRouter, Depends, HTTPException, Request
from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user
from src import schemas


router = APIRouter(prefix="/users", tags=["users"])
DEV_ROLE_MASTER_PASSWORD = os.getenv("DEV_ROLE_MASTER_PASSWORD", "")


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
        import logging
        logging.getLogger("sistema_corporativo").warning("_log_security_event failed: %s", _log_err)


def _is_privileged_role(role_name: str) -> bool:
    if not role_name:
        return False
    role = str(role_name).strip().lower()
    return role in {"desarrollador", "administrativo", "ceo", "admin", "administrador"}


def _is_admin_general(role_name: Optional[str]) -> bool:
    if not role_name:
        return False
    role = str(role_name).strip().lower()
    return role in {"ceo", "administrador general", "admin general", "owner", "administrador"}

@router.get("/all", response_model=List[schemas.UsuarioListResponse])
async def list_all_users(
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        if not _is_privileged_role(current_user.get("role")):
            raise HTTPException(status_code=403, detail="No autorizado")

        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="No autorizado: tenant no especificado")

        # Inyectar contexto de tenant para que RLS filtre correctamente
        await conn.execute(
            "SELECT set_config('app.current_tenant_id', $1, true)",
            str(tenant_id)
        )

        query = """
            SELECT p.id, p.username, p.nombre, p.apellido, p.email, p.rol_id, r.nombre_rol as role, p.estado
            FROM profiles p
            LEFT JOIN roles r ON p.rol_id = r.id
            WHERE p.tenant_id = $1::uuid AND p.rol_id != 4
            ORDER BY p.username
        """
        rows = await conn.fetch(query, uuid.UUID(tenant_id))
        await _log_security_event(
            conn,
            tenant_id=current_user.get("tenant_id"),
            user_id=current_user.get("sub"),
            username=current_user.get("username"),
            evento="USERS_LIST",
            detalles="Listado de usuarios",
            estado="info",
            page="/users/all",
            ip_origen=request.client.host if request.client else None,
            gerencia_id=current_user.get("gerencia_id"),
        )
        return [dict(r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener usuarios: {str(e)}")

@router.put("/{user_id}/role")
async def update_user_role(
    user_id: str,
    data: dict,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        actor_role = str(current_user.get("role") or "").strip().lower()
        if actor_role not in {"desarrollador", "developer", "dev"}:
            raise HTTPException(status_code=403, detail="No autorizado: solo el rol Desarrollador puede cambiar roles")

        rol_id = data.get("rol_id")
        if not rol_id:
            raise HTTPException(status_code=400, detail="rol_id es requerido")
        if rol_id not in {1, 2, 3, 5}:
            raise HTTPException(status_code=400, detail="rol_id inválido o no permitido desde esta interfaz")

        if rol_id == 4:
            raise HTTPException(status_code=403, detail="El rol de Desarrollador solo puede ser asignado desde el Panel de Desarrollo.")

        await conn.execute(
            "UPDATE profiles SET rol_id = $1 WHERE id = $2",
            rol_id, user_id
        )
        await _log_security_event(
            conn,
            tenant_id=current_user.get("tenant_id"),
            user_id=current_user.get("sub"),
            username=current_user.get("username"),
            evento="USER_ROLE_UPDATED",
            detalles=f"Rol actualizado para user_id={user_id} rol_id={rol_id}",
            estado="warning",
            page=f"/users/{user_id}/role",
            ip_origen=request.client.host if request.client else None,
            gerencia_id=current_user.get("gerencia_id"),
        )
        return {"message": "Rol actualizado correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EmployeeCreatePayload(BaseModel):
    username: str
    nombre: str
    apellido: str
    email: EmailStr
    password: str
    rol_id: int
    gerencia_nombre: Optional[str] = "Tecnología"


@router.post("/admin/employees")
async def create_employee(
    payload: EmployeeCreatePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        # 1. Verificar que el usuario actual tenga rol de Desarrollador
        role = str(current_user.get("role") or "").strip().lower()
        if role not in {"desarrollador", "developer", "dev"}:
            raise HTTPException(status_code=403, detail="No autorizado: se requiere rol de Desarrollador")

        if payload.rol_id == 4:
            raise HTTPException(status_code=403, detail="El rol de Desarrollador solo puede ser asignado desde el Panel de Desarrollo.")

        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="No autorizado: el usuario no pertenece a ningún tenant")

        # 2. Configurar el contexto de tenant en la sesión para cumplir con RLS
        await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id))

        # 3. Validación de Límites (max_users)
        # Consulta la vista tenant_user_counts, organizations, y subscription_plans
        org_limits = await conn.fetchrow(
            """
            SELECT sp.max_users as plan_max_users, o.config, COALESCE(v.user_count, 0) as active_users
            FROM organizations o
            LEFT JOIN subscription_plans sp ON o.plan_id = sp.id
            LEFT JOIN tenant_user_counts v ON o.id = v.tenant_id
            WHERE o.id = $1::uuid
            """,
            uuid.UUID(tenant_id)
        )
        if not org_limits:
            raise HTTPException(status_code=400, detail="Organización no encontrada")

        max_users = org_limits["plan_max_users"]
        if max_users is None:
            cfg = org_limits["config"]
            if isinstance(cfg, str):
                import json
                cfg = json.loads(cfg)
            max_users = (cfg or {}).get("max_users", 12) if cfg else 12

        active_users = org_limits["active_users"]

        if active_users >= max_users:
            raise HTTPException(
                status_code=403,
                detail=f"Límite de usuarios alcanzado ({active_users}/{max_users}). Por favor, contacta a soporte para actualizar tu plan."
            )

        # 4. Validar si el username o email ya existe
        existing = await conn.fetchrow(
            "SELECT id FROM profiles WHERE username = $1 OR email = $2",
            payload.username, payload.email
        )
        if existing:
            raise HTTPException(status_code=400, detail="El nombre de usuario o correo electrónico ya está registrado")

        # 5. Resolver o crear gerencia asociada al tenant
        g_id = await conn.fetchval(
            "SELECT id FROM gerencias WHERE nombre = $1 AND tenant_id = $2::uuid",
            payload.gerencia_nombre, uuid.UUID(tenant_id)
        )
        if not g_id:
            g_id = await conn.fetchval(
                "INSERT INTO gerencias (nombre, tenant_id) VALUES ($1, $2::uuid) RETURNING id",
                payload.gerencia_nombre, uuid.UUID(tenant_id)
            )

        # 6. Hashear la contraseña e insertar el nuevo empleado
        from auth.security import get_password_hash
        hashed_pw = get_password_hash(payload.password)

        new_user_id = await conn.fetchval(
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
            payload.rol_id,
            g_id,
            True,
            uuid.UUID(tenant_id)
        )

        # 7. Asociar el usuario a la organización
        await conn.execute(
            """
            INSERT INTO user_organizations (user_id, organization_id, role)
            VALUES ($1::uuid, $2::uuid, 'member')
            ON CONFLICT (user_id, organization_id) DO NOTHING
            """,
            new_user_id,
            uuid.UUID(tenant_id)
        )

        # 8. Registrar evento de seguridad
        await _log_security_event(
            conn,
            tenant_id=tenant_id,
            user_id=new_user_id,
            username=payload.username,
            evento="EMPLOYEE_CREATED",
            detalles=f"Empleado '{payload.username}' creado exitosamente por Admin General",
            estado="success",
            page="/users/admin/employees",
            ip_origen=request.client.host if request.client else None,
            gerencia_id=g_id,
        )

        return {
            "message": "Empleado creado exitosamente",
            "user_id": str(new_user_id),
            "username": payload.username,
            "email": payload.email
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creando empleado: {e}")
        raise HTTPException(status_code=500, detail="Error interno al crear el empleado")
