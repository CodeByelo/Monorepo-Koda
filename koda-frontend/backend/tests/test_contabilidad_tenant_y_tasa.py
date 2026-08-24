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
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.erp_extended import MatrizIntegracion, CuentaContable
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_crear_asiento_usa_tasa_actual_no_hardcoded(setup_db):
    """Verifica que POST /contabilidad/asientos use la tasa BCV real del tenant y no 36.52."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Test {uuid.uuid4().hex[:6]}",
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
    db.add(user)
    
    # Crear tasa real específica para este tenant
    tasa_real_valor = Decimal("785.40")
    tasa = TasaCambio(
        tenant_id=tenant_id,
        moneda_origen="USD",
        moneda_destino="VES",
        valor_ves=tasa_real_valor,
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    payload = {
        "concepto": "Asiento de prueba tasa real",
        "referencia": "TEST-REF-001",
        "lineas": [
            {
                "cuenta_codigo": "1.1.01",
                "cuenta_nombre": "Caja y Bancos",
                "debe": "100.00",
                "haber": "0.00",
                "centro_costo": "ADMIN"
            },
            {
                "cuenta_codigo": "4.1.01",
                "cuenta_nombre": "Ventas",
                "debe": "0.00",
                "haber": "100.00",
                "centro_costo": "ADMIN"
            }
        ]
    }

    response = client.post("/contabilidad/asientos", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    # Verificar que la tasa guardada sea la tasa real configurada (785.40) y NO 36.52
    asiento_id = data["id"]
    asiento_db = db.query(AsientoContable).filter(AsientoContable.id == asiento_id).first()
    assert asiento_db is not None
    assert Decimal(str(asiento_db.tasa_cambio_bs)) == tasa_real_valor
    assert Decimal(str(asiento_db.tasa_cambio_bs)) != Decimal("36.52")

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento_id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_matriz_integracion_aislamiento_multi_tenant(setup_db):
    """Verifica que dos inquilinos diferentes no sobreescriban sus configuraciones de MatrizIntegracion."""
    db = SessionLocal()
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    tenant_obj_a = Tenant(
        id=tenant_a,
        nombre_empresa=f"Empresa A {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    tenant_obj_b = Tenant(
        id=tenant_b,
        nombre_empresa=f"Empresa B {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )

    user_a = Profile(
        id=uuid.uuid4(),
        username=f"user_a_{uuid.uuid4().hex[:6]}",
        nombre="Empresa A",
        apellido="Admin",
        email=f"empresa_a_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_a
    )
    user_b = Profile(
        id=uuid.uuid4(),
        username=f"user_b_{uuid.uuid4().hex[:6]}",
        nombre="Empresa B",
        apellido="Admin",
        email=f"empresa_b_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_b
    )
    db.add_all([tenant_obj_a, tenant_obj_b])
    db.add_all([user_a, user_b])
    db.commit()

    client = TestClient(app)

    # 1. Configurar Tenant A: VENTA_CONTADO -> 4.1.01
    app.dependency_overrides[get_current_user] = lambda: user_a
    res_save_a = client.post("/contabilidad/matriz-integracion", json={
        "lineas": [
            {
                "evento": "VENTA_CONTADO",
                "cuenta_debe_codigo": "1.1.01",
                "cuenta_haber_codigo": "4.1.01"
            }
        ],
        "usuario": "Admin A"
    })
    assert res_save_a.status_code == 200

    # 2. Configurar Tenant B: VENTA_CONTADO -> 4.1.05
    app.dependency_overrides[get_current_user] = lambda: user_b
    res_save_b = client.post("/contabilidad/matriz-integracion", json={
        "lineas": [
            {
                "evento": "VENTA_CONTADO",
                "cuenta_debe_codigo": "1.1.01",
                "cuenta_haber_codigo": "4.1.05"
            }
        ],
        "usuario": "Admin B"
    })
    assert res_save_b.status_code == 200

    # 3. Consultar Tenant A y verificar que NO fue sobreescrito por Tenant B
    app.dependency_overrides[get_current_user] = lambda: user_a
    res_get_a = client.get("/contabilidad/matriz-integracion")
    assert res_get_a.status_code == 200
    data_a = res_get_a.json()
    linea_a = next(l for l in data_a["lineas"] if l["evento"] == "VENTA_CONTADO")
    assert linea_a["cuenta_haber_codigo"] == "4.1.01"

    # 4. Consultar Tenant B y verificar su valor independiente
    app.dependency_overrides[get_current_user] = lambda: user_b
    res_get_b = client.get("/contabilidad/matriz-integracion")
    assert res_get_b.status_code == 200
    data_b = res_get_b.json()
    linea_b = next(l for l in data_b["lineas"] if l["evento"] == "VENTA_CONTADO")
    assert linea_b["cuenta_haber_codigo"] == "4.1.05"

    # Cleanup
    db.query(MatrizIntegracion).filter(MatrizIntegracion.tenant_id.in_([tenant_a, tenant_b])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a, tenant_b])).delete()
    db.commit()
    db.close()
