import os
import uuid
import pytest
from fastapi import FastAPI, HTTPException, Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Asegurar env vars necesarias
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from backend.core.database import Base, get_db
from backend.models.core import Tenant, Profile
from backend.core.security import create_access_token
from backend.services.auth import get_current_user_from_token
from backend.routers.auth import router as auth_router

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

def test_public_register_is_disabled(db_session):
    """POST /auth/register debe devolver 400 con cualquier payload."""
    app = FastAPI()
    app.include_router(auth_router)
    app.dependency_overrides[get_db] = lambda: db_session

    client = TestClient(app)
    payload = {
        "nombre": "Test User",
        "email": "testregister@koda.com",
        "password": "Password123!"
    }
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 400
    assert "El registro público está deshabilitado" in resp.json()["detail"]

def test_non_developer_with_null_tenant_fails_auth(db_session):
    """Un usuario con rol no-desarrollador y tenant_id=None debe fallar con 401."""
    user_id = uuid.uuid4()
    profile = Profile(
        id=user_id,
        nombre="Attacker",
        apellido="User",
        username="attacker",
        email="attacker@koda.com",
        password_hash="...",
        rol_id=3, # Usuario (no developer)
        tenant_id=None,
        estado=True
    )
    db_session.add(profile)
    db_session.commit()

    # Generar token con tenant_id: None
    token = create_access_token(data={
        "sub": str(user_id),
        "email": profile.email,
        "username": profile.username,
        "rol": "Usuario",
        "tenant_id": None
    })

    # Intentar autenticar vía get_current_user_from_token
    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_token(token, db_session)
    assert exc_info.value.status_code == 401

def test_developer_with_null_tenant_passes_auth(db_session):
    """Un Desarrollador (rol_id=4) con tenant_id=None sí debe pasar la autenticación."""
    user_id = uuid.uuid4()
    profile = Profile(
        id=user_id,
        nombre="Henry",
        apellido="Daniel",
        username="Drodriguez",
        email="drodriguez@koda.com",
        password_hash="...",
        rol_id=4, # Desarrollador
        tenant_id=None,
        estado=True
    )
    db_session.add(profile)
    db_session.commit()

    token = create_access_token(data={
        "sub": str(user_id),
        "email": profile.email,
        "username": profile.username,
        "rol": "Desarrollador",
        "tenant_id": None
    })

    authenticated_user = get_current_user_from_token(token, db_session)
    assert authenticated_user.id == user_id
    assert authenticated_user.username == "Drodriguez"
