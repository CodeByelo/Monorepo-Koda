import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.operations import Cliente
from backend.models.erp_extended import Empresa, Sucursal
from backend.schemas.operations import ClienteCreate, ClienteResponse
from backend.services.auth import role_required
from backend.services.org_sync_client import sync_organization_name, OrgSyncError

router = APIRouter(prefix="/entidades", tags=["Entidades"], dependencies=[Depends(role_required(['Admin', 'Ventas', 'Contabilidad']))])

logger = logging.getLogger("koda_entidades")

# =========================================================
# EMPRESA Y SUCURSALES
# =========================================================

class EmpresaPerfilUpdate(BaseModel):
    rif: Optional[str] = None
    razon_social: Optional[str] = None
    nombre_comercial: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    tipo_contribuyente: Optional[str] = None

class SucursalCreate(BaseModel):
    codigo: str
    nombre: str
    ciudad: Optional[str] = None
    estado: str = "Activo"

def _get_or_create_empresa(db: Session, current_user: Profile) -> Empresa:
    emp = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    if not emp:
        # Empresa.rif ahora es único por (tenant_id, rif) — ver
        # UniqueConstraint('_tenant_empresa_rif_uc') en models/erp_extended.py.
        # Este RIF placeholder puede repetirse de forma segura entre tenants.
        emp = Empresa(
            rif="J-40000000-0",
            razon_social="KODA ERP SOLUTIONS, C.A.",
            nombre_comercial="KODA ERP",
            email="admin@koda.com",
            telefono="+58 212 000-0000",
            direccion="Caracas, Venezuela",
            tipo_contribuyente="ORDINARIO",
            tenant_id=current_user.tenant_id,
        )
        db.add(emp)
        db.commit()
        db.refresh(emp)
    return emp

import os
from fastapi import File, UploadFile
import secrets

def _logo_path(tenant_id) -> str:
    """Per-tenant logo file path. Namespaced by tenant_id to avoid one
    tenant's uploaded logo leaking onto another tenant's documents
    (this used to be a single global backend/static/logo.png)."""
    return f"backend/static/logo_{tenant_id}.png"

@router.get("/empresa/perfil", dependencies=[Depends(role_required(['Admin']))])
def obtener_perfil(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    emp = _get_or_create_empresa(db, current_user)
    logo_path = _logo_path(current_user.tenant_id)
    logo_exists = os.path.exists(logo_path)
    return {
        "rif": emp.rif,
        "razon_social": emp.razon_social,
        "nombre_comercial": emp.nombre_comercial or emp.razon_social,
        "email": emp.email,
        "telefono": emp.telefono,
        "direccion": emp.direccion,
        "tipo_contribuyente": emp.tipo_contribuyente,
        "logo_url": f"/api/static/logo_{current_user.tenant_id}.png" if logo_exists else None,
    }

@router.put("/empresa/perfil", dependencies=[Depends(role_required(['Admin']))])
def actualizar_perfil(data: EmpresaPerfilUpdate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    emp = _get_or_create_empresa(db, current_user)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)

    # Sincronización best-effort del nombre visible hacia el sistema
    # institucional (KODA_Remaster/sistema-corporativo/backend), para que el
    # nombre mostrado justo después del login en frontend-enterprise quede
    # consistente con el "Nombre Comercial Público" de este ERP. Se usa
    # nombre_comercial (el campo que esta pantalla realmente expone al
    # usuario) y no razon_social (la razón social fiscal completa, fuente de
    # verdad de la facturación de este ERP, no del nombre mostrado en el
    # otro sistema). Un fallo aquí NUNCA debe hacer fallar el guardado local
    # del perfil: es una comodidad de consistencia visual, no la fuente de
    # verdad de los datos fiscales del ERP.
    nombre_a_sincronizar = emp.nombre_comercial or emp.razon_social
    if nombre_a_sincronizar:
        try:
            sync_organization_name(current_user.tenant_id, nombre_a_sincronizar)
        except OrgSyncError as e:
            logger.warning(
                "No se pudo sincronizar el nombre de organización con "
                f"KODA_Remaster para tenant {current_user.tenant_id}: {e}"
            )

    return {"ok": True}

@router.get("/empresa/sucursales")
def listar_sucursales(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    return db.query(Sucursal).filter(Sucursal.tenant_id == current_user.tenant_id).all()

@router.post("/empresa/sucursales")
def crear_sucursal(data: SucursalCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    s = Sucursal(**data.model_dump(), tenant_id=current_user.tenant_id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.post("/empresa/logo")
async def subir_logo(file: UploadFile = File(...), current_user: Profile = Depends(get_current_user)):
    os.makedirs("backend/static", exist_ok=True)
    logo_path = _logo_path(current_user.tenant_id)
    with open(logo_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"ok": True, "message": "Logo registrado exitosamente", "logo_url": f"/api/static/logo_{current_user.tenant_id}.png"}

@router.post("/empresa/api-tokens")
def crear_token(current_user=Depends(role_required(['Admin']))):
    secure_token = f"koda_live_{secrets.token_hex(24)}"
    return {"ok": True, "token": secure_token}

@router.delete("/empresa/logo")
def eliminar_logo(current_user: Profile = Depends(get_current_user)):
    logo_path = _logo_path(current_user.tenant_id)
    if os.path.exists(logo_path):
        os.remove(logo_path)
        return {"ok": True, "message": "Logo eliminado exitosamente"}
    else:
        raise HTTPException(status_code=404, detail="No hay ningún logo registrado.")
