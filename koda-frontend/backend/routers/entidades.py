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

router = APIRouter(prefix="/entidades", tags=["Entidades"], dependencies=[Depends(role_required(['Admin', 'Ventas', 'Contabilidad']))])

# =========================================================
# CLIENTES
# =========================================================

@router.get("/clientes", response_model=List[ClienteResponse])
@router.get("/clientes/", response_model=List[ClienteResponse], include_in_schema=False)
def listar_clientes(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    return db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()

@router.post("/clientes", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED)
@router.post("/clientes/", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def crear_cliente(cliente: ClienteCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    # RIF es único por tenant (ver UniqueConstraint('tenant_id', 'rif') en el modelo Cliente),
    # por lo que la validación de duplicados también debe estar acotada al tenant.
    db_cliente = db.query(Cliente).filter(
        Cliente.rif == cliente.rif,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if db_cliente:
        raise HTTPException(status_code=400, detail="El RIF/Cédula ya existe")
    nuevo_cliente = Cliente(**cliente.model_dump(), tenant_id=current_user.tenant_id)
    db.add(nuevo_cliente)
    db.commit()
    db.refresh(nuevo_cliente)
    return nuevo_cliente

@router.get("/clientes/{cliente_id}", response_model=ClienteResponse)
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente

@router.put("/clientes/{cliente_id}", response_model=ClienteResponse)
def actualizar_cliente(cliente_id: int, cliente_update: ClienteCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    duplicado = db.query(Cliente).filter(
        Cliente.rif == cliente_update.rif,
        Cliente.id != cliente_id,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="El RIF/Cédula ya está en uso por otro cliente")

    for key, value in cliente_update.model_dump().items():
        setattr(cliente, key, value)
    db.commit()
    db.refresh(cliente)
    return cliente

@router.delete("/clientes/{cliente_id}")
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    db.delete(cliente)
    db.commit()
    return {"message": "Cliente eliminado exitosamente"}


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
