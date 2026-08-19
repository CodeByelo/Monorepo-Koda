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
