"""
Tests de backend/routers/sso_bridge.py (puente de SSO real hacia
KODA_Remaster/sistema-corporativo/backend) y de la reutilización del
mecanismo de exchange_code preexistente (backend/routers/auth.py).

Mismo patrón de acceso a datos que tests/test_nomina_legal.py: `import
backend.main` para que `Base.metadata.create_all(...)` corra sobre el
SQLite de pruebas, y `backend.core.database.SessionLocal` directo para
crear los fixtures (Profile/Tenant) sin pasar por HTTP.

Requiere las mismas variables de entorno de 32+ caracteres que el resto del
backend (SECRET_KEY, AUDIT_LOG_SECRET, BOT_INTERNAL_API_KEY,
LOGISTICS_INTERNAL_FORWARD_KEY, SSO_BRIDGE_INTERNAL_KEY, etc.) ya
configuradas en el entorno de ejecución de pytest — igual que el resto de
la suite, que también depende de esa configuración externa.
"""
import sys
import uuid

sys.path.insert(0, "/app")

import backend.main  # noqa: F401 — dispara Base.metadata.create_all(...)
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal
from backend.core.security import SSO_BRIDGE_INTERNAL_KEY
from backend.models.core import Profile, Tenant

client = TestClient(app)

_ISSUE_URL = "/internal/auth/sso-bridge/issue"
_HEADER = "X-SSO-Bridge-Key"


def _crear_tenant_y_perfil(session, *, activo: bool = True, con_tenant: bool = True):
    tenant_id = uuid.uuid4() if con_tenant else None
    if con_tenant:
        tenant = Tenant(id=tenant_id, nombre_empresa="Test SSO Bridge S.A.", estado_licencia="ACTIVA")
        session.add(tenant)
        session.flush()  # <-- asegura que el INSERT de tenants ocurra antes que el de profiles

    unique = uuid.uuid4().hex[:10]
    profile = Profile(
        username=f"test_sso_{unique}",
        nombre="Test",
        apellido="SsoBridge",
        email=f"test_sso_{unique}@koda.com",
        password_hash="...",
        rol_id=3,
        tenant_id=tenant_id,
        estado=1 if activo else 0,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def _cleanup(session, profile: Profile):
    tenant_id = profile.tenant_id
    session.query(Profile).filter(Profile.id == profile.id).delete()
    if tenant_id:
        session.query(Tenant).filter(Tenant.id == tenant_id).delete()
    session.commit()


def test_issue_rechaza_sin_header():
    """Sin X-SSO-Bridge-Key (o con uno incorrecto), el endpoint nunca debe
    emitir un código — es, en la práctica, un endpoint que mintea sesiones."""
    resp = client.post(_ISSUE_URL, json={"profile_id": str(uuid.uuid4())})
    assert resp.status_code in (401, 403)

    resp_wrong = client.post(
        _ISSUE_URL,
        json={"profile_id": str(uuid.uuid4())},
        headers={_HEADER: "clave-incorrecta-claramente-invalida-000000"},
    )
    assert resp_wrong.status_code in (401, 403)


def test_issue_rechaza_profile_id_inexistente():
    """Un profile_id que no existe en la tabla `profiles` de este backend
    (empresa/tenant institucional sin ERP provisionado) debe dar 404 claro,
    nunca un 500 genérico."""
    resp = client.post(
        _ISSUE_URL,
        json={"profile_id": str(uuid.uuid4())},
        headers={_HEADER: SSO_BRIDGE_INTERNAL_KEY},
    )
    assert resp.status_code == 404


def test_issue_rechaza_profile_inactivo():
    session = SessionLocal()
    try:
        profile = _crear_tenant_y_perfil(session, activo=False)
        try:
            resp = client.post(
                _ISSUE_URL,
                json={"profile_id": str(profile.id)},
                headers={_HEADER: SSO_BRIDGE_INTERNAL_KEY},
            )
            assert resp.status_code == 404
        finally:
            _cleanup(session, profile)
    finally:
        session.close()


def test_issue_emite_codigo_valido_y_es_de_un_solo_uso():
    """Camino feliz: profile_id real, activo, con tenant -> se emite un
    exchange_code. Ese código debe ser consumible exactamente UNA vez por
    POST /auth/exchange (el mecanismo preexistente, reutilizado sin
    duplicarlo) y fallar la segunda vez (replay)."""
    session = SessionLocal()
    try:
        profile = _crear_tenant_y_perfil(session, activo=True)
        try:
            issue_resp = client.post(
                _ISSUE_URL,
                json={"profile_id": str(profile.id)},
                headers={_HEADER: SSO_BRIDGE_INTERNAL_KEY},
            )
            assert issue_resp.status_code == 200
            code = issue_resp.json()["exchange_code"]
            assert code

            # Primer canje: debe funcionar y devolver una sesión real para
            # el mismo usuario.
            first = client.post("/auth/exchange", json={"code": code})
            assert first.status_code == 200
            body = first.json()
            assert body["user"]["id"] == str(profile.id)

            # Segundo canje del MISMO código: debe fallar (de un solo uso,
            # invalidado inmediatamente al consumirse, no solo por TTL).
            second = client.post("/auth/exchange", json={"code": code})
            assert second.status_code == 401
        finally:
            _cleanup(session, profile)
    finally:
        session.close()


def test_issue_rechaza_profile_sin_tenant():
    session = SessionLocal()
    try:
        profile = _crear_tenant_y_perfil(session, activo=True, con_tenant=False)
        try:
            resp = client.post(
                _ISSUE_URL,
                json={"profile_id": str(profile.id)},
                headers={_HEADER: SSO_BRIDGE_INTERNAL_KEY},
            )
            assert resp.status_code == 404
        finally:
            _cleanup(session, profile)
    finally:
        session.close()
