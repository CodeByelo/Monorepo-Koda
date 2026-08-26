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
from backend.models.erp_extended import DeclaracionIVA
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_borrador_periodo_invalido_da_422(setup_db):
    """1. Borrador con período inválido (no YYYY-MM) devuelve 422 y no crea DeclaracionIVA."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa IVA {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
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

    payload = {"periodo": "fecha-mala", "retenciones": 0}
    res = client_app.post("/fiscal/declaracion-iva/borrador", json=payload)
    assert res.status_code == 422

    count = db.query(DeclaracionIVA).filter(DeclaracionIVA.tenant_id == tenant_id).count()
    assert count == 0

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_borrador_sin_periodo_da_422(setup_db):
    """2. Borrador sin campo período devuelve 422."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa IVA {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
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

    payload = {"retenciones": 10}
    res = client_app.post("/fiscal/declaracion-iva/borrador", json=payload)
    assert res.status_code == 422

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_borrador_retenciones_negativas_da_422(setup_db):
    """3. Borrador con retenciones negativas devuelve 422."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa IVA {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
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

    payload = {"periodo": "2026-07", "retenciones": -50}
    res = client_app.post("/fiscal/declaracion-iva/borrador", json=payload)
    assert res.status_code == 422

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_borrador_payload_valido_guarda_correctamente(setup_db):
    """4. Borrador con payload válido (e ignorando campo 'data' extra) persiste exitosamente."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa IVA {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
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

    payload = {
        "periodo": "2026-07",
        "retenciones": 25.50,
        "data": {"extra_field": "some_value"}
    }
    res = client_app.post("/fiscal/declaracion-iva/borrador", json=payload)
    assert res.status_code == 200, res.text
    assert res.json().get("ok") is True

    decl = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == "2026-07",
        DeclaracionIVA.tenant_id == tenant_id
    ).first()
    assert decl is not None
    assert decl.estado == "BORRADOR"
    assert Decimal(str(decl.retenciones)) == Decimal("25.50")

    # Cleanup
    db.query(DeclaracionIVA).filter(DeclaracionIVA.id == decl.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_finalizar_periodo_invalido_da_422(setup_db):
    """5. Finalizar con período inválido devuelve 422."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa IVA {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
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

    payload = {"periodo": "2026-13-99", "retenciones": 10.0}
    res = client_app.post("/fiscal/declaracion-iva/finalizar", json=payload)
    assert res.status_code == 422

    # Cleanup
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
