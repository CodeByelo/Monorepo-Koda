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
from backend.models.erp_extended import CuentaPorPagar, CuentaBancaria, MovimientoBancario, CuentaContable
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _seed_cuentas_test(db, tenant_id):
    plan = [
        ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
        ("2.1.01", "Cuentas por Pagar Comerciales", "PASIVO", 3),
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
                naturaleza="DEUDORA" if tipo == "ACTIVO" else "ACREEDORA",
                tenant_id=tenant_id
            ))
    db.commit()


def test_pago_individual_cxp_genera_asiento_contable(setup_db):
    """1. Verifica que aprobar una orden de pago genere asiento contable y debite banco."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Pago Individual {uuid.uuid4().hex[:6]}",
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

    proveedor = Proveedor(
        nombre="Proveedor Pagos C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        telefono="0212-3333333",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.flush()

    banco = CuentaBancaria(
        banco="Banesco",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(banco)

    cxp = CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento="FAC-PAGO-001",
        monto_total_usd=Decimal("300.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxp)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    payload = {
        "orden_id": f"OP-{cxp.id}",
        "banco_id": banco.id,
        "referencia": "REF-PAGO-IND-001",
        "metodo": "TRANSFERENCIA"
    }

    res = client.post("/pagos/ordenes/aprobar", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Verificar Asiento Contable
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == "REF-PAGO-IND-001",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("300.00")
    assert asiento.total_haber_usd == Decimal("300.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert "2.1.01" in cuentas_map  # Cuentas por Pagar Comerciales (Debe)
    assert cuentas_map["2.1.01"].debe_usd == Decimal("300.00")
    assert cuentas_map["2.1.01"].haber_usd == Decimal("0.00")

    assert "1.1.01" in cuentas_map  # Caja y Bancos (Haber)
    assert cuentas_map["1.1.01"].debe_usd == Decimal("0.00")
    assert cuentas_map["1.1.01"].haber_usd == Decimal("300.00")

    # 2. Verificar estado de la CxP y saldo bancario
    db.refresh(cxp)
    assert cxp.estado == "PAGADA"
    assert cxp.monto_pagado_usd == Decimal("300.00")

    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("700.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).delete()
    db.query(CuentaPorPagar).filter(CuentaPorPagar.id == cxp.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_pago_por_lote_genera_un_solo_asiento_por_el_total(setup_db):
    """2. Verifica que procesar lotes de pago genere un único asiento por el total de las CxPs."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Pago Lote {uuid.uuid4().hex[:6]}",
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

    proveedor = Proveedor(
        nombre="Proveedor Lote C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        telefono="0212-4444444",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.flush()

    banco = CuentaBancaria(
        banco="Mercantil",
        numero_cuenta=f"0105-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("2000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(banco)

    # Crear 3 CxPs pendientes: 100 + 250 + 150 = 500
    cxp1 = CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento="FAC-LOTE-001",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    cxp2 = CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento="FAC-LOTE-002",
        monto_total_usd=Decimal("250.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    cxp3 = CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento="FAC-LOTE-003",
        monto_total_usd=Decimal("150.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add_all([cxp1, cxp2, cxp3])
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    ref_lote = "LOTE-TEST-PAGOS-001"
    payload = {"referencia": ref_lote}

    res = client.post("/pagos/lotes/procesar", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Verificar que existe UN SOLO Asiento Contable por el total (500.00)
    asientos = db.query(AsientoContable).filter(
        AsientoContable.referencia == ref_lote,
        AsientoContable.tenant_id == tenant_id
    ).all()
    assert len(asientos) == 1
    asiento = asientos[0]
    assert asiento.total_debe_usd == Decimal("500.00")
    assert asiento.total_haber_usd == Decimal("500.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert cuentas_map["2.1.01"].debe_usd == Decimal("500.00")
    assert cuentas_map["1.1.01"].haber_usd == Decimal("500.00")

    # 2. Verificar que todas las CxP quedaron PAGADAS
    for c in [cxp1, cxp2, cxp3]:
        db.refresh(c)
        assert c.estado == "PAGADA"
        assert c.monto_pagado_usd == c.monto_total_usd

    # 3. Verificar saldo bancario
    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("1500.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).delete()
    db.query(CuentaPorPagar).filter(CuentaPorPagar.id.in_([cxp1.id, cxp2.id, cxp3.id])).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_pago_rechazado_en_periodo_cerrado_y_rollback_completo(setup_db):
    """3. Verifica que un pago en período cerrado falle y no debite banco ni marque PAGADA la CxP."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cierre Pago {uuid.uuid4().hex[:6]}",
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

    proveedor = Proveedor(
        nombre="Proveedor Cierre Pago C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        telefono="0212-5555555",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.flush()

    banco = CuentaBancaria(
        banco="Banesco Cierre",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(banco)

    cxp = CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento="FAC-BLOQUEADA-001",
        monto_total_usd=Decimal("400.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxp)

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
    client = TestClient(app)

    payload = {
        "orden_id": f"OP-{cxp.id}",
        "banco_id": banco.id,
        "referencia": "REF-BLOQUEADA-001",
        "metodo": "TRANSFERENCIA"
    }

    res = client.post("/pagos/ordenes/aprobar", json=payload)
    assert res.status_code in [400, 403], f"Expected 400 or 403, got {res.status_code}: {res.text}"
    assert "CERRADO" in res.text or "cerrado" in res.text

    # Rollback completo: Verificar que NO se modificó nada en la BD
    db.refresh(cxp)
    assert cxp.estado == "PENDIENTE"
    assert cxp.monto_pagado_usd == Decimal("0.00")

    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("1000.00")

    mov_count = db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).count()
    assert mov_count == 0

    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == "REF-BLOQUEADA-001",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is None

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(CuentaPorPagar).filter(CuentaPorPagar.id == cxp.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
