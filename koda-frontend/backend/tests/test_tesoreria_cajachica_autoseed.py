import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, date
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
from backend.models.core import Tenant, Profile
from backend.models.erp_extended import FondoCajaChica, GastoCajaChica, CuentaBancaria
from backend.core.security import get_current_user
from backend.routers.operaciones.tesoreria import tesoreria_router


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


def create_mock_user(db_session, tenant_id=None):
    if not tenant_id:
        tenant_id = uuid.uuid4()
    tenant = db_session.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        tenant = Tenant(id=tenant_id, nombre_empresa=f"Tenant {str(tenant_id)[:8]}")
        db_session.add(tenant)
        db_session.commit()

    user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username=f"user_{uuid.uuid4().hex[:8]}",
        email=f"user_{uuid.uuid4().hex[:8]}@test.com",
        rol_id=2  # Admin
    )
    db_session.add(user)
    db_session.commit()
    return user


# ============================================================
# FIX 1: GET /tesoreria/caja-chica no crea fondos falsos
# ============================================================

def test_get_caja_chica_sin_fondos_no_auto_crea(db_session):
    """
    GET /tesoreria/caja-chica con un tenant sin fondos devuelve fondos: []
    y NO inserta ningún FondoCajaChica en la base.
    """
    user = create_mock_user(db_session)
    tenant_id = user.tenant_id

    # Conteo inicial
    count_antes = db_session.query(FondoCajaChica).filter(FondoCajaChica.tenant_id == tenant_id).count()
    assert count_antes == 0

    app = FastAPI()
    app.include_router(tesoreria_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user

    client = TestClient(app)
    resp = client.get("/tesoreria/caja-chica")
    assert resp.status_code == 200
    data = resp.json()

    assert data["fondos"] == []
    assert data["gastos"] == []
    assert data["metricas"]["fondo_asignado"] == "$0.00"
    assert data["metricas"]["saldo_disponible"] == "$0.00"

    # Conteo posterior
    count_despues = db_session.query(FondoCajaChica).filter(FondoCajaChica.tenant_id == tenant_id).count()
    assert count_despues == 0


# ============================================================
# FIX 2: GET /tesoreria/arqueo no crea cuentas falsas
# ============================================================

def test_get_arqueo_sin_cuentas_no_auto_crea(db_session):
    """
    GET /tesoreria/arqueo con un tenant sin cuentas bancarias no inserta
    ningún CuentaBancaria nuevo, y devuelve saldos en 0.0 sin romper.
    """
    user = create_mock_user(db_session)
    tenant_id = user.tenant_id

    count_antes = db_session.query(CuentaBancaria).filter(CuentaBancaria.tenant_id == tenant_id).count()
    assert count_antes == 0

    app = FastAPI()
    app.include_router(tesoreria_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user

    client = TestClient(app)
    resp = client.get("/tesoreria/arqueo?fecha=2026-09-01")
    assert resp.status_code == 200
    data = resp.json()

    assert data["saldo_sistema_usd"] == 0.0
    assert data["saldo_sistema_ves"] == 0.0

    count_despues = db_session.query(CuentaBancaria).filter(CuentaBancaria.tenant_id == tenant_id).count()
    assert count_despues == 0


# ============================================================
# FIX 3: DELETE /tesoreria/caja-chica/fondos/{id}
# ============================================================

def test_delete_fondo_caja_chica_sin_gastos_lo_elimina(db_session):
    """
    DELETE /tesoreria/caja-chica/fondos/{id} sobre un fondo sin gastos y sin usar
    (disponible == asignado) lo borra de verdad (ya no existe en la BD).
    """
    user = create_mock_user(db_session)
    tenant_id = user.tenant_id

    fondo = FondoCajaChica(
        id=1,
        nombre="Fondo Pruebas",
        responsable="Administrador",
        asignado_usd=Decimal("200.00"),
        disponible_usd=Decimal("200.00"),
        estado="ACTIVO",
        tenant_id=tenant_id
    )
    db_session.add(fondo)
    db_session.commit()

    app = FastAPI()
    app.include_router(tesoreria_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user

    client = TestClient(app)
    resp = client.delete("/tesoreria/caja-chica/fondos/1")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "accion": "eliminado"}

    # Ya no debe existir en la BD
    fondo_db = db_session.query(FondoCajaChica).filter(FondoCajaChica.id == 1).first()
    assert fondo_db is None


def test_delete_fondo_caja_chica_con_gastos_lo_desactiva(db_session):
    """
    DELETE /tesoreria/caja-chica/fondos/{id} sobre un fondo CON gastos
    asociados NO lo borra — lo deja en la base con estado = "INACTIVO".
    """
    user = create_mock_user(db_session)
    tenant_id = user.tenant_id

    fondo = FondoCajaChica(
        id=2,
        nombre="Fondo Con Gastos",
        responsable="Operaciones",
        asignado_usd=Decimal("500.00"),
        disponible_usd=Decimal("450.00"),
        estado="ACTIVO",
        tenant_id=tenant_id
    )
    gasto = GastoCajaChica(
        id=1,
        fondo_id=2,
        concepto="Café y papelería",
        monto_usd=Decimal("50.00"),
        soporte="Factura Fiscal",
        fecha=date.today(),
        estado="PROCESADO",
        tenant_id=tenant_id
    )
    db_session.add_all([fondo, gasto])
    db_session.commit()

    app = FastAPI()
    app.include_router(tesoreria_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user

    client = TestClient(app)
    resp = client.delete("/tesoreria/caja-chica/fondos/2")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "accion": "desactivado"}

    # Debe persistir en BD pero con estado INACTIVO
    fondo_db = db_session.query(FondoCajaChica).filter(FondoCajaChica.id == 2).first()
    assert fondo_db is not None
    assert fondo_db.estado == "INACTIVO"


def test_delete_fondo_caja_chica_otro_tenant_devuelve_404(db_session):
    """
    DELETE /tesoreria/caja-chica/fondos/{id} sobre un fondo de OTRO tenant
    devuelve 404 (aislamiento multi-tenant).
    """
    user_a = create_mock_user(db_session)
    tenant_b_id = uuid.uuid4()
    tenant_b = Tenant(id=tenant_b_id, nombre_empresa="Tenant B")

    fondo_b = FondoCajaChica(
        id=3,
        nombre="Fondo Tenant B",
        responsable="Admin B",
        asignado_usd=Decimal("300.00"),
        disponible_usd=Decimal("300.00"),
        estado="ACTIVO",
        tenant_id=tenant_b_id
    )
    db_session.add_all([tenant_b, fondo_b])
    db_session.commit()

    app = FastAPI()
    app.include_router(tesoreria_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user_a

    client = TestClient(app)
    resp = client.delete("/tesoreria/caja-chica/fondos/3")
    assert resp.status_code == 404
    assert "Fondo de caja chica no encontrado" in resp.json()["detail"]

    # El fondo de Tenant B debe seguir intacto
    fondo_db = db_session.query(FondoCajaChica).filter(FondoCajaChica.id == 3).first()
    assert fondo_db is not None
    assert fondo_db.estado == "ACTIVO"
