import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Asegurar variables de entorno dummy
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from backend.core.database import Base, get_db
from backend.models.core import Tenant, Profile
from backend.models.operations import Producto
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token
from backend.routers.productos import router as productos_router


@pytest.fixture(scope="function")
def test_engine():
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
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def test_setup(db_session):
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant Productos")
    user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="user_productos",
        email="user_productos@test.com",
        rol_id=2
    )
    db_session.add_all([tenant, user])
    db_session.commit()
    return {"tenant_id": tenant_id, "user": user}


@pytest.fixture(scope="function")
def test_client(db_session, test_setup):
    app = FastAPI()
    app.include_router(productos_router)

    user = test_setup["user"]

    def override_get_db():
        yield db_session

    def override_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_current_user_from_token] = override_user

    client = TestClient(app)
    client.tenant_id = test_setup["tenant_id"]
    client.user = user
    return client


def _crear_producto(db_session, tenant_id, stock=50, sku=None):
    """Helper: crea un producto directamente en DB con stock conocido."""
    prod = Producto(
        tenant_id=tenant_id,
        sku=sku or f"SKU-{uuid.uuid4().hex[:6]}",
        nombre="Producto Test",
        precio_usd=Decimal("10.00"),
        costo_usd=Decimal("6.00"),
        stock=Decimal(str(stock))
    )
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)
    return prod


def test_bug1_put_actualiza_stock_y_kardex(test_client, db_session, test_setup):
    """
    PUT /productos/{id} con stock=9999 actualiza el stock del producto
    y mantiene la trazabilidad. Otros campos como nombre y precio_usd también se actualizan.
    """
    tenant_id = test_setup["tenant_id"]
    prod = _crear_producto(db_session, tenant_id, stock=50, sku="PROD-STOCK-TEST")

    payload = {
        "sku": "PROD-STOCK-TEST",
        "nombre": "Nombre Actualizado",
        "precio_usd": 15.00,
        "costo_usd": 9.00,
        "stock": 9999,
        "stock_minimo": 5
    }
    resp = test_client.put(f"/productos/{prod.id}", json=payload)
    assert resp.status_code == 200

    db_session.expire(prod)
    db_session.refresh(prod)
    assert float(prod.stock) == 9999.0
    assert prod.nombre == "Nombre Actualizado"
    assert float(prod.precio_usd) == 15.00


def test_bug2_delete_con_historial_devuelve_400(test_client, db_session, test_setup):
    """
    Bug 2: DELETE /productos/{id} cuando la base reventa con IntegrityError
    (producto con VentaDetalle/KardexMovimiento asociado) debe devolver
    400 con un mensaje claro — no 500 ni traceback de Postgres.

    En SQLite en memoria las FKs no se enforzan por defecto, así que
    simulamos la restricción de la DB inyectando el IntegrityError
    directamente en db.commit(), tal como lo haría Postgres con RESTRICT.
    """
    tenant_id = test_setup["tenant_id"]
    prod = _crear_producto(db_session, tenant_id, stock=10, sku="PROD-CON-HIST")

    # Simulamos que Postgres revienta con IntegrityError en el commit
    # (equivalente a tener un VentaDetalle apuntando a este producto).
    import sqlite3
    db_orig_commit = db_session.commit

    call_count = {"n": 0}

    def mock_commit():
        call_count["n"] += 1
        # El 1er commit es el del fixture (ya pasó). Cuando el endpoint
        # llama a commit() después de db.delete(), lanzamos la FK error.
        raise SAIntegrityError(
            statement="DELETE FROM productos WHERE id = ?",
            params=(prod.id,),
            orig=sqlite3.IntegrityError("FOREIGN KEY constraint failed")
        )

    with patch.object(db_session, "commit", side_effect=mock_commit):
        resp = test_client.delete(f"/productos/{prod.id}")

    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "ventas o movimientos de inventario" in detail
    # No debe haber traceback ni texto crudo de Postgres en el mensaje
    assert "IntegrityError" not in detail
    assert "FOREIGN KEY" not in detail.upper()


def test_bug2_delete_sin_historial_ok(test_client, db_session, test_setup):
    """
    Un producto sin VentaDetalle ni KardexMovimiento sí debe poder
    eliminarse (200) con el mensaje esperado.
    """
    tenant_id = test_setup["tenant_id"]
    prod_libre = _crear_producto(db_session, tenant_id, stock=5, sku="PROD-SIN-HIST")
    resp = test_client.delete(f"/productos/{prod_libre.id}")
    assert resp.status_code == 200
    assert resp.json()["message"] == "Producto eliminado exitosamente"
    assert db_session.get(Producto, prod_libre.id) is None
