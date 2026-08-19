"""
Test de seguridad de GET /auth/koda-frontend/exchange-code
(routers/auth_router.py), el lado de KODA_Remaster/sistema-corporativo/backend
del puente de SSO real hacia koda-frontend/backend.

Mismo estilo que tests/test_tenancy.py: `from main import app`,
`TestClient(app)`, JWT firmado con el JWT_SECRET real del entorno (main.py
ya falla al importar si falta).

Este test NO requiere una base de datos real ni red: el endpoint bajo
prueba solo depende de `get_current_user` (JWT ya validado por
`auth.supabase_auth`) y de `services.koda_frontend_client`, que aquí se
reemplaza por un doble de prueba para poder aserir, sin red ni Postgres,
CUÁL `profile_id` terminó usándose.

Caso cubierto (explícitamente pedido): el `profile_id` que se le pide a
koda-frontend SIEMPRE debe salir del JWT de la sesión actual
(`current_user["sub"]`), NUNCA de un valor que el cliente intente inyectar
en la petición (aquí, vía query string, el único canal disponible en un
GET) — de lo contrario sería una vulnerabilidad de account-takeover.
"""
import os

from fastapi.testclient import TestClient
from jose import jwt

from main import app
from auth.supabase_auth import get_current_user
import services.koda_frontend_client as koda_frontend_client
import routers.auth_router as auth_router_module

# main.py ya falla al importar si JWT_SECRET no está definido o es débil,
# así que si llegamos hasta acá ya sabemos que existe (igual que
# tests/test_tenancy.py).
SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"

REAL_PROFILE_ID = "11111111-1111-1111-1111-111111111111"
ATTACKER_PROFILE_ID = "99999999-9999-9999-9999-999999999999"

client = TestClient(app)


def _make_token(profile_id: str) -> str:
    return jwt.encode({"sub": profile_id, "role": "Usuario"}, SECRET_KEY, algorithm=ALGORITHM)


def test_exchange_code_usa_profile_id_del_jwt_no_del_cliente(monkeypatch):
    captured = {}

    async def fake_issue(profile_id: str, timeout: float = 5.0) -> str:
        captured["profile_id"] = profile_id
        return "fake-exchange-code"

    monkeypatch.setattr(auth_router_module, "issue_sso_bridge_exchange_code", fake_issue)

    token = _make_token(REAL_PROFILE_ID)

    # El "atacante" intenta forzar un profile_id ajeno vía query string (el
    # único canal donde un cliente podría intentar inyectarlo en un GET).
    resp = client.get(
        f"/auth/koda-frontend/exchange-code?profile_id={ATTACKER_PROFILE_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.json()["exchange_code"] == "fake-exchange-code"

    # CRÍTICO: el profile_id efectivamente usado debe ser el de la SESIÓN
    # (JWT), nunca el que el cliente intentó inyectar por query string.
    assert captured["profile_id"] == REAL_PROFILE_ID
    assert captured["profile_id"] != ATTACKER_PROFILE_ID


def test_exchange_code_sin_sesion_rechaza():
    resp = client.get("/auth/koda-frontend/exchange-code")
    assert resp.status_code == 401


def test_exchange_code_propaga_404_como_error_claro(monkeypatch):
    """Si koda-frontend responde 404 (profile_id sin cuenta/tenant
    provisionado en el ERP -- empresa institucional sin ERP activado), el
    endpoint debe traducirlo a un 404 con mensaje claro, no un 500
    genérico."""
    async def fake_issue_404(profile_id: str, timeout: float = 5.0) -> str:
        raise koda_frontend_client.SsoBridgeError("no encontrado", status_code=404)

    monkeypatch.setattr(auth_router_module, "issue_sso_bridge_exchange_code", fake_issue_404)

    token = _make_token(REAL_PROFILE_ID)
    resp = client.get(
        "/auth/koda-frontend/exchange-code",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
    assert "ERP" in resp.json()["detail"]


def test_issue_sso_bridge_exchange_code_respeta_sla_de_timeout():
    """
    No-regresión de la Fix del timeout budget stacking en
    services/koda_frontend_client.py: antes, 3 intentos x 60s + backoff
    [0, 2, 5] daban un peor caso de ~187s para UN click de usuario. Ahora
    son 2 intentos x 5s + un backoff de 2s => peor caso ~12s.

    Este test NO usa el doble de prueba de los tests anteriores (que
    reemplaza toda la función por un retorno instantáneo y por eso nunca
    ejercitó el retry/timeout real). Aquí se reemplaza únicamente
    `httpx.AsyncClient` por un doble que "cuelga" hasta el `timeout`
    configurado en cada intento, para medir el tiempo real de pared y
    detectar si alguien vuelve a subir el timeout o el número de
    reintentos.
    """
    import asyncio
    import time

    import httpx
    import pytest

    class _FakeHangingClient:
        """Simula que koda-frontend nunca responde: el timeout real de
        httpx dispararía justo a los `timeout` segundos configurados."""

        def __init__(self, timeout):
            self._timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None):
            await asyncio.sleep(self._timeout)
            raise httpx.ReadTimeout("simulado: koda-frontend nunca responde")

    original_async_client = koda_frontend_client.httpx.AsyncClient
    original_url = koda_frontend_client.KODA_FRONTEND_API_URL
    original_key = koda_frontend_client.SSO_BRIDGE_INTERNAL_KEY
    koda_frontend_client.httpx.AsyncClient = _FakeHangingClient
    koda_frontend_client.KODA_FRONTEND_API_URL = "http://fake-erp.test"
    koda_frontend_client.SSO_BRIDGE_INTERNAL_KEY = "test-key"
    try:
        start = time.monotonic()
        with pytest.raises(koda_frontend_client.SsoBridgeError):
            asyncio.run(
                koda_frontend_client.issue_sso_bridge_exchange_code(REAL_PROFILE_ID)
            )
        elapsed = time.monotonic() - start
    finally:
        koda_frontend_client.httpx.AsyncClient = original_async_client
        koda_frontend_client.KODA_FRONTEND_API_URL = original_url
        koda_frontend_client.SSO_BRIDGE_INTERNAL_KEY = original_key

    # SLA endurecido: peor caso ~12s. Si alguien revierte a un budget
    # largo (p. ej. 60s x 3 intentos), esto debe fallar.
    assert elapsed <= 13.0, f"El presupuesto de reintentos se disparó: {elapsed:.1f}s"
