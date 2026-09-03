"""
Verificación independiente del fix de seguridad fix/fuga-datos-entre-tenants-dashboard-telegram.

Antes del fix, GET /dashboard/metricas y GET /dashboard/alertas no exigían sesión
ni filtraban ninguna query por tenant_id, devolviendo datos combinados de TODAS
las empresas. Este test confirma que, tras el fix, cada tenant solo ve sus
propios datos.
"""
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.operations import Venta, Producto, Cliente, Proveedor
from backend.models.erp_extended import CuentaPorCobrar, CuentaPorPagar
from backend.routers.dashboard_ext import get_dashboard_metrics, get_alerts_center


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def do_attach(dbapi_connection, connection_record):
        dbapi_connection.execute("ATTACH DATABASE ':memory:' AS public;")

    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


class _FakeUser:
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id


def _seed_tenant(db_session, tenant_id, *, venta_total, cxc_pendiente, cxc_vencida,
                  cxp_pendiente, cxp_vencida, stock_agotado):
    cliente = Cliente(nombre=f"Cliente {tenant_id}", rif=f"J-{uuid.uuid4().int % 10**8}", tenant_id=tenant_id)
    proveedor = Proveedor(rif=f"J-{uuid.uuid4().int % 10**8}", nombre=f"Proveedor {tenant_id}", tenant_id=tenant_id)
    db_session.add(cliente)
    db_session.add(proveedor)
    db_session.commit()

    db_session.add(Venta(
        cliente_id=cliente.id,
        numero_factura=f"F-{uuid.uuid4().hex[:8]}",
        subtotal_usd=Decimal(str(venta_total)),
        iva_usd=Decimal("0.00"),
        total_usd=Decimal(str(venta_total)),
        metodo_pago="DIVISA",
        tasa_cambio_bs=Decimal("40.0000"),
        estado="ACTIVA",
        tenant_id=tenant_id,
    ))

    ahora = datetime.now(timezone.utc)
    db_session.add(CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=f"CXC-{uuid.uuid4().hex[:8]}",
        monto_total_usd=Decimal(str(cxc_pendiente)),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=ahora + timedelta(days=30),  # no vencida
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))
    db_session.add(CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=f"CXC-{uuid.uuid4().hex[:8]}",
        monto_total_usd=Decimal(str(cxc_vencida)),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=ahora - timedelta(days=10),  # vencida
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))

    db_session.add(CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento=f"CXP-{uuid.uuid4().hex[:8]}",
        monto_total_usd=Decimal(str(cxp_pendiente)),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=ahora + timedelta(days=30),
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))
    db_session.add(CuentaPorPagar(
        proveedor_id=proveedor.id,
        numero_documento=f"CXP-{uuid.uuid4().hex[:8]}",
        monto_total_usd=Decimal(str(cxp_vencida)),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=ahora - timedelta(days=10),
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))

    db_session.add(Producto(
        sku=f"SKU-{uuid.uuid4().hex[:8]}",
        nombre="Producto agotado",
        precio_usd=Decimal("10.00"),
        costo_usd=Decimal("5.00"),
        stock=Decimal("0.00") if stock_agotado else Decimal("100.00"),
        tenant_id=tenant_id,
    ))
    db_session.commit()


def _seed_tenant_sin_alertas(db_session, tenant_id):
    """Tenant limpio: sin CxC/CxP vencidas, sin productos agotados."""
    cliente = Cliente(nombre=f"Cliente limpio {tenant_id}", rif=f"J-{uuid.uuid4().int % 10**8}", tenant_id=tenant_id)
    db_session.add(cliente)
    db_session.commit()

    ahora = datetime.now(timezone.utc)
    db_session.add(CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=f"CXC-{uuid.uuid4().hex[:8]}",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=ahora + timedelta(days=30),  # no vencida
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))
    db_session.add(Producto(
        sku=f"SKU-{uuid.uuid4().hex[:8]}",
        nombre="Producto con stock",
        precio_usd=Decimal("10.00"),
        costo_usd=Decimal("5.00"),
        stock=Decimal("100.00"),
        tenant_id=tenant_id,
    ))
    db_session.commit()


def test_metricas_aisla_por_tenant(db_session, monkeypatch):
    # margen_bruto_pct/ventas_mensuales_anio son helpers preexistentes, fuera del
    # alcance de este fix (el prompt de la corrección explícitamente los deja
    # como están) y no son compatibles con SQLite en memoria (usan la propiedad
    # de compatibilidad `Venta.total`, no una columna real). Se neutralizan
    # aquí para aislar la verificación al filtrado por tenant_id, que es lo que
    # este fix realmente cambia.
    import backend.routers.dashboard_ext as dashboard_ext
    monkeypatch.setattr(dashboard_ext, "margen_bruto_pct", lambda db: 0)
    monkeypatch.setattr(dashboard_ext, "ventas_mensuales_anio", lambda db: [0] * 12)

    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    _seed_tenant(db_session, tenant_a, venta_total=1000, cxc_pendiente=100, cxc_vencida=50,
                 cxp_pendiente=200, cxp_vencida=20, stock_agotado=True)
    _seed_tenant(db_session, tenant_b, venta_total=9999, cxc_pendiente=888, cxc_vencida=777,
                 cxp_pendiente=666, cxp_vencida=555, stock_agotado=True)

    result_a = get_dashboard_metrics(db=db_session, current_user=_FakeUser(tenant_a))
    result_b = get_dashboard_metrics(db=db_session, current_user=_FakeUser(tenant_b))

    # Cada tenant ve exactamente lo suyo (una sola venta de $1000/$9999), no la suma de ambos.
    assert result_a["totalVendido"] == 1000.0, result_a
    assert result_b["totalVendido"] == 9999.0, result_b
    # CxC pendiente de A = 100 + 50 (ambas estan != PAGADA), nunca la de B.
    assert result_a["porCobrar"] == 150.0, result_a
    assert result_b["porCobrar"] == 1665.0, result_b
    assert result_a["porPagar"] == 220.0, result_a
    assert result_b["porPagar"] == 1221.0, result_b


def test_alertas_aisla_por_tenant(db_session):
    tenant_a = uuid.uuid4()  # tiene CxC/CxP vencidas y stock agotado
    tenant_b = uuid.uuid4()  # sin nada vencido, sin agotados

    _seed_tenant(db_session, tenant_a, venta_total=1000, cxc_pendiente=100, cxc_vencida=50,
                 cxp_pendiente=200, cxp_vencida=20, stock_agotado=True)
    _seed_tenant_sin_alertas(db_session, tenant_b)

    result_a = get_alerts_center(db=db_session, current_user=_FakeUser(tenant_a))
    result_b = get_alerts_center(db=db_session, current_user=_FakeUser(tenant_b))

    alertas_a = {i["alerta"] for i in result_a["items"]}
    alertas_b = {i["alerta"] for i in result_b["items"]}

    # Tenant A tiene vencidos/agotados reales -> debe ver las 3 alertas.
    assert "Facturas vencidas" in alertas_a
    assert any("Productos agotados" in a for a in alertas_a)
    assert result_a["total"] == 3, result_a

    # Tenant B no tiene NADA vencido/agotado propio. Antes del fix (sin filtro
    # de tenant_id), hubiera visto igualmente las alertas de A por la fuga de
    # datos entre tenants. Con el fix, su lista debe estar vacia.
    assert alertas_b == set(), f"Tenant B no deberia ver alertas de otro tenant: {alertas_b}"
    assert result_b["total"] == 0, result_b


def test_get_current_user_es_obligatorio_en_ambos_endpoints():
    """
    Confirma a nivel de firma que ambos endpoints ahora dependen de
    get_current_user (antes de este fix, ninguno lo requeria).
    """
    import inspect
    from backend.core.security import get_current_user

    for fn in (get_dashboard_metrics, get_alerts_center):
        sig = inspect.signature(fn)
        assert "current_user" in sig.parameters, f"{fn.__name__} no exige current_user"
        default = sig.parameters["current_user"].default
        assert getattr(default, "dependency", None) is get_current_user, (
            f"{fn.__name__}.current_user no depende de get_current_user"
        )
