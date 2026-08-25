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
from backend.models.operations import Venta, Cliente
from backend.models.erp_extended import CuentaPorCobrar, NotaCredito, CuentaContable
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _seed_cuentas_test(db, tenant_id):
    plan = [
        ("1.1.02", "Cuentas por Cobrar Comerciales", "ACTIVO", 3),
        ("4.1.01", "Ventas de Mercancía", "INGRESOS", 3),
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


def test_nota_credito_genera_asiento_y_actualiza_cxc(setup_db):
    """1. Nota de CRÉDITO: reduce saldo de CxC y genera asiento 4.1.01 (Debe) / 1.1.02 (Haber)."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa NC Test {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Facturador",
        apellido="Test",
        email=f"facturador_{uuid.uuid4().hex[:6]}@test.com",
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
        nombre="Cliente NC S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
    db.flush()

    doc_num = f"FAC-NC-{uuid.uuid4().hex[:6]}"
    venta = Venta(
        cliente_id=cliente.id,
        numero_factura=doc_num,
        total_usd=Decimal("500.00"),
        tasa_cambio_bs=Decimal("50.00"),
        tipo_pago="CREDITO",
        estado="EMITIDA",
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    db.add(venta)
    db.flush()

    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        venta_id=venta.id,
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
        "numero_factura": doc_num,
        "monto": "150.00",
        "motivo": "Devolución parcial de mercancía",
        "tipo": "CREDITO"
    }

    res = client_app.post("/ventas/notas-credito", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["tipo"] == "CREDITO"
    nota_num = data["id"]

    # 1. CxC refleja abono de $150.00 y sigue PENDIENTE
    db.refresh(cxc)
    assert cxc.monto_pagado_usd == Decimal("150.00")
    assert cxc.estado == "PENDIENTE"

    # 2. Asiento contable: Debe 4.1.01 ($150) / Haber 1.1.02 ($150)
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == nota_num,
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("150.00")
    assert asiento.total_haber_usd == Decimal("150.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert "4.1.01" in cuentas_map
    assert cuentas_map["4.1.01"].debe_usd == Decimal("150.00")
    assert cuentas_map["4.1.01"].haber_usd == Decimal("0.00")

    assert "1.1.02" in cuentas_map
    assert cuentas_map["1.1.02"].debe_usd == Decimal("0.00")
    assert cuentas_map["1.1.02"].haber_usd == Decimal("150.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(NotaCredito).filter(NotaCredito.numero == nota_num).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(Venta).filter(Venta.id == venta.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_nota_debito_genera_asiento_y_reabre_cxc_pagada(setup_db):
    """2. Nota de DÉBITO: incrementa monto_total de CxC, la reabre y genera asiento 1.1.02 (Debe) / 4.1.01 (Haber)."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa ND Test {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Facturador",
        apellido="Test",
        email=f"facturador_{uuid.uuid4().hex[:6]}@test.com",
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
        nombre="Cliente ND S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        tenant_id=tenant_id
    )
    db.add(cliente)
    db.flush()

    doc_num = f"FAC-ND-{uuid.uuid4().hex[:6]}"
    venta = Venta(
        cliente_id=cliente.id,
        numero_factura=doc_num,
        total_usd=Decimal("200.00"),
        tasa_cambio_bs=Decimal("50.00"),
        tipo_pago="CREDITO",
        estado="EMITIDA",
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    db.add(venta)
    db.flush()

    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        venta_id=venta.id,
        numero_documento=doc_num,
        monto_total_usd=Decimal("200.00"),
        monto_pagado_usd=Decimal("200.00"),
        tasa_cambio_bs=Decimal("50.00"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PAGADA",
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
        "numero_factura": doc_num,
        "monto": "50.00",
        "motivo": "Cargo adicional por flete no incluido",
        "tipo": "DEBITO"
    }

    res = client_app.post("/ventas/notas-credito", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["tipo"] == "DEBITO"
    nota_num = data["id"]

    # 1. CxC incrementa monto_total a $250.00 y se reabre a PENDIENTE
    db.refresh(cxc)
    assert cxc.monto_total_usd == Decimal("250.00")
    assert cxc.monto_pagado_usd == Decimal("200.00")
    assert cxc.estado == "PENDIENTE"

    # 2. Asiento contable: Debe 1.1.02 ($50) / Haber 4.1.01 ($50)
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == nota_num,
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is not None
    assert asiento.total_debe_usd == Decimal("50.00")
    assert asiento.total_haber_usd == Decimal("50.00")

    cuentas_map = {d.cuenta_codigo: d for d in asiento.detalles}
    assert "1.1.02" in cuentas_map
    assert cuentas_map["1.1.02"].debe_usd == Decimal("50.00")
    assert cuentas_map["1.1.02"].haber_usd == Decimal("0.00")

    assert "4.1.01" in cuentas_map
    assert cuentas_map["4.1.01"].debe_usd == Decimal("0.00")
    assert cuentas_map["4.1.01"].haber_usd == Decimal("50.00")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(NotaCredito).filter(NotaCredito.numero == nota_num).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(Venta).filter(Venta.id == venta.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_nota_credito_rechazada_en_periodo_cerrado_y_rollback_completo(setup_db):
    """3. Nota de crédito en período cerrado: rechaza con 403 y no altera CxC ni crea Nota ni Asiento."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa NC Cierre {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Facturador",
        apellido="Test",
        email=f"facturador_{uuid.uuid4().hex[:6]}@test.com",
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

    doc_num = f"FAC-CERR-{uuid.uuid4().hex[:6]}"
    venta = Venta(
        cliente_id=cliente.id,
        numero_factura=doc_num,
        total_usd=Decimal("300.00"),
        tasa_cambio_bs=Decimal("50.00"),
        tipo_pago="CREDITO",
        estado="EMITIDA",
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    db.add(venta)
    db.flush()

    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        venta_id=venta.id,
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
        "numero_factura": doc_num,
        "monto": "100.00",
        "motivo": "Reclamo en período cerrado",
        "tipo": "CREDITO"
    }

    res = client_app.post("/ventas/notas-credito", json=payload)
    assert res.status_code in [400, 403], f"Expected 400 or 403, got {res.status_code}: {res.text}"
    assert "CERRADO" in res.text or "cerrado" in res.text

    # Rollback completo: CxC intacta, sin NotaCredito y sin Asiento
    db.refresh(cxc)
    assert cxc.monto_pagado_usd == Decimal("0.00")
    assert cxc.estado == "PENDIENTE"

    nota_count = db.query(NotaCredito).filter(
        NotaCredito.venta_id == venta.id,
        NotaCredito.tenant_id == tenant_id
    ).count()
    assert nota_count == 0

    asiento = db.query(AsientoContable).filter(
        AsientoContable.concepto.like(f"%{doc_num}%"),
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento is None

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc.id).delete()
    db.query(Venta).filter(Venta.id == venta.id).delete()
    db.query(Cliente).filter(Cliente.id == cliente.id).delete()
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
