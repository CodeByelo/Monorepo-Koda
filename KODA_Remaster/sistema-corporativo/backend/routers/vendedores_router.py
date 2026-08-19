"""
routers/vendedores_router.py
────────────────────────────
Módulo de Vendedores para Koda ERP (Remaster).

Funcionalidades:
  - CRUD de vendedores vinculados a perfiles de usuario
  - Configuración de % comisión por vendedor
  - Vista del propio vendedor autenticado (GET /vendedores/me)
  - Migración automática de la tabla vendedores al arrancar

Diseño:
  - Un usuario con rol vinculado al catálogo de vendedores via user_id.
  - vendedores.user_id → profiles.id (FK opcional)
"""

import uuid
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/vendedores", tags=["Vendedores"])


async def ensure_vendedores_schema(conn) -> None:
    """Crea/migra la tabla vendedores. Idempotente."""
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS vendedores (
                id              SERIAL PRIMARY KEY,
                tenant_id       UUID,
                nombre          TEXT NOT NULL,
                codigo          TEXT NOT NULL UNIQUE,
                activo          BOOLEAN NOT NULL DEFAULT TRUE,
                meta_mensual_usd NUMERIC(15,2) DEFAULT 0,
                user_id         UUID REFERENCES profiles(id),
                porcentaje_comision NUMERIC(5,2) DEFAULT 5.00,
                email           TEXT,
                telefono        TEXT,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        for col_ddl in [
            "ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id)",
            "ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS porcentaje_comision NUMERIC(5,2) DEFAULT 5.00",
            "ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS email TEXT",
            "ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS telefono TEXT",
            "ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        ]:
            try:
                await conn.execute(col_ddl)
            except Exception:
                pass
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_vendedores_user_id ON vendedores (user_id)"
        )
        logger.info("✅ Schema vendedores verificado/migrado.")
    except Exception as e:
        logger.warning("⚠️ No se pudo migrar tabla vendedores: %s", e)


def _require_admin(current_user: dict) -> None:
    role = str(current_user.get("role") or "").strip().lower()
    if role not in {"ceo", "administrador", "desarrollador", "gerente"}:
        raise HTTPException(status_code=403, detail="No autorizado: se requiere rol Administrador o superior")


async def _log_event(conn, *, tenant_id, user_id, username, evento, detalles, estado="info", ip=None):
    try:
        await conn.execute(
            """
            INSERT INTO security_events
                (tenant_id, user_id, username, evento, event_type, detalles, estado, page, ip_origen)
            VALUES ($1::uuid, $2::uuid, $3, $4, $4, $5, $6, $7, $8)
            """,
            tenant_id, user_id, username or "anon", evento, detalles, estado, "/vendedores", ip,
        )
    except Exception:
        pass


class VendedorCreate(BaseModel):
    nombre: str
    codigo: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    porcentaje_comision: float = 5.0
    meta_mensual_usd: float = 0.0
    user_id: Optional[str] = None


class VendedorUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    porcentaje_comision: Optional[float] = None
    meta_mensual_usd: Optional[float] = None
    activo: Optional[bool] = None


class ComisionUpdate(BaseModel):
    porcentaje_comision: float


@router.get("/me")
async def get_mi_perfil_vendedor(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    """Retorna el perfil y estadísticas del vendedor autenticado."""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        vendedor = await conn.fetchrow(
            """
            SELECT v.*,
                   COUNT(ve.id) as total_ventas,
                   COALESCE(SUM(ve.monto_total), 0) as total_facturado_usd
            FROM vendedores v
            LEFT JOIN facturas ve ON ve.creado_por = v.user_id AND ve.status = 'emitida'
            WHERE v.user_id = $1::uuid
            GROUP BY v.id
            """,
            uuid.UUID(user_id)
        )
        if not vendedor:
            raise HTTPException(status_code=404, detail="No tienes un perfil de vendedor asociado a tu cuenta")
        return {
            **dict(vendedor),
            "comision_generada_usd": float(vendedor["total_facturado_usd"]) * (float(vendedor["porcentaje_comision"]) / 100),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error en GET /vendedores/me: %s", e)
        raise HTTPException(status_code=500, detail="Error al obtener perfil de vendedor")


@router.get("/")
async def list_vendedores(
    activo: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    """Lista todos los vendedores del tenant con estadísticas del mes."""
    tenant_id = current_user.get("tenant_id")
    try:
        where_activo = "" if activo is None else f"AND v.activo = {'TRUE' if activo else 'FALSE'}"
        rows = await conn.fetch(
            f"""
            SELECT v.*, p.username, p.email as user_email
            FROM vendedores v
            LEFT JOIN profiles p ON v.user_id = p.id
            WHERE (v.tenant_id = $1::uuid OR v.tenant_id IS NULL)
              {where_activo}
            ORDER BY v.nombre
            """,
            uuid.UUID(tenant_id)
        )
        return [
            {**dict(r), "tiene_login": r["user_id"] is not None}
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar vendedores: {str(e)}")


@router.get("/{vendedor_id}")
async def get_vendedor(
    vendedor_id: int,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    """Retorna un vendedor con su historial de facturas."""
    tenant_id = current_user.get("tenant_id")
    try:
        vendedor = await conn.fetchrow(
            """
            SELECT v.*, p.username, p.email as user_email
            FROM vendedores v
            LEFT JOIN profiles p ON v.user_id = p.id
            WHERE v.id = $1 AND (v.tenant_id = $2::uuid OR v.tenant_id IS NULL)
            """,
            vendedor_id, uuid.UUID(tenant_id)
        )
        if not vendedor:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado")

        facturas = await conn.fetch(
            """
            SELECT f.id, f.numero_factura, f.created_at,
                   f.monto_total, f.moneda_documento, f.status
            FROM facturas f
            WHERE f.creado_por = $1::uuid AND f.tenant_id = $2::uuid
            ORDER BY f.created_at DESC
            LIMIT 20
            """,
            vendedor["user_id"], uuid.UUID(tenant_id)
        ) if vendedor["user_id"] else []

        return {
            **dict(vendedor),
            "tiene_login": vendedor["user_id"] is not None,
            "facturas_recientes": [dict(f) for f in facturas],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post("/")
async def create_vendedor(
    payload: VendedorCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    """Crea un nuevo vendedor. Si se provee user_id, lo vincula al perfil existente."""
    _require_admin(current_user)
    tenant_id = current_user.get("tenant_id")
    try:
        codigo = payload.codigo
        if not codigo:
            count = await conn.fetchval("SELECT COUNT(*) FROM vendedores") or 0
            codigo = f"VND-{str(int(count) + 1).zfill(3)}"

        user_id_val = uuid.UUID(payload.user_id) if payload.user_id else None

        new_id = await conn.fetchval(
            """
            INSERT INTO vendedores
                (tenant_id, nombre, codigo, email, telefono,
                 porcentaje_comision, meta_mensual_usd, user_id, activo)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, TRUE)
            RETURNING id
            """,
            uuid.UUID(tenant_id), payload.nombre.strip(), codigo,
            payload.email, payload.telefono, payload.porcentaje_comision,
            payload.meta_mensual_usd, user_id_val,
        )

        await _log_event(
            conn, tenant_id=tenant_id, user_id=current_user.get("sub"),
            username=current_user.get("username"), evento="VENDEDOR_CREATED",
            detalles=f"Vendedor '{payload.nombre}' creado (código: {codigo})",
            estado="success", ip=request.client.host if request.client else None,
        )
        return {"message": "Vendedor creado exitosamente", "id": new_id, "codigo": codigo}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear vendedor: {str(e)}")


@router.patch("/{vendedor_id}/comision")
async def update_comision(
    vendedor_id: int,
    payload: ComisionUpdate,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    """Actualiza el porcentaje de comisión de un vendedor."""
    _require_admin(current_user)
    tenant_id = current_user.get("tenant_id")
    if not (0 <= payload.porcentaje_comision <= 100):
        raise HTTPException(status_code=400, detail="El porcentaje debe estar entre 0 y 100")
    try:
        updated = await conn.fetchval(
            """
            UPDATE vendedores SET porcentaje_comision = $1
            WHERE id = $2 AND (tenant_id = $3::uuid OR tenant_id IS NULL)
            RETURNING id
            """,
            payload.porcentaje_comision, vendedor_id, uuid.UUID(tenant_id)
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado")
        return {"message": f"Comisión actualizada a {payload.porcentaje_comision}%", "id": vendedor_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post("/{vendedor_id}/vincular-usuario")
async def vincular_usuario(
    vendedor_id: int,
    data: dict,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    """Vincula un vendedor del catálogo con un profile de usuario para que pueda logearse."""
    _require_admin(current_user)
    tenant_id = current_user.get("tenant_id")
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id es requerido")
    try:
        profile = await conn.fetchrow(
            "SELECT id, username FROM profiles WHERE id = $1::uuid AND tenant_id = $2::uuid",
            uuid.UUID(user_id), uuid.UUID(tenant_id)
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Usuario no encontrado en este tenant")

        vendedor_row = await conn.fetchval(
            "SELECT id FROM vendedores WHERE id = $1 AND (tenant_id = $2::uuid OR tenant_id IS NULL)",
            vendedor_id, uuid.UUID(tenant_id)
        )
        if not vendedor_row:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado en este tenant")

        existing = await conn.fetchval(
            "SELECT id FROM vendedores WHERE user_id = $1::uuid AND id != $2",
            uuid.UUID(user_id), vendedor_id
        )
        if existing:
            raise HTTPException(status_code=409, detail="Este usuario ya está vinculado a otro vendedor")

        await conn.execute(
            "UPDATE vendedores SET user_id = $1::uuid WHERE id = $2 AND (tenant_id = $3::uuid OR tenant_id IS NULL)",
            uuid.UUID(user_id), vendedor_id, uuid.UUID(tenant_id)
        )
        await _log_event(
            conn, tenant_id=tenant_id, user_id=current_user.get("sub"),
            username=current_user.get("username"), evento="VENDEDOR_LINKED",
            detalles=f"Vendedor id={vendedor_id} vinculado a '{profile['username']}'",
            estado="success", ip=request.client.host if request.client else None,
        )
        return {"message": f"Vendedor vinculado al usuario '{profile['username']}'", "vendedor_id": vendedor_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
