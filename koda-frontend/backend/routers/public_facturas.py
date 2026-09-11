import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models.operations import Venta
from backend.models.erp_extended import Empresa
from backend.utils.ip_utils import get_real_ip_str

public_facturas_router = APIRouter(
    prefix="/public/facturas",
    tags=["Facturas Públicas (Solo Lectura QR)"]
)

# ── Rate Limiter Simple en Memoria para Consulta Pública ─────────────────────
# Límite: 20 peticiones por minuto por IP
# Estructura: ip -> lista de timestamps (float)
_RATE_LIMIT_MAX_REQUESTS = 20
_RATE_LIMIT_WINDOW_SECONDS = 60
_ip_request_history: dict[str, list[float]] = defaultdict(list)


def _check_public_rate_limit(request: Request) -> None:
    now = time.time()
    client_ip = get_real_ip_str(request) or "unknown"
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    # Limpiar timestamps antiguos fuera de la ventana
    history = _ip_request_history[client_ip]
    _ip_request_history[client_ip] = [t for t in history if t > window_start]

    if len(_ip_request_history[client_ip]) >= _RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes. Por favor intente más tarde.",
            headers={"Retry-After": str(_RATE_LIMIT_WINDOW_SECONDS)}
        )

    _ip_request_history[client_ip].append(now)


# ── Esquema de Respuesta Mínimo (Zero PII, Zero Tokens) ──────────────────────
class FacturaPublicaResponse(BaseModel):
    empresa_emisor: str
    empresa_rif: str
    numero_factura: str
    fecha: str
    total_usd: float
    total_bs: float | None = None
    tasa_cambio_bs: float | None = None
    estado: str


@public_facturas_router.get(
    "/{qr_token}",
    response_model=FacturaPublicaResponse,
    summary="Consulta pública y segura de factura vía QR",
    description="Permite consultar los datos públicos mínimos de una factura escaneada. No requiere autenticación y no emite tokens ni expone datos del cliente."
)
def consultar_factura_publica(
    qr_token: str,
    request: Request,
    db: Session = Depends(get_db)
):
    # 1. Aplicar rate limit por IP
    _check_public_rate_limit(request)

    # 2. Buscar venta por qr_token exacto.
    # Si el formato no es UUID o no existe, siempre responder un 404 genérico idéntico
    # para evitar fuga de información por análisis diferencial.
    venta = None
    try:
        import uuid as _uuid
        # Intentar parsear a UUID para evitar errores de sintaxis en DB
        token_uuid = _uuid.UUID(str(qr_token).strip())
        venta = db.query(Venta).filter(Venta.qr_token == token_uuid).first()
    except Exception:
        venta = None

    if not venta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Factura no encontrada."
        )

    # 3. Obtener información pública de la empresa emisora
    empresa = None
    if venta.tenant_id:
        empresa = db.query(Empresa).filter(Empresa.tenant_id == venta.tenant_id).first()

    nombre_empresa = (
        (empresa.razon_social or empresa.nombre_comercial).strip()
        if empresa and (empresa.razon_social or empresa.nombre_comercial)
        else "EMPRESA EMISORA"
    )
    rif_empresa = (empresa.rif or "N/A").strip() if empresa else "N/A"

    # 4. Calcular total en Bs según tasa congelada en la venta
    total_usd = float(venta.total_usd or 0.0)
    tasa_bs = float(venta.tasa_cambio_bs or 0.0)
    total_bs = round(total_usd * tasa_bs, 2) if tasa_bs > 0 else None

    # 5. Retornar DTO estricto: SIN PII, SIN JWT, SIN SESIONES
    return FacturaPublicaResponse(
        empresa_emisor=nombre_empresa,
        empresa_rif=rif_empresa,
        numero_factura=str(venta.numero_factura),
        fecha=venta.fecha.isoformat() if venta.fecha else "",
        total_usd=round(total_usd, 2),
        total_bs=total_bs,
        tasa_cambio_bs=round(tasa_bs, 4) if tasa_bs > 0 else None,
        estado=str(venta.estado or "ACTIVA").upper()
    )
