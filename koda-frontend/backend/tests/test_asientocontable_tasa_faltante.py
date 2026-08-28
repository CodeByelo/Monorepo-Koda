import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, date
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.operations import Producto, KardexMovimiento, AjusteInventario
from backend.models.erp_extended import Almacen, StockPorAlmacen
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.fiscal import INPCIndice
from backend.core.security import get_current_user
from backend.services.auth import get_current_user_from_token


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def clean_dependency_overrides():
    original_get_current_user = app.dependency_overrides.get(get_current_user)
    original_get_current_user_from_token = app.dependency_overrides.get(get_current_user_from_token)
    yield
    if original_get_current_user is not None:
        app.dependency_overrides[get_current_user] = original_get_current_user
    else:
        app.dependency_overrides.pop(get_current_user, None)
    if original_get_current_user_from_token is not None:
        app.dependency_overrides[get_current_user_from_token] = original_get_current_user_from_token
    else:
        app.dependency_overrides.pop(get_current_user_from_token, None)


def _set_auth_override(user):
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_user_from_token] = lambda: user


def _create_tenant_and_admin(db, name_prefix="TasaFaltante"):
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"{name_prefix} {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"admin_{uuid.uuid4().hex[:6]}",
        nombre="Admin",
        apellido="Tester",
        email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,  # Admin / Gerente
        tenant_id=tenant_id,
        estado=1
    )
    db.add(tenant)
    db.flush()
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)
    return tenant, user


def _create_almacen_and_producto(db, tenant_id, stock_inicial=Decimal("50.00"), costo_usd=Decimal("10.00")):
    almacen = Almacen(
        codigo=f"ALM-{uuid.uuid4().hex[:6]}",
        nombre=f"Almacen Central {uuid.uuid4().hex[:4]}",
        tipo="ALMACEN",
        tenant_id=tenant_id
    )
    db.add(almacen)
    db.flush()

    producto = Producto(
        sku=f"SKU-{uuid.uuid4().hex[:6]}",
        nombre="Producto Ajuste Test",
        precio_usd=Decimal("20.00"),
        costo_usd=costo_usd,
        stock=stock_inicial,
        stock_minimo=Decimal("5.00"),
        es_exento=False,
        tenant_id=tenant_id
    )
    db.add(producto)
    db.flush()

    stock_alm = StockPorAlmacen(
        producto_id=producto.id,
        almacen_id=almacen.id,
        cantidad=stock_inicial,
        tenant_id=tenant_id
    )
    db.add(stock_alm)
    db.commit()
    db.refresh(almacen)
    db.refresh(producto)
    return almacen, producto


def test_ajuste_inventario_merma_crea_asiento_con_tasa(setup_db):
    """
    POST /inventario/ajustes/{id}/aprobar (con cantidad negativa: merma)
    Verifica que el AsientoContable resultante tenga tasa_cambio_bs seteado y > 0.
    """
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "Merma")
    almacen, producto = _create_almacen_and_producto(db, tenant.id, stock_inicial=Decimal("50.00"), costo_usd=Decimal("10.00"))

    # Registrar tasa de cambio BCV
    tasa = TasaCambio(
        tenant_id=tenant.id,
        fecha=datetime.now(timezone.utc),
        valor_ves=Decimal("55.50"),
        fuente="BCV"
    )
    db.add(tasa)

    # Proponer ajuste de merma (-5)
    ajuste = AjusteInventario(
        producto_id=producto.id,
        cantidad=Decimal("-5.00"),
        motivo="Merma por daño en depósito",
        almacen_id=almacen.id,
        estado="PENDIENTE",
        tenant_id=tenant.id
    )
    db.add(ajuste)
    db.commit()
    db.refresh(ajuste)

    _set_auth_override(admin)
    client = TestClient(app)

    res = client.post(
        f"/inventario/ajustes/{ajuste.id}/aprobar",
        headers={"X-Idempotency-Key": str(uuid.uuid4())}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["estado"] == "APROBADO"

    # Verificar AsientoContable en DB
    ref = f"AJU-{str(ajuste.id).zfill(6)}"
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == ref,
        AsientoContable.tenant_id == tenant.id
    ).first()

    assert asiento is not None
    assert asiento.tasa_cambio_bs is not None
    assert float(asiento.tasa_cambio_bs) == 55.50
    assert asiento.tasa_cambio_bs > 0
    # Monto total: 5 unid * 10 usd * 55.50 = 2775.00 Bs
    assert float(asiento.total_debe) == 2775.00
    assert float(asiento.total_haber) == 2775.00
    assert len(asiento.detalles) == 2

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(KardexMovimiento).filter(KardexMovimiento.tenant_id == tenant.id).delete()
    db.query(AjusteInventario).filter(AjusteInventario.tenant_id == tenant.id).delete()
    db.query(StockPorAlmacen).filter(StockPorAlmacen.tenant_id == tenant.id).delete()
    db.query(Producto).filter(Producto.tenant_id == tenant.id).delete()
    db.query(Almacen).filter(Almacen.tenant_id == tenant.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_ajuste_inventario_sobrante_crea_asiento_con_tasa(setup_db):
    """
    POST /inventario/ajustes/{id}/aprobar (con cantidad positiva: sobrante)
    Verifica que el AsientoContable resultante tenga tasa_cambio_bs seteado y > 0.
    """
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "Sobrante")
    almacen, producto = _create_almacen_and_producto(db, tenant.id, stock_inicial=Decimal("20.00"), costo_usd=Decimal("15.00"))

    # Registrar tasa de cambio BCV
    tasa = TasaCambio(
        tenant_id=tenant.id,
        fecha=datetime.now(timezone.utc),
        valor_ves=Decimal("60.00"),
        fuente="BCV"
    )
    db.add(tasa)

    # Proponer ajuste de sobrante (+10)
    ajuste = AjusteInventario(
        producto_id=producto.id,
        cantidad=Decimal("10.00"),
        motivo="Sobrante en auditoria fisica",
        almacen_id=almacen.id,
        estado="PENDIENTE",
        tenant_id=tenant.id
    )
    db.add(ajuste)
    db.commit()
    db.refresh(ajuste)

    _set_auth_override(admin)
    client = TestClient(app)

    res = client.post(
        f"/inventario/ajustes/{ajuste.id}/aprobar",
        headers={"X-Idempotency-Key": str(uuid.uuid4())}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["estado"] == "APROBADO"

    # Verificar AsientoContable en DB
    ref = f"AJU-{str(ajuste.id).zfill(6)}"
    asiento = db.query(AsientoContable).filter(
        AsientoContable.referencia == ref,
        AsientoContable.tenant_id == tenant.id
    ).first()

    assert asiento is not None
    assert asiento.tasa_cambio_bs is not None
    assert float(asiento.tasa_cambio_bs) == 60.00
    assert asiento.tasa_cambio_bs > 0
    # Monto total: 10 unid * 15 usd * 60.00 = 9000.00 Bs
    assert float(asiento.total_debe) == 9000.00
    assert float(asiento.total_haber) == 9000.00
    assert len(asiento.detalles) == 2

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(KardexMovimiento).filter(KardexMovimiento.tenant_id == tenant.id).delete()
    db.query(AjusteInventario).filter(AjusteInventario.tenant_id == tenant.id).delete()
    db.query(StockPorAlmacen).filter(StockPorAlmacen.tenant_id == tenant.id).delete()
    db.query(Producto).filter(Producto.tenant_id == tenant.id).delete()
    db.query(Almacen).filter(Almacen.tenant_id == tenant.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_ajuste_inflacion_ejecutar_crea_asiento_con_tasa(setup_db):
    """
    POST /contabilidad/ajuste-inflacion/ejecutar con datos que generen total_axi > 0
    Verifica que el AsientoContable resultante tenga tasa_cambio_bs seteado y > 0.
    """
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "Inflacion")

    # Registrar tasa de cambio BCV
    tasa = TasaCambio(
        tenant_id=tenant.id,
        fecha=datetime.now(timezone.utc),
        valor_ves=Decimal("45.00"),
        fuente="BCV"
    )
    db.add(tasa)

    # Crear índices INPC para el cálculo
    inpc_cierre = INPCIndice(anio=2026, mes=5, indice=Decimal("150.0000"), tenant_id=tenant.id)
    inpc_orig1 = INPCIndice(anio=2025, mes=10, indice=Decimal("100.0000"), tenant_id=tenant.id)
    inpc_orig2 = INPCIndice(anio=2025, mes=12, indice=Decimal("110.0000"), tenant_id=tenant.id)
    inpc_orig3 = INPCIndice(anio=2026, mes=3, indice=Decimal("120.0000"), tenant_id=tenant.id)
    db.add_all([inpc_cierre, inpc_orig1, inpc_orig2, inpc_orig3])

    # Crear productos con stock > 0 para generar AXI
    almacen, prod1 = _create_almacen_and_producto(db, tenant.id, stock_inicial=Decimal("100.00"), costo_usd=Decimal("5.00"))
    db.commit()

    _set_auth_override(admin)
    client = TestClient(app)

    res = client.post("/contabilidad/ajuste-inflacion/ejecutar", json={"periodo": "2026-05"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    asiento_id = data["asiento_id"]

    # Verificar AsientoContable en DB
    asiento = db.query(AsientoContable).filter(
        AsientoContable.id == asiento_id,
        AsientoContable.tenant_id == tenant.id
    ).first()

    assert asiento is not None
    assert asiento.tasa_cambio_bs is not None
    assert float(asiento.tasa_cambio_bs) == 45.00
    assert asiento.tasa_cambio_bs > 0
    assert asiento.total_debe > 0
    assert asiento.total_haber == asiento.total_debe
    assert len(asiento.detalles) == 2

    # Cleanup
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento.id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento.id).delete()
    db.query(INPCIndice).filter(INPCIndice.tenant_id == tenant.id).delete()
    db.query(StockPorAlmacen).filter(StockPorAlmacen.tenant_id == tenant.id).delete()
    db.query(Producto).filter(Producto.tenant_id == tenant.id).delete()
    db.query(Almacen).filter(Almacen.tenant_id == tenant.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()


def test_sin_tasa_cambio_usa_fallback_en_ambos_endpoints(setup_db):
    """
    Un caso donde NO haya ninguna TasaCambio cargada para el tenant:
    confirma que el sistema utiliza la tasa de respaldo oficial (784.66)
    y los AsientosContables resultantes tienen tasa_cambio_bs seteado en 784.66.
    """
    db = SessionLocal()
    tenant, admin = _create_tenant_and_admin(db, "SinTasa")
    almacen, producto = _create_almacen_and_producto(db, tenant.id, stock_inicial=Decimal("50.00"), costo_usd=Decimal("10.00"))

    # Crear propuesta de ajuste de inventario (-2 merma)
    ajuste = AjusteInventario(
        producto_id=producto.id,
        cantidad=Decimal("-2.00"),
        motivo="Merma test fallback tasa",
        almacen_id=almacen.id,
        estado="PENDIENTE",
        tenant_id=tenant.id
    )
    db.add(ajuste)

    # Crear índices INPC para que ajuste de inflación tenga total_axi > 0
    inpc_cierre = INPCIndice(anio=2026, mes=5, indice=Decimal("150.0000"), tenant_id=tenant.id)
    inpc_orig1 = INPCIndice(anio=2025, mes=10, indice=Decimal("100.0000"), tenant_id=tenant.id)
    inpc_orig2 = INPCIndice(anio=2025, mes=12, indice=Decimal("110.0000"), tenant_id=tenant.id)
    inpc_orig3 = INPCIndice(anio=2026, mes=3, indice=Decimal("120.0000"), tenant_id=tenant.id)
    db.add_all([inpc_cierre, inpc_orig1, inpc_orig2, inpc_orig3])
    db.commit()
    db.refresh(ajuste)

    _set_auth_override(admin)
    client = TestClient(app)

    # 1. Probar aprobar ajuste de inventario sin TasaCambio registrada
    res_inv = client.post(
        f"/inventario/ajustes/{ajuste.id}/aprobar",
        headers={"X-Idempotency-Key": str(uuid.uuid4())}
    )
    assert res_inv.status_code == 200, res_inv.text
    ref_inv = f"AJU-{str(ajuste.id).zfill(6)}"
    asiento_inv = db.query(AsientoContable).filter(
        AsientoContable.referencia == ref_inv,
        AsientoContable.tenant_id == tenant.id
    ).first()
    assert asiento_inv is not None
    assert asiento_inv.tasa_cambio_bs is not None
    assert float(asiento_inv.tasa_cambio_bs) == 784.66

    # 2. Probar ajuste por inflación sin TasaCambio registrada
    res_inf = client.post("/contabilidad/ajuste-inflacion/ejecutar", json={"periodo": "2026-05"})
    assert res_inf.status_code == 200, res_inf.text
    data_inf = res_inf.json()
    assert data_inf["ok"] is True
    asiento_id_inf = data_inf["asiento_id"]

    asiento_inf = db.query(AsientoContable).filter(
        AsientoContable.id == asiento_id_inf,
        AsientoContable.tenant_id == tenant.id
    ).first()
    assert asiento_inf is not None
    assert asiento_inf.tasa_cambio_bs is not None
    assert float(asiento_inf.tasa_cambio_bs) == 784.66

    # Cleanup
    asientos_ids = [a.id for a in [asiento_inv, asiento_inf] if a]
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id.in_(asientos_ids)).delete(synchronize_session=False)
    db.query(AsientoContable).filter(AsientoContable.tenant_id == tenant.id).delete()
    db.query(KardexMovimiento).filter(KardexMovimiento.tenant_id == tenant.id).delete()
    db.query(INPCIndice).filter(INPCIndice.tenant_id == tenant.id).delete()
    db.query(AjusteInventario).filter(AjusteInventario.tenant_id == tenant.id).delete()
    db.query(StockPorAlmacen).filter(StockPorAlmacen.tenant_id == tenant.id).delete()
    db.query(Producto).filter(Producto.tenant_id == tenant.id).delete()
    db.query(Almacen).filter(Almacen.tenant_id == tenant.id).delete()
    db.query(Profile).filter(Profile.tenant_id == tenant.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant.id).delete()
    db.commit()
    db.close()
