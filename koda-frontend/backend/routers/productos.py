import os
import uuid

import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from typing import List

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.operations import Producto
from backend.schemas.operations import ProductoCreate, ProductoResponse

router = APIRouter(prefix="/productos", tags=["Productos"])

# =========================================================
# SUBIDA DE IMÁGENES DE PRODUCTO (Supabase Storage)
# =========================================================
# Requiere las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
# (ver koda-frontend/.env.template). El bucket "productos" debe existir en
# el proyecto de Supabase con una política de lectura pública, ya que las
# imágenes se sirven luego vía la URL pública devuelta por Storage.
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_STORAGE_BUCKET_PRODUCTOS = os.getenv("SUPABASE_STORAGE_BUCKET_PRODUCTOS", "productos")

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


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


@router.post("/{producto_id}/imagen", response_model=ProductoResponse)
async def subir_imagen_producto(
    producto_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    """Sube una imagen de producto a Supabase Storage y guarda la URL pública en imagen_url."""
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.tenant_id == current_user.tenant_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF.",
        )

    contenido = await file.read()
    if len(contenido) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="La imagen supera el tamaño máximo permitido (5MB).",
        )
    if len(contenido) == 0:
        raise HTTPException(status_code=400, detail="El archivo de imagen está vacío.")

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "El almacenamiento de imágenes no está configurado en el servidor "
                "(faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
            ),
        )

    extension = os.path.splitext(file.filename or "")[1] or ".jpg"
    object_path = f"{current_user.tenant_id}/{producto_id}/{uuid.uuid4().hex}{extension}"

    upload_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET_PRODUCTOS}/{object_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": file.content_type,
        "x-upsert": "true",
    }

    try:
        resp = requests.post(upload_url, headers=headers, data=contenido, timeout=15)
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo contactar el almacenamiento de imágenes: {exc}",
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Error al subir la imagen al almacenamiento ({resp.status_code}): {resp.text}",
        )

    public_url = (
        f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/"
        f"{SUPABASE_STORAGE_BUCKET_PRODUCTOS}/{object_path}"
    )

    producto.imagen_url = public_url
    db.commit()
    db.refresh(producto)
    return producto
