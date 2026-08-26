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
from backend.models.operations import Proveedor
from backend.models.erp_extended import Compra, RetencionIVA
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_actualizar_control_compra_persiste_sin_crashear(setup_db):
    """1. Actualizar número de control persiste el nuevo valor sin crashear y sin crear RetencionIVA fantasma."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Control Compra {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Comprador",
        apellido="Test",
        email=f"comprador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    proveedor = Proveedor(
        nombre="Distribuidora Nacional C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        telefono="0212-5555555",
        email="ventas@distnacional.com",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.flush()

    compra = Compra(
        proveedor_id=proveedor.id,
        numero_factura=f"FAC-COMP-{uuid.uuid4().hex[:6]}",
        numero_control="000-001",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        total_usd=Decimal("116.00"),
        tasa_cambio_bs=Decimal("50.00"),
        estado="REGISTRADA",
        tenant_id=tenant_id
    )
    db.add(compra)
    db.commit()

    count_ret_antes = db.query(RetencionIVA).filter(RetencionIVA.tenant_id == tenant_id).count()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {"numero_control": "000-002"}
    res = client_app.patch(f"/fiscal/libro-compras/{compra.id}/control", json=payload)

    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data.get("ok") is True

    # Verificar que el número de control cambió en BD
    db.refresh(compra)
    assert compra.numero_control == "000-002"

    # Verificar que NO se creó ninguna fila en RetencionIVA
    count_ret_despues = db.query(RetencionIVA).filter(RetencionIVA.tenant_id == tenant_id).count()
    assert count_ret_despues == count_ret_antes

    # Cleanup
    db.query(Compra).filter(Compra.id == compra.id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_actualizar_control_compra_rechaza_vacio(setup_db):
    """2. Actualizar sin numero_control o con string vacío devuelve 400 y no modifica la compra."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Control Vacio {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Comprador",
        apellido="Test",
        email=f"comprador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    proveedor = Proveedor(
        nombre="Proveedor Vacio C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.flush()

    compra = Compra(
        proveedor_id=proveedor.id,
        numero_factura=f"FAC-COMP-{uuid.uuid4().hex[:6]}",
        numero_control="CTRL-ORIGINAL",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("50.00"),
        iva_usd=Decimal("8.00"),
        total_usd=Decimal("58.00"),
        tasa_cambio_bs=Decimal("50.00"),
        estado="REGISTRADA",
        tenant_id=tenant_id
    )
    db.add(compra)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    # 1. Payload sin el campo numero_control
    res1 = client_app.patch(f"/fiscal/libro-compras/{compra.id}/control", json={})
    assert res1.status_code == 400
    assert "numero_control" in res1.text

    # 2. Payload con numero_control vacío
    res2 = client_app.patch(f"/fiscal/libro-compras/{compra.id}/control", json={"numero_control": ""})
    assert res2.status_code == 400
    assert "numero_control" in res2.text

    db.refresh(compra)
    assert compra.numero_control == "CTRL-ORIGINAL"

    # Cleanup
    db.query(Compra).filter(Compra.id == compra.id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_actualizar_control_compra_compra_ajena_da_404(setup_db):
    """3. Intentar actualizar una compra perteneciente a otro tenant devuelve 404 y no la modifica."""
    db = SessionLocal()
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    tenant_a = Tenant(id=tenant_a_id, nombre_empresa="Empresa A", estado_licencia="ACTIVA")
    tenant_b = Tenant(id=tenant_b_id, nombre_empresa="Empresa B", estado_licencia="ACTIVA")
    user_a = Profile(
        id=uuid.uuid4(),
        username=f"user_a_{uuid.uuid4().hex[:6]}",
        nombre="Usuario A",
        apellido="Test",
        email=f"usera_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_a_id
    )
    db.add_all([tenant_a, tenant_b])
    db.flush()
    db.add(user_a)

    prov_b = Proveedor(nombre="Proveedor B", rif=f"J-{uuid.uuid4().hex[:8].upper()}", tenant_id=tenant_b_id)
    db.add(prov_b)
    db.flush()

    compra_b = Compra(
        proveedor_id=prov_b.id,
        numero_factura=f"FAC-B-{uuid.uuid4().hex[:6]}",
        numero_control="CTRL-TENANT-B",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        total_usd=Decimal("116.00"),
        tasa_cambio_bs=Decimal("50.00"),
        estado="REGISTRADA",
        tenant_id=tenant_b_id
    )
    db.add(compra_b)
    db.commit()

    def mock_user():
        return user_a

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.patch(f"/fiscal/libro-compras/{compra_b.id}/control", json={"numero_control": "HACK-CTRL"})
    assert res.status_code == 404

    db.refresh(compra_b)
    assert compra_b.numero_control == "CTRL-TENANT-B"

    # Cleanup
    db.query(Compra).filter(Compra.id == compra_b.id).delete()
    db.query(Proveedor).filter(Proveedor.id == prov_b.id).delete()
    db.query(Profile).filter(Profile.id == user_a.id).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a_id, tenant_b_id])).delete()
    db.commit()
    db.close()
