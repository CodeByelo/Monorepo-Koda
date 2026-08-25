import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_dashboard_periodo_invalido_da_400(setup_db):
    """1. Dashboard con período inválido devuelve 400 (no 500)."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa Periodo {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.get("/fiscal/dashboard?periodo=fecha-mala")
    assert res.status_code == 400
    assert "Período inválido" in res.text

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_dashboard_mes_fuera_de_rango_da_400(setup_db):
    """2. Dashboard con mes fuera de rango (13) devuelve 400."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa Mes 13 {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.get("/fiscal/dashboard?periodo=2026-13")
    assert res.status_code == 400
    assert "El mes debe estar entre 01 y 12" in res.text

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_dashboard_periodo_valido_funciona(setup_db):
    """3. Dashboard con período válido calcula calendario para el mes siguiente correspondiente."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa OK {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    tasa = TasaCambio(
        tenant_id=tenant_id,
        valor_ves=Decimal("50.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.get("/fiscal/dashboard?periodo=2026-07")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "calendario" in data
    fechas_calendario = [item["fecha"] for item in data["calendario"]]
    # Para período 2026-07, el calendario de vencimiento corresponde a agosto 2026 (2026-08)
    assert any("2026-08-15" in f for f in fechas_calendario)
    assert any("2026-08-10" in f for f in fechas_calendario)

    # Cleanup
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_declaracion_iva_get_periodo_invalido_da_400(setup_db):
    """4. GET /fiscal/declaracion-iva con período inválido devuelve 400 vía periodo_rango."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa Decl {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.get("/fiscal/declaracion-iva?periodo=fecha-mala")
    assert res.status_code == 400
    assert "Período inválido" in res.text

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
