"""
services/org_sync_client.py
────────────────────────────
Cliente HTTP interno hacia KODA_Remaster/sistema-corporativo/backend (el
sistema institucional/landing/login, desplegado como un servicio Render
DISTINTO de este ERP) para propagar el "Nombre Comercial Público" de la
Empresa hacia `organizations.name` de ESE backend, de modo que el nombre
mostrado justo después del login en `frontend-enterprise` quede consistente
con el configurado en Perfil de Empresa de este ERP.

Estos son dos backends DISTINTOS (JWT secret propio, despliegue propio en
Render, tabla `organizations` propia vía asyncpg), por lo que la
comunicación es exclusivamente vía HTTP — nunca import directo de código de
KODA_Remaster/sistema-corporativo/backend.

Autenticación: header `X-Internal-Api-Key` con el valor de la variable de
entorno ORG_SYNC_API_KEY (ver backend.core.security). Ese valor debe
configurarse IDÉNTICO en las variables de entorno de Render de AMBOS
backends. No existe valor por defecto ni hardcodeado.

Deliberadamente best-effort: esta sincronización es una comodidad de
consistencia visual para el sistema institucional, NO la fuente de verdad
de los datos fiscales del ERP (eso sigue siendo la tabla `Empresa` de este
backend). Un fallo aquí NUNCA debe hacer fallar el guardado local del
perfil de empresa — ver `routers/entidades.py::actualizar_perfil`, que
envuelve la llamada a `sync_organization_name` en su propio try/except.
"""
import os
from typing import Optional

import requests

from backend.core.security import ORG_SYNC_API_KEY

KODA_REMASTER_API_URL = os.getenv("KODA_REMASTER_API_URL", "").strip().rstrip("/")


class OrgSyncError(Exception):
    """Error controlado al comunicarse con la API interna de KODA_Remaster."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def sync_organization_name(tenant_id, nombre: str, timeout: float = 5.0) -> None:
    """
    PUT {KODA_REMASTER_API_URL}/internal/organizations/{tenant_id}/name

    Lanza OrgSyncError ante cualquier problema (config faltante, red,
    respuesta >= 400) para que el llamador decida cómo manejarlo. No
    devuelve nada en el caso exitoso: al llamador (routers/entidades.py) no
    le hace falta el cuerpo de la respuesta, solo saber si falló o no.
    """
    if not KODA_REMASTER_API_URL:
        raise OrgSyncError(
            "KODA_REMASTER_API_URL no está configurada en este backend (ver .env.template)."
        )

    url = f"{KODA_REMASTER_API_URL}/internal/organizations/{tenant_id}/name"
    headers = {"X-Internal-Api-Key": ORG_SYNC_API_KEY}

    try:
        response = requests.put(url, json={"name": nombre}, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        raise OrgSyncError(f"No se pudo contactar al sistema institucional (KODA_Remaster): {e}")

    if response.status_code >= 400:
        detail = response.text
        try:
            body = response.json()
            detail = body.get("detail", detail)
        except Exception:
            pass
        raise OrgSyncError(str(detail), status_code=response.status_code)
