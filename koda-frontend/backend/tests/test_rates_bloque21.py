import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import patch

# Asegurar variables de entorno dummy si no están definidas
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
from backend.core.security import get_current_user, require_role
from backend.routers.rates import router as rates_router, _tasa_cache


@pytest.fixture(scope="function")
def test_engine():
    """Engine SQLite en memoria con schema public atado y StaticPool."""
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
    """Crea una sesión de base de datos para tests."""
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def test_client(db_session):
    """TestClient de FastAPI con dependencias configuradas para Tenant A."""
    _tasa_cache.clear()

    app = FastAPI()
    app.include_router(rates_router)

    tenant_a_id = uuid.uuid4()
    tenant_a = Tenant(id=tenant_a_id, nombre_empresa="Tenant Rates A")

    user_admin = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_a_id,
        username="admin_rates",
        email="admin_rates@test.com",
        rol_id=2  # Admin
    )
    db_session.add_all([tenant_a, user_admin])
    db_session.commit()

    def override_get_db():
        yield db_session

    def override_get_current_user():
        return user_admin

    from backend.services.auth import get_current_user_from_token
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_current_user_from_token] = override_get_current_user

    client = TestClient(app)
    client.tenant_a_id = tenant_a_id
    client.user_admin = user_admin
    return client


def test_bug1_create_tasa_assigns_tenant_id(test_client, db_session):
    """
    Bug 1: create_tasa (POST /tasa) debe asignar el tenant_id del usuario autenticado
    y no dejarlo en None, evitando contaminar la tasa global de fallback.
    """
    tenant_a_id = test_client.tenant_a_id

    payload = {
        "valor_ves": 820.50,
        "fuente": "BCV_TEST"
    }
    response = test_client.post("/tasa", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert float(data["valor_ves"]) == 820.50

    # Verificar en base de datos que tenant_id fue guardado correctamente
    db_tasa = db_session.query(TasaCambio).filter(TasaCambio.valor_ves == Decimal("820.50")).first()
    assert db_tasa is not None
    assert db_tasa.tenant_id == tenant_a_id
    assert db_tasa.tenant_id is not None


def test_bug2_get_tasa_actual_fallback_canonical_784_66(test_client, db_session):
    """
    Bug 2: Sin filas de TasaCambio en la BD, GET /tasa/actual debe devolver
    exactamente el fallback canónico de tasa_actual() (784.66), no el valor desactualizado 757.54.
    """
    _tasa_cache.clear()
    # Asegurar que no hay tasas en la BD
    db_session.query(TasaCambio).delete()
    db_session.commit()

    # Evitamos que intente scraping de red durante el test
    with patch("backend.routers.rates._perform_bcv_sync", side_effect=Exception("No internet")):
        response = test_client.get("/tasa/actual")
        assert response.status_code == 200
        data = response.json()
        assert data["tasa"] == 784.66
        assert data["valor_ves"] == 784.66


def test_bug3_tasa_manual_error_handling_no_traceback_leak(test_client, db_session):
    """
    Bug 3: Si ocurre un error inesperado en PUT /tasa/manual, la respuesta debe
    ser un 500 genérico y NO debe filtrar el traceback ni rutas del servidor en el detail.
    """
    # Forzamos una excepción en la sesión al hacer commit o add
    with patch.object(db_session, "commit", side_effect=RuntimeError("Simulated DB Disk Full / Server Path /var/www/secret")):
        payload = {"tasa": 850.00}
        response = test_client.put("/tasa/manual", json=payload)
        assert response.status_code == 500
        detail = response.json().get("detail", "")
        # Debe ser un mensaje genérico
        assert detail == "Error interno al actualizar la tasa de cambio."
        # No debe contener trazas de stack trace ni rutas internas
        assert "Traceback" not in detail
        assert "Simulated DB Disk Full" not in detail
        assert "/var/www/secret" not in detail
