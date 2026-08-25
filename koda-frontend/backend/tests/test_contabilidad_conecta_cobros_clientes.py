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
from backend.models.operations import Cliente
from backend.models.erp_extended import CuentaPorCobrar, CuentaBancaria, MovimientoBancario, CuentaContable
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _seed_cuentas_test(db, tenant_id):
    plan = [
        ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
        ("1.1.02", "Cuentas por Cobrar Comerciales", "ACTIVO", 3),
        ("5.1.03", "Otras Asignaciones (Gasto)", "GASTO", 3),
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
                naturaleza="DEUDORA" if tipo in ["ACTIVO", "GASTO"] else "ACREEDORA",
                tenant_id=tenant_id
            ))
    db.commit()


def test_cobro_simple_banco_genera_asiento_y_movimiento(setup_db):
    """1. Cobro simple por banco: mueve banco, crea movimiento bancario y genera asiento 1.1.01 vs 1.1.02."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cobro Simple {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cobrador",
        apellido="Test",
        email=f"cobrador_{uuid.uuid4().hex[:6]}@test.com",
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

    cliente = Cliente(
        nombre="Cliente Cobro Simple S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
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

    doc_num = f"FAC-COBRO-{uuid.uuid4().hex[:6]}"
    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=doc_num,
        monto_total_usd=Decimal("500.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxc)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "factura_id": doc_num,
        "monto": 500.00,
        "metodos": [
            {"type": "Transferencia", "account": "Banesco", "amount": "500.00", "ref": "REF-TRANS-01"}
        ]
    }

    res = client_app.post("/cobranzas/aplicacion/procesar", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Verificar Cuenta Bancaria y Movimiento
    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("1500.00")

    mov = db.query(MovimientoBancario).filter(
        MovimientoBancario.cuenta_id == banco.id,
        MovimientoBancario.referencia == "REF-TRANS-01",
        MovimientoBancario.tenant_id == tenant_id
    ).first()
    assert mov is not None
    assert mov.tipo == "INGRESO"
    assert mov.monto_usd == Decimal("500.00")

    # 2. Verificar Asiento Contable
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COBRO-{doc_num}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("500.00")
    assert asiento.total_haber_usd == Decimal("500.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert "1.1.01" in cuentas_map  # Caja y Bancos (Debe)
    assert cuentas_map["1.1.01"].debe_usd == Decimal("500.00")
    assert cuentas_map["1.1.01"].haber_usd == Decimal("0.00")

    assert "1.1.02" in cuentas_map  # Cuentas por Cobrar (Haber)
    assert cuentas_map["1.1.02"].debe_usd == Decimal("0.00")
    assert cuentas_map["1.1.02"].haber_usd == Decimal("500.00")

    # 3. Verificar CxC
    db.refresh(cxc)
    assert cxc.estado == "PAGADA"
    assert cxc.monto_pagado_usd == Decimal("500.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_cobro_mixto_efectivo_y_banco(setup_db):
    """2. Cobro mixto: solo mueve banco por la parte bancaria, y asiento de 1.1.01 refleja el total."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cobro Mixto {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cobrador",
        apellido="Test",
        email=f"cobrador_{uuid.uuid4().hex[:6]}@test.com",
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

    cliente = Cliente(
        nombre="Cliente Cobro Mixto S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
    db.flush()

    banco = CuentaBancaria(
        banco="Mercantil",
        numero_cuenta=f"0105-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("500.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(banco)

    doc_num = f"FAC-MIX-{uuid.uuid4().hex[:6]}"
    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=doc_num,
        monto_total_usd=Decimal("300.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxc)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "factura_id": doc_num,
        "monto": 300.00,
        "metodos": [
            {"type": "Efectivo", "amount": "100.00", "account": None},
            {"type": "Transferencia", "account": "Mercantil", "amount": "200.00", "ref": "REF-MIX-01"}
        ]
    }

    res = client_app.post("/cobranzas/aplicacion/procesar", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Banco solo aumenta 200.00 (500 + 200 = 700)
    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("700.00")

    # 2. Solo 1 movimiento bancario para la parte de Mercantil
    movs = db.query(MovimientoBancario).filter(
        MovimientoBancario.cuenta_id == banco.id,
        MovimientoBancario.tenant_id == tenant_id
    ).all()
    assert len(movs) == 1
    assert movs[0].monto_usd == Decimal("200.00")

    # 3. Asiento contable refleja el total de 300.00 en 1.1.01
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COBRO-{doc_num}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("300.00")
    assert asiento.total_haber_usd == Decimal("300.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert cuentas_map["1.1.01"].debe_usd == Decimal("300.00")
    assert cuentas_map["1.1.02"].haber_usd == Decimal("300.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_cobro_con_diferencia_faltante_comision(setup_db):
    """3. Cobro con diferencia 'Faltante': genera línea extra en 5.1.03 (Gasto) al Debe y asiento cuadra."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cobro Comision {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cobrador",
        apellido="Test",
        email=f"cobrador_{uuid.uuid4().hex[:6]}@test.com",
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

    cliente = Cliente(
        nombre="Cliente Comision S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
    db.flush()

    banco = CuentaBancaria(
        banco="Banesco Comision",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(banco)

    doc_num = f"FAC-COM-{uuid.uuid4().hex[:6]}"
    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=doc_num,
        monto_total_usd=Decimal("580.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxc)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "factura_id": doc_num,
        "monto": 580.00,
        "metodos": [
            {"type": "Transferencia", "account": "Banesco Comision", "amount": "575.00", "ref": "REF-COM-01"}
        ],
        "diferencia": -5.00,
        "accion_diferencia": "Faltante",
        "motivo_diferencia": "Comisión Bancaria (Gasto)"
    }

    res = client_app.post("/cobranzas/aplicacion/procesar", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Banco aumenta 575.00
    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("1575.00")

    # 2. CxC queda PAGADA por los 580.00 completos
    db.refresh(cxc)
    assert cxc.estado == "PAGADA"
    assert cxc.monto_pagado_usd == Decimal("580.00")

    # 3. Asiento contable: Debe = 575 (1.1.01) + 5 (5.1.03) = 580; Haber = 580 (1.1.02)
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COBRO-{doc_num}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("580.00")
    assert asiento.total_haber_usd == Decimal("580.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert "1.1.01" in cuentas_map
    assert cuentas_map["1.1.01"].debe_usd == Decimal("575.00")

    assert "5.1.03" in cuentas_map
    assert cuentas_map["5.1.03"].debe_usd == Decimal("5.00")

    assert "1.1.02" in cuentas_map
    assert cuentas_map["1.1.02"].haber_usd == Decimal("580.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_cobro_sin_metodos_trata_como_efectivo(setup_db):
    """4. Cobro sin campo 'metodos' (handleAplicarPendiente): se trata como Efectivo al 100%."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cobro Pendiente {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cobrador",
        apellido="Test",
        email=f"cobrador_{uuid.uuid4().hex[:6]}@test.com",
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

    cliente = Cliente(
        nombre="Cliente Pendiente S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
    db.flush()

    doc_num = f"FAC-PEND-{uuid.uuid4().hex[:6]}"
    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=doc_num,
        monto_total_usd=Decimal("150.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxc)
    db.commit()

    _seed_cuentas_test(db, tenant_id)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "factura_id": doc_num,
        "monto": 150.00
    }

    res = client_app.post("/cobranzas/aplicacion/procesar", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True

    # 1. Asiento generado en 1.1.01 y 1.1.02
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COBRO-{doc_num}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("150.00")
    assert asiento.total_haber_usd == Decimal("150.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert cuentas_map["1.1.01"].debe_usd == Decimal("150.00")
    assert cuentas_map["1.1.02"].haber_usd == Decimal("150.00")

    # 2. CxC queda PAGADA
    db.refresh(cxc)
    assert cxc.estado == "PAGADA"
    assert cxc.monto_pagado_usd == Decimal("150.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_cobro_rechazado_en_periodo_cerrado_y_rollback_completo(setup_db):
    """5. Cobro en período cerrado: rechazado con 403, no altera saldo de banco ni CxC ni crea movimientos."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cierre Cobro {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cobrador",
        apellido="Test",
        email=f"cobrador_{uuid.uuid4().hex[:6]}@test.com",
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

    cliente = Cliente(
        nombre="Cliente Cierre S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
    db.flush()

    banco = CuentaBancaria(
        banco="Banesco Cierre Cobro",
        numero_cuenta=f"0134-{uuid.uuid4().hex[:10]}",
        moneda="USD",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(banco)

    doc_num = f"FAC-CERR-{uuid.uuid4().hex[:6]}"
    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=doc_num,
        monto_total_usd=Decimal("200.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db.add(cxc)

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

    payload = {
        "factura_id": doc_num,
        "monto": 200.00,
        "metodos": [
            {"type": "Transferencia", "account": "Banesco Cierre Cobro", "amount": "200.00", "ref": "REF-CERR-01"}
        ]
    }

    res = client_app.post("/cobranzas/aplicacion/procesar", json=payload)
    assert res.status_code in [400, 403], f"Expected 400 or 403, got {res.status_code}: {res.text}"
    assert "CERRADO" in res.text or "cerrado" in res.text

    # Rollback completo: Verificar que NO se modificó nada en BD
    db.refresh(cxc)
    assert cxc.estado == "PENDIENTE"
    assert cxc.monto_pagado_usd == Decimal("0.00")

    db.refresh(banco)
    assert banco.saldo_actual_usd == Decimal("1000.00")

    mov_count = db.query(MovimientoBancario).filter(MovimientoBancario.cuenta_id == banco.id).count()
    assert mov_count == 0

    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COBRO-{doc_num}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is None

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.id == banco.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
