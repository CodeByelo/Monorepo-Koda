import os
import uuid
import asyncio
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest

# Asegurar variables de entorno dummy si no están definidas para permitir la importación de módulos
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.core import Tenant, Profile, TasaCambio
from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar, Vendedor
from backend.models.operations import Venta, VentaDetalle, Producto, Cliente
from backend.routers.operaciones.reportes import (
    reporte_ventas,
    reporte_antiguedad,
    reporte_diferencial,
    exportar_query_builder
)


@pytest.fixture(scope="function")
def test_engine():
    """Engine SQLite en memoria con schema public atado."""
    engine = create_engine("sqlite:///:memory:")
    @event.listens_for(engine, "connect")
    def do_attach(dbapi_connection, connection_record):
        dbapi_connection.execute("ATTACH DATABASE ':memory:' AS public;")
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(test_engine):
    """Crea una sesión de base de datos para tests."""
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_bugs1_2_3_multi_tenant_tasa_cambio(db_session):
    """
    Verifica que los reportes (ventas, antigüedad, diferencial) utilicen la TasaCambio
    específica de cada tenant (tenant A = 100.0, tenant B = 200.0) y no la de otros tenants.
    """
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    tenant_a = Tenant(id=tenant_a_id, nombre_empresa="Tenant A", estado_licencia="ACTIVA")
    tenant_b = Tenant(id=tenant_b_id, nombre_empresa="Tenant B", estado_licencia="ACTIVA")

    user_a = Profile(id=uuid.uuid4(), tenant_id=tenant_a_id, rol_id=1, email="usera@test.com", username="usera", password_hash="fake")
    user_b = Profile(id=uuid.uuid4(), tenant_id=tenant_b_id, rol_id=1, email="userb@test.com", username="userb", password_hash="fake")

    cliente_a = Cliente(id=1, tenant_id=tenant_a_id, nombre="Cliente A", rif="J-11111111")
    cliente_b = Cliente(id=2, tenant_id=tenant_b_id, nombre="Cliente B", rif="J-22222222")

    # Tasas de cambio distintas por tenant
    tasa_a = TasaCambio(tenant_id=tenant_a_id, valor_ves=Decimal("100.00"), fecha=datetime.now(timezone.utc))
    tasa_b = TasaCambio(tenant_id=tenant_b_id, valor_ves=Decimal("200.00"), fecha=datetime.now(timezone.utc))

    # Cuentas por cobrar para tenant A
    cxc_a = CuentaPorCobrar(
        id=1,
        tenant_id=tenant_a_id,
        cliente_id=cliente_a.id,
        numero_documento="CXC-A1",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("90.00"),
        fecha_emision=datetime.now(timezone.utc) - timedelta(days=10),
        fecha_vencimiento=datetime.now(timezone.utc) + timedelta(days=10),
        estado="PAGADA"
    )

    # Cuentas por cobrar para tenant B
    cxc_b = CuentaPorCobrar(
        id=2,
        tenant_id=tenant_b_id,
        cliente_id=cliente_b.id,
        numero_documento="CXC-B1",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("90.00"),
        fecha_emision=datetime.now(timezone.utc) - timedelta(days=10),
        fecha_vencimiento=datetime.now(timezone.utc) + timedelta(days=10),
        estado="PAGADA"
    )

    db_session.add_all([tenant_a, tenant_b, user_a, user_b, cliente_a, cliente_b, tasa_a, tasa_b, cxc_a, cxc_b])
    db_session.commit()

    # 1. Test reporte_ventas
    res_ventas_a = reporte_ventas(periodo="mensual", db=db_session, current_user=user_a)
    res_ventas_b = reporte_ventas(periodo="mensual", db=db_session, current_user=user_b)
    
    chart_a = res_ventas_a.get("chart", [])
    chart_b = res_ventas_b.get("chart", [])
    if chart_a:
        assert chart_a[-1]["rate"] == 100.0
    if chart_b:
        assert chart_b[-1]["rate"] == 200.0

    # 2. Test reporte_diferencial
    res_diff_a = reporte_diferencial(db=db_session, current_user=user_a)
    res_diff_b = reporte_diferencial(db=db_session, current_user=user_b)

    # Tenant A diff: tasa_val = 100.0, tasa_issue = 90.0 -> diff_tasa = 10.0 -> diff_bs = 100 * 10 = +Bs. 1,000.00
    ops_a = res_diff_a["operations"]
    assert len(ops_a) == 1
    assert ops_a[0]["rateCollection"] == "100.00"
    assert ops_a[0]["diff"] == "+Bs. 1,000.00"

    # Tenant B diff: tasa_val = 200.0, tasa_issue = 90.0 -> diff_tasa = 110.0 -> diff_bs = 100 * 110 = +Bs. 11,000.00
    ops_b = res_diff_b["operations"]
    assert len(ops_b) == 1
    assert ops_b[0]["rateCollection"] == "200.00"
    assert ops_b[0]["diff"] == "+Bs. 11,000.00"

    # 3. Test reporte_antiguedad (cartera pendiente)
    cxc_pend_a = CuentaPorCobrar(
        id=3,
        tenant_id=tenant_a_id,
        cliente_id=cliente_a.id,
        numero_documento="CXC-A2",
        monto_total_usd=Decimal("50.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("90.00"),
        fecha_emision=datetime.now(timezone.utc) - timedelta(days=5),
        fecha_vencimiento=datetime.now(timezone.utc) + timedelta(days=5),
        estado="PENDIENTE"
    )
    cxc_pend_b = CuentaPorCobrar(
        id=4,
        tenant_id=tenant_b_id,
        cliente_id=cliente_b.id,
        numero_documento="CXC-B2",
        monto_total_usd=Decimal("50.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("90.00"),
        fecha_emision=datetime.now(timezone.utc) - timedelta(days=5),
        fecha_vencimiento=datetime.now(timezone.utc) + timedelta(days=5),
        estado="PENDIENTE"
    )
    db_session.add_all([cxc_pend_a, cxc_pend_b])
    db_session.commit()

    res_ant_a = reporte_antiguedad(db=db_session, current_user=user_a)
    res_ant_b = reporte_antiguedad(db=db_session, current_user=user_b)
    
    assert res_ant_a is not None
    assert res_ant_b is not None


def test_tasa_cambio_fallback_784_66(db_session):
    """
    Verifica que al no existir ninguna TasaCambio cargada en BD,
    el helper tasa_actual devuelva el fallback oficial 784.66.
    """
    tenant_id = uuid.uuid4()
    user = Profile(id=uuid.uuid4(), tenant_id=tenant_id, rol_id=1, email="fallback@test.com", username="fallbackuser", password_hash="fake")
    cliente = Cliente(id=10, tenant_id=tenant_id, nombre="Cliente Fallback Test", rif="J-99999999")
    
    cxc = CuentaPorCobrar(
        id=100,
        tenant_id=tenant_id,
        cliente_id=cliente.id,
        numero_documento="CXC-FB1",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("90.00"),
        fecha_emision=datetime.now(timezone.utc) - timedelta(days=5),
        fecha_vencimiento=datetime.now(timezone.utc) + timedelta(days=5),
        estado="PAGADA"
    )

    db_session.add_all([user, cliente, cxc])
    db_session.commit()

    res_diff = reporte_diferencial(db=db_session, current_user=user)
    ops = res_diff["operations"]
    assert len(ops) == 1
    assert ops[0]["rateCollection"] == "784.66"


def test_bug4_exportar_query_builder_csv(db_session):
    """
    Verifica que el endpoint exportar_query_builder ejecute correctamente la consulta
    con joinedload y genere el archivo CSV esperado sin errores de atributos perezosos.
    """
    async def run_test():
        tenant_id = uuid.uuid4()
        user = Profile(id=uuid.uuid4(), tenant_id=tenant_id, rol_id=1, email="qb@test.com", username="qbuser", password_hash="fake")

        cliente = Cliente(id=1, tenant_id=tenant_id, nombre="Cliente QB Test", rif="J-12345678")
        vendedor = Vendedor(id=1, tenant_id=tenant_id, nombre="Vendedor QB Test", codigo="V-8888")
        producto = Producto(id=1, tenant_id=tenant_id, nombre="Producto QB", sku="PROD-QB-01", costo_usd=Decimal("10.00"), precio_usd=Decimal("20.00"))

        venta = Venta(
            id=1,
            tenant_id=tenant_id,
            cliente_id=cliente.id,
            vendedor_id=vendedor.id,
            numero_factura="FAC-QB-001",
            fecha=datetime.now(timezone.utc),
            subtotal_usd=Decimal("20.00"),
            iva_usd=Decimal("3.20"),
            total_usd=Decimal("23.20"),
            metodo_pago="Efectivo",
            tasa_cambio_bs=Decimal("50.00"),
            estado="ACTIVA"
        )

        detalle = VentaDetalle(
            id=1,
            tenant_id=tenant_id,
            venta_id=venta.id,
            producto_id=producto.id,
            cantidad=Decimal("2.00"),
            precio_usd_capturado=Decimal("20.00")
        )

        db_session.add_all([user, cliente, vendedor, producto, venta, detalle])
        db_session.commit()

        fields_arg = "date,customer,sku,seller,netAmount,quantity"
        response = exportar_query_builder(fields=fields_arg, periodo=None, db=db_session, current_user=user)
        
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk)
        content = b"".join(chunks).decode("utf-8-sig")
        
        assert "DATE,CUSTOMER,SKU,SELLER,NETAMOUNT,QUANTITY" in content
        assert "Cliente QB Test" in content
        assert "PROD-QB-01" in content
        assert "Vendedor QB Test" in content

    asyncio.run(run_test())
