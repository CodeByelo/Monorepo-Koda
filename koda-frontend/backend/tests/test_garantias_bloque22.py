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
from backend.models.core import Tenant, Profile
from backend.models.operations import Producto, Cliente, Venta, VentaDetalle
from backend.models.erp_extended import Garantia
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token
from backend.routers.garantias import router as garantias_router


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
def test_setup(db_session):
    """Configura ambiente con Tenant, Usuario Admin, Usuario Vendedor, Productos, Clientes y Ventas."""
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant Garantias")

    user_admin = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="admin_garantias",
        email="admin_garantias@test.com",
        rol_id=2  # Admin
    )

    user_vendedor = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="vendedor_garantias",
        email="vendedor_garantias@test.com",
        rol_id=3  # Usuario / no-admin
    )

    cliente_1 = Cliente(
        id=1,
        tenant_id=tenant_id,
        rif="J-11111111-1",
        nombre="Cliente Comprador 1",
        email="cliente1@test.com"
    )

    cliente_2 = Cliente(
        id=2,
        tenant_id=tenant_id,
        rif="J-22222222-2",
        nombre="Cliente Ajeno 2",
        email="cliente2@test.com"
    )

    prod_comprado = Producto(
        id=10,
        tenant_id=tenant_id,
        sku="PROD-COMPRADO",
        nombre="Nevera Frost 400L",
        precio_usd=Decimal("500.00"),
        costo_usd=Decimal("300.00"),
        stock=Decimal("10.00")
    )

    prod_no_comprado = Producto(
        id=20,
        tenant_id=tenant_id,
        sku="PROD-NO-COMPRADO",
        nombre="Lavadora Automatica 12kg",
        precio_usd=Decimal("400.00"),
        costo_usd=Decimal("250.00"),
        stock=Decimal("5.00")
    )

    venta_1 = Venta(
        id=100,
        tenant_id=tenant_id,
        numero_factura="FAC-0001",
        cliente_id=1,
        subtotal_usd=Decimal("500.00"),
        iva_usd=Decimal("80.00"),
        igtf_usd=Decimal("0.00"),
        total_usd=Decimal("580.00"),
        metodo_pago="Efectivo",
        tasa_cambio_bs=Decimal("784.66"),
        estado="EMITIDA",
        fecha=datetime.now(timezone.utc)
    )

    detalle_1 = VentaDetalle(
        id=1,
        tenant_id=tenant_id,
        venta_id=100,
        producto_id=10,
        cantidad=Decimal("1.00"),
        precio_usd_capturado=Decimal("500.00")
    )

    db_session.add_all([
        tenant, user_admin, user_vendedor, cliente_1, cliente_2,
        prod_comprado, prod_no_comprado, venta_1, detalle_1
    ])
    db_session.commit()

    return {
        "tenant_id": tenant_id,
        "user_admin": user_admin,
        "user_vendedor": user_vendedor,
        "cliente_1": cliente_1,
        "cliente_2": cliente_2,
        "prod_comprado": prod_comprado,
        "prod_no_comprado": prod_no_comprado,
        "venta_1": venta_1,
    }


def _get_client_for_user(db_session, user):
    app = FastAPI()
    app.include_router(garantias_router)

    def override_get_db():
        yield db_session

    def override_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_current_user_from_token] = override_user

    return TestClient(app)


def test_bug1_validacion_consistencia_producto_cliente_con_venta(test_setup, db_session):
    """
    Bug 1: Al crear una garantía asociada a una venta_id:
    - Debe rechazar si el producto_id no está en los VentaDetalle de esa venta (400).
    - Debe rechazar si el cliente_id no coincide con el cliente_id de la venta (400).
    - Debe permitir si producto_id y cliente_id coinciden con la venta (201).
    - Debe permitir crear garantía sin venta_id (ej. reemplazo de fábrica) (201).
    """
    client = _get_client_for_user(db_session, test_setup["user_admin"])

    # 1. Producto no comprado en esa venta
    payload_prod_invalido = {
        "producto_id": 20,  # prod_no_comprado
        "venta_id": 100,    # venta_1 (solo contiene prod_id 10)
        "cliente_id": 1,
        "duracion_meses": 12,
        "notas": "Intento de garantia para producto no comprado"
    }
    resp_prod = client.post("/garantias", json=payload_prod_invalido)
    assert resp_prod.status_code == 400
    assert "no forma parte de la venta" in resp_prod.json()["detail"]

    # 2. Cliente distinto al cliente de la venta
    payload_cliente_invalido = {
        "producto_id": 10,  # prod_comprado
        "venta_id": 100,    # venta_1 (pertenece a cliente_id 1)
        "cliente_id": 2,    # cliente_2
        "duracion_meses": 12,
        "notas": "Intento de garantia para cliente equivocado"
    }
    resp_cli = client.post("/garantias", json=payload_cliente_invalido)
    assert resp_cli.status_code == 400
    assert "no coincide con el cliente de la venta" in resp_cli.json()["detail"]

    # 3. Garantía válida asociada a la venta
    payload_valido = {
        "producto_id": 10,
        "venta_id": 100,
        "cliente_id": 1,
        "duracion_meses": 12,
        "notas": "Garantía válida de 1 año"
    }
    resp_valido = client.post("/garantias", json=payload_valido)
    assert resp_valido.status_code == 201
    data = resp_valido.json()
    assert data["producto_id"] == 10
    assert data["venta_id"] == 100
    assert data["cliente_id"] == 1
    assert data["estado"] == "VIGENTE"

    # 4. Garantía válida sin venta_id (reemplazo de fábrica / cortesía)
    payload_sin_venta = {
        "producto_id": 20,
        "cliente_id": 1,
        "duracion_meses": 6,
        "notas": "Garantía de cortesía/fábrica sin venta"
    }
    resp_sin_venta = client.post("/garantias", json=payload_sin_venta)
    assert resp_sin_venta.status_code == 201
    assert resp_sin_venta.json()["venta_id"] is None


def test_bug2_actualizar_garantia_requiere_rol_admin_o_gerente(test_setup, db_session):
    """
    Bug 2: PATCH /garantias/{id} debe requerir rol Admin o Gerente.
    Un usuario con rol no autorizado (ej. Vendedor) debe recibir 403 Forbidden.
    Un Admin/Gerente sí debe poder actualizar el estado (ej. ANULADA o RECLAMADA).
    """
    # Crear una garantía previa en la BD
    garantia = Garantia(
        tenant_id=test_setup["tenant_id"],
        producto_id=10,
        cliente_id=1,
        fecha_inicio=datetime.now(timezone.utc),
        duracion_meses=12,
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="VIGENTE"
    )
    db_session.add(garantia)
    db_session.commit()
    db_session.refresh(garantia)

    # 1. Intentar actualizar como Vendedor -> 403 Forbidden
    client_vendedor = _get_client_for_user(db_session, test_setup["user_vendedor"])
    resp_vendedor = client_vendedor.patch(f"/garantias/{garantia.id}", json={"estado": "ANULADA"})
    assert resp_vendedor.status_code == 403
    assert "Permisos insuficientes" in resp_vendedor.json()["detail"]

    # 2. Actualizar como Admin -> 200 OK
    client_admin = _get_client_for_user(db_session, test_setup["user_admin"])
    resp_admin = client_admin.patch(f"/garantias/{garantia.id}", json={"estado": "ANULADA", "notas": "Anulada por devolución"})
    assert resp_admin.status_code == 200
    assert resp_admin.json()["estado"] == "ANULADA"
    assert resp_admin.json()["notas"] == "Anulada por devolución"
