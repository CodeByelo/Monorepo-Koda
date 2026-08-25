import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.models.erp_extended import CuentaContable
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_asiento_rechazado_en_periodo_cerrado(setup_db):
    """1. Un asiento no se puede crear en un período ya cerrado."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cierre Test {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    tasa = TasaCambio(
        tenant_id=tenant_id,
        valor_ves=Decimal("50.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)

    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    cierre = CierrePeriodo(
        periodo=current_period,
        tenant_id=tenant_id,
        usuario="Admin"
    )
    db.add(cierre)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    payload = {
        "concepto": "Asiento en periodo cerrado",
        "referencia": "TEST-CERRADO-001",
        "lineas": [
            {
                "cuenta_codigo": "1.1.01",
                "cuenta_nombre": "Caja y Bancos",
                "debe": "100.00",
                "haber": "0.00"
            },
            {
                "cuenta_codigo": "4.1.01",
                "cuenta_nombre": "Ventas",
                "debe": "0.00",
                "haber": "100.00"
            }
        ]
    }

    response = client.post("/contabilidad/asientos", json=payload)
    assert response.status_code in [400, 403], f"Expected 400 or 403, got {response.status_code}: {response.text}"
    assert "CERRADO" in response.text or "cerrado" in response.text

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_ciclo_completo_cierre_y_reapertura_periodo(setup_db):
    """2. Ciclo completo de cierre de período (ejecutar, historial, bloqueo y reapertura)."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Ciclo Cierre {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    tasa = TasaCambio(
        tenant_id=tenant_id,
        valor_ves=Decimal("50.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    current_period = datetime.now(timezone.utc).strftime("%Y-%m")

    # A) Crear asiento inicial con éxito
    payload = {
        "concepto": "Asiento antes del cierre",
        "referencia": "TEST-PRE-CIERRE-001",
        "lineas": [
            {"cuenta_codigo": "1.1.01", "cuenta_nombre": "Caja", "debe": "200.00", "haber": "0.00"},
            {"cuenta_codigo": "4.1.01", "cuenta_nombre": "Ventas", "debe": "0.00", "haber": "200.00"}
        ]
    }
    resp_asiento1 = client.post("/contabilidad/asientos", json=payload)
    assert resp_asiento1.status_code == 200, resp_asiento1.text
    asiento1_id = resp_asiento1.json()["id"]

    # B) Ejecutar cierre del período
    resp_cierre = client.post("/contabilidad/cierre/ejecutar", json={"periodo": current_period})
    assert resp_cierre.status_code == 200, resp_cierre.text
    data_cierre = resp_cierre.json()
    assert data_cierre["ok"] is True
    assert data_cierre["periodo"] == current_period

    # C) Consultar historial de cierres
    resp_hist = client.get("/contabilidad/cierres/historial")
    assert resp_hist.status_code == 200, resp_hist.text
    historial = resp_hist.json()
    assert any(h["periodo"] == current_period and h["estado"] == "CERRADO" for h in historial)

    # D) Intentar crear asiento en período cerrado debe ser bloqueado
    payload_bloqueado = {
        "concepto": "Asiento bloqueado por cierre",
        "referencia": "TEST-BLOQUEADO-001",
        "lineas": [
            {"cuenta_codigo": "1.1.01", "cuenta_nombre": "Caja", "debe": "50.00", "haber": "0.00"},
            {"cuenta_codigo": "4.1.01", "cuenta_nombre": "Ventas", "debe": "0.00", "haber": "50.00"}
        ]
    }
    resp_bloqueado = client.post("/contabilidad/asientos", json=payload_bloqueado)
    assert resp_bloqueado.status_code in [400, 403]
    assert "CERRADO" in resp_bloqueado.text or "cerrado" in resp_bloqueado.text

    # E) Reabrir período cerrado
    resp_reabrir = client.post("/contabilidad/cierre/reabrir", json={"periodo": current_period, "justificacion": "Reapertura para ajuste de cierre"})
    assert resp_reabrir.status_code == 200, resp_reabrir.text
    assert resp_reabrir.json()["ok"] is True

    # F) Intentar crear asiento tras la reapertura debe permitirse
    resp_asiento2 = client.post("/contabilidad/asientos", json=payload_bloqueado)
    assert resp_asiento2.status_code == 200, resp_asiento2.text
    asiento2_id = resp_asiento2.json()["id"]

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id.in_([asiento1_id, asiento2_id])).delete(synchronize_session=False)
    db.query(AsientoContable).filter(AsientoContable.id.in_([asiento1_id, asiento2_id])).delete(synchronize_session=False)
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_balance_comprobacion_cuadra_matematicamente(setup_db):
    """3. El balance de comprobación cuadra matemáticamente."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Balance {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    tasa = TasaCambio(
        tenant_id=tenant_id,
        valor_ves=Decimal("60.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    current_period = datetime.now(timezone.utc).strftime("%Y-%m")

    # Crear 3 asientos balanceados
    asientos_payload = [
        {
            "concepto": "Asiento 1: Ventas",
            "referencia": "BAL-001",
            "lineas": [
                {"cuenta_codigo": "1.1.01", "cuenta_nombre": "Caja y Bancos", "debe": "500.00", "haber": "0.00"},
                {"cuenta_codigo": "4.1.01", "cuenta_nombre": "Ventas", "debe": "0.00", "haber": "500.00"}
            ]
        },
        {
            "concepto": "Asiento 2: Compra Inventario",
            "referencia": "BAL-002",
            "lineas": [
                {"cuenta_codigo": "1.1.03", "cuenta_nombre": "Inventario", "debe": "200.00", "haber": "0.00"},
                {"cuenta_codigo": "2.1.01", "cuenta_nombre": "Cuentas por Pagar", "debe": "0.00", "haber": "200.00"}
            ]
        },
        {
            "concepto": "Asiento 3: Pago de Gastos",
            "referencia": "BAL-003",
            "lineas": [
                {"cuenta_codigo": "5.1.01", "cuenta_nombre": "Costo de Ventas", "debe": "150.00", "haber": "0.00"},
                {"cuenta_codigo": "1.1.01", "cuenta_nombre": "Caja y Bancos", "debe": "0.00", "haber": "150.00"}
            ]
        }
    ]

    created_ids = []
    for p in asientos_payload:
        res = client.post("/contabilidad/asientos", json=p)
        assert res.status_code == 200, res.text
        created_ids.append(res.json()["id"])

    # Consultar balance de comprobación
    res_bal = client.get(f"/contabilidad/balance-comprobacion?periodo={current_period}")
    assert res_bal.status_code == 200, res_bal.text
    bal_data = res_bal.json()

    # Total debe = 500 + 200 + 150 = 850
    # Total haber = 500 + 200 + 150 = 850
    total_debe = bal_data["totales"]["debe"]
    total_haber = bal_data["totales"]["haber"]
    assert total_debe == 850.0
    assert total_haber == 850.0
    assert total_debe == total_haber

    # Suma de líneas individuales
    sum_lineas_debe = sum(float(l["debe"]) for l in bal_data["lineas"])
    sum_lineas_haber = sum(float(l["haber"]) for l in bal_data["lineas"])
    assert sum_lineas_debe == 850.0
    assert sum_lineas_haber == 850.0

    # Lectura de auditoría forense debe confirmar cuadre
    cuadre_card = next((c for c in bal_data.get("lectura", []) if c.get("label") == "CUADRE"), None)
    assert cuadre_card is not None
    assert cuadre_card["title"] == "Balance Cuadrado"

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id.in_(created_ids)).delete(synchronize_session=False)
    db.query(AsientoContable).filter(AsientoContable.id.in_(created_ids)).delete(synchronize_session=False)
    db.query(CuentaContable).filter(CuentaContable.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_aislamiento_multitenant_asientos_y_balance(setup_db):
    """4. Aislamiento de tenant en asientos y balance."""
    db = SessionLocal()

    # Tenant A
    tenant_a_id = uuid.uuid4()
    tenant_a = Tenant(id=tenant_a_id, nombre_empresa="Tenant A Contabilidad", estado_licencia="ACTIVA")
    user_a = Profile(
        id=uuid.uuid4(),
        username=f"user_a_{uuid.uuid4().hex[:6]}",
        nombre="Contador A",
        apellido="Test",
        email=f"user_a_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_a_id
    )
    db.add(tenant_a)
    db.flush()
    db.add(user_a)

    tasa_a = TasaCambio(
        tenant_id=tenant_a_id,
        valor_ves=Decimal("50.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa_a)

    # Tenant B
    tenant_b_id = uuid.uuid4()
    tenant_b = Tenant(id=tenant_b_id, nombre_empresa="Tenant B Contabilidad", estado_licencia="ACTIVA")
    user_b = Profile(
        id=uuid.uuid4(),
        username=f"user_b_{uuid.uuid4().hex[:6]}",
        nombre="Contador B",
        apellido="Test",
        email=f"user_b_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_b_id
    )
    db.add(tenant_b)
    db.flush()
    db.add(user_b)

    tasa_b = TasaCambio(
        tenant_id=tenant_b_id,
        valor_ves=Decimal("55.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa_b)
    db.commit()

    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    client = TestClient(app)

    # 1. Crear asiento en Tenant A (100 USD)
    app.dependency_overrides[get_current_user] = lambda: user_a
    resp_a = client.post("/contabilidad/asientos", json={
        "concepto": "Asiento Tenant A",
        "referencia": "REF-TENANT-A",
        "lineas": [
            {"cuenta_codigo": "1.1.01", "cuenta_nombre": "Caja", "debe": "100.00", "haber": "0.00"},
            {"cuenta_codigo": "4.1.01", "cuenta_nombre": "Ventas", "debe": "0.00", "haber": "100.00"}
        ]
    })
    assert resp_a.status_code == 200, resp_a.text
    asiento_a_id = resp_a.json()["id"]

    # 2. Crear asiento en Tenant B (250 USD)
    app.dependency_overrides[get_current_user] = lambda: user_b
    resp_b = client.post("/contabilidad/asientos", json={
        "concepto": "Asiento Tenant B",
        "referencia": "REF-TENANT-B",
        "lineas": [
            {"cuenta_codigo": "1.1.01", "cuenta_nombre": "Caja", "debe": "250.00", "haber": "0.00"},
            {"cuenta_codigo": "4.1.01", "cuenta_nombre": "Ventas", "debe": "0.00", "haber": "250.00"}
        ]
    })
    assert resp_b.status_code == 200, resp_b.text
    asiento_b_id = resp_b.json()["id"]

    # 3. Listar asientos con User A -> no debe ver asiento B
    app.dependency_overrides[get_current_user] = lambda: user_a
    list_a = client.get("/contabilidad/asientos")
    assert list_a.status_code == 200
    ids_a = [item["id"] for item in list_a.json()["data"]]
    assert asiento_a_id in ids_a
    assert asiento_b_id not in ids_a

    # 4. Listar asientos con User B -> no debe ver asiento A
    app.dependency_overrides[get_current_user] = lambda: user_b
    list_b = client.get("/contabilidad/asientos")
    assert list_b.status_code == 200
    ids_b = [item["id"] for item in list_b.json()["data"]]
    assert asiento_b_id in ids_b
    assert asiento_a_id not in ids_b

    # 5. Balance de comprobación Tenant A -> debe = 100.0
    app.dependency_overrides[get_current_user] = lambda: user_a
    bal_a = client.get(f"/contabilidad/balance-comprobacion?periodo={current_period}")
    assert bal_a.status_code == 200
    assert bal_a.json()["totales"]["debe"] == 100.0
    assert bal_a.json()["totales"]["haber"] == 100.0

    # 6. Balance de comprobación Tenant B -> debe = 250.0
    app.dependency_overrides[get_current_user] = lambda: user_b
    bal_b = client.get(f"/contabilidad/balance-comprobacion?periodo={current_period}")
    assert bal_b.status_code == 200
    assert bal_b.json()["totales"]["debe"] == 250.0
    assert bal_b.json()["totales"]["haber"] == 250.0

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id.in_([asiento_a_id, asiento_b_id])).delete(synchronize_session=False)
    db.query(AsientoContable).filter(AsientoContable.id.in_([asiento_a_id, asiento_b_id])).delete(synchronize_session=False)
    db.query(CuentaContable).filter(CuentaContable.tenant_id.in_([tenant_a_id, tenant_b_id])).delete(synchronize_session=False)
    db.query(TasaCambio).filter(TasaCambio.tenant_id.in_([tenant_a_id, tenant_b_id])).delete(synchronize_session=False)
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete(synchronize_session=False)
    db.query(Tenant).filter(Tenant.id.in_([tenant_a_id, tenant_b_id])).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_cierre_periodo_aislado_por_tenant(setup_db):
    """5. Verifica que dos tenants distintos puedan cerrar el mismo período sin colisión de unicidad."""
    db = SessionLocal()

    # Tenant 1
    tenant_1_id = uuid.uuid4()
    tenant_1 = Tenant(id=tenant_1_id, nombre_empresa="Tenant 1 Cierre", estado_licencia="ACTIVA")
    user_1 = Profile(
        id=uuid.uuid4(),
        username=f"user_1_{uuid.uuid4().hex[:6]}",
        nombre="Admin 1",
        apellido="Test",
        email=f"user_1_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_1_id
    )
    db.add(tenant_1)
    db.flush()
    db.add(user_1)

    # Tenant 2
    tenant_2_id = uuid.uuid4()
    tenant_2 = Tenant(id=tenant_2_id, nombre_empresa="Tenant 2 Cierre", estado_licencia="ACTIVA")
    user_2 = Profile(
        id=uuid.uuid4(),
        username=f"user_2_{uuid.uuid4().hex[:6]}",
        nombre="Admin 2",
        apellido="Test",
        email=f"user_2_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_2_id
    )
    db.add(tenant_2)
    db.flush()
    db.add(user_2)
    db.commit()

    client = TestClient(app)
    periodo_test = "2026-08"

    # Tenant 1 cierra periodo_test
    app.dependency_overrides[get_current_user] = lambda: user_1
    resp_1 = client.post("/contabilidad/cierre/ejecutar", json={"periodo": periodo_test})
    assert resp_1.status_code == 200, resp_1.text
    assert resp_1.json()["ok"] is True

    # Tenant 2 cierra el MISMO periodo_test (no debe colisionar)
    app.dependency_overrides[get_current_user] = lambda: user_2
    resp_2 = client.post("/contabilidad/cierre/ejecutar", json={"periodo": periodo_test})
    assert resp_2.status_code == 200, resp_2.text
    assert resp_2.json()["ok"] is True

    # Verificar que existen ambos registros en la BD
    cierres = db.query(CierrePeriodo).filter(CierrePeriodo.periodo == periodo_test).all()
    tenant_ids_cerrados = [c.tenant_id for c in cierres]
    assert tenant_1_id in tenant_ids_cerrados
    assert tenant_2_id in tenant_ids_cerrados

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id.in_([tenant_1_id, tenant_2_id])).delete(synchronize_session=False)
    db.query(Profile).filter(Profile.id.in_([user_1.id, user_2.id])).delete(synchronize_session=False)
    db.query(Tenant).filter(Tenant.id.in_([tenant_1_id, tenant_2_id])).delete(synchronize_session=False)
    db.commit()
    db.close()

