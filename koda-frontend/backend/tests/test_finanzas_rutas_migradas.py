import sys
import os
import uuid
import json
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.operations import Cliente, Proveedor
from backend.models.erp_extended import (
    CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario,
    TransferenciaTesoreria, PrestamoUVC, ColocacionInversion, PresupuestoPartida, CuentaContable,
    AuditoriaLog
)
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _seed_cuentas_contables(db, tenant_id):
    plan = [
        ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
        ("1.1.02", "Cuentas por Cobrar Comerciales", "ACTIVO", 3),
    ]
    for codigo, nombre, tipo, nivel in plan:
        existing = db.query(CuentaContable).filter(
            CuentaContable.codigo == codigo,
            CuentaContable.tenant_id == tenant_id
        ).first()
        if not existing:
            db.add(CuentaContable(
                codigo=codigo,
                nombre=nombre,
                tipo=tipo,
                nivel=nivel,
                activa=True,
                naturaleza="DEUDORA",
                tenant_id=tenant_id
            ))
    db.commit()


def _create_tenant_and_user(db, name_prefix="Test"):
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"{name_prefix} {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre=f"{name_prefix} User",
        apellido="Tester",
        email=f"{name_prefix.lower()}_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)
    return tenant, user


# ==============================================================================
# 1 & 2 & 3. TRANSFERENCIAS INTERNAS (GET, POST, POST /{id}/confirmar)
# ==============================================================================

def test_transferencias_internas_crud_confirmar_and_multitenant(setup_db):
    """Prueba GET, POST y POST /{id}/confirmar de transferencias internas con aislamiento multi-tenant."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "TrfA")
    tenant_b, user_b = _create_tenant_and_user(db, "TrfB")
    _seed_cuentas_contables(db, tenant_a.id)
    _seed_cuentas_contables(db, tenant_b.id)

    # Cuentas bancarias tenant A
    cta_origen_a = CuentaBancaria(tenant_id=tenant_a.id, banco="Banco Origen A", numero_cuenta="01020000000000000001", moneda="USD", saldo_actual_usd=Decimal("1000.00"), activa=True)
    cta_dest_a = CuentaBancaria(tenant_id=tenant_a.id, banco="Banco Destino A", numero_cuenta="01020000000000000002", moneda="USD", saldo_actual_usd=Decimal("500.00"), activa=True)
    # Cuentas bancarias tenant B
    cta_origen_b = CuentaBancaria(tenant_id=tenant_b.id, banco="Banco Origen B", numero_cuenta="01020000000000000003", moneda="USD", saldo_actual_usd=Decimal("2000.00"), activa=True)
    cta_dest_b = CuentaBancaria(tenant_id=tenant_b.id, banco="Banco Destino B", numero_cuenta="01020000000000000004", moneda="USD", saldo_actual_usd=Decimal("100.00"), activa=True)
    db.add_all([cta_origen_a, cta_dest_a, cta_origen_b, cta_dest_b])
    db.commit()
    db.refresh(cta_origen_a)
    db.refresh(cta_dest_a)
    db.refresh(cta_origen_b)
    db.refresh(cta_dest_b)

    # Crear transferencia existente en B
    trf_b = TransferenciaTesoreria(
        tenant_id=tenant_b.id,
        cuenta_origen_id=cta_origen_b.id,
        cuenta_destino_id=cta_dest_b.id,
        monto_usd=Decimal("300.00"),
        tasa_cambio_bs=Decimal("50.0"),
        concepto="Trf Tenant B",
        estado="PENDIENTE"
    )
    db.add(trf_b)
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # 1. POST /tesoreria/transferencias-internas (Crear)
    payload = {
        "origen_id": cta_origen_a.id,
        "destino_id": cta_dest_a.id,
        "monto_usd": 200.0,
        "tasa_cambio_bs": 50.0,
        "concepto": "Fondeo Sucursal A"
    }
    res_post = client.post("/tesoreria/transferencias-internas", json=payload)
    assert res_post.status_code == 200
    trf_id = res_post.json()["id"]

    # Verificar que se guardó en DB
    trf_db = db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.id == trf_id).first()
    assert trf_db is not None
    assert trf_db.tenant_id == tenant_a.id
    assert trf_db.estado == "PENDIENTE"
    assert float(trf_db.monto_usd) == 200.0

    # 2. GET /tesoreria/transferencias-internas (Listar y validar aislamiento)
    res_get = client.get("/tesoreria/transferencias-internas")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert len(data_get) == 1
    assert data_get[0]["db_id"] == trf_id
    assert data_get[0]["from"] == "Banco Origen A"
    assert data_get[0]["to"] == "Banco Destino A"
    assert data_get[0]["amount"] == "$200.00"
    assert data_get[0]["canConfirm"] is True
    # Confirmar que NO se ve la de Tenant B
    assert not any(t["desc"] == "Trf Tenant B" or t["from"] == "Banco Origen B" for t in data_get)

    # 3. POST /tesoreria/transferencias-internas/{id}/confirmar (Confirmar transferencia)
    res_conf = client.post(f"/tesoreria/transferencias-internas/{trf_id}/confirmar")
    assert res_conf.status_code == 200
    assert res_conf.json()["ok"] is True

    # Verificar saldos actualizados en DB
    db.refresh(cta_origen_a)
    db.refresh(cta_dest_a)
    db.refresh(trf_db)
    assert float(cta_origen_a.saldo_actual_usd) == 800.0  # 1000 - 200
    assert float(cta_dest_a.saldo_actual_usd) == 700.0   # 500 + 200
    assert trf_db.estado == "COMPLETADO"

    # Cleanup
    db.query(TransferenciaTesoreria).filter(TransferenciaTesoreria.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 4. CUENTAS BANCARIAS (GET /tesoreria/cuentas)
# ==============================================================================

def test_obtener_cuentas_bancarias_and_multitenant(setup_db):
    """Prueba GET /tesoreria/cuentas y su aislamiento multi-tenant."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "CuentasA")
    tenant_b, user_b = _create_tenant_and_user(db, "CuentasB")

    cta_a = CuentaBancaria(tenant_id=tenant_a.id, banco="Banesco A", numero_cuenta="01340000000000000001", moneda="USD", saldo_actual_usd=Decimal("1500.00"), activa=True)
    cta_b = CuentaBancaria(tenant_id=tenant_b.id, banco="Mercantil B", numero_cuenta="01050000000000000002", moneda="USD", saldo_actual_usd=Decimal("3000.00"), activa=True)
    db.add_all([cta_a, cta_b])
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    res = client.get("/tesoreria/cuentas")
    assert res.status_code == 200
    cuentas = res.json()
    assert len(cuentas) == 1
    assert cuentas[0]["banco"] == "Banesco A"
    assert cuentas[0]["saldo"] == 1500.0
    assert cuentas[0]["moneda"] == "USD"

    # Cleanup
    db.query(CuentaBancaria).filter(CuentaBancaria.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 5. FLUJO DE CAJA (GET /tesoreria/flujo)
# ==============================================================================

def test_flujo_caja_alias_and_multitenant(setup_db):
    """Prueba GET /tesoreria/flujo con proyecciones de CxC y CxP y aislamiento multi-tenant."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "FlujoA")
    tenant_b, user_b = _create_tenant_and_user(db, "FlujoB")

    cli_a = Cliente(tenant_id=tenant_a.id, rif="J-10101010-1", nombre="Cliente Flujo A")
    prov_a = Proveedor(tenant_id=tenant_a.id, rif="J-20202020-2", nombre="Proveedor Flujo A")
    cli_b = Cliente(tenant_id=tenant_b.id, rif="J-30303030-3", nombre="Cliente Flujo B")
    db.add_all([cli_a, prov_a, cli_b])
    db.commit()
    db.refresh(cli_a)
    db.refresh(prov_a)
    db.refresh(cli_b)

    now = datetime.now(timezone.utc)
    cxc_a = CuentaPorCobrar(
        tenant_id=tenant_a.id,
        cliente_id=cli_a.id,
        numero_documento="FAC-FLUJO-A",
        monto_total_usd=Decimal("300.00"),
        monto_pagado_usd=Decimal("50.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=now,
        fecha_vencimiento=now + timedelta(days=10),
        estado="PENDIENTE"
    )
    cxp_a = CuentaPorPagar(
        tenant_id=tenant_a.id,
        proveedor_id=prov_a.id,
        numero_documento="CXP-FLUJO-A",
        monto_total_usd=Decimal("600.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=now,
        fecha_vencimiento=now + timedelta(days=15),
        estado="PENDIENTE"
    )
    cxc_b = CuentaPorCobrar(
        tenant_id=tenant_b.id,
        cliente_id=cli_b.id,
        numero_documento="FAC-FLUJO-B",
        monto_total_usd=Decimal("900.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=now,
        fecha_vencimiento=now + timedelta(days=5),
        estado="PENDIENTE"
    )
    db.add_all([cxc_a, cxp_a, cxc_b])
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    res = client.get("/tesoreria/flujo")
    assert res.status_code == 200
    data = res.json()
    proy = data.get("proyecciones", [])
    assert len(proy) == 2

    cobro = next((p for p in proy if p["type"] == "Entrada"), None)
    assert cobro is not None
    assert cobro["amount"] == 250.0  # 300 - 50
    assert cobro["sub"] == "Cliente Flujo A"
    assert cobro["area"] == "Cobranzas"

    pago = next((p for p in proy if p["type"] == "Salida"), None)
    assert pago is not None
    assert pago["amount"] == 600.0
    assert pago["sub"] == "Proveedor Flujo A"
    assert pago["isCritical"] is True  # > 500

    # Cleanup
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(CuentaPorPagar).filter(CuentaPorPagar.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Cliente).filter(Cliente.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Proveedor).filter(Proveedor.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 6. AUDITORÍA DE TURNOS (GET /tesoreria/turnos)
# ==============================================================================

def test_auditoria_turnos_and_multitenant(setup_db):
    """Prueba GET /tesoreria/turnos leyendo AuditoriaLog de cierre de arqueo y aislamiento multi-tenant."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "TurnosA")
    tenant_b, user_b = _create_tenant_and_user(db, "TurnosB")

    log_a1 = AuditoriaLog(
        tenant_id=tenant_a.id,
        usuario="Carlos Cajero",
        accion="CIERRE_ARQUEO",
        modulo="TESORERIA",
        detalle=json.dumps({"diferencia": -5.0, "caja": "Caja 1", "fisico": 100.0, "resolucion": "Aceptable"}),
        fecha=datetime.now(timezone.utc)
    )
    log_a2 = AuditoriaLog(
        tenant_id=tenant_a.id,
        usuario="Carlos Cajero",
        accion="CIERRE_ARQUEO",
        modulo="TESORERIA",
        detalle=json.dumps({"diferencia": -25.0, "caja": "Caja 1", "fisico": 200.0, "resolucion": "Faltante"}),
        fecha=datetime.now(timezone.utc)
    )
    log_b = AuditoriaLog(
        tenant_id=tenant_b.id,
        usuario="Maria Cajera B",
        accion="CIERRE_ARQUEO",
        modulo="TESORERIA",
        detalle=json.dumps({"diferencia": 0.0, "caja": "Caja B", "fisico": 500.0, "resolucion": "Exacto"}),
        fecha=datetime.now(timezone.utc)
    )
    db.add_all([log_a1, log_a2, log_b])
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    res = client.get("/tesoreria/turnos")
    assert res.status_code == 200
    data = res.json()
    assert "metricas" in data
    assert "cajeros_monitoreados" in data["metricas"]
    assert "1 Usuarios" in data["metricas"]["cajeros_monitoreados"]
    assert data["metricas"]["desviacion_total"] == "$30.00"

    ranking = data.get("ranking", [])
    assert len(ranking) == 1
    assert ranking[0]["name"] == "Carlos Cajero"
    assert ranking[0]["isCritical"] is True  # total loss = -30.0 (|loss| > 20)

    # Cleanup
    db.query(AuditoriaLog).filter(AuditoriaLog.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 7 & 8. PRÉSTAMOS UVC (GET /tesoreria/prestamos/resumen & POST /tesoreria/prestamos-uvc)
# ==============================================================================

def test_prestamos_uvc_crud_and_multitenant(setup_db):
    """Prueba GET /tesoreria/prestamos/resumen y POST /tesoreria/prestamos-uvc con aislamiento."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "PrestamosA")
    tenant_b, user_b = _create_tenant_and_user(db, "PrestamosB")

    # Tasa de cambio para A
    tasa_a = TasaCambio(tenant_id=tenant_a.id, fecha=datetime.now(timezone.utc), valor_ves=Decimal("50.00"), fuente="BCV")
    db.add(tasa_a)
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # 1. POST /tesoreria/prestamos-uvc
    payload = {
        "descripcion": "Préstamo Capital de Trabajo",
        "monto_uvc": 1000.0,
        "tasa": 15.0,
        "tasa_cambio_bs": 50.0
    }
    res_post = client.post("/tesoreria/prestamos-uvc", json=payload)
    assert res_post.status_code == 200
    assert res_post.json()["ok"] is True

    # Verificar en DB
    prestamo_db = db.query(PrestamoUVC).filter(PrestamoUVC.tenant_id == tenant_a.id).first()
    assert prestamo_db is not None
    assert prestamo_db.descripcion == "Préstamo Capital de Trabajo"
    assert float(prestamo_db.monto_uvc) == 1000.0

    # 2. GET /tesoreria/prestamos/resumen
    res_get = client.get("/tesoreria/prestamos/resumen")
    assert res_get.status_code == 200
    data = res_get.json()
    assert "metricas" in data
    assert data["metricas"]["capital_pendiente_uvc"] == "1,000.00 UVC"
    assert len(data["creditos"]) == 1
    assert data["creditos"][0]["descripcion"] == "Préstamo Capital de Trabajo"

    # Cleanup
    db.query(PrestamoUVC).filter(PrestamoUVC.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 9 & 10. PRESUPUESTO Y DESVIACIÓN (GET /tesoreria/presupuesto & GET /tesoreria/presupuesto/desviacion)
# ==============================================================================

def test_presupuesto_y_desviacion_and_multitenant(setup_db):
    """Prueba GET /tesoreria/presupuesto y GET /tesoreria/presupuesto/desviacion con aislamiento."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "PresupuestoA")
    tenant_b, user_b = _create_tenant_and_user(db, "PresupuestoB")

    periodo_str = "2026-08"
    p_a = PresupuestoPartida(
        tenant_id=tenant_a.id,
        centro_costo="Operaciones",
        concepto="Mantenimiento Equipos",
        presupuestado_usd=Decimal("500.00"),
        ejecutado_usd=Decimal("600.00"),
        periodo=periodo_str,
        estado="ACTIVO"
    )
    p_b = PresupuestoPartida(
        tenant_id=tenant_b.id,
        centro_costo="Marketing",
        concepto="Publicidad Digital",
        presupuestado_usd=Decimal("1000.00"),
        ejecutado_usd=Decimal("800.00"),
        periodo=periodo_str,
        estado="ACTIVO"
    )
    db.add_all([p_a, p_b])
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # 1. GET /tesoreria/presupuesto
    res_pre = client.get(f"/tesoreria/presupuesto?periodo={periodo_str}")
    assert res_pre.status_code == 200
    data_pre = res_pre.json()
    assert data_pre["periodo"] == periodo_str
    assert len(data_pre["partidas"]) == 1
    assert data_pre["partidas"][0]["concepto"] == "Mantenimiento Equipos"
    assert data_pre["partidas"][0]["presupuestado"] == 500.0
    assert data_pre["partidas"][0]["ejecutado"] == 600.0

    # 2. GET /tesoreria/presupuesto/desviacion
    res_desv = client.get(f"/tesoreria/presupuesto/desviacion?periodo={periodo_str}")
    assert res_desv.status_code == 200
    data_desv = res_desv.json()
    assert "metricas" in data_desv
    assert "desviacion_total" in data_desv["metricas"]
    assert len(data_desv["breakdown"]) == 1
    assert data_desv["breakdown"][0]["item"] == "Mantenimiento Equipos"
    assert data_desv["breakdown"][0]["isOver"] is True

    # Cleanup
    db.query(PresupuestoPartida).filter(PresupuestoPartida.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 11, 12 & 16. INVERSIONES (GET /inversiones/resumen, POST /inversiones & GET /inversiones/exportar)
# ==============================================================================

def test_inversiones_crud_resumen_y_exportar_and_multitenant(setup_db):
    """Prueba GET /tesoreria/inversiones/resumen, POST /tesoreria/inversiones y exportar Excel con aislamiento."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "InversionesA")
    tenant_b, user_b = _create_tenant_and_user(db, "InversionesB")

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # 1. POST /tesoreria/inversiones (Registrar colocación)
    payload = {
        "nombre": "Certificado Depósito Banesco",
        "plazo_dias": 60,
        "capital_bs": 50000.0,
        "tasa_interes_anual": 45.0,
        "tasa_cambio_inicial": 50.0
    }
    res_post = client.post("/tesoreria/inversiones", json=payload)
    assert res_post.status_code == 200
    assert res_post.json()["ok"] is True

    # Verificar en DB
    inv_db = db.query(ColocacionInversion).filter(ColocacionInversion.tenant_id == tenant_a.id).first()
    assert inv_db is not None
    assert inv_db.nombre == "Certificado Depósito Banesco"
    assert inv_db.plazo_dias == 60

    # 2. GET /tesoreria/inversiones/resumen
    res_resumen = client.get("/tesoreria/inversiones/resumen")
    assert res_resumen.status_code == 200
    data_resumen = res_resumen.json()
    assert "metricas" in data_resumen
    assert len(data_resumen["colocaciones"]) == 1
    assert data_resumen["colocaciones"][0]["name"] == "Certificado Depósito Banesco"

    # 3. GET /tesoreria/inversiones/exportar (Excel)
    res_export = client.get("/tesoreria/inversiones/exportar")
    assert res_export.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res_export.headers.get("content-type", "")
    assert len(res_export.content) > 0

    # Cleanup
    db.query(ColocacionInversion).filter(ColocacionInversion.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 13. IMPORTAR EXTRACTO BANCARIO (POST /tesoreria/importar)
# ==============================================================================

def test_importar_extracto_bancario_and_multitenant(setup_db):
    """Prueba POST /tesoreria/importar conciliando contra movimiento interno y creando nuevos."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "ImportA")
    tenant_b, user_b = _create_tenant_and_user(db, "ImportB")

    cta_a = CuentaBancaria(tenant_id=tenant_a.id, banco="Banco Import A", numero_cuenta="01020000000000000010", moneda="USD", saldo_actual_usd=Decimal("500.00"), activa=True)
    db.add(cta_a)
    db.commit()
    db.refresh(cta_a)

    now = datetime.now(timezone.utc)
    # Movimiento interno previo pendiente de conciliar ($100 ingreso)
    mov_interno = MovimientoBancario(
        tenant_id=tenant_a.id,
        cuenta_id=cta_a.id,
        fecha=now,
        concepto="Cobro previo pendiente",
        monto_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("50.0"),
        tipo="INGRESO",
        referencia="REF-9999",
        estado="ACTIVO"
    )
    db.add(mov_interno)
    db.commit()
    db.refresh(mov_interno)

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # Enviar extracto con: 1 movimiento que coincide ($100) y 1 nuevo ($50)
    payload = {
        "cuenta_id": cta_a.id,
        "movimientos": [
            {
                "fecha": now.strftime("%Y-%m-%d"),
                "referencia": "REF-9999",
                "concepto": "Abono cliente match",
                "monto": 5000.0  # 5000 Bs / 50 Bs/$ = $100
            },
            {
                "fecha": now.strftime("%Y-%m-%d"),
                "referencia": "REF-NEW-1",
                "concepto": "Comisión bancaria nueva",
                "monto": -2500.0 # -2500 Bs / 50 Bs/$ = -$50
            }
        ]
    }
    # Tasa mock para tenant A
    tasa = TasaCambio(tenant_id=tenant_a.id, fecha=now, valor_ves=Decimal("50.00"), fuente="BCV")
    db.add(tasa)
    db.commit()

    res_imp = client.post("/tesoreria/importar", json=payload)
    assert res_imp.status_code == 200
    data_imp = res_imp.json()
    assert data_imp["ok"] is True
    assert data_imp["conciliados"] == 1
    assert data_imp["nuevos"] == 1

    # Verificar estado del movimiento interno en DB
    db.refresh(mov_interno)
    assert mov_interno.estado == "CONCILIADO"

    # Verificar movimiento nuevo insertado
    mov_nuevo = db.query(MovimientoBancario).filter(MovimientoBancario.referencia == "REF-NEW-1").first()
    assert mov_nuevo is not None
    assert mov_nuevo.tenant_id == tenant_a.id
    assert mov_nuevo.estado == "ACTIVO"

    # Cleanup
    db.query(MovimientoBancario).filter(MovimientoBancario.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 14 & 15. MOVIMIENTOS DE CAJA (GET /tesoreria/movimientos-caja & POST /tesoreria/movimientos-caja)
# ==============================================================================

def test_movimientos_caja_crud_and_multitenant(setup_db):
    """Prueba GET y POST de /tesoreria/movimientos-caja con métricas de deducción y soporte."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "CajaA")
    tenant_b, user_b = _create_tenant_and_user(db, "CajaB")

    cta_caja_a = CuentaBancaria(tenant_id=tenant_a.id, banco="Caja Principal A", numero_cuenta="00000000000000000001", moneda="USD", saldo_actual_usd=Decimal("200.00"), activa=True)
    db.add(cta_caja_a)
    db.commit()
    db.refresh(cta_caja_a)

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # 1. POST /tesoreria/movimientos-caja (Registrar egreso)
    payload = {
        "cuenta_id": cta_caja_a.id,
        "concepto": "Compra de insumos de limpieza",
        "monto_usd": 30.0,
        "tipo": "EGRESO",
        "referencia": "FAC-CLEAN-01",
        "tasa_cambio_bs": 50.0
    }
    res_post = client.post("/tesoreria/movimientos-caja", json=payload)
    assert res_post.status_code == 200
    assert res_post.json()["ok"] is True
    mov_id = res_post.json()["id"]

    # Verificar saldo de caja actualizado en DB
    db.refresh(cta_caja_a)
    assert float(cta_caja_a.saldo_actual_usd) == 170.0  # 200 - 30

    # 2. GET /tesoreria/movimientos-caja
    res_get = client.get("/tesoreria/movimientos-caja")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert "metricas" in data_get
    assert data_get["metricas"]["saldo_caja"] == "$170.00"
    assert len(data_get["movimientos"]) == 1
    assert data_get["movimientos"][0]["desc"] == "Compra de insumos de limpieza"
    assert data_get["movimientos"][0]["amount"] == "-$30.00"
    assert data_get["movimientos"][0]["support"] == "Factura"

    # Cleanup
    db.query(MovimientoBancario).filter(MovimientoBancario.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(CuentaBancaria).filter(CuentaBancaria.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()


# ==============================================================================
# 17. COBRANZAS: ESTADO DE CUENTA CLIENTE (GET /cobranzas/estado-cuenta)
# ==============================================================================

def test_estado_cuenta_cliente_and_multitenant(setup_db):
    """Prueba GET /cobranzas/estado-cuenta con cliente_id, rif y fallback a primer cliente, y aislamiento multi-tenant."""
    db = SessionLocal()
    tenant_a, user_a = _create_tenant_and_user(db, "EstadoCtaA")
    tenant_b, user_b = _create_tenant_and_user(db, "EstadoCtaB")

    cli_a = Cliente(tenant_id=tenant_a.id, rif="J-55555555-5", nombre="Cliente Estado A", email="estado_a@test.com")
    cli_b = Cliente(tenant_id=tenant_b.id, rif="J-66666666-6", nombre="Cliente Estado B", email="estado_b@test.com")
    db.add_all([cli_a, cli_b])
    db.commit()
    db.refresh(cli_a)
    db.refresh(cli_b)

    now = datetime.now(timezone.utc)
    cxc_a = CuentaPorCobrar(
        tenant_id=tenant_a.id,
        cliente_id=cli_a.id,
        numero_documento="FAC-EST-01",
        monto_total_usd=Decimal("400.00"),
        monto_pagado_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("50.0"),
        fecha_emision=now,
        fecha_vencimiento=now + timedelta(days=30),
        estado="PENDIENTE"
    )
    tasa_a = TasaCambio(tenant_id=tenant_a.id, fecha=now, valor_ves=Decimal("50.00"), fuente="BCV")
    db.add_all([cxc_a, tasa_a])
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: user_a
    client = TestClient(app)

    # 1. Consulta por cliente_id
    res_id = client.get(f"/cobranzas/estado-cuenta?cliente_id={cli_a.id}")
    assert res_id.status_code == 200
    data_id = res_id.json()
    assert data_id["cliente"]["nombre"] == "Cliente Estado A"
    assert len(data_id["movimientos"]) == 1
    assert data_id["movimientos"][0]["doc"] == "FAC-EST-01"
    assert data_id["movimientos"][0]["debitUsd"] == "$400.00"
    assert data_id["movimientos"][0]["creditUsd"] == "$100.00"
    kpis = {k["label"]: k["value"] for k in data_id["kpis"]}
    assert kpis["SALDO EXIGIBLE (USD)"] == "$300.00"
    assert kpis["DOCUMENTOS ACTIVOS"] == "1"

    # 2. Consulta por rif
    res_rif = client.get(f"/cobranzas/estado-cuenta?rif={cli_a.rif}")
    assert res_rif.status_code == 200
    assert res_rif.json()["cliente"]["rif"] == "J-55555555-5"

    # 3. Aislamiento multi-tenant: intentar consultar cliente de Tenant B siendo Tenant A -> no devuelve datos del cliente ajeno
    res_b = client.get(f"/cobranzas/estado-cuenta?cliente_id={cli_b.id}")
    assert res_b.status_code == 200
    # No encuentra cli_b en tenant_a, cae en None o lista vacía de movimientos de ese cliente
    assert res_b.json()["cliente"] is None or res_b.json()["cliente"]["id"] != cli_b.id

    # Cleanup
    db.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Cliente).filter(Cliente.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
    db.query(Profile).filter(Profile.id.in_([user_a.id, user_b.id])).delete()
    db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
    db.commit()
    db.close()
