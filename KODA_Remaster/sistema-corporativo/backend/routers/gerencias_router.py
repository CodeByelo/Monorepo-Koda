from fastapi import APIRouter, Depends, HTTPException, Request
from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user
from typing import List, Optional
import uuid
from src import schemas


router = APIRouter(prefix="/gerencias", tags=["gerencias"])


async def _ensure_security_events_table(conn) -> None:
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS security_events (
            id BIGSERIAL PRIMARY KEY,
            tenant_id UUID,
            user_id UUID,
            username TEXT,
            evento TEXT NOT NULL,
            detalles TEXT,
            estado TEXT DEFAULT 'info',
            page TEXT,
            ip_origen TEXT,
            gerencia_id INTEGER,
            event_type TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)


async def _log_security_event(
    conn,
    *,
    tenant_id: Optional[str],
    user_id: Optional[str],
    username: Optional[str],
    evento: str,
    detalles: Optional[str] = None,
    estado: str = "info",
    page: Optional[str] = None,
    ip_origen: Optional[str] = None,
    gerencia_id: Optional[int] = None,
) -> None:
    await _ensure_security_events_table(conn)
    await conn.execute(
        """
        INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen, gerencia_id, event_type)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)
        """,
        uuid.UUID(str(tenant_id)) if tenant_id else None,
        uuid.UUID(str(user_id)) if user_id else None,
        username or "anon",
        evento,
        detalles,
        estado,
        page,
        ip_origen,
        gerencia_id,
        evento,
    )


@router.get("", response_model=List[schemas.GerenciaResponse])
async def list_gerencias(
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    try:
        tenant_id = current_user.get("tenant_id")
        role = current_user.get("role") or current_user.get("rol")
        role_norm = str(role).strip().lower() if role else ""
        
        # Inyectar el contexto de tenant para la sesión RLS
        if tenant_id:
            await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id))
            await conn.execute("SELECT set_config('app.current_user_role', $1, true)", role_norm)
        
        # Si es Desarrollador/Developer, hacer bypass del tenant_id y retornar todas
        if role_norm in {"desarrollador", "developer", "dev"}:
            rows = await conn.fetch("SELECT id, nombre, siglas, categoria FROM gerencias ORDER BY nombre")
        else:
            if tenant_id:
                tenant_uuid = uuid.UUID(str(tenant_id))
                rows = await conn.fetch(
                    "SELECT id, nombre, siglas, categoria FROM gerencias WHERE tenant_id = $1::uuid OR tenant_id IS NULL ORDER BY nombre",
                    tenant_uuid
                )
            else:
                rows = await conn.fetch("SELECT id, nombre, siglas, categoria FROM gerencias WHERE tenant_id IS NULL ORDER BY nombre")

        try:
            await _log_security_event(
                conn,
                tenant_id=tenant_id,
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="GERENCIAS_LIST",
                detalles=f"Listado de gerencias para tenant_id={tenant_id}",
                estado="info",
                page="/gerencias",
                ip_origen=request.client.host if request.client else None,
                gerencia_id=current_user.get("gerencia_id")
            )
        except Exception:
            pass
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener gerencias: {str(e)}")

