import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.operations import Cliente
from backend.models.erp_extended import Empresa, Sucursal, PlantillaDocumento
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
    instagram: Optional[str] = None
    mensaje_garantia: Optional[str] = None

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



# Catálogo cerrado de campos configurables del ticket — el frontend (Fase 3)
# debe restringirse a estos IDs; cualquier otro se rechaza para no permitir
# que un config corrupto/arbitrario rompa el render del PDF.
CAMPOS_TICKET_VALIDOS = {
    "logo", "empresa_nombre", "empresa_rif", "empresa_direccion", "empresa_telefono",
    "factura_numero", "factura_fecha", "cliente", "tabla_productos_inicio",
    "subtotal", "descuentos", "iva", "igtf", "total", "metodo_pago", "tasa_bcv", "total_bs",
    "garantia_texto", "agradecimiento", "instagram",
}

# Diseño por defecto: reproduce el layout actual del ticket (el que ya está
# en producción) expresado como coordenadas, para que un tenant sin
# configuración propia vea exactamente lo mismo que ve hoy.
DEFAULT_TICKET_TEMPLATE = {
    "logo":                   {"x": 40, "y": 6,  "font_size": 0,  "bold": False, "align": "center", "visible": True},
    "empresa_nombre":         {"x": 40, "y": 26, "font_size": 10, "bold": True,  "align": "center", "visible": True},
    "empresa_direccion":      {"x": 40, "y": 30, "font_size": 8,  "bold": False, "align": "center", "visible": True},
    "empresa_rif":            {"x": 40, "y": 34, "font_size": 8,  "bold": False, "align": "center", "visible": True},
    "empresa_telefono":       {"x": 40, "y": 38, "font_size": 8,  "bold": False, "align": "center", "visible": True},
    "factura_numero":         {"x": 40, "y": 42, "font_size": 8,  "bold": True,  "align": "center", "visible": True},
    "factura_fecha":          {"x": 40, "y": 46, "font_size": 8,  "bold": False, "align": "center", "visible": True},
    "cliente":                {"x": 40, "y": 51, "font_size": 8,  "bold": False, "align": "center", "visible": True},
    "tabla_productos_inicio": {"x": 4,  "y": 58, "font_size": 8,  "bold": False, "align": "left",   "visible": True},
    "subtotal":               {"x": 4,  "y": 0,  "font_size": 8,  "bold": False, "align": "left",   "visible": True},
    "descuentos":             {"x": 4,  "y": 0,  "font_size": 8,  "bold": False, "align": "left",   "visible": True},
    "iva":                    {"x": 4,  "y": 0,  "font_size": 8,  "bold": False, "align": "left",   "visible": True},
    "igtf":                   {"x": 4,  "y": 0,  "font_size": 8,  "bold": False, "align": "left",   "visible": True},
    "total":                  {"x": 4,  "y": 0,  "font_size": 10, "bold": True,  "align": "left",   "visible": True},
    "metodo_pago":            {"x": 40, "y": 0,  "font_size": 8,  "bold": False, "align": "center", "visible": True},
    "tasa_bcv":               {"x": 4,  "y": 0,  "font_size": 8,  "bold": False, "align": "left",   "visible": True},
    "total_bs":               {"x": 4,  "y": 0,  "font_size": 9,  "bold": True,  "align": "left",   "visible": True},
    "garantia_texto":         {"x": 40, "y": 0,  "font_size": 7,  "bold": False, "align": "center", "visible": True, "texto": ""},
    "agradecimiento":         {"x": 40, "y": 0,  "font_size": 8,  "bold": True,  "align": "center", "visible": True, "texto": "¡Gracias por su compra!"},
    "instagram":              {"x": 40, "y": 0,  "font_size": 8,  "bold": False, "align": "center", "visible": True},
}
# Nota: los campos con "y": 0 se calculan dinámicamente en el momento de
# generar el PDF (fluyen después de la tabla de productos, cuya altura
# varía por venta) — su "y" guardado se IGNORA para esos campos específicos
# en la Fase 1. Solo importan su font_size/bold/align/visible. Esto se
# documenta también en el endpoint GET para que el futuro editor visual
# (Fase 3) sepa que esos campos no se pueden arrastrar verticalmente,
# solo activar/desactivar y cambiar estilo.

class PlantillaTicketUpdate(BaseModel):
    config: dict

@router.get("/plantilla-ticket")
def obtener_plantilla_ticket(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    plantilla = db.query(PlantillaDocumento).filter(
        PlantillaDocumento.tenant_id == current_user.tenant_id,
        PlantillaDocumento.tipo_documento == "ticket",
    ).first()
    if plantilla:
        # Merge sobre el default: si en el futuro se agregan campos nuevos
        # al default, un tenant con config antigua no se queda sin ellos.
        merged = {**DEFAULT_TICKET_TEMPLATE, **plantilla.config}
        return {"config": merged, "es_personalizado": True}
    return {"config": DEFAULT_TICKET_TEMPLATE, "es_personalizado": False}

@router.put("/plantilla-ticket", dependencies=[Depends(role_required(['Admin']))])
def guardar_plantilla_ticket(
    payload: PlantillaTicketUpdate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    claves_invalidas = set(payload.config.keys()) - CAMPOS_TICKET_VALIDOS
    if claves_invalidas:
        raise HTTPException(
            status_code=400,
            detail=f"Campos no reconocidos: {', '.join(claves_invalidas)}",
        )
    for campo_id, estilo in payload.config.items():
        if not isinstance(estilo, dict):
            raise HTTPException(status_code=400, detail=f"Configuración inválida para '{campo_id}'.")
        x, y = estilo.get("x"), estilo.get("y")
        if x is not None and not (0 <= x <= 80):
            raise HTTPException(status_code=400, detail=f"'{campo_id}': x debe estar entre 0 y 80mm (ancho del ticket).")
        if y is not None and not (0 <= y <= 400):
            raise HTTPException(status_code=400, detail=f"'{campo_id}': y fuera de rango.")

    plantilla = db.query(PlantillaDocumento).filter(
        PlantillaDocumento.tenant_id == current_user.tenant_id,
        PlantillaDocumento.tipo_documento == "ticket",
    ).first()
    if plantilla:
        plantilla.config = payload.config
        plantilla.actualizado_por = getattr(current_user, "id", None)
    else:
        plantilla = PlantillaDocumento(
            tenant_id=current_user.tenant_id,
            tipo_documento="ticket",
            config=payload.config,
            actualizado_por=getattr(current_user, "id", None),
        )
        db.add(plantilla)
    db.commit()
    return {"ok": True, "config": plantilla.config}

import os
import uuid
import requests
from fastapi import File, UploadFile
import secrets

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_STORAGE_BUCKET_DOCS = os.getenv("SUPABASE_STORAGE_BUCKET", "documentos")

ALLOWED_LOGO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

def _logo_path(tenant_id) -> str:
    """Ruta local fallback de almacenamiento para desarrollo sin Supabase."""
    return f"backend/static/logo_{tenant_id}.png"

def get_empresa_logo_image(empresa, tenant_id):
    """
    Retorna un objeto compatible con ReportLab (ImageReader o ruta local)
    soportando tanto URLs públicas de Supabase Storage en la nube como rutas locales.
    Retorna None si no hay logo o si la descarga falla.
    """
    import io
    import requests
    from reportlab.lib.utils import ImageReader

    logo_url = getattr(empresa, "logo_url", None)
    if logo_url and logo_url.startswith("http"):
        try:
            resp = requests.get(logo_url, timeout=3.5)
            if resp.status_code == 200 and len(resp.content) > 0:
                return ImageReader(io.BytesIO(resp.content))
        except Exception:
            pass

    # Fallback local
    local_path = _logo_path(tenant_id)
    if os.path.exists(local_path):
        try:
            return ImageReader(local_path)
        except Exception:
            pass

    return None

@router.get("/empresa/perfil", dependencies=[Depends(role_required(['Admin']))])
def obtener_perfil(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    emp = _get_or_create_empresa(db, current_user)
    
    logo_url = emp.logo_url
    if not logo_url:
        logo_path = _logo_path(current_user.tenant_id)
        if os.path.exists(logo_path):
            logo_url = f"/static/logo_{current_user.tenant_id}.png"

    return {
        "rif": emp.rif,
        "razon_social": emp.razon_social,
        "nombre_comercial": emp.nombre_comercial or emp.razon_social,
        "email": emp.email,
        "telefono": emp.telefono,
        "direccion": emp.direccion,
        "tipo_contribuyente": emp.tipo_contribuyente,
        "logo_url": logo_url,
        "instagram": emp.instagram,
        "mensaje_garantia": emp.mensaje_garantia,
    }

@router.put("/empresa/perfil", dependencies=[Depends(role_required(['Admin']))])
def actualizar_perfil(data: EmpresaPerfilUpdate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    emp = _get_or_create_empresa(db, current_user)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)

    # Sincronización best-effort del nombre visible hacia el sistema institucional
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
async def subir_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    emp = _get_or_create_empresa(db, current_user)

    if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Formato de imagen no soportado. Usa PNG, JPG, WEBP o SVG.",
        )

    contenido = await file.read()
    if len(contenido) > MAX_LOGO_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="El logo supera el tamaño máximo permitido (5MB).",
        )
    if len(contenido) == 0:
        raise HTTPException(status_code=400, detail="El archivo de logo está vacío.")

    # Si Supabase Storage está disponible, guardar en bucket persistente en la nube
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        extension = os.path.splitext(file.filename or "")[1] or ".png"
        object_path = f"logos/{current_user.tenant_id}/logo{extension}"
        upload_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET_DOCS}/{object_path}"
        headers = {
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": file.content_type or "image/png",
            "x-upsert": "true",
        }

        try:
            resp = requests.post(upload_url, headers=headers, data=contenido, timeout=15)
            if resp.status_code in (200, 201):
                public_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET_DOCS}/{object_path}"
                emp.logo_url = public_url
                db.commit()
                db.refresh(emp)
                return {"ok": True, "message": "Logo registrado exitosamente", "logo_url": public_url}
            else:
                logger.error(f"Error al subir logo a Supabase Storage ({resp.status_code}): {resp.text}")
        except requests.RequestException as exc:
            logger.error(f"Fallo de conexión a Supabase Storage: {exc}")

    # Fallback local (desarrollo o sin Supabase configurado)
    os.makedirs("backend/static", exist_ok=True)
    logo_path = _logo_path(current_user.tenant_id)
    with open(logo_path, "wb") as buffer:
        buffer.write(contenido)
    
    local_url = f"/static/logo_{current_user.tenant_id}.png"
    emp.logo_url = local_url
    db.commit()
    db.refresh(emp)

    return {"ok": True, "message": "Logo registrado exitosamente", "logo_url": local_url}

@router.post("/empresa/api-tokens")
def crear_token(current_user=Depends(role_required(['Admin']))):
    secure_token = f"koda_live_{secrets.token_hex(24)}"
    return {"ok": True, "token": secure_token}

@router.delete("/empresa/logo")
def eliminar_logo(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    emp = _get_or_create_empresa(db, current_user)
    
    # Limpiar en Supabase si aplica
    if emp.logo_url and SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and "storage/v1/object" in emp.logo_url:
        try:
            # Extraer path del objeto
            object_path = emp.logo_url.split(f"/{SUPABASE_STORAGE_BUCKET_DOCS}/")[-1]
            del_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET_DOCS}/{object_path}"
            headers = {
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
            }
            requests.delete(del_url, headers=headers, timeout=10)
        except Exception as e:
            logger.warning(f"No se pudo eliminar logo de Supabase Storage: {e}")

    # Limpiar en disco local si existe
    logo_path = _logo_path(current_user.tenant_id)
    if os.path.exists(logo_path):
        try:
            os.remove(logo_path)
        except Exception:
            pass

    emp.logo_url = None
    db.commit()
    return {"ok": True, "message": "Logo eliminado exitosamente"}
