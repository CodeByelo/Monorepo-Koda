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
from backend.models.erp_extended import CuentaBancaria, TransferenciaTesoreria, CuentaContable
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _seed_cuentas_test(db, tenant_id):
    plan = [
        ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
    ]
    for codigo, nombre, tipo, nivel in plan:
        existing = db.query(CuentaContable).filter(
            CuentaContable.codigo == codigo,
            CuentaContable.tenant_id == tenant_id
        ).first()
        if not existing:
            db.add(CuentaContable(
                codigo=codigo,
                nombre=nombre,
                tipo=tipo,
                nivel=nivel,
                activa=True,
                naturaleza="DEUDORA",
                tenant_id=tenant_id
            ))
    db.commit()


def test_transferencia_cuentas_usd_genera_asiento_y_mueve_saldos(setup_db):
    """1. Transferencia entre cuentas USD: mueve saldos y genera asiento 1.1.01 al Debe y al Haber."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Trf USD {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Tesorero",
        apellido="Test",
        email=f"tesorero_{uuid.uuid4().hex[:6]}@test.com",
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

    banco_origen = CuentaBancaria(
        banco="Banesco Origen",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    banco_destino = CuentaBancaria(
        banco="Mercantil Destino",
        numero_cuenta=f"0105-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("500.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add_all([banco_origen, banco_destino])
    db.flush()

    trf = TransferenciaTesoreria(
        cuenta_origen_id=banco_origen.id,
        cuenta_destino_id=banco_destino.id,
        monto_usd=Decimal("200.00"),
        tasa_cambio_bs=Decimal("50.00"),
        concepto="Trf USD Test",
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(trf)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.post(f"/tesoreria/transferencias-internas/{trf.id}/confirmar")
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Saldos bancarios
    db.refresh(banco_origen)
    db.refresh(banco_destino)
    assert banco_origen.saldo_actual_usd == Decimal("800.00")
    assert banco_destino.saldo_actual_usd == Decimal("700.00")

    # 2. Asiento contable
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"TRF-{trf.id}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("200.00")
    assert asiento.total_haber_usd == Decimal("200.00")
    assert len(asiento.detalles) == 2

    linea_debe = next((d for d in asiento.detalles if d.debe_usd == Decimal("200.00")), None)
    linea_haber = next((d for d in asiento.detalles if d.haber_usd == Decimal("200.00")), None)
    assert linea_debe is not None
    assert linea_debe.cuenta_codigo == "1.1.01"
    assert linea_haber is not None
    assert linea_haber.cuenta_codigo == "1.1.01"

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.id == trf.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id.in_([banco_origen.id, banco_destino.id])).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_transferencia_cuenta_origen_ves_resta_monto_usd_exacto_sin_inflar_por_tasa(setup_db):
    """2. Fix del bug de moneda: cuenta origen VES resta el monto_usd exacto ($100.00) y NO $5.000.00."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Trf VES {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Tesorero",
        apellido="Test",
        email=f"tesorero_{uuid.uuid4().hex[:6]}@test.com",
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

    # Cuenta origen en VES con saldo de $500.00
    banco_origen = CuentaBancaria(
        banco="Banesco VES",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="VES",
        saldo_actual_usd=Decimal("500.00"),
        activa=True,
        tenant_id=tenant_id
    )
    banco_destino = CuentaBancaria(
        banco="Mercantil USD Destino",
        numero_cuenta=f"0105-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("100.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add_all([banco_origen, banco_destino])
    db.flush()

    # Transferencia de $100.00 USD con tasa 50.00
    trf = TransferenciaTesoreria(
        cuenta_origen_id=banco_origen.id,
        cuenta_destino_id=banco_destino.id,
        monto_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("50.00"),
        concepto="Trf VES a USD",
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(trf)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.post(f"/tesoreria/transferencias-internas/{trf.id}/confirmar")
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # El saldo de banco origen debe bajar exactamente $100.00 (500.00 - 100.00 = 400.00), NO $5000.00
    db.refresh(banco_origen)
    db.refresh(banco_destino)
    assert banco_origen.saldo_actual_usd == Decimal("400.00")
    assert banco_destino.saldo_actual_usd == Decimal("200.00")

    # Cleanup
    asiento = db.query(AsientoContable).filter(AsientoContable.referencia == f"TRF-{trf.id}").first()
    if asiento:
        db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
        db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.id == trf.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id.in_([banco_origen.id, banco_destino.id])).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_transferencia_rechazada_en_periodo_cerrado_y_rollback_completo(setup_db):
    """3. Transferencia en período cerrado: rechaza con 403 y no altera saldos de bancos ni crea asiento."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Trf Cierre {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Tesorero",
        apellido="Test",
        email=f"tesorero_{uuid.uuid4().hex[:6]}@test.com",
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

    banco_origen = CuentaBancaria(
        banco="Banesco Cierre Origen",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    banco_destino = CuentaBancaria(
        banco="Mercantil Cierre Destino",
        numero_cuenta=f"0105-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("500.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add_all([banco_origen, banco_destino])
    db.flush()

    trf = TransferenciaTesoreria(
        cuenta_origen_id=banco_origen.id,
        cuenta_destino_id=banco_destino.id,
        monto_usd=Decimal("300.00"),
        tasa_cambio_bs=Decimal("50.00"),
        concepto="Trf Cierre Test",
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(trf)

    # Crear cierre para el período actual
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    cierre = CierrePeriodo(
        periodo=current_period,
        tenant_id=tenant_id,
        usuario="Admin"
    )
    db.add(cierre)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.post(f"/tesoreria/transferencias-internas/{trf.id}/confirmar")
    assert res.status_code in [400, 403], f"Expected 400 or 403, got {res.status_code}: {res.text}"
    assert "CERRADO" in res.text or "cerrado" in res.text

    # Rollback completo: saldos intactos y trf sigue PENDIENTE
    db.refresh(banco_origen)
    db.refresh(banco_destino)
    db.refresh(trf)
    assert banco_origen.saldo_actual_usd == Decimal("1000.00")
    assert banco_destino.saldo_actual_usd == Decimal("500.00")
    assert trf.estado == "PENDIENTE"

    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"TRF-{trf.id}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is None

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.id == trf.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id.in_([banco_origen.id, banco_destino.id])).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
