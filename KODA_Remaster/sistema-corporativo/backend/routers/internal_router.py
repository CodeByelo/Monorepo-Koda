"""
routers/internal_router.py
───────────────────────────
API de servicio (server-to-server) consumida por koda-frontend/backend (el
ERP, un despliegue de Render COMPLETAMENTE SEPARADO de este backend).

Caso de uso actual: cuando un Admin/CEO de un tenant (rol normal, NO
Desarrollador) actualiza el "Nombre Comercial Público" en la pantalla
Perfil de Empresa del ERP (`koda-frontend/src/pages/Admin/AdminDashboard.tsx`
→ `PUT /entidades/empresa/perfil`), el ERP propaga ese nombre hacia
`organizations.name` de ESTE backend, para que el nombre mostrado justo
después del login en `frontend-enterprise` quede consistente con el del ERP.

Antes de este endpoint, la ÚNICA forma de cambiar `organizations.name` era
`PUT /dev/tenants/{id}` (routers/developer_router.py), protegido por
`require_developer` — es decir, exclusivo de Desarrolladores. Este router
expone un endpoint MÍNIMO y EXPLÍCITO, protegido por una clave compartida
fija (`X-Internal-Api-Key`, ver `auth.security.verify_org_sync_api_key`),
NUNCA por `require_developer`/JWT de usuario: es un límite de confianza
distinto a propósito (llamada servidor-a-servidor, no una sesión de
Desarrollador ni de tenant).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

import database.async_db as async_db
from auth.security import verify_org_sync_api_key

router = APIRouter(
    prefix="/internal",
    tags=["Internal API (service-to-service)"],
    dependencies=[Depends(verify_org_sync_api_key)],
)


class OrganizationNameUpdate(BaseModel):
    # 150 caracteres para calzar con la columna `organizations.name`.
    name: str = Field(..., min_length=1, max_length=150)


@router.put("/organizations/{tenant_id}/name")
async def actualizar_nombre_organizacion(tenant_id: str, payload: OrganizationNameUpdate):
    """
    Actualiza `organizations.name` para el tenant dado. Invocado
    exclusivamente por koda-frontend/backend tras guardar el perfil de
    Empresa del ERP — ver `backend.services.org_sync_client` en ese
    backend. No requiere ninguna otra autenticación: la clave compartida
    del header `X-Internal-Api-Key` ES la autenticación.
    """
    try:
        tenant_uuid = uuid.UUID(str(tenant_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="tenant_id inválido: debe ser un UUID.")

    nombre = payload.name.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")

    async with async_db.pool.acquire() as conn:
        exists = await conn.fetchval("SELECT id FROM organizations WHERE id = $1::uuid", tenant_uuid)
        if not exists:
            raise HTTPException(status_code=404, detail="Organización no encontrada.")

        await conn.execute(
            "UPDATE organizations SET name = $1 WHERE id = $2::uuid",
            nombre,
            tenant_uuid,
        )

    return {"status": "success", "message": "Nombre de organización actualizado correctamente."}
