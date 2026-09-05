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
from backend.models.erp_extended import Empresa, Almacen, StockPorAlmacen, CuentaContable, Cotizacion, CotizacionItem
from backend.models.operations import Producto, Cliente, Venta, VentaDetalle, KardexMovimiento
from backend.models.fiscal import CorrelativoFiscal, ReglaFiscal
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token
from backend.routers.facturacion import router as facturacion_router
from backend.routers.sales import router as sales_router
from backend.routers.operaciones.ventas import ventas_ext_router


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
    app.include_router(sales_router)
    app.include_router(ventas_ext_router)

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
    app.dependency_overrides[get_current_user_from_token] = override_get_current_user

    client = TestClient(app)
    client.headers.update({"X-Idempotency-Key": str(uuid.uuid4())})
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


def test_idempotencia_emision_factura(test_client, db_session):
    """
    FIX A: POST /v1/facturacion/emitir debe respetar X-Idempotency-Key.
    Dos llamadas con la misma key deben devolver la misma factura cacheada
    y descontar el stock del producto una sola vez.
    """
    from unittest.mock import AsyncMock, patch
    import backend.utils.idempotency as idem_module

    tenant_a_id = test_client.tenant_a_id
    prod = Producto(
        id=303,
        sku="PROD-IDEM-TEST",
        nombre="Producto Idempotencia",
        precio_usd=Decimal("50.00"),
        costo_usd=Decimal("30.00"),
        stock=Decimal("10.00"),
        tenant_id=tenant_a_id
    )
    stock_alm = StockPorAlmacen(
        producto_id=303,
        almacen_id=1,
        cantidad=Decimal("10.00"),
        tenant_id=tenant_a_id
    )
    db_session.add_all([prod, stock_alm])
    db_session.commit()

    idem_key = str(uuid.uuid4())
    payload = {
        "cliente_id": "10",
        "metodo_pago": "Efectivo",
        "moneda_documento": "SOLO_USD",
        "detalles": [
            {
                "producto_id": "PROD-IDEM-TEST",
                "cantidad": 2.0,
                "precio_unitario": 50.0
            }
        ]
    }

    # Simular Redis en memoria para probar el mecanismo de idempotencia
    redis_store = {}

    mock_redis = AsyncMock()

    async def mock_set(key, val, ex=None, nx=False):
        if nx and key in redis_store:
            return False
        redis_store[key] = val.encode("utf-8") if isinstance(val, str) else val
        return True

    async def mock_get(key):
        return redis_store.get(key)

    mock_redis.set.side_effect = mock_set
    mock_redis.get.side_effect = mock_get

    with patch.object(idem_module, "redis_client", mock_redis):
        # 1. Primera emisión
        resp1 = test_client.post(
            "/v1/facturacion/emitir",
            json=payload,
            headers={"X-Idempotency-Key": idem_key}
        )
        assert resp1.status_code == 201
        data1 = resp1.json()
        factura_num1 = data1["numero_factura"]

        # 2. Segunda emisión con la MISMA llave (reintento de red)
        resp2 = test_client.post(
            "/v1/facturacion/emitir",
            json=payload,
            headers={"X-Idempotency-Key": idem_key}
        )
        assert resp2.status_code in (200, 201)
        data2 = resp2.json()
        assert data2["numero_factura"] == factura_num1

    # Verificar que el stock se descontó una sola vez (10.0 - 2.0 = 8.0)
    db_session.refresh(prod)
    db_session.refresh(stock_alm)
    assert prod.stock == Decimal("8.00")
    assert stock_alm.cantidad == Decimal("8.00")


def test_ventas_facturar_cliente_inexistente_retorna_404(test_client, db_session):
    """
    FIX A (Batch 3): POST /ventas/facturar con un cliente_id que no existe en el tenant
    debe retornar 404 (antes caía silenciosamente al primer cliente o a Consumidor Final).
    """
    prod = Producto(
        id=777,
        tenant_id=test_client.tenant_a_id,
        sku="PROD-VENTAS-404",
        nombre="Producto Test 404",
        precio_usd=Decimal("20.00"),
        costo_usd=Decimal("10.00"),
        stock=Decimal("50.00")
    )
    db_session.add(prod)
    db_session.commit()

    payload = {
        "cliente_id": 999999,
        "metodo_pago": "Efectivo",
        "moneda_pago": "USD",
        "subtotal_usd": 20.0,
        "total_usd": 23.2,
        "detalles": [
            {
                "producto_id": prod.id,
                "cantidad": 1.0,
                "precio_usd": 20.0
            }
        ]
    }

    res = test_client.post(
        "/ventas/facturar",
        json=payload,
        headers={"X-Idempotency-Key": str(uuid.uuid4())}
    )
    assert res.status_code == 404
    assert "no encontrado en su empresa" in res.json().get("detail", "")


def test_anular_venta_repone_stock_por_almacen(test_client, db_session):
    """
    FIX B (Batch 3): Anular una venta debe reponer tanto el stock global (Producto.stock)
    como el desglose por almacén (StockPorAlmacen.cantidad) buscando el almacén original en el Kardex.
    """
    # 1. Crear producto con stock global 50 y en almacén 1 con stock 50
    prod = Producto(
        id=888,
        tenant_id=test_client.tenant_a_id,
        sku="PROD-ANULAR-TEST",
        nombre="Producto Anular Test",
        precio_usd=Decimal("10.00"),
        costo_usd=Decimal("5.00"),
        stock=Decimal("50.00")
    )
    stock_alm = StockPorAlmacen(
        tenant_id=test_client.tenant_a_id,
        producto_id=888,
        almacen_id=1,
        cantidad=Decimal("50.00")
    )
    db_session.add_all([prod, stock_alm])
    db_session.commit()

    # 2. Emitir venta de 5 unidades vía /v1/facturacion/emitir
    payload = {
        "cliente_id": "10",
        "metodo_pago": "Efectivo",
        "moneda_documento": "SOLO_USD",
        "detalles": [
            {
                "producto_id": "PROD-ANULAR-TEST",
                "cantidad": 5.0,
                "precio_unitario": 10.0
            }
        ]
    }
    resp_emitir = test_client.post(
        "/v1/facturacion/emitir",
        json=payload,
        headers={"X-Idempotency-Key": str(uuid.uuid4())}
    )
    assert resp_emitir.status_code == 201
    venta_data = resp_emitir.json()
    numero_factura = venta_data["numero_factura"]

    # Verificar que el stock bajó a 45 en ambos lados
    db_session.refresh(prod)
    db_session.refresh(stock_alm)
    assert prod.stock == Decimal("45.00")
    assert stock_alm.cantidad == Decimal("45.00")

    # Buscar la venta creada en la base de datos
    venta_db = db_session.query(Venta).filter(Venta.numero_factura == numero_factura).first()
    assert venta_db is not None

    # 3. Anular la venta vía POST /ventas/{venta_id}/anular
    resp_anular = test_client.post(f"/ventas/{venta_db.id}/anular")
    assert resp_anular.status_code == 200
    assert resp_anular.json()["estado"] == "ANULADA"

    # 4. Verificar que TANTO prod.stock COMO stock_alm.cantidad volvieron a su valor original de 50.00
    db_session.refresh(prod)
    db_session.refresh(stock_alm)
    assert prod.stock == Decimal("50.00")
    assert stock_alm.cantidad == Decimal("50.00")


def test_facturar_cotizacion_respeta_precio_cotizado(test_client, db_session):
    """
    FIX C (Batch 3): Facturar una cotización debe respetar item.precio_unitario (precio cotizado)
    en vez de pisarlo con el precio de catálogo de Producto.precio_usd.
    """
    # 1. Producto con precio de catálogo de $100.00
    prod = Producto(
        id=666,
        tenant_id=test_client.tenant_a_id,
        sku="PROD-COTIZ-TEST",
        nombre="Producto Cotización Test",
        precio_usd=Decimal("100.00"),
        costo_usd=Decimal("40.00"),
        stock=Decimal("20.00")
    )
    stock_alm = StockPorAlmacen(
        tenant_id=test_client.tenant_a_id,
        producto_id=666,
        almacen_id=1,
        cantidad=Decimal("20.00")
    )
    db_session.add_all([prod, stock_alm])
    db_session.commit()

    # 2. Cotización con precio especial cotizado de $85.00 (descuento acordado con cliente)
    cot = Cotizacion(
        tenant_id=test_client.tenant_a_id,
        numero_cotizacion=f"COT-PRECIO-{uuid.uuid4().hex[:6]}",
        cliente_id=10,
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        moneda="USD",
        tasa_cambio=Decimal("50.00"),
        subtotal=Decimal("85.00"),
        descuento_total=Decimal("0.00"),
        total=Decimal("98.60"),
        estado="Aceptada",
        creado_por=test_client.user_a.id
    )
    db_session.add(cot)
    db_session.flush()

    item = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=666,
        descripcion="Item con precio negociado",
        cantidad=Decimal("1.00"),
        precio_unitario=Decimal("85.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("85.00")
    )
    db_session.add(item)
    db_session.commit()

    # 3. Facturar la cotización
    res = test_client.post(
        f"/ventas/cotizaciones/{cot.id}/facturar",
        json={"metodo_pago": "Efectivo"}
    )
    assert res.status_code == 200
    factura_num = res.json()["numero_factura"]

    # 4. Verificar que la Venta / VentaDetalle creada tiene precio_usd_capturado = 85.00 (no 100.00)
    venta_creada = db_session.query(Venta).filter(Venta.numero_factura == factura_num).first()
    assert venta_creada is not None
    assert len(venta_creada.detalles) == 1
    assert float(venta_creada.detalles[0].precio_usd_capturado) == 85.00
    assert float(venta_creada.subtotal_usd) == 85.00

