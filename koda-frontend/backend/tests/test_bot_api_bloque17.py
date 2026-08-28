import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, patch

# Asegurar variables de entorno dummy si no están definidas
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.models
from backend.core.database import Base, get_db
from backend.models.operations import Producto, Cliente, Venta, VentaDetalle, KardexMovimiento
from backend.models.core import TasaCambio, Tenant, Profile
from backend.models.erp_extended import (
    Vendedor, Almacen, StockPorAlmacen, CuentaPorCobrar, CuentaContable, Empresa, AuditoriaLog
)
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.fiscal import CorrelativoFiscal, ReglaFiscal
from backend.routers.bot_api import router as bot_router
import backend.utils.idempotency as idempotency_module


from sqlalchemy.pool import StaticPool

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
def client(db_session):
    """Crea un TestClient con la dependencia get_db apuntando a SQLite en memoria."""
    test_app = FastAPI()
    test_app.include_router(bot_router)
    
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    test_app.dependency_overrides[get_db] = override_get_db
    return TestClient(test_app)


def test_crear_venta_bot_requiere_x_idempotency_key(client):
    """
    Verifica que el decorador @require_idempotency está activo en POST /bot/venta:
    - Si falta X-Idempotency-Key -> 400 'Falta el encabezado X-Idempotency-Key.'
    - Si X-Idempotency-Key no es UUID -> 400 'El encabezado X-Idempotency-Key debe ser un UUID valido.'
    """
    bot_key = os.getenv("BOT_INTERNAL_API_KEY")
    headers_sin_key = {"X-Bot-Api-Key": bot_key}

    payload = {
        "tenant_id": str(uuid.uuid4()),
        "vendedor_id": 1,
        "lineas": [{"sku": "SKU-001", "cantidad": 1}],
        "metodo_pago": "Efectivo"
    }

    # 1. Sin header de idempotencia
    resp1 = client.post("/bot/venta", json=payload, headers=headers_sin_key)
    assert resp1.status_code == 400
    assert "Falta el encabezado X-Idempotency-Key" in resp1.json()["detail"]

    # 2. Con header no-UUID
    headers_invalido = {"X-Bot-Api-Key": bot_key, "X-Idempotency-Key": "no-un-uuid"}
    resp2 = client.post("/bot/venta", json=payload, headers=headers_invalido)
    assert resp2.status_code == 400
    assert "debe ser un UUID valido" in resp2.json()["detail"]


def test_crear_venta_bot_idempotencia_con_cache_redis(client, db_session):
    """
    Verifica el comportamiento de idempotencia ante reintentos simula el cache de Redis:
    1. Primera llamada: ejecuta la venta, asigna factura, descuenta stock y guarda en cache.
    2. Segunda llamada con el mismo X-Idempotency-Key: retorna la respuesta cacheada directamente
       sin duplicar facturas ni volver a descontar stock.
    """
    tenant_id = uuid.uuid4()
    bot_key = os.getenv("BOT_INTERNAL_API_KEY")
    idem_key = str(uuid.uuid4())

    tenant = Tenant(
        id=tenant_id,
        nombre_empresa="Tenant Bot Test",
        estado_licencia="ACTIVA"
    )
    empresa = Empresa(
        razon_social="Empresa Bot C.A.",
        rif="J-12345678-9",
        tenant_id=tenant_id
    )
    almacen = Almacen(
        nombre="Principal",
        codigo="ALM-001",
        tipo="LOCAL",
        tenant_id=tenant_id
    )
    vendedor = Vendedor(
        nombre="Carlos Vendedor",
        codigo="VEN-001",
        activo=True,
        tenant_id=tenant_id
    )
    prod = Producto(
        sku="SKU-BOT-01",
        nombre="Producto Bot",
        precio_usd=Decimal("50.00"),
        costo_usd=Decimal("25.00"),
        stock=Decimal("10.00"),
        es_exento=False,
        tenant_id=tenant_id
    )
    tasa = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("100.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    correlativo = CorrelativoFiscal(
        tipo_documento="FACTURA",
        prefijo="FAC-",
        siguiente_numero=1,
        tenant_id=tenant_id
    )
    cuentas = [
        CuentaContable(codigo="1.1.01", nombre="Caja", tipo="ACTIVO", tenant_id=tenant_id),
        CuentaContable(codigo="1.1.02", nombre="Cuentas por Cobrar", tipo="ACTIVO", tenant_id=tenant_id),
        CuentaContable(codigo="1.1.03", nombre="Inventario", tipo="ACTIVO", tenant_id=tenant_id),
        CuentaContable(codigo="2.1.02", nombre="IVA Débito Fiscal", tipo="PASIVO", tenant_id=tenant_id),
        CuentaContable(codigo="2.1.03", nombre="IGTF por Pagar", tipo="PASIVO", tenant_id=tenant_id),
        CuentaContable(codigo="4.1.01", nombre="Ventas de Mercancía", tipo="INGRESO", tenant_id=tenant_id),
        CuentaContable(codigo="5.1.01", nombre="Costo de Ventas", tipo="EGRESO", tenant_id=tenant_id),
    ]

    db_session.add_all([tenant, empresa, almacen, vendedor, prod, tasa, correlativo] + cuentas)
    db_session.flush()

    stock_alm = StockPorAlmacen(
        almacen_id=almacen.id,
        producto_id=prod.id,
        cantidad=10,
        tenant_id=tenant_id
    )
    db_session.add(stock_alm)
    db_session.commit()

    headers = {
        "X-Bot-Api-Key": bot_key,
        "X-Idempotency-Key": idem_key
    }
    payload = {
        "tenant_id": str(tenant_id),
        "vendedor_id": vendedor.id,
        "lineas": [{"sku": "SKU-BOT-01", "cantidad": 2}],
        "metodo_pago": "Efectivo"
    }

    # Mock del cliente Redis para probar la interceptación y cacheo
    fake_redis_storage = {}

    mock_redis = AsyncMock()

    async def fake_set(name, value, ex=None, nx=None):
        if nx and name in fake_redis_storage:
            return None
        # Convertir a formato esperado por el decorador si es necesario (b'json_string')
        if isinstance(value, dict):
            val_to_store = json.dumps(value).encode("utf-8")
        else:
            val_to_store = value.encode("utf-8") if isinstance(value, str) else value
        fake_redis_storage[name] = val_to_store
        return True

    async def fake_get(name):
        return fake_redis_storage.get(name)

    async def fake_delete(name):
        fake_redis_storage.pop(name, None)

    mock_redis.set = fake_set
    mock_redis.get = fake_get
    mock_redis.delete = fake_delete

    with patch.object(idempotency_module, "redis_client", mock_redis):
        # Primera llamada
        resp1 = client.post("/bot/venta", json=payload, headers=headers)
        if resp1.status_code != 201:
            print("RESP1 ERROR:", resp1.status_code, resp1.json())
        assert resp1.status_code == 201
        data1 = resp1.json()
        assert data1["numero_factura"] is not None
        factura_1 = data1["numero_factura"]

        # Verificar que se creó 1 venta y el stock bajó a 8
        db_session.refresh(prod)
        assert float(prod.stock) == 8.0
        ventas_count = db_session.query(Venta).filter(Venta.tenant_id == tenant_id).count()
        assert ventas_count == 1

        # Segunda llamada (reintento del bot con el mismo X-Idempotency-Key)
        resp2 = client.post("/bot/venta", json=payload, headers=headers)
        assert resp2.status_code in (200, 201)
        data2 = resp2.json()

        # Debe devolver exactamente la misma factura y respuesta
        assert data2["numero_factura"] == factura_1

        # El stock NO debió descontarse de nuevo (sigue siendo 8)
        db_session.refresh(prod)
        assert float(prod.stock) == 8.0

        # No se debió crear una segunda venta en la BD
        ventas_count_after = db_session.query(Venta).filter(Venta.tenant_id == tenant_id).count()
        assert ventas_count_after == 1
