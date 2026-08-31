import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import pytest
from pydantic import ValidationError
from fastapi import HTTPException

# Asegurar variables de entorno dummy si no están definidas
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.core import Tenant, Profile
from backend.models.erp_extended import Almacen, LoteProducto, StockPorAlmacen, TransferenciaInventario
from backend.models.operations import Producto, KardexMovimiento
from backend.routers.operaciones.inventario import (
    inventario_dashboard,
    TransferenciaCreate,
    crear_transferencia,
    recibir_transferencia,
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


def test_bug1_dashboard_lote_naive_datetime(db_session):
    """
    Bug 1: LoteProducto.fecha_vencimiento naive de DB no debe causar
    TypeError: can't subtract offset-naive and offset-aware datetimes en /inventario/dashboard.
    """
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant Vencimiento")
    user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="user_lote_test",
        email="lote@test.com",
        rol_id=2
    )
    prod = Producto(
        id=101,
        sku="MED-001",
        nombre="Paracetamol 500mg",
        precio_usd=Decimal("5.0"),
        costo_usd=Decimal("2.0"),
        stock=Decimal("50.0"),
        tenant_id=tenant_id
    )
    # fecha_vencimiento naive (como la devuelve Postgres/SQLAlchemy para TIMESTAMP WITHOUT TIME ZONE)
    # dentro de 20 días
    naive_vencimiento = datetime.utcnow() + timedelta(days=20)
    lote = LoteProducto(
        id=1,
        producto_id=101,
        lote="LOT-2026-X",
        fecha_vencimiento=naive_vencimiento,
        cantidad=Decimal("50.0"),
        tenant_id=tenant_id
    )
    db_session.add_all([tenant, user, prod, lote])
    db_session.commit()

    # El dashboard no debe lanzar TypeError y debe calcular correctamente expiryAlerts
    res = inventario_dashboard(db=db_session, current_user=user)
    assert "expiryAlerts" in res
    assert len(res["expiryAlerts"]) == 1
    alert = res["expiryAlerts"][0]
    assert alert["nombre"] == "Paracetamol 500mg (Lote: LOT-2026-X)"
    assert alert["estado"] == "CRÍTICO" # <= 30 días
    assert alert["dias"] >= 19 and alert["dias"] <= 21


def test_bug2_transferencia_create_negative_zero_validation():
    """
    Bug 2: TransferenciaCreate debe rechazar cantidad <= 0 (negativa o cero) con validación de Pydantic.
    """
    # Cantidad negativa
    with pytest.raises(ValidationError):
        TransferenciaCreate(
            origen_almacen_id=1,
            destino_almacen_id=2,
            producto_id=10,
            cantidad=-100.0
        )

    # Cantidad cero
    with pytest.raises(ValidationError):
        TransferenciaCreate(
            origen_almacen_id=1,
            destino_almacen_id=2,
            producto_id=10,
            cantidad=0.0
        )

    # Cantidad positiva válida
    t = TransferenciaCreate(
        origen_almacen_id=1,
        destino_almacen_id=2,
        producto_id=10,
        cantidad=15.5
    )
    assert t.cantidad == 15.5


def test_bug3_crear_transferencia_valida_stock_almacen_origen(db_session):
    """
    Bug 3: crear_transferencia debe validar el stock disponible en el almacén de ORIGEN,
    no el stock global del producto. Si origen tiene 0 unidades (aunque global tenga 100 en otro almacén),
    debe rechazar con HTTP 400.
    """
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant Multi Almacen")
    user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="user_trf_test",
        email="trf@test.com",
        rol_id=2
    )
    almacen_a = Almacen(id=1, codigo="ALM-A", nombre="Almacén Principal", tenant_id=tenant_id, activo=True)
    almacen_b = Almacen(id=2, codigo="ALM-B", nombre="Almacén Sucursal", tenant_id=tenant_id, activo=True)
    # Stock global del producto = 100
    prod = Producto(
        id=201,
        sku="SKU-MULTI",
        nombre="Producto Multi Almacen",
        precio_usd=Decimal("10.0"),
        costo_usd=Decimal("5.0"),
        stock=Decimal("100.0"),
        tenant_id=tenant_id
    )
    # Todo el stock (100) está en Almacén A (id=1). Almacén B (id=2) tiene 0.
    stock_a = StockPorAlmacen(
        producto_id=201,
        almacen_id=1,
        cantidad=Decimal("100.0"),
        tenant_id=tenant_id
    )
    db_session.add_all([tenant, user, almacen_a, almacen_b, prod, stock_a])
    db_session.commit()

    # Intentar transferir desde Almacén B (donde no hay stock) hacia Almacén A
    payload_invalido = TransferenciaCreate(
        origen_almacen_id=2,
        destino_almacen_id=1,
        producto_id=201,
        cantidad=10.0
    )
    with pytest.raises(HTTPException) as exc_info:
        crear_transferencia(payload=payload_invalido, db=db_session, current_user=user)
    assert exc_info.value.status_code == 400
    assert "Stock insuficiente en el almacén de origen" in exc_info.value.detail

    # Intentar transferir desde Almacén A (donde sí hay 100) hacia Almacén B: debe tener éxito
    payload_valido = TransferenciaCreate(
        origen_almacen_id=1,
        destino_almacen_id=2,
        producto_id=201,
        cantidad=30.0
    )
    res = crear_transferencia(payload=payload_valido, db=db_session, current_user=user)
    assert "id" in res
    trf = db_session.query(TransferenciaInventario).filter(TransferenciaInventario.id == res["id"]).first()
    assert trf is not None
    assert trf.estado == "PENDIENTE"
    assert trf.cantidad == Decimal("30.0")


def test_bug4_recibir_transferencia_canonical_lock_and_clamping(db_session):
    """
    Bug 4 & Bug 2 defense:
    - Verificar que recibir_transferencia complete con éxito y mueva stock correctamente.
    - Verificar que se creen los movimientos de Kardex correspondientes (Transferencia_Salida y Transferencia_Entrada).
    - Verificar que el stock de origen quede clamp en >= 0.
    """
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant Recibir")
    user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="user_recibir_test",
        email="recibir@test.com",
        rol_id=2
    )
    # Creamos almacenes con IDs en cualquier orden
    almacen_origen = Almacen(id=10, codigo="ALM-10", nombre="Almacén 10", tenant_id=tenant_id, activo=True)
    almacen_destino = Almacen(id=5, codigo="ALM-5", nombre="Almacén 5", tenant_id=tenant_id, activo=True)
    prod = Producto(
        id=301,
        sku="SKU-TRF-REC",
        nombre="Producto Trf Recibir",
        precio_usd=Decimal("20.0"),
        costo_usd=Decimal("10.0"),
        stock=Decimal("50.0"),
        tenant_id=tenant_id
    )
    stock_origen = StockPorAlmacen(
        producto_id=301,
        almacen_id=10,
        cantidad=Decimal("50.0"),
        tenant_id=tenant_id
    )
    trf = TransferenciaInventario(
        id=77,
        origen_almacen_id=10,
        destino_almacen_id=5,
        producto_id=301,
        cantidad=Decimal("20.0"),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add_all([tenant, user, almacen_origen, almacen_destino, prod, stock_origen, trf])
    db_session.commit()

    # Recibir transferencia (origen_id=10 > destino_id=5 -> lockea en orden canónico 5, 10)
    res = recibir_transferencia(transfer_id=77, db=db_session, current_user=user)
    assert res["ok"] is True

    # Verificar estado y stocks
    db_session.refresh(trf)
    db_session.refresh(stock_origen)
    assert trf.estado == "COMPLETADA"
    assert stock_origen.cantidad == Decimal("30.0")

    stock_destino = db_session.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == 301,
        StockPorAlmacen.almacen_id == 5,
        StockPorAlmacen.tenant_id == tenant_id
    ).first()
    assert stock_destino is not None
    assert stock_destino.cantidad == Decimal("20.0")

    # Verificar Kardex
    kardex_movs = db_session.query(KardexMovimiento).filter(
        KardexMovimiento.producto_id == 301,
        KardexMovimiento.tenant_id == tenant_id
    ).all()
    assert len(kardex_movs) == 2
    tipos = {m.tipo_movimiento: m for m in kardex_movs}
    assert "Transferencia_Salida" in tipos
    assert "Transferencia_Entrada" in tipos
    assert tipos["Transferencia_Salida"].cantidad == Decimal("-20.0")
    assert tipos["Transferencia_Salida"].almacen_id == 10
    assert tipos["Transferencia_Entrada"].cantidad == Decimal("20.0")
    assert tipos["Transferencia_Entrada"].almacen_id == 5
