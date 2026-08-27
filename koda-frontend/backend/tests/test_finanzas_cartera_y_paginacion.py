import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.operations import Cliente, Proveedor
from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_cartera_clientes_n1_fix_and_structure(setup_db):
    """Verifica que /cobranzas/cartera retorna estructura y cálculos idénticos sin N+1."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa Cartera {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cobranzas User",
        apellido="Test",
        email=f"cobranzas_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    cli1 = Cliente(tenant_id=tenant_id, rif="J-11111111-1", nombre="Cliente Alpha", telefono="04141111111", email="alpha@test.com", direccion="Caracas")
    cli2 = Cliente(tenant_id=tenant_id, rif="J-22222222-2", nombre="Cliente Beta", telefono="04142222222", email="beta@test.com", direccion="Valencia")
    db.add_all([cli1, cli2])
    db.commit()
    db.refresh(cli1)
    db.refresh(cli2)

    ahora = datetime.now(timezone.utc)
    # CxC para Alpha: 1 pendiente vencida ($100), 1 pendiente no vencida ($200, $50 pagado), 1 pagada
    cxc1 = CuentaPorCobrar(
        tenant_id=tenant_id,
        cliente_id=cli1.id,
        numero_documento="FAC-001",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=ahora - timedelta(days=45),
        fecha_vencimiento=ahora - timedelta(days=15),
        estado="PENDIENTE"
    )
    cxc2 = CuentaPorCobrar(
        tenant_id=tenant_id,
        cliente_id=cli1.id,
        numero_documento="FAC-002",
        monto_total_usd=Decimal("200.00"),
        monto_pagado_usd=Decimal("50.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=ahora - timedelta(days=10),
        fecha_vencimiento=ahora + timedelta(days=20),
        estado="PENDIENTE"
    )
    cxc3 = CuentaPorCobrar(
        tenant_id=tenant_id,
        cliente_id=cli1.id,
        numero_documento="FAC-003",
        monto_total_usd=Decimal("80.00"),
        monto_pagado_usd=Decimal("80.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=ahora - timedelta(days=60),
        fecha_vencimiento=ahora - timedelta(days=30),
        estado="PAGADA"
    )
    # Beta sin facturas
    db.add_all([cxc1, cxc2, cxc3])
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.get("/cobranzas/cartera")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2

    # Verify Alpha
    alpha = next((c for c in data if c["rif"] == "J-11111111-1"), None)
    assert alpha is not None
    assert alpha["name"] == "Cliente Alpha"
    assert alpha["nombre"] == "Cliente Alpha"
    assert alpha["balance"] == 250.0  # 100 + 150
    assert alpha["docs_count"] == 2
    assert alpha["mora_real"] == 100.0  # solo FAC-001 vencida
    assert alpha["status"] == "MORA"
    assert alpha["ultimo_pago"] == (ahora - timedelta(days=60)).strftime("%d/%m/%Y")

    # Verify Beta
    beta = next((c for c in data if c["rif"] == "J-22222222-2"), None)
    assert beta is not None
    assert beta["balance"] == 0.0
    assert beta["docs_count"] == 0
    assert beta["mora_real"] == 0.0
    assert beta["status"] == "AL DÍA"
    assert beta["ultimo_pago"] == "Sin pagos"

    # Cleanup
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id == tenant_id).delete()
    db.query(Cliente).filter(Cliente.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_paginacion_pagos_y_tesoreria_y_cobranzas_completo(setup_db):
    """Verifica que /cobranzas/cuentas NO está paginado, /tesoreria/movimientos SÍ está paginado, y /pagos/cuentas calcula KPIs globales sobre todas las filas aunque su lista esté paginada."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa Pag KPI {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Finanzas User",
        apellido="Test",
        email=f"finanzas_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    cli = Cliente(tenant_id=tenant_id, rif="J-33333333-3", nombre="Cliente Pag Test")
    prov = Proveedor(tenant_id=tenant_id, rif="J-44444444-4", nombre="Proveedor Pag Test")
    cuenta = CuentaBancaria(tenant_id=tenant_id, banco="Banco Pag Test", numero_cuenta="01020000000000000000", moneda="USD", saldo_actual_usd=Decimal("1000.00"), activa=True)
    db.add_all([cli, prov, cuenta])
    db.commit()
    db.refresh(cli)
    db.refresh(prov)
    db.refresh(cuenta)

    now = datetime.now(timezone.utc)
    # Crear 6 CxC
    for i in range(6):
        db.add(CuentaPorCobrar(
            tenant_id=tenant_id,
            cliente_id=cli.id,
            numero_documento=f"FAC-PAG-{i}",
            monto_total_usd=Decimal("100.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("50.0"),
            fecha_emision=now - timedelta(days=i),
            fecha_vencimiento=now + timedelta(days=30),
            estado="PENDIENTE"
        ))
    # Crear 6 CxP (cada una $200, total $1200)
    for i in range(6):
        db.add(CuentaPorPagar(
            tenant_id=tenant_id,
            proveedor_id=prov.id,
            numero_documento=f"CXP-PAG-{i}",
            monto_total_usd=Decimal("200.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("50.0"),
            fecha_emision=now - timedelta(days=i),
            fecha_vencimiento=now + timedelta(days=30),
            estado="PENDIENTE"
        ))
    # Crear 5 Movimientos Bancarios en el mes actual
    periodo_str = f"{now.year}-{str(now.month).zfill(2)}"
    for i in range(5):
        db.add(MovimientoBancario(
            tenant_id=tenant_id,
            cuenta_id=cuenta.id,
            concepto=f"Movimiento {i}",
            monto_usd=Decimal("50.00"),
            tasa_cambio_bs=Decimal("50.0"),
            tipo="INGRESO",
            referencia=f"REF-{i}",
            estado="ACTIVO",
            fecha=now - timedelta(hours=i)
        ))
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    # 1. Test /cobranzas/cuentas: devuelve la lista COMPLETA (no paginada)
    res_cxc = client_app.get("/cobranzas/cuentas")
    assert res_cxc.status_code == 200
    assert len(res_cxc.json()) == 6

    # 2. Test /pagos/cuentas: KPIs reflejan el total global de 6 facturas ($1200),
    # mientras que facturas_list respeta skip/limit
    res_cxp_pag = client_app.get("/pagos/cuentas?skip=0&limit=2")
    assert res_cxp_pag.status_code == 200
    cxp_data = res_cxp_pag.json()
    assert len(cxp_data["facturas"]) == 2
    # Métricas calculadas sobre todas las 6 facturas pendientes
    metricas = {m["label"]: m["value"] for m in cxp_data["metricas"]}
    assert metricas["Facturas Pendientes"] == "6"
    assert metricas["Total Deuda"] == "$1,200.00"

    # 3. Test /tesoreria/movimientos pagination
    res_mov_all = client_app.get(f"/tesoreria/movimientos?periodo={periodo_str}")
    assert res_mov_all.status_code == 200
    assert len(res_mov_all.json()) == 5

    res_mov_pag = client_app.get(f"/tesoreria/movimientos?periodo={periodo_str}&skip=2&limit=2")
    assert res_mov_pag.status_code == 200
    assert len(res_mov_pag.json()) == 2

    # Cleanup
    db.query(MovimientoBancario).filter(MovimientoBancario.tenant_id == tenant_id).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.tenant_id == tenant_id).delete()
    db.query(CuentaPorPagar).filter(CuentaPorPagar.tenant_id == tenant_id).delete()
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id == tenant_id).delete()
    db.query(Proveedor).filter(Proveedor.tenant_id == tenant_id).delete()
    db.query(Cliente).filter(Cliente.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
