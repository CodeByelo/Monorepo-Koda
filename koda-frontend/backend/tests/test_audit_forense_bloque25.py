import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Variables de entorno dummy
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
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.audit import AuditorSession, AuditLog
from backend.models.erp_extended import AuditoriaLog
from backend.core.security import get_current_user, get_current_auditor
from backend.routers.audit import router as audit_router
from backend.routers.forense import router as forense_router


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


# ============================================================
# BUG 1: audit.py — export_ledger_for_audit filtra por tenant_id
# ============================================================

def test_bug1_export_ledger_filtra_por_tenant_id(db_session):
    """
    Bug 1: export_ledger_for_audit (GET /audit/export/ledger) debe filtrar
    por AsientoContable.tenant_id == auditor_session.tenant_id.
    Un auditor habilitado para el Tenant A no debe recibir los asientos
    contables del Tenant B en el mismo rango de fechas.
    """
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    tenant_a = Tenant(id=tenant_a_id, nombre_empresa="Empresa A")
    tenant_b = Tenant(id=tenant_b_id, nombre_empresa="Empresa B")

    # Auditor session para Tenant A
    start_date = datetime.now(timezone.utc) - timedelta(days=5)
    end_date = datetime.now(timezone.utc) + timedelta(days=5)

    auditor_session_a = AuditorSession(
        id=1,
        tenant_id=str(tenant_a_id),
        auditor_name="Auditor Seniat",
        organization="SENIAT",
        scope="all",
        start_date=start_date,
        end_date=end_date,
        token_hash="dummy_hash",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        is_active=True
    )

    # Asientos contables para Tenant A
    asiento_a = AsientoContable(
        id=1,
        tenant_id=tenant_a_id,
        referencia="REF-A-001",
        fecha=datetime.now(timezone.utc),
        concepto="Venta Mercancia Tenant A",
        total_debe_usd=Decimal("100.00"),
        total_haber_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("784.66"),
        estado="ACTIVO"
    )
    detalle_a = AsientoDetalle(
        id=1,
        asiento_id=1,
        cuenta_codigo="1.1.01",
        cuenta_nombre="Caja",
        debe_usd=Decimal("100.00"),
        haber_usd=Decimal("0.00")
    )

    # Asientos contables para Tenant B (mismo rango de fechas)
    asiento_b = AsientoContable(
        id=2,
        tenant_id=tenant_b_id,
        referencia="REF-B-001",
        fecha=datetime.now(timezone.utc),
        concepto="Venta Confidencial Tenant B",
        total_debe_usd=Decimal("500.00"),
        total_haber_usd=Decimal("500.00"),
        tasa_cambio_bs=Decimal("784.66"),
        estado="ACTIVO"
    )
    detalle_b = AsientoDetalle(
        id=2,
        asiento_id=2,
        cuenta_codigo="1.1.02",
        cuenta_nombre="Banco",
        debe_usd=Decimal("500.00"),
        haber_usd=Decimal("0.00")
    )

    db_session.add_all([
        tenant_a, tenant_b, auditor_session_a,
        asiento_a, detalle_a, asiento_b, detalle_b
    ])
    db_session.commit()

    app = FastAPI()
    app.include_router(audit_router)

    def override_get_db():
        yield db_session

    def override_get_current_auditor():
        return auditor_session_a

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_auditor] = override_get_current_auditor

    client = TestClient(app)
    resp = client.get("/audit/export/ledger")
    assert resp.status_code == 200
    data = resp.json()

    # Debe contener únicamente el asiento del Tenant A
    assert len(data) == 1
    assert data[0]["account_code"] == "1.1.01"
    assert data[0]["concept"] == "Venta Mercancia Tenant A"
    assert data[0]["debit"] == 100.0


# ============================================================
# BUG 2: forense.py — get_forensic_timeline no busca por usuario
# ============================================================

def test_bug2_forensic_timeline_no_busca_por_usuario(db_session):
    """
    Bug 2: get_forensic_timeline (GET /api/v1/auditoria/forense/{aggregate_id})
    no debe incluir el campo usuario en la búsqueda OR.
    Buscar por un valor que solo existe en el campo `usuario` debe dar 404.
    Buscar por un valor que está en `detalle`, `accion`, `modulo` o `ip` debe dar 200.
    """
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa="Tenant Forense")

    admin_user = Profile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        username="admin_auditor",
        email="admin_auditor@test.com",
        rol_id=2  # Admin -> "Admin"
    )

    # Log 1: usuario específico "empleado_vigilado@empresa.com", detalle "Factura FAC-100"
    log1 = AuditoriaLog(
        id=1,
        tenant_id=tenant_id,
        usuario="empleado_vigilado@empresa.com",
        accion="EMISION",
        modulo="FACTURACION",
        detalle="Emisión de factura FAC-100",
        ip="192.168.1.50",
        fecha=datetime.now(timezone.utc)
    )

    # Log 2: usuario "otro_user", detalle contiene "DOC-200"
    log2 = AuditoriaLog(
        id=2,
        tenant_id=tenant_id,
        usuario="otro_user",
        accion="ANULACION",
        modulo="VENTAS",
        detalle="Anulación de pedido DOC-200",
        ip="192.168.1.60",
        fecha=datetime.now(timezone.utc)
    )

    db_session.add_all([tenant, admin_user, log1, log2])
    db_session.commit()

    app = FastAPI()
    app.include_router(forense_router)

    def override_get_db():
        yield db_session

    def override_get_current_user():
        return admin_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)

    # 1. Búsqueda por ID de documento/entidad en detalle -> 200 OK
    resp_doc = client.get("/api/v1/auditoria/forense/FAC-100")
    assert resp_doc.status_code == 200
    data_doc = resp_doc.json()
    assert data_doc["total_records"] == 1
    assert data_doc["data"][0]["actor_id"] == "empleado_vigilado@empresa.com"
    assert data_doc["data"][0]["payload"]["detalle"] == "Emisión de factura FAC-100"

    # 2. Búsqueda por término que SOLO está en usuario -> 404 Not Found
    resp_user = client.get("/api/v1/auditoria/forense/empleado_vigilado@empresa.com")
    assert resp_user.status_code == 404
    assert "No se encontraron eventos asociados" in resp_user.json()["detail"]

    # 3. Búsqueda por acción / módulo / IP -> 200 OK
    resp_ip = client.get("/api/v1/auditoria/forense/192.168.1.60")
    assert resp_ip.status_code == 200
    assert resp_ip.json()["total_records"] == 1
