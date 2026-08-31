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

from backend.core.database import Base, get_db
from backend.models.core import Tenant, Profile
from backend.models.erp_extended import Empresa, RetencionIVA, RetencionISLR
from backend.models.operations import Proveedor
from backend.core.security import get_current_user
from backend.routers.fiscal.reportes_pdf import router as reportes_pdf_router


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
def test_client(db_session):
    """TestClient de FastAPI con dependencias mockeadas."""
    app = FastAPI()
    app.include_router(reportes_pdf_router, prefix="/fiscal")

    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Empresa Fiscal Test")
    user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="admin_fiscal",
        email="admin_fiscal@test.com",
        rol_id=2
    )
    empresa = Empresa(
        id=1,
        tenant_id=tenant_id,
        rif="J-12345678-0",
        razon_social="EMPRESA FISCAL C.A.",
        direccion="Caracas, Venezuela",
        tipo_contribuyente="ESPECIAL"
    )
    db_session.add_all([tenant, user, empresa])
    db_session.commit()

    def override_get_db():
        yield db_session

    def override_get_current_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    client.tenant_id = tenant_id
    client.user = user
    return client


def test_bug1_generar_pdf_retencion_iva_exitoso(test_client, db_session):
    """
    Bug 1: generar_pdf_retencion_iva ya no usa columnas inexistentes de Compra
    y genera correctamente un PDF de comprobante de retención de IVA para un proveedor registrado.
    """
    tenant_id = test_client.tenant_id
    proveedor = Proveedor(
        id=10,
        rif="J-40987654-3",
        nombre="DISTRIBUIDORA ANDINA C.A.",
        tenant_id=tenant_id
    )
    ret_iva = RetencionIVA(
        id=1,
        tenant_id=tenant_id,
        proveedor_rif="J-40987654-3",
        proveedor_nombre="DISTRIBUIDORA ANDINA C.A.",
        numero_factura="FAC-2026-001",
        numero_comprobante="20260500000001",
        fecha_comprobante=datetime(2026, 5, 10),
        base_usd=Decimal("1000.00"),
        alicuota=Decimal("0.75"),
        monto_usd=Decimal("120.00"), # 1000 * 0.16 * 0.75
        tasa_cambio_bs=Decimal("784.66"),
        periodo="202605",
        estado="VALIDADO"
    )
    db_session.add_all([proveedor, ret_iva])
    db_session.commit()

    response = test_client.get(
        "/fiscal/retencion-iva/pdf",
        params={
            "proveedor_id": "J-40987654-3",
            "periodo": "202605",
            "correlativo": "20260500000001"
        }
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment; filename=RET_IVA_20260500000001.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_bug2_generar_pdf_retencion_iva_alicuota_real_100(test_client, db_session):
    """
    Bug 2: El PDF de retención de IVA lee las filas reales de RetencionIVA con su alícuota
    y monto específicos (ej. 100% en contribuyentes especiales o retención total), en lugar
    de hardcodear 75% fijo.
    """
    tenant_id = test_client.tenant_id
    proveedor = Proveedor(
        id=11,
        rif="J-50111222-3",
        nombre="SERVICIOS INDUSTRIALES 100 C.A.",
        tenant_id=tenant_id
    )
    ret_iva_100 = RetencionIVA(
        id=2,
        tenant_id=tenant_id,
        proveedor_rif="J-50111222-3",
        proveedor_nombre="SERVICIOS INDUSTRIALES 100 C.A.",
        numero_factura="FAC-100-001",
        numero_comprobante="20260500000099",
        fecha_comprobante=datetime(2026, 5, 15),
        base_usd=Decimal("500.00"),
        alicuota=Decimal("1.00"),  # 100% de retención de IVA
        monto_usd=Decimal("80.00"),  # 500 * 0.16 * 1.00 = 80.00
        tasa_cambio_bs=Decimal("784.66"),
        periodo="202605",
        estado="VALIDADO"
    )
    db_session.add_all([proveedor, ret_iva_100])
    db_session.commit()

    response = test_client.get(
        "/fiscal/retencion-iva/pdf",
        params={
            "proveedor_id": "J-50111222-3",
            "periodo": "202605",
            "correlativo": "20260500000099"
        }
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_bug3_endpoints_pdf_require_parameters_422(test_client):
    """
    Bug 3: Llamar a /arc/pdf y /retencion-iva/pdf sin query params debe fallar
    con 422 Unprocessable Entity, en vez de usar defaults de demo/placeholder.
    """
    # 1. /arc/pdf sin parámetros -> 422
    resp_arc = test_client.get("/fiscal/arc/pdf")
    assert resp_arc.status_code == 422

    # 2. /arc/pdf con sólo 1 de 2 parámetros -> 422
    resp_arc_partial = test_client.get("/fiscal/arc/pdf", params={"proveedor_id": "J-12345678-0"})
    assert resp_arc_partial.status_code == 422

    # 3. /retencion-iva/pdf sin parámetros -> 422
    resp_ret_iva = test_client.get("/fiscal/retencion-iva/pdf")
    assert resp_ret_iva.status_code == 422

    # 4. /retencion-iva/pdf con parámetros incompletos -> 422
    resp_ret_iva_partial = test_client.get(
        "/fiscal/retencion-iva/pdf",
        params={"proveedor_id": "J-12345678-0", "periodo": "202605"}
    )
    assert resp_ret_iva_partial.status_code == 422


def test_arc_pdf_exitoso_con_parametros_obligatorios(test_client, db_session):
    """
    Verifica que /arc/pdf funcione correctamente cuando se proveen los parámetros
    obligatorios y exista un proveedor y retenciones ISLR.
    """
    tenant_id = test_client.tenant_id
    proveedor = Proveedor(
        id=20,
        rif="J-30123456-7",
        nombre="PROVEEDOR ARC C.A.",
        tenant_id=tenant_id
    )
    ret_islr = RetencionISLR(
        id=1,
        tenant_id=tenant_id,
        proveedor_rif="J-30123456-7",
        proveedor_nombre="PROVEEDOR ARC C.A.",
        numero_factura="FAC-ISLR-01",
        concepto_codigo="001",
        base_usd=Decimal("2000.00"),
        alicuota=Decimal("0.05"),
        monto_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("784.66"),
        periodo="2026-05",
        estado="VALIDADO"
    )
    db_session.add_all([proveedor, ret_islr])
    db_session.commit()

    response = test_client.get(
        "/fiscal/arc/pdf",
        params={
            "proveedor_id": "J-30123456-7",
            "anio": 2026
        }
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment; filename=ARC_J-30123456-7_2026.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")
