import os
import uuid
import pytest
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in [
    "SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY",
    "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY",
    "SSO_BRIDGE_INTERNAL_KEY", "TELEGRAM_LINK_INTERNAL_API_KEY",
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
]:
    if not os.getenv(key):
        os.environ[key] = f"dummy_secret_key_at_least_32_chars_{key.lower()}"

from backend.core.database import Base
from backend.models.core import Profile
from backend.models.operations import Producto, Venta, KardexMovimiento
from backend.models.erp_extended import (
    StockPorAlmacen,
    Almacen,
    DevolucionCliente,
    Vehiculo,
    Chofer,
    TurnoDespacho,
    CuarentenaLogistica,
)
from backend.routers.operaciones.inventario import (
    DevolucionClienteCreate,
    crear_devolucion_cliente,
    obtener_ficha_360_producto,
)


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


def test_ficha_producto_360_producto_sin_historial(db_session):
    tenant_id = uuid.uuid4()
    user = Profile(id=uuid.uuid4(), tenant_id=tenant_id, username="tester", email="test@koda.com", rol_id=1)

    producto = Producto(
        tenant_id=tenant_id,
        sku="TEST-SKU-001",
        nombre="Impresora Térmica Test",
        precio_usd=Decimal("150.00"),
        costo_usd=Decimal("90.00"),
        stock=Decimal("0.00"),
    )
    db_session.add(producto)
    db_session.commit()
    db_session.refresh(producto)

    ficha = obtener_ficha_360_producto(id=producto.id, db=db_session, current_user=user)

    assert ficha["producto"]["id"] == producto.id
    assert ficha["producto"]["sku"] == "TEST-SKU-001"
    assert ficha["producto"]["stock_total"] == 0.0
    assert ficha["producto"]["rotacion_30d"] == 0.0
    assert "Incógnitas" in ficha["producto"]["cuadrante"]
    assert len(ficha["stock_almacenes"]) == 0
    assert len(ficha["lotes"]) == 0
    assert len(ficha["movimientos"]) == 0
    assert len(ficha["devoluciones"]["proveedor"]) == 0
    assert len(ficha["devoluciones"]["cliente"]) == 0
    assert len(ficha["devoluciones"]["cuarentena"]) == 0
    assert len(ficha["garantias"]) == 0
    assert len(ficha["cotizaciones"]) == 0
    assert len(ficha["auditorias_conteo"]) == 0


def test_devolucion_cliente_bueno_y_danado(db_session):
    tenant_id = uuid.uuid4()
    user = Profile(id=uuid.uuid4(), tenant_id=tenant_id, username="tester", email="test@koda.com", rol_id=1)

    # 1. Crear almacén, producto y venta
    almacen = Almacen(
        tenant_id=tenant_id,
        codigo="ALM-01",
        nombre="Almacén Principal",
        tipo="LOCAL",
    )
    db_session.add(almacen)
    db_session.commit()
    db_session.refresh(almacen)

    producto = Producto(
        tenant_id=tenant_id,
        sku="IMP-58MM",
        nombre="Impresora 58mm Fiscal",
        precio_usd=Decimal("200.00"),
        costo_usd=Decimal("120.00"),
        stock=Decimal("10.00"),
    )
    db_session.add(producto)
    db_session.commit()
    db_session.refresh(producto)

    stock_alm = StockPorAlmacen(
        tenant_id=tenant_id,
        almacen_id=almacen.id,
        producto_id=producto.id,
        cantidad=Decimal("10.00"),
    )
    db_session.add(stock_alm)

    venta = Venta(
        tenant_id=tenant_id,
        numero_factura="FAC-0001",
        subtotal_usd=Decimal("200.00"),
        iva_usd=Decimal("32.00"),
        total_usd=Decimal("232.00"),
        metodo_pago="Efectivo",
        tasa_cambio_bs=Decimal("36.50"),
        estado="ACTIVA",
    )
    db_session.add(venta)
    db_session.commit()
    db_session.refresh(venta)

    # 2. Devolución de cliente: BUENO
    dev_bueno_data = DevolucionClienteCreate(
        venta_id=venta.id,
        producto_id=producto.id,
        almacen_id=almacen.id,
        cantidad=Decimal("2.0"),
        motivo="Cliente solicitó modelo bluetooth",
        condicion="BUENO",
    )
    res_bueno = crear_devolucion_cliente(payload=dev_bueno_data, db=db_session, current_user=user)

    assert res_bueno["ok"] is True
    assert res_bueno["condicion"] == "BUENO"

    # Verificar aumento de stock general y por almacén
    db_session.refresh(producto)
    db_session.refresh(stock_alm)
    assert float(producto.stock) == 12.0
    assert float(stock_alm.cantidad) == 12.0

    # Verificar KardexMovimiento generado
    kardex_bueno = (
        db_session.query(KardexMovimiento)
        .filter(
            KardexMovimiento.tenant_id == tenant_id,
            KardexMovimiento.producto_id == producto.id,
            KardexMovimiento.tipo_movimiento == "Devolucion_Cliente",
        )
        .first()
    )
    assert kardex_bueno is not None
    assert float(kardex_bueno.cantidad) == 2.0

    # 3. Devolución de cliente: DAÑADO
    dev_danado_data = DevolucionClienteCreate(
        venta_id=venta.id,
        producto_id=producto.id,
        almacen_id=almacen.id,
        cantidad=Decimal("1.0"),
        motivo="Impresora caída y carcasa partida",
        condicion="DAÑADO",
    )
    res_danado = crear_devolucion_cliente(payload=dev_danado_data, db=db_session, current_user=user)

    assert res_danado["ok"] is True
    assert res_danado["condicion"] == "DAÑADO"

    # Verificar que el stock NO aumentó
    db_session.refresh(producto)
    db_session.refresh(stock_alm)
    assert float(producto.stock) == 12.0
    assert float(stock_alm.cantidad) == 12.0

    # 4. Ficha 360: Devoluciones y Cuarentena cruzada
    # Agregar un registro de cuarentena logística ligada a un TurnoDespacho
    vehiculo = Vehiculo(
        tenant_id=tenant_id,
        nombre="Camión Koda 1",
        placa="ABC-123",
        tipo="CAMION",
    )
    chofer = Chofer(
        tenant_id=tenant_id,
        nombre="Carlos Conductor",
    )
    db_session.add_all([vehiculo, chofer])
    db_session.commit()
    db_session.refresh(vehiculo)
    db_session.refresh(chofer)

    turno = TurnoDespacho(
        tenant_id=tenant_id,
        numero_turno="TURNO-001",
        vehiculo_id=vehiculo.id,
        chofer_id=chofer.id,
        fecha_salida=datetime.now(timezone.utc),
        destino="Sucursal Centro",
    )
    db_session.add(turno)
    db_session.commit()
    db_session.refresh(turno)

    cuarentena = CuarentenaLogistica(
        turno_id=turno.id,
        producto_id=producto.id,
        cantidad=Decimal("3.0"),
        motivo="Caja mojada durante lluvia en ruta",
        estado="PENDIENTE_REVISION",
    )
    db_session.add(cuarentena)
    db_session.commit()

    ficha = obtener_ficha_360_producto(id=producto.id, db=db_session, current_user=user)

    assert len(ficha["devoluciones"]["cliente"]) == 2
    assert ficha["devoluciones"]["cliente"][0]["condicion"] in ["BUENO", "DAÑADO"]
    assert len(ficha["devoluciones"]["cuarentena"]) == 1
    assert ficha["devoluciones"]["cuarentena"][0]["turno"] == "TURNO-001"
    assert ficha["devoluciones"]["cuarentena"][0]["cantidad"] == 3.0
    assert ficha["devoluciones"]["cuarentena"][0]["estado"] == "PENDIENTE_REVISION"
    assert len(ficha["movimientos"]) >= 1
