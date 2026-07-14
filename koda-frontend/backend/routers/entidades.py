from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.core.database import get_db
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
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(Cliente).all()

@router.post("/clientes", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED)
@router.post("/clientes/", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def crear_cliente(cliente: ClienteCreate, db: Session = Depends(get_db)):
    db_cliente = db.query(Cliente).filter(Cliente.rif == cliente.rif).first()
    if db_cliente:
        raise HTTPException(status_code=400, detail="El RIF/Cédula ya existe")
    nuevo_cliente = Cliente(**cliente.model_dump())
    db.add(nuevo_cliente)
    db.commit()
    db.refresh(nuevo_cliente)
    return nuevo_cliente

@router.get("/clientes/{cliente_id}", response_model=ClienteResponse)
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente

@router.put("/clientes/{cliente_id}", response_model=ClienteResponse)
def actualizar_cliente(cliente_id: int, cliente_update: ClienteCreate, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    duplicado = db.query(Cliente).filter(Cliente.rif == cliente_update.rif, Cliente.id != cliente_id).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="El RIF/Cédula ya está en uso por otro cliente")
        
    for key, value in cliente_update.model_dump().items():
        setattr(cliente, key, value)
    db.commit()
    db.refresh(cliente)
    return cliente

@router.delete("/clientes/{cliente_id}")
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
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

def _get_or_create_empresa(db: Session) -> Empresa:
    emp = db.query(Empresa).first()
    if not emp:
        emp = Empresa(
            rif="J-40000000-0",
            razon_social="KODA ERP SOLUTIONS, C.A.",
            nombre_comercial="KODA ERP",
            email="admin@koda.com",
            telefono="+58 212 000-0000",
            direccion="Caracas, Venezuela",
            tipo_contribuyente="ORDINARIO",
        )
        db.add(emp)
        db.commit()
        db.refresh(emp)
    return emp

import os
from fastapi import File, UploadFile
import secrets

@router.get("/empresa/perfil", dependencies=[Depends(role_required(['Admin']))])
def obtener_perfil(db: Session = Depends(get_db)):
    emp = _get_or_create_empresa(db)
    logo_exists = os.path.exists("backend/static/logo.png")
    return {
        "rif": emp.rif,
        "razon_social": emp.razon_social,
        "nombre_comercial": emp.nombre_comercial or emp.razon_social,
        "email": emp.email,
        "telefono": emp.telefono,
        "direccion": emp.direccion,
        "tipo_contribuyente": emp.tipo_contribuyente,
        "logo_url": "/api/static/logo.png" if logo_exists else None,
    }

@router.put("/empresa/perfil", dependencies=[Depends(role_required(['Admin']))])
def actualizar_perfil(data: EmpresaPerfilUpdate, db: Session = Depends(get_db)):
    emp = _get_or_create_empresa(db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)
    return {"ok": True}

@router.get("/empresa/sucursales")
def listar_sucursales(db: Session = Depends(get_db)):
    return db.query(Sucursal).all()

@router.post("/empresa/sucursales")
def crear_sucursal(data: SucursalCreate, db: Session = Depends(get_db)):
    s = Sucursal(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.post("/empresa/logo")
async def subir_logo(file: UploadFile = File(...)):
    os.makedirs("backend/static", exist_ok=True)
    logo_path = "backend/static/logo.png"
    with open(logo_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"ok": True, "message": "Logo registrado exitosamente", "logo_url": "/api/static/logo.png"}

@router.post("/empresa/api-tokens")
def crear_token(current_user=Depends(role_required(['Admin']))):
    secure_token = f"koda_live_{secrets.token_hex(24)}"
    return {"ok": True, "token": secure_token}

@router.delete("/empresa/logo")
def eliminar_logo():
    logo_path = "backend/static/logo.png"
    if os.path.exists(logo_path):
        os.remove(logo_path)
        return {"ok": True, "message": "Logo eliminado exitosamente"}
    else:
        raise HTTPException(status_code=404, detail="No hay ningún logo registrado.")
