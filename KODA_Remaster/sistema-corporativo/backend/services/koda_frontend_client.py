"""
services/koda_frontend_client.py
──────────────────────────────────
Cliente HTTP interno hacia koda-frontend/backend (el ERP, un despliegue de
Render COMPLETAMENTE SEPARADO de este backend) para el puente de SSO: cuando
un usuario ya autenticado en ESTE backend abre el "Módulo de Facturación"
embebido (BillingModule.tsx en frontend-enterprise), este cliente pide un
exchange_code de un solo uso para SU `profile_id`, que koda-frontend/backend
puede canjear por una sesión real (ver `routers/sso_bridge.py` de ese
backend).

Estos son dos backends DISTINTOS (JWT secret propio, despliegue propio en
Render), por lo que la comunicación es exclusivamente vía HTTP — nunca
import directo de código de koda-frontend/backend.

Autenticación: header `X-SSO-Bridge-Key` con el valor de la variable de
entorno SSO_BRIDGE_INTERNAL_KEY. Ese valor debe configurarse IDÉNTICO en las
variables de entorno de Render de AMBOS backends. Deliberadamente un secreto
PROPIO, distinto de BOT_INTERNAL_API_KEY/ORG_SYNC_API_KEY: este puente
mintea sesiones de usuario real (autenticación), no sincroniza datos. No
existe valor por defecto ni hardcodeado.
"""
import os
from typing import Optional

import httpx

KODA_FRONTEND_API_URL = os.getenv("KODA_FRONTEND_API_URL", "").strip().rstrip("/")
SSO_BRIDGE_INTERNAL_KEY = os.getenv("SSO_BRIDGE_INTERNAL_KEY", "").strip()


class SsoBridgeError(Exception):
    """Error controlado al comunicarse con el puente de SSO de koda-frontend/backend."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not KODA_FRONTEND_API_URL:
        raise SsoBridgeError(
            "KODA_FRONTEND_API_URL no está configurada en este backend (ver .env.template)."
        )
    if not SSO_BRIDGE_INTERNAL_KEY:
        raise SsoBridgeError(
            "SSO_BRIDGE_INTERNAL_KEY no está configurada en este backend (ver .env.template)."
        )


async def issue_sso_bridge_exchange_code(profile_id: str, timeout: float = 5.0) -> str:
    """
    POST {KODA_FRONTEND_API_URL}/internal/auth/sso-bridge/issue

    Devuelve el `exchange_code` de un solo uso emitido por koda-frontend
    para `profile_id`. Lanza SsoBridgeError (con `status_code` cuando la
    causa es una respuesta HTTP del ERP, p. ej. 404 si ese profile_id no
    tiene cuenta provisionada ahí) ante cualquier problema, para que el
    llamador (routers/auth_router.py) decida cómo traducirlo a un mensaje
    de usuario claro.

    Timeout corto (5s) + 2 intentos con un único backoff de 2s: peor caso
    ~12s de espera total para UN click de usuario. Antes eran 3 intentos de
    60s con backoff [0, 2, 5] = hasta ~187s en un solo click, lo cual
    generaba el síntoma de "error distinto en cada click" (timeouts de la
    plataforma/proxy interactuando mal con una espera de más de 3 minutos).
    El ERP (koda-frontend en Render) tiene cold starts reales de 30-60s,
    pero para ese caso es mejor fallar rápido y dejar que el usuario (o un
    único retry del frontend) reintente, que colgar el request casi 3
    minutos.
    """
    _require_config()

    url = f"{KODA_FRONTEND_API_URL}/internal/auth/sso-bridge/issue"
    headers = {"X-SSO-Bridge-Key": SSO_BRIDGE_INTERNAL_KEY}

    last_error = None
    retry_delays = [0, 2.0]  # segundos antes de cada intento

    for attempt in range(2):
        if attempt > 0:
            import asyncio
            await asyncio.sleep(retry_delays[attempt])

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, json={"profile_id": profile_id}, headers=headers)
        except httpx.HTTPError as e:
            last_error = SsoBridgeError(f"No se pudo contactar al ERP (koda-frontend): {e}")
            continue  # Reintentar en errores de conexión

        if response.status_code >= 500:
            # Errores de servidor: reintentar
            last_error = SsoBridgeError(
                f"ERP respondió con error {response.status_code}",
                status_code=response.status_code,
            )
            continue

        if response.status_code >= 400:
            # Errores de negocio (4xx): NO reintentar
            detail = response.text
            try:
                body = response.json()
                detail = body.get("detail", detail)
            except Exception:
                pass
            raise SsoBridgeError(str(detail), status_code=response.status_code)

        try:
            data = response.json()
        except Exception:
            raise SsoBridgeError("Respuesta inválida del ERP al emitir el código de intercambio.")

        code = data.get("exchange_code")
        if not code:
            raise SsoBridgeError("El ERP no devolvió un exchange_code válido.")
        return code

    # Agotados los reintentos
    if last_error:
        raise last_error
    raise SsoBridgeError("No se pudo contactar al ERP después de 2 intentos.")
