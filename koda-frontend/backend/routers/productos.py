from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.operations import Producto
from backend.schemas.operations import ProductoCreate, ProductoResponse

router = APIRouter(prefix="/productos", tags=["Productos"])


@router.get("", response_model=List[ProductoResponse])
@router.get("/", response_model=List[ProductoResponse])
def listar_productos(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    return db.query(Producto).filter(Producto.tenant_id == current_user.tenant_id).all()

@router.post("/", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED)
def crear_producto(producto: ProductoCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    # NOTA: Producto.sku tiene unique=True a nivel de columna (global, no por tenant),
    # a diferencia de Cliente.rif que sí tiene UniqueConstraint('tenant_id', 'rif').
    # Este chequeo de duplicados queda acotado al tenant por consistencia con el resto
    # del patrón, pero la restricción real en base de datos sigue siendo global; dos
    # tenants distintos aún no podrán compartir un mismo SKU (IntegrityError en el insert).
    # TODO: evaluar si Producto.sku debería migrarse a UniqueConstraint('tenant_id', 'sku').
    db_producto = db.query(Producto).filter(
        Producto.sku == producto.sku,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if db_producto:
        raise HTTPException(status_code=400, detail="El SKU ya existe")
    nuevo_producto = Producto(**producto.model_dump(), tenant_id=current_user.tenant_id)
    db.add(nuevo_producto)
    db.commit()
    db.refresh(nuevo_producto)
    return nuevo_producto

@router.get("/{producto_id}", response_model=ProductoResponse)
def obtener_producto(producto_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto

@router.put("/{producto_id}", response_model=ProductoResponse)
def actualizar_producto(producto_id: int, producto_update: ProductoCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Validar que SKU no choque
    duplicado = db.query(Producto).filter(
        Producto.sku == producto_update.sku,
        Producto.id != producto_id,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="El SKU ya está en uso por otro producto")

    for key, value in producto_update.model_dump().items():
        setattr(producto, key, value)
    db.commit()
    db.refresh(producto)
    return producto

@router.delete("/{producto_id}")
def eliminar_producto(producto_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(producto)
    db.commit()
    return {"message": "Producto eliminado exitosamente"}
