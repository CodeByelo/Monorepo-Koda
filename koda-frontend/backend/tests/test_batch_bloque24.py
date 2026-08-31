import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch, AsyncMock
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Variables de entorno dummy
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.core.database import Base, get_db
from backend.models.core import Tenant, Profile, TasaCambio
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token
from backend.routers.contabilidad.cuentas import router as cuentas_router
from backend.routers.operaciones.tasas import tasas_router
from backend.utils.helpers import tasa_actual


# ============================================================
# FIXTURES COMUNES
# ============================================================

@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    @event.listens_for(engine, "connect")
    def do_attach(dbapi_connection, connection_record):
        dbapi_connection.execute("ATTACH DATABASE ':memory:' AS public;")
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def setup_users(db_session):
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant B24")

    user_admin = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="admin_b24",
        email="admin_b24@test.com",
        rol_id=2  # Admin
    )
    user_usuario = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="usuario_b24",
        email="usuario_b24@test.com",
        rol_id=3  # Usuario comun — no Admin/Gerente
    )
    db_session.add_all([tenant, user_admin, user_usuario])
    db_session.commit()
    return {
        "tenant_id": tenant_id,
        "user_admin": user_admin,
        "user_usuario": user_usuario,
    }


def _make_cuentas_client(db_session, user):
    app = FastAPI()
    app.include_router(cuentas_router)

    def override_get_db():
        yield db_session

    def override_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_current_user_from_token] = override_user

    return TestClient(app)


# ============================================================
# BUG 1: contabilidad/cuentas.py — require_role en endpoints mutadores
# ============================================================

def test_bug1_usuario_no_admin_no_puede_put_cuenta(db_session, setup_users):
    """
    Bug 1: PUT /cuentas/{id} — un usuario sin rol Admin/Gerente recibe 403.
    Un Admin sí puede.
    """
    from backend.models.erp_extended import CuentaContable

    tenant_id = setup_users["tenant_id"]
    cuenta = CuentaContable(
        tenant_id=tenant_id, codigo="1", nombre="ACTIVO", tipo="ACTIVO", nivel=1, activa=True
    )
    db_session.add(cuenta)
    db_session.commit()
    db_session.refresh(cuenta)

    # Usuario sin privilegios -> 403
    client_usuario = _make_cuentas_client(db_session, setup_users["user_usuario"])
    resp = client_usuario.put(f"/cuentas/{cuenta.id}", json={"nombre": "ACTIVO MODIFICADO"})
    assert resp.status_code == 403
    assert "Permisos insuficientes" in resp.json()["detail"]

    # Admin -> 200
    client_admin = _make_cuentas_client(db_session, setup_users["user_admin"])
    resp_admin = client_admin.put(f"/cuentas/{cuenta.id}", json={"nombre": "ACTIVO ACTUALIZADO"})
    assert resp_admin.status_code == 200


def test_bug1_usuario_no_admin_no_puede_delete_cuenta(db_session, setup_users):
    """
    Bug 1: DELETE /cuentas/{id} — usuario sin Admin/Gerente recibe 403.
    Admin puede eliminar (siempre que no tenga movimientos contables).
    """
    from backend.models.erp_extended import CuentaContable

    tenant_id = setup_users["tenant_id"]
    cuenta = CuentaContable(
        tenant_id=tenant_id, codigo="9.1.TEST", nombre="Cuenta Test Delete", tipo="EGRESO", nivel=3, activa=True
    )
    db_session.add(cuenta)
    db_session.commit()
    db_session.refresh(cuenta)

    # Usuario sin privilegios -> 403
    client_usuario = _make_cuentas_client(db_session, setup_users["user_usuario"])
    resp = client_usuario.delete(f"/cuentas/{cuenta.id}")
    assert resp.status_code == 403
    assert "Permisos insuficientes" in resp.json()["detail"]

    # Admin -> 200 (sin asientos contables asociados)
    client_admin = _make_cuentas_client(db_session, setup_users["user_admin"])
    resp_admin = client_admin.delete(f"/cuentas/{cuenta.id}")
    assert resp_admin.status_code == 200


def test_bug1_usuario_no_admin_no_puede_importar_plantilla(db_session, setup_users):
    """
    Bug 1: POST /cuentas/importar-plantilla — usuario sin Admin/Gerente recibe 403.
    Admin puede importar.
    """
    # Usuario sin privilegios -> 403
    client_usuario = _make_cuentas_client(db_session, setup_users["user_usuario"])
    resp = client_usuario.post("/cuentas/importar-plantilla", json={"plantilla": "Comercial"})
    assert resp.status_code == 403
    assert "Permisos insuficientes" in resp.json()["detail"]

    # Admin -> 200
    client_admin = _make_cuentas_client(db_session, setup_users["user_admin"])
    resp_admin = client_admin.post("/cuentas/importar-plantilla", json={"plantilla": "Comercial"})
    assert resp_admin.status_code == 200


def test_bug1_listar_cuentas_sigue_sin_restriccion(db_session, setup_users):
    """
    GET /cuentas (solo lectura) debe seguir funcionando sin restricción de rol.
    """
    client_usuario = _make_cuentas_client(db_session, setup_users["user_usuario"])
    resp = client_usuario.get("/cuentas")
    assert resp.status_code == 200


# ============================================================
# BUG 2: developer_router.py — blacklist tenant en WebSocket
# (se testea la lógica del endpoint directamente con mocks,
#  ya que el WebSocket real requiere Redis y ws_manager vivos)
# ============================================================

def test_bug2_websocket_rechaza_tenant_blacklisteado():
    """
    Bug 2: websocket_endpoint debe cerrar la conexión (code 1008) cuando
    el tenant_id del token está en la blacklist de Redis.
    """
    import asyncio
    from backend.routers.developer_router import websocket_endpoint

    # Construir un JWT fake con tenant_id
    import jwt as pyjwt
    from backend.services.auth import SECRET_KEY, ALGORITHM

    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    token = pyjwt.encode(
        {"sub": user_id, "tenant_id": tenant_id},
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    # Mock websocket que registra si fue cerrado
    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    mock_ws.close = AsyncMock()

    # Redis mock: tenant en blacklist, usuario NO en blacklist
    mock_redis = MagicMock()
    mock_redis.exists = MagicMock(side_effect=lambda key: (
        1 if f"blacklist:tenant:{tenant_id}" in key else 0
    ))

    with patch("backend.routers.developer_router.redis_client", mock_redis):
        asyncio.run(
            websocket_endpoint(mock_ws, token)
        )

    # Debe haber cerrado con code 1008
    mock_ws.close.assert_called_once_with(code=1008)
    # NO debe haber llamado a ws_manager.connect
    # (la conexión se rechazó antes de llegar a esa línea)


def test_bug2_websocket_acepta_tenant_no_blacklisteado():
    """
    Bug 2: websocket_endpoint NO debe cerrar la conexión cuando
    el tenant_id del token NO está en la blacklist.
    """
    import asyncio
    from backend.routers.developer_router import websocket_endpoint
    import jwt as pyjwt
    from backend.services.auth import SECRET_KEY, ALGORITHM

    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    token = pyjwt.encode(
        {"sub": user_id, "tenant_id": tenant_id},
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    mock_ws.close = AsyncMock()
    # receive_text lanza WebSocketDisconnect para terminar el loop
    from fastapi import WebSocketDisconnect
    mock_ws.receive_text = AsyncMock(side_effect=WebSocketDisconnect())

    # Redis mock: nadie en blacklist
    mock_redis = MagicMock()
    mock_redis.exists = MagicMock(return_value=0)

    mock_ws_manager = AsyncMock()
    mock_ws_manager.connect = AsyncMock()
    mock_ws_manager.disconnect = AsyncMock()

    with patch("backend.routers.developer_router.redis_client", mock_redis), \
         patch("backend.routers.developer_router.ws_manager", mock_ws_manager):
        asyncio.run(
            websocket_endpoint(mock_ws, token)
        )

    # No debe haber cerrado la conexión por blacklist
    # (puede cerrarse por WebSocketDisconnect pero no por el close(1008) del blacklist)
    for call in mock_ws.close.call_args_list:
        # Si hubo close, no debe haber sido el 1008 de blacklist
        assert call.kwargs.get("code") != 1008 or call.args[0] != 1008


# ============================================================
# BUG 3: operaciones/tasas.py — tasa_actual con tenant_id
# ============================================================

def _make_tasas_client(db_session, user):
    app = FastAPI()
    app.include_router(tasas_router)

    def override_get_db():
        yield db_session

    def override_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_current_user_from_token] = override_user

    return TestClient(app)


def test_bug3_fallback_784_cuando_no_hay_tasa_propia(db_session, setup_users):
    """
    Bug 3: con la BD sin ninguna TasaCambio para el tenant actual,
    GET /tasas/bcv debe devolver 784.66 (el fallback del helper canónico),
    NO 36.52 (el fallback incorrecto que había hardcodeado).
    """
    client = _make_tasas_client(db_session, setup_users["user_admin"])
    resp = client.get("/tasas/bcv")
    assert resp.status_code == 200
    data = resp.json()
    # El fallback del proyecto es 784.66, no 36.52
    assert data["valor"] == 784.66
    assert data["fuente"] == "BCV"


def test_bug3_no_devuelve_tasa_de_otro_tenant(db_session, setup_users):
    """
    Bug 3: si hay una TasaCambio de un Tenant A pero el usuario
    pertenece al Tenant B (que no tiene tasas), el endpoint debe
    devolver el fallback 784.66 — no la tasa del Tenant A.
    """
    # Crear tasa para un tenant AJENO al usuario del test
    tenant_ajeno = uuid.uuid4()
    tasa_ajena = TasaCambio(
        tenant_id=tenant_ajeno,
        valor_ves=Decimal("500.00"),
        fuente="BCV"
    )
    db_session.add(tasa_ajena)
    db_session.commit()

    client = _make_tasas_client(db_session, setup_users["user_admin"])
    resp = client.get("/tasas/bcv")
    assert resp.status_code == 200
    data = resp.json()
    # No debe devolver 500 (tasa del tenant ajeno)
    assert data["valor"] == 784.66


def test_bug3_devuelve_tasa_correcta_del_propio_tenant(db_session, setup_users):
    """
    Bug 3 (positivo): cuando el tenant SÍ tiene una TasaCambio registrada,
    el endpoint debe devolver ese valor (no el fallback, no la de otro tenant).
    """
    tenant_id = setup_users["tenant_id"]
    tasa_propia = TasaCambio(
        tenant_id=tenant_id,
        valor_ves=Decimal("40.00"),
        fuente="BCV"
    )
    db_session.add(tasa_propia)
    db_session.commit()

    client = _make_tasas_client(db_session, setup_users["user_admin"])
    resp = client.get("/tasas/bcv")
    assert resp.status_code == 200
    data = resp.json()
    assert float(data["valor"]) == 40.0
