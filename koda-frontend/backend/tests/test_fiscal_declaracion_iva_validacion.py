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
from backend.models.operations import Venta
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
    # BUGFIX: el campo "retenciones" del formulario viene en Bs. (ver
    # IVADeclaration.tsx), pero la columna del modelo es retenciones_usd.
    # Antes se guardaba el monto en Bs. directo ahí; ahora se guarda dividido
    # por la tasa de la declaración (50.00 en este fixture), para que la
    # columna "_usd" sí contenga dólares reales: 25.50 Bs. / 50.00 = 0.51 USD.
    assert Decimal(str(decl.retenciones)) == Decimal("0.51")
    # Y multiplicado de vuelta por la tasa se recupera el monto en Bs. que el
    # usuario tecleó — el número que ve en pantalla no cambia con el fix.
    assert (Decimal(str(decl.retenciones)) * Decimal(str(decl.tasa_cambio_bs))).quantize(Decimal("0.01")) == Decimal("25.50")

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


def test_finalizar_guarda_debito_credito_en_usd_reales(setup_db):
    """6. BUGFIX: al finalizar, debito_fiscal_usd/credito_fiscal_mes_usd/
    retenciones_usd deben guardar el monto real en USD (no en Bs. como
    antes), y al reconvertir con la tasa de la declaración debe recuperarse
    exactamente el mismo monto en Bs. que el usuario vio en pantalla — es
    decir, el fix no debe cambiar ningún número visible para el usuario,
    solo cómo se guarda internamente."""
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

    venta = Venta(
        tenant_id=tenant_id,
        numero_factura=f"FAC-{uuid.uuid4().hex[:8]}",
        fecha=datetime(2026, 7, 15, tzinfo=timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        igtf_usd=Decimal("0.00"),
        total_usd=Decimal("116.00"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("50.00"),
        estado="ACTIVA",
    )
    db.add(venta)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {"periodo": "2026-07", "retenciones": 100.0}  # 100 Bs. de retención
    res = client_app.post("/fiscal/declaracion-iva/finalizar", json=payload)
    assert res.status_code == 200, res.text

    decl = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == "2026-07",
        DeclaracionIVA.tenant_id == tenant_id
    ).first()
    assert decl is not None
    assert decl.estado == "FINALIZADA"

    tasa_decl = Decimal(str(decl.tasa_cambio_bs))
    assert tasa_decl == Decimal("50.00")

    # IVA de la venta: 16.00 USD -> en Bs. son 16.00*50 = 800.00 Bs.
    # Guardado como USD real: 800.00 / 50 = 16.00 (coincide con el iva_usd
    # original de la venta, como debe ser: es la misma tasa).
    assert Decimal(str(decl.debito_fiscal_usd)).quantize(Decimal("0.01")) == Decimal("16.00")
    # Reconvertido a Bs. (lo que se ve en el PDF) da el mismo monto de siempre.
    assert (Decimal(str(decl.debito_fiscal_usd)) * tasa_decl).quantize(Decimal("0.01")) == Decimal("800.00")

    # Retenciones: se tecleó "100" en el campo marcado "Bs." -> guardado como
    # 100/50 = 2.00 USD reales; reconvertido da de vuelta los 100 Bs. tecleados.
    assert Decimal(str(decl.retenciones_usd)).quantize(Decimal("0.01")) == Decimal("2.00")
    assert (Decimal(str(decl.retenciones_usd)) * tasa_decl).quantize(Decimal("0.01")) == Decimal("100.00")

    # Cleanup
    db.query(DeclaracionIVA).filter(DeclaracionIVA.id == decl.id).delete()
    db.query(Venta).filter(Venta.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
