import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, Tenant
from backend.models.accounting import CierrePeriodo
from backend.models.erp_extended import AuditoriaLog
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _crear_ambiente_cierre(db, rol="Admin"):
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Auditoria Cierre {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    rol_id_map = {"Admin": 2, "Gerente": 5, "Vendedor": 3}
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Auditor",
        apellido="Contable",
        email=f"auditor_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=rol_id_map.get(rol, 3),
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()
    return tenant, user


def test_reabrir_periodo_requiere_justificacion(setup_db):
    """1. POST /contabilidad/cierre/reabrir con justificacion < 10 chars o ausente -> 422."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Admin")

    # Crear cierre previo
    cierre = CierrePeriodo(
        periodo="2026-06",
        tenant_id=tenant.id,
        usuario=user.email,
        estado="CERRADO"
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    # A) Sin justificación
    res_sin = client.post("/contabilidad/cierre/reabrir", json={"periodo": "2026-06"})
    assert res_sin.status_code == 422, f"Expected 422, got {res_sin.status_code}: {res_sin.text}"

    # B) Con justificación demasiado corta (< 10 caracteres)
    res_corta = client.post("/contabilidad/cierre/reabrir", json={"periodo": "2026-06", "justificacion": "corta"})
    assert res_corta.status_code == 422, f"Expected 422, got {res_corta.status_code}: {res_corta.text}"

    db.close()


def test_reabrir_periodo_requiere_rol_admin_gerente(setup_db):
    """2. Usuario con rol='Vendedor' intenta reabrir -> 403."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Vendedor")

    cierre = CierrePeriodo(
        periodo="2026-05",
        tenant_id=tenant.id,
        usuario="Admin",
        estado="CERRADO"
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    res = client.post(
        "/contabilidad/cierre/reabrir",
        json={"periodo": "2026-05", "justificacion": "Reapertura no autorizada por vendedor"}
    )
    assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"

    db.close()


def test_reabrir_periodo_no_borra_la_fila(setup_db):
    """3. Reabrir período con Admin y justificación válida conserva la fila con estado REABIERTO."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Admin")

    periodo = "2026-04"
    cierre = CierrePeriodo(
        periodo=periodo,
        tenant_id=tenant.id,
        usuario=user.email,
        estado="CERRADO"
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    justificacion = "Ajuste contable extraordinario solicitado por Auditoría"
    res = client.post(
        "/contabilidad/cierre/reabrir",
        json={"periodo": periodo, "justificacion": justificacion}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    assert data["estado"] == "REABIERTO"

    # Verificar directamente en base de datos que la fila NO fue borrada
    fila = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == tenant.id
    ).first()
    assert fila is not None
    assert fila.estado == "REABIERTO"
    assert fila.motivo_reapertura == justificacion
    assert fila.reabierto_por == (user.nombre or user.email)
    assert fila.veces_reabierto == 1
    assert fila.fecha_reabierto is not None

    db.close()


def test_reabrir_periodo_genera_auditoria_log(setup_db):
    """3b. Reabrir período genera un registro en AuditoriaLog con accion REAPERTURA_PERIODO y detalle."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Gerente")

    periodo = "2026-03"
    cierre = CierrePeriodo(
        periodo=periodo,
        tenant_id=tenant.id,
        usuario=user.email,
        estado="CERRADO"
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    justificacion = "Reapertura para reajuste de inventario de cierre fiscal"
    res = client.post(
        "/contabilidad/cierre/reabrir",
        json={"periodo": periodo, "justificacion": justificacion}
    )
    assert res.status_code == 200, res.text

    # Verificar entrada en AuditoriaLog
    log = db.query(AuditoriaLog).filter(
        AuditoriaLog.tenant_id == tenant.id,
        AuditoriaLog.accion == "REAPERTURA_PERIODO"
    ).first()
    assert log is not None
    assert log.modulo == "CONTABILIDAD_CIERRE"
    assert justificacion in log.detalle
    assert periodo in log.detalle

    db.close()


def test_recerrar_periodo_reabierto_actualiza_estado(setup_db):
    """4. Re-cerrar un período reabierto actualiza la misma fila a CERRADO conservando veces_reabierto."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Admin")

    periodo = "2026-02"
    # Inicia como reabierto con 1 reapertura previa
    cierre = CierrePeriodo(
        periodo=periodo,
        tenant_id=tenant.id,
        usuario=user.email,
        estado="REABIERTO",
        motivo_reapertura="Ajustes previos",
        veces_reabierto=1
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    res_recierre = client.post("/contabilidad/cierre/ejecutar", json={"periodo": periodo})
    assert res_recierre.status_code == 200, res_recierre.text
    assert res_recierre.json()["ok"] is True

    fila = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == tenant.id
    ).first()
    assert fila is not None
    assert fila.estado == "CERRADO"
    assert fila.veces_reabierto == 1  # No se resetea

    # Verificar log de recierre
    log = db.query(AuditoriaLog).filter(
        AuditoriaLog.tenant_id == tenant.id,
        AuditoriaLog.accion == "RECIERRE_PERIODO"
    ).first()
    assert log is not None

    db.close()


def test_cerrar_periodo_ya_cerrado_da_400(setup_db):
    """5. Intentar ejecutar_cierre sobre un período con estado CERRADO da 400."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Admin")

    periodo = "2026-01"
    cierre = CierrePeriodo(
        periodo=periodo,
        tenant_id=tenant.id,
        usuario=user.email,
        estado="CERRADO"
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    res = client.post("/contabilidad/cierre/ejecutar", json={"periodo": periodo})
    assert res.status_code == 400
    assert "ya se encuentra cerrado" in res.json().get("detail", "")

    db.close()


def test_cierres_historial_devuelve_estado_real(setup_db):
    """6. GET /contabilidad/cierres/historial devuelve el estado real (REABIERTO) y todos los campos de auditoría."""
    db = SessionLocal()
    tenant, user = _crear_ambiente_cierre(db, rol="Admin")

    periodo = "2025-12"
    cierre = CierrePeriodo(
        periodo=periodo,
        tenant_id=tenant.id,
        usuario=user.email,
        estado="REABIERTO",
        reabierto_por="Gerente General",
        motivo_reapertura="Ajuste de inventario de cierre anual",
        veces_reabierto=2,
        fecha_reabierto=datetime(2026, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_current_user_from_token] = mock_user
    client = TestClient(app)

    res = client.get("/contabilidad/cierres/historial")
    assert res.status_code == 200, res.text
    items = res.json()
    match = next((item for item in items if item["periodo"] == periodo), None)
    assert match is not None
    assert match["estado"] == "REABIERTO"
    assert match["reabierto_por"] == "Gerente General"
    assert match["motivo_reapertura"] == "Ajuste de inventario de cierre anual"
    assert match["veces_reabierto"] == 2
    assert match["fecha_reabierto"] is not None

    db.close()
