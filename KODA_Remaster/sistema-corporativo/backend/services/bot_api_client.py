"""
services/bot_api_client.py
──────────────────────────
Cliente HTTP interno hacia koda-frontend/backend (desplegado como el servicio
Render "koda-backend-contable") para las operaciones que el bot de Telegram de
ESTE backend (sistema-corporativo) necesita delegar: registrar una venta,
consultar stock de un SKU y obtener alertas de inventario.

Estos son dos backends DISTINTOS (JWT secret propio, despliegue propio en
Render), por lo que la comunicación es exclusivamente vía HTTP — nunca import
directo de código de koda-frontend/backend.

Autenticación: header `X-Bot-Api-Key` con el valor de la variable de entorno
BOT_INTERNAL_API_KEY. Ese valor debe configurarse IDÉNTICO en las variables de
entorno de Render de AMBOS backends. No existe valor por defecto ni hardcodeado:
si falta la configuración, las llamadas fallan explícitamente (BotApiError) en
lugar de intentar con una clave insegura.
"""
import os
import logging
from typing import Optional, Any

import httpx

logger = logging.getLogger("sistema_corporativo")

KODA_FRONTEND_API_URL = os.getenv("KODA_FRONTEND_API_URL", "").strip().rstrip("/")
BOT_INTERNAL_API_KEY = os.getenv("BOT_INTERNAL_API_KEY", "").strip()


class BotApiError(Exception):
    """Error controlado al comunicarse con la API interna del bot en koda-frontend/backend."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not KODA_FRONTEND_API_URL:
        raise BotApiError(
            "KODA_FRONTEND_API_URL no está configurada en este backend "
            "(ver .env.template)."
        )
    if not BOT_INTERNAL_API_KEY:
        raise BotApiError(
            "BOT_INTERNAL_API_KEY no está configurada en este backend "
            "(ver .env.template)."
        )


async def _request(method: str, path: str, **kwargs) -> Any:
    _require_config()
    url = f"{KODA_FRONTEND_API_URL}{path}"
    headers = kwargs.pop("headers", {}) or {}
    headers["X-Bot-Api-Key"] = BOT_INTERNAL_API_KEY

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.request(method, url, headers=headers, **kwargs)
    except httpx.HTTPError as e:
        logger.error(f"[BOT_API] Error de red al llamar {method} {path}: {e}")
        raise BotApiError(
            f"No se pudo contactar al servicio de ventas/inventario: {e}"
        )

    if response.status_code >= 400:
        detail = response.text
        try:
            body = response.json()
            detail = body.get("detail", detail)
        except Exception:
            pass
        raise BotApiError(str(detail), status_code=response.status_code)

    try:
        return response.json()
    except Exception:
        return {}


async def get_stock(tenant_id: str, sku: str) -> dict:
    """GET {KODA_FRONTEND_API_URL}/bot/stock?tenant_id=...&sku=..."""
    return await _request(
        "GET", "/bot/stock", params={"tenant_id": tenant_id, "sku": sku}
    )


async def buscar_productos(tenant_id: str, query: str) -> list:
    """GET {KODA_FRONTEND_API_URL}/bot/productos/buscar?tenant_id=...&q=..."""
    data = await _request(
        "GET", "/bot/productos/buscar", params={"tenant_id": tenant_id, "q": query}
    )
    if isinstance(data, dict):
        return data.get("resultados") or []
    return data or []


async def get_alertas(tenant_id: str) -> list:
    """GET {KODA_FRONTEND_API_URL}/bot/alertas?tenant_id=..."""
    data = await _request("GET", "/bot/alertas", params={"tenant_id": tenant_id})
    if isinstance(data, dict):
        return data.get("alertas") or data.get("items") or []
    return data or []


async def registrar_venta(
    tenant_id: str,
    vendedor_id,
    cliente_rif: Optional[str],
    lineas: list,
    metodo_pago: str,
    moneda_documento: str,
) -> dict:
    """POST {KODA_FRONTEND_API_URL}/bot/venta"""
    payload = {
        "tenant_id": tenant_id,
        "vendedor_id": vendedor_id,
        "cliente_rif": cliente_rif,
        "lineas": lineas,
        "metodo_pago": metodo_pago,
        "moneda_documento": moneda_documento,
    }
    return await _request("POST", "/bot/venta", json=payload)
