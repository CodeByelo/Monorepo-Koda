import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.operations import Cliente
from backend.schemas.operations import ClienteCreate, ClienteResponse
from backend.services.auth import role_required

router = APIRouter(prefix="/clientes", tags=["Clientes"], dependencies=[Depends(get_current_user)])

logger = logging.getLogger("koda_clientes")


@router.get("/segmentos")
def segmentos_clientes():
    return ["Mayorista", "Minorista", "Distribuidor", "Corporativo"]


@router.get("", response_model=List[ClienteResponse])
@router.get("/", response_model=List[ClienteResponse], include_in_schema=False)
def listar_clientes(
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    return db.query(Cliente).filter(
        Cliente.tenant_id == current_user.tenant_id
    ).order_by(Cliente.id.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def crear_cliente(
    cliente: ClienteCreate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    # RIF es único por tenant
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


@router.get("/{cliente_id}", response_model=ClienteResponse)
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.tenant_id == current_user.tenant_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


@router.put("/{cliente_id}", response_model=ClienteResponse)
def actualizar_cliente(
    cliente_id: int,
    cliente_update: ClienteCreate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
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


@router.delete("/{cliente_id}")
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
