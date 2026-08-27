import sys
import os
import uuid
from decimal import Decimal
from datetime import date, datetime, timezone, timedelta
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.hr import Empleado, Nomina, RHEmployee, RHConcept, RHPayrollPeriod, RHPayrollDetail
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _set_auth_override(user):
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_user_from_token] = lambda: user


def _create_tenant_and_admin(db, name_prefix="Payroll"):
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"{name_prefix} {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"admin_{uuid.uuid4().hex[:6]}",
        nombre="Admin",
        apellido="Nomina",
        email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,  # Admin
        tenant_id=tenant_id,
        estado=1   # Activo (INTEGER)
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)
    return tenant, user


def _create_employee_profile(db, tenant_id, name="Juan", cedula="V-12345678"):
    user = Profile(
        id=uuid.uuid4(),
        username=f"emp_{uuid.uuid4().hex[:6]}",
        nombre=name,
        apellido="Perez",
        email=f"emp_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=3,
        tenant_id=tenant_id,
        estado=1  # INTEGER
    )
    db.add(user)
    db.flush()

    # RHEmployee
    rh_emp = RHEmployee(
        id=user.id,
        tenant_id=tenant_id,
        cedula=cedula,
        nombres=f"{name} Perez",
        cargo="Analista",
        fecha_ingreso=date(2025, 1, 1),
        sueldo_base_mensual=Decimal("500.00"),
        tipo_cuenta_bancaria="Corriente",
        numero_cuenta="01020000000000000001",
        status="activo"
    )
    db.add(rh_emp)
    db.commit()
    db.refresh(user)
    db.refresh(rh_emp)
    return user, rh_emp


def test_get_employees_active_profile_filter(setup_db):
    """1. Test Bug 1: GET /payroll/employees con Profile.estado == 1 (no debe crashear con Profile.estado.is_(True))."""
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "EmpActive")
    emp_profile, rh_emp = _create_employee_profile(db, tenant.id, "Carlos", "V-11111111")

    # Crear otro usuario inactivo (estado=0)
    inactivo_user = Profile(
        id=uuid.uuid4(),
        username=f"inactivo_{uuid.uuid4().hex[:6]}",
        nombre="Inactivo",
        apellido="User",
        email=f"inactivo_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=3,
        tenant_id=tenant.id,
        estado=0  # Inactivo
    )
    db.add(inactivo_user)
    db.commit()

    _set_auth_override(admin)
    client = TestClient(app)

    res = client.get("/payroll/employees")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    carlos_emp = next((e for e in data if e["id"] == str(emp_profile.id)), None)
    assert carlos_emp is not None
    assert carlos_emp["nombres"] == "Carlos Perez"

    # Verificar que el usuario inactivo no está en los empleados retornados
    assert not any(e["id"] == str(inactivo_user.id) for e in data)

    # Cleanup
    db.query(RHEmployee).filter(RHEmployee.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_bulk_save_details_new_detail_assigns_tenant_id(setup_db):
    """2. Test Bug 4: POST /payroll/details/bulk asigna tenant_id a RHPayrollDetail nuevo y no crashea por NOT NULL."""
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "BulkDetails")
    emp_profile, rh_emp = _create_employee_profile(db, tenant.id, "Maria", "V-22222222")

    concept = RHConcept(tenant_id=tenant.id, tipo="asignacion", nombre="Bono Productividad", afecta_salario_base=False)
    period = RHPayrollPeriod(tenant_id=tenant.id, nombre_periodo="2026-08-Q1", fecha_inicio=date(2026, 8, 1), fecha_fin=date(2026, 8, 15), status="abierto")
    db.add_all([concept, period])
    db.commit()
    db.refresh(concept)
    db.refresh(period)

    _set_auth_override(admin)
    client = TestClient(app)

    payload = {
        "period_id": period.id,
        "details": [
            {
                "employee_id": str(emp_profile.id),
                "period_id": period.id,
                "concept_id": concept.id,
                "monto": 50.0,
                "cantidad_horas_dias": 1.0
            }
        ]
    }
    res = client.post("/payroll/details/bulk", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert float(data[0]["monto"]) == 50.0

    # Verificar directamente en DB que tenant_id quedó guardado
    detail_db = db.query(RHPayrollDetail).filter(RHPayrollDetail.period_id == period.id).first()
    assert detail_db is not None
    assert detail_db.tenant_id == tenant.id

    # Cleanup
    db.query(RHPayrollDetail).filter(RHPayrollDetail.tenant_id == tenant.id).delete()
    db.query(RHConcept).filter(RHConcept.tenant_id == tenant.id).delete()
    db.query(RHPayrollPeriod).filter(RHPayrollPeriod.tenant_id == tenant.id).delete()
    db.query(RHEmployee).filter(RHEmployee.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_confirm_payroll_creates_asiento_with_tasa_cambio_bs(setup_db):
    """3. Test Bug 2: POST /payroll/process/confirm crea Nomina y AsientoContable con tasa_cambio_bs seteada."""
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "ConfirmDyn")
    emp_profile, rh_emp = _create_employee_profile(db, tenant.id, "Elena", "V-33333333")

    concept = RHConcept(tenant_id=tenant.id, tipo="deduccion", nombre="Prestamo Empresa", afecta_salario_base=False)
    period = RHPayrollPeriod(tenant_id=tenant.id, nombre_periodo="2026-08-Q2", fecha_inicio=date(2026, 8, 16), fecha_fin=date(2026, 8, 31), status="abierto")
    tasa = TasaCambio(tenant_id=tenant.id, fecha=datetime.now(timezone.utc), valor_ves=Decimal("50.00"), fuente="BCV")
    db.add_all([concept, period, tasa])
    db.commit()
    db.refresh(concept)
    db.refresh(period)

    # Detalle de deducción
    detail = RHPayrollDetail(
        tenant_id=tenant.id,
        employee_id=emp_profile.id,
        period_id=period.id,
        concept_id=concept.id,
        monto=Decimal("20.00"),
        cantidad_horas_dias=Decimal("1.00")
    )
    db.add(detail)
    db.commit()

    _set_auth_override(admin)
    client = TestClient(app)

    res = client.post(f"/payroll/process/confirm?period_id={period.id}")
    assert res.status_code == 200
    nomina_id = res.json()["nomina_id"]

    # Verificar Nomina en DB
    nomina_db = db.query(Nomina).filter(Nomina.id == nomina_id).first()
    assert nomina_db is not None
    assert nomina_db.tenant_id == tenant.id
    assert float(nomina_db.tasa_cambio_bs) == 50.0

    # Verificar AsientoContable en DB
    asiento_db = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"NOM-{nomina_id}",
        AsientoContable.tenant_id == tenant.id
    ).first()
    assert asiento_db is not None
    assert asiento_db.tasa_cambio_bs is not None
    assert float(asiento_db.tasa_cambio_bs) == 50.0
    assert asiento_db.tenant_id == tenant.id
    assert len(asiento_db.detalles) == 4

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento_db.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento_db.id).delete()
    db.query(Nomina).filter(Nomina.id == nomina_id).delete()
    db.query(RHPayrollDetail).filter(RHPayrollDetail.tenant_id == tenant.id).delete()
    db.query(RHConcept).filter(RHConcept.tenant_id == tenant.id).delete()
    db.query(RHPayrollPeriod).filter(RHPayrollPeriod.tenant_id == tenant.id).delete()
    db.query(RHEmployee).filter(RHEmployee.tenant_id == tenant.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_legacy_hr_procesar_nomina_asiento_tenant_id_and_tasa(setup_db):
    """4. Test Bug 3: POST /rrhh/nomina/procesar genera AsientoContable con tenant_id y tasa_cambio_bs correctos."""
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "LegacyHR")

    # Empleado legacy
    emp_legacy = Empleado(
        tenant_id=tenant.id,
        cedula="V-44444444",
        nombre_completo="Pedro Gonzalez",
        cargo="Operador",
        salario_base_usd=Decimal("400.00"),
        bono_alimentacion_usd=Decimal("40.00"),
        activo=1
    )
    tasa = TasaCambio(tenant_id=tenant.id, fecha=datetime.now(timezone.utc), valor_ves=Decimal("50.00"), fuente="BCV")
    db.add_all([emp_legacy, tasa])
    db.commit()
    db.refresh(emp_legacy)

    _set_auth_override(admin)
    client = TestClient(app)

    res = client.post("/rrhh/nomina/procesar", params={"periodo": "Quincena 1 - Septiembre 2026"})
    assert res.status_code == 201
    data = res.json()
    nomina_id = data["id"]

    # Verificar Nomina en DB
    nomina_db = db.query(Nomina).filter(Nomina.id == nomina_id).first()
    assert nomina_db is not None
    assert nomina_db.tenant_id == tenant.id

    # Verificar AsientoContable en DB
    asiento_db = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"NOM-{nomina_id}",
        AsientoContable.tenant_id == tenant.id
    ).first()
    assert asiento_db is not None
    assert asiento_db.tenant_id == tenant.id  # Multi-tenant isolation verificado
    assert asiento_db.tasa_cambio_bs is not None
    assert float(asiento_db.tasa_cambio_bs) == 50.0
    assert len(asiento_db.detalles) == 7

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento_db.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento_db.id).delete()
    db.query(Nomina).filter(Nomina.id == nomina_id).delete()
    db.query(Empleado).filter(Empleado.tenant_id == tenant.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_guard_solapamiento_entre_motores_nomina(setup_db):
    """5. Test Guard: Confirmar que procesar en un motor bloquea con 409 al otro motor si hay solapamiento de fechas."""
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "GuardOverlap")
    emp_profile, rh_emp = _create_employee_profile(db, tenant.id, "Sofia", "V-55555555")

    # Empleado legacy también para el segundo motor
    emp_legacy = Empleado(
        tenant_id=tenant.id,
        cedula="V-55555555",
        nombre_completo="Sofia Perez",
        cargo="Analista",
        salario_base_usd=Decimal("600.00"),
        bono_alimentacion_usd=Decimal("40.00"),
        activo=1
    )
    period = RHPayrollPeriod(
        tenant_id=tenant.id,
        nombre_periodo="2026-10-Q1",
        fecha_inicio=date(2026, 10, 1),
        fecha_fin=date(2026, 10, 15),
        status="abierto"
    )
    tasa = TasaCambio(tenant_id=tenant.id, fecha=datetime.now(timezone.utc), valor_ves=Decimal("50.00"), fuente="BCV")
    db.add_all([emp_legacy, period, tasa])
    db.commit()
    db.refresh(period)

    _set_auth_override(admin)
    client = TestClient(app)

    # 1. Procesar en motor dinámico (/payroll/process/confirm)
    res_dyn = client.post(f"/payroll/process/confirm?period_id={period.id}")
    assert res_dyn.status_code == 200
    nomina_id = res_dyn.json()["nomina_id"]

    # 2. Intentar procesar en motor legacy (/rrhh/nomina/procesar) con rango solapado (1 al 15 de Octubre 2026) -> debe dar 409
    res_legacy = client.post("/rrhh/nomina/procesar", params={"periodo": "Quincena 1 - Octubre 2026"})
    assert res_legacy.status_code == 409
    assert "Ya existe una nómina procesada" in res_legacy.json()["detail"]

    # 3. Intentar procesar otro período dinámico que se solape con el mismo rango -> debe dar 409
    period_overlap = RHPayrollPeriod(
        tenant_id=tenant.id,
        nombre_periodo="2026-10-Overlap",
        fecha_inicio=date(2026, 10, 10),
        fecha_fin=date(2026, 10, 20),
        status="abierto"
    )
    db.add(period_overlap)
    db.commit()
    db.refresh(period_overlap)

    res_dyn_overlap = client.post(f"/payroll/process/confirm?period_id={period_overlap.id}")
    assert res_dyn_overlap.status_code == 409
    assert "Ya existe una nómina procesada" in res_dyn_overlap.json()["detail"]

    # Cleanup
    asiento_db = db.query(AsientoContable).filter(AsientoContable.referencia == f"NOM-{nomina_id}").first()
    if asiento_db:
        db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento_db.id).delete()
        db.query(AsientoContable).filter(AsientoContable.id == asiento_db.id).delete()
    db.query(Nomina).filter(Nomina.tenant_id == tenant.id).delete()
    db.query(RHPayrollDetail).filter(RHPayrollDetail.tenant_id == tenant.id).delete()
    db.query(RHPayrollPeriod).filter(RHPayrollPeriod.tenant_id == tenant.id).delete()
    db.query(RHEmployee).filter(RHEmployee.tenant_id == tenant.id).delete()
    db.query(Empleado).filter(Empleado.tenant_id == tenant.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()

