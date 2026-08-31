import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Asegurar variables de entorno dummy si no están definidas
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.core.database import Base, get_db
from backend.models.core import Tenant, Profile, TasaCambio
from backend.models.erp_extended import Empresa, Almacen, StockPorAlmacen, CuentaContable
from backend.models.operations import Producto, Cliente, Venta, VentaDetalle, KardexMovimiento
from backend.models.fiscal import CorrelativoFiscal, ReglaFiscal
from backend.core.security import get_current_user
from backend.routers.facturacion import router as facturacion_router


@pytest.fixture(scope="function")
def test_engine():
    """Engine SQLite en memoria con schema public atado y StaticPool."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


@pytest.fixture(scope="function")
def test_client(db_session):
    """TestClient de FastAPI con dependencias y entorno fiscal/contable configurado."""
    app = FastAPI()
    app.include_router(facturacion_router)

    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    tenant_a = Tenant(id=tenant_a_id, nombre_empresa="Tenant Facturacion A")
    tenant_b = Tenant(id=tenant_b_id, nombre_empresa="Tenant Facturacion B")

    user_a = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_a_id,
        username="facturador_a",
        email="facturador_a@test.com",
        rol_id=2
    )

    empresa_a = Empresa(
        id=1,
        tenant_id=tenant_a_id,
        rif="J-12345678-0",
        razon_social="EMPRESA FACTURACION A C.A.",
        direccion="Caracas, Venezuela",
        tipo_contribuyente="ESPECIAL"
    )

    almacen_a = Almacen(
        id=1,
        tenant_id=tenant_a_id,
        codigo="ALM-01",
        nombre="Almacén Principal A",
        activo=True
    )

    tasa = TasaCambio(
        id=1,
        tenant_id=tenant_a_id,
        valor_ves=Decimal("784.66")
    )

    correlativo = CorrelativoFiscal(
        id=1,
        tenant_id=tenant_a_id,
        tipo_documento="FACTURA",
        prefijo="FAC-",
        siguiente_numero=1
    )

    regla = ReglaFiscal(
        id=1,
        tenant_id=tenant_a_id,
        nombre="IVA",
        tasa=Decimal("0.1600"),
        activa=True
    )

    cliente_a = Cliente(
        id=10,
        tenant_id=tenant_a_id,
        rif="J-99999999-9",
        nombre="CLIENTE VALIDO TENANT A",
        email="cliente_a@test.com"
    )

    cliente_b = Cliente(
        id=20,
        tenant_id=tenant_b_id,
        rif="J-88888888-8",
        nombre="CLIENTE AJENO TENANT B",
        email="cliente_b@test.com"
    )

    # Cuentas contables para que procesar_emision_factura no falle
    cuentas = [
        CuentaContable(id=1, tenant_id=tenant_a_id, codigo="1.1.01.01", nombre="Caja Principal", tipo="ACTIVO"),
        CuentaContable(id=2, tenant_id=tenant_a_id, codigo="1.1.02.01", nombre="Banco", tipo="ACTIVO"),
        CuentaContable(id=3, tenant_id=tenant_a_id, codigo="1.1.03.01", nombre="Cuentas por Cobrar", tipo="ACTIVO"),
        CuentaContable(id=4, tenant_id=tenant_a_id, codigo="4.1.01.01", nombre="Ventas de Mercancía", tipo="INGRESO"),
        CuentaContable(id=5, tenant_id=tenant_a_id, codigo="2.1.04.01", nombre="Débito Fiscal IVA", tipo="PASIVO"),
        CuentaContable(id=6, tenant_id=tenant_a_id, codigo="2.1.04.02", nombre="IGTF por Pagar", tipo="PASIVO"),
        CuentaContable(id=7, tenant_id=tenant_a_id, codigo="5.1.01.01", nombre="Costo de Ventas", tipo="EGRESO"),
        CuentaContable(id=8, tenant_id=tenant_a_id, codigo="1.1.05.01", nombre="Inventario", tipo="ACTIVO"),
    ]

    db_session.add_all([
        tenant_a, tenant_b, user_a, empresa_a, almacen_a, tasa,
        correlativo, regla, cliente_a, cliente_b, *cuentas
    ])
    db_session.commit()

    def override_get_db():
        yield db_session

    def override_get_current_user():
        return user_a

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    client.tenant_a_id = tenant_a_id
    client.tenant_b_id = tenant_b_id
    client.user_a = user_a
    client.cliente_a = cliente_a
    client.cliente_b = cliente_b
    return client


def test_bug1_rechazar_producto_huerfano_seed_sin_tenant(test_client, db_session):
    """
    Bug 1: Un producto sin tenant_id (tenant_id IS NULL, como los del seed inicial PROD-001)
    o perteneciente a otro tenant NO debe poder facturarse desde Tenant A.
    El endpoint debe devolver 404 Not Found, nunca 201 Created.
    """
    tenant_a_id = test_client.tenant_a_id

    # 1. Producto huérfano (tenant_id = None)
    prod_huerfano = Producto(
        id=999,
        sku="PROD-001",
        nombre="Harina PAN 1kg (Seed)",
        precio_usd=Decimal("1.50"),
        costo_usd=Decimal("1.00"),
        stock=Decimal("100.00"),
        tenant_id=None
    )
    db_session.add(prod_huerfano)
    db_session.commit()

    payload_huerfano = {
        "cliente_id": "10",
        "metodo_pago": "Transferencia",
        "moneda_documento": "BIMONETARIO",
        "detalles": [
            {
                "producto_id": "PROD-001",
                "cantidad": 2.0,
                "precio_unitario": 1.50
            }
        ]
    }
    resp_huerfano = test_client.post("/v1/facturacion/emitir", json=payload_huerfano)
    assert resp_huerfano.status_code == 404
    assert "no encontrado en su inventario" in resp_huerfano.json()["detail"]

    # 2. Producto legítimo perteneciente a Tenant A
    prod_legitimo = Producto(
        id=101,
        sku="PROD-TENANT-A",
        nombre="Producto Real Tenant A",
        precio_usd=Decimal("10.00"),
        costo_usd=Decimal("6.00"),
        stock=Decimal("50.00"),
        tenant_id=tenant_a_id
    )
    stock_alm = StockPorAlmacen(
        producto_id=101,
        almacen_id=1,
        cantidad=Decimal("50.00"),
        tenant_id=tenant_a_id
    )
    db_session.add_all([prod_legitimo, stock_alm])
    db_session.commit()

    payload_legitimo = {
        "cliente_id": "10",
        "metodo_pago": "Transferencia",
        "moneda_documento": "BIMONETARIO",
        "detalles": [
            {
                "producto_id": "PROD-TENANT-A",
                "cantidad": 2.0,
                "precio_unitario": 10.00
            }
        ]
    }
    resp_legitimo = test_client.post("/v1/facturacion/emitir", json=payload_legitimo)
    assert resp_legitimo.status_code == 201
    data = resp_legitimo.json()
    assert data["cliente"]["id"] == 10
    assert data["cliente"]["nombre"] == "CLIENTE VALIDO TENANT A"
    assert data["monto_total"] > 0


def test_bug2_rechazar_cliente_inexistente_o_ajeno_con_404(test_client, db_session):
    """
    Bug 2: Si el cliente_id no existe o pertenece a otro tenant, el endpoint debe devolver
    404 Not Found de inmediato, sin emitir silenciosamente la factura a nombre de otro cliente.
    """
    tenant_a_id = test_client.tenant_a_id

    prod = Producto(
        id=202,
        sku="PROD-TEST-CLIENTE",
        nombre="Producto Test Cliente",
        precio_usd=Decimal("20.00"),
        costo_usd=Decimal("12.00"),
        stock=Decimal("30.00"),
        tenant_id=tenant_a_id
    )
    stock_alm = StockPorAlmacen(
        producto_id=202,
        almacen_id=1,
        cantidad=Decimal("30.00"),
        tenant_id=tenant_a_id
    )
    db_session.add_all([prod, stock_alm])
    db_session.commit()

    # 1. cliente_id numérico inexistente (ID 99999)
    payload_inexistente = {
        "cliente_id": "99999",
        "metodo_pago": "Transferencia",
        "moneda_documento": "BIMONETARIO",
        "detalles": [{"producto_id": "PROD-TEST-CLIENTE", "cantidad": 1.0, "precio_unitario": 20.0}]
    }
    resp_inexistente = test_client.post("/v1/facturacion/emitir", json=payload_inexistente)
    assert resp_inexistente.status_code == 404
    assert "no encontrado en su empresa" in resp_inexistente.json()["detail"]

    # 2. cliente_id perteneciente al Tenant B (ID 20)
    payload_ajeno = {
        "cliente_id": "20",
        "metodo_pago": "Transferencia",
        "moneda_documento": "BIMONETARIO",
        "detalles": [{"producto_id": "PROD-TEST-CLIENTE", "cantidad": 1.0, "precio_unitario": 20.0}]
    }
    resp_ajeno = test_client.post("/v1/facturacion/emitir", json=payload_ajeno)
    assert resp_ajeno.status_code == 404
    assert "no encontrado en su empresa" in resp_ajeno.json()["detail"]

    # Verificar que NO se crearon ventas espurias en la BD
    assert db_session.query(Venta).filter(Venta.cliente_id == 20).count() == 0
