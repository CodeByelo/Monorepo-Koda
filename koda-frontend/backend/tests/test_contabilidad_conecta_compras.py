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
from backend.models.operations import Proveedor
from backend.models.erp_extended import Compra, CuentaPorPagar
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_compra_genera_asiento_contable_automatico(setup_db):
    """Verifica que POST /compras genere un asiento contable automático con debe y haber balanceados."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Compra Test {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Comprador",
        apellido="Test",
        email=f"comprador_{uuid.uuid4().hex[:6]}@test.com",
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

    proveedor = Proveedor(
        nombre="Distribuidora Mayorista C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        contacto="Ventas",
        telefono="0212-0000000",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    # 1. Compra de BIENES_INVENTARIO
    factura_inv = f"FAC-INV-{uuid.uuid4().hex[:6]}"
    payload_inv = {
        "proveedor_id": proveedor.id,
        "numero_factura": factura_inv,
        "numero_control": "00-001234",
        "subtotal_usd": "100.00",
        "iva_usd": "16.00",
        "total_usd": "116.00",
        "tasa_cambio_bs": "50.00",
        "categoria": "BIENES_INVENTARIO",
        "dias_credito": 15
    }

    res_inv = client.post("/compras", json=payload_inv)
    assert res_inv.status_code == 200, res_inv.text
    compra_inv_id = res_inv.json()["id"]

    # Verificar que existe el asiento contable para la compra de inventario
    asiento_inv = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COMPRA-{factura_inv}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento_inv is not None
    assert asiento_inv.total_debe_usd == Decimal("116.00")
    assert asiento_inv.total_haber_usd == Decimal("116.00")

    cuentas_inv_map = {d.cuenta_codigo: d for d in asiento_inv.detalles}
    assert "1.1.03" in cuentas_inv_map  # Inventario de Mercancía
    assert cuentas_inv_map["1.1.03"].debe_usd == Decimal("100.00")
    assert "1.1.04" in cuentas_inv_map  # IVA Crédito Fiscal
    assert cuentas_inv_map["1.1.04"].debe_usd == Decimal("16.00")
    assert "2.1.01" in cuentas_inv_map  # Cuentas por Pagar Comerciales
    assert cuentas_inv_map["2.1.01"].haber_usd == Decimal("116.00")

    # 2. Compra de GASTOS / SERVICIOS
    factura_srv = f"FAC-SRV-{uuid.uuid4().hex[:6]}"
    payload_srv = {
        "proveedor_id": proveedor.id,
        "numero_factura": factura_srv,
        "numero_control": "00-001235",
        "subtotal_usd": "200.00",
        "iva_usd": "32.00",
        "total_usd": "232.00",
        "tasa_cambio_bs": "50.00",
        "categoria": "SERVICIOS",
        "dias_credito": 30
    }

    res_srv = client.post("/compras", json=payload_srv)
    assert res_srv.status_code == 200, res_srv.text
    compra_srv_id = res_srv.json()["id"]

    asiento_srv = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"COMPRA-{factura_srv}",
        AsientoContable.tenant_id == tenant_id
    ).first()
    assert asiento_srv is not None
    assert asiento_srv.total_debe_usd == Decimal("232.00")
    assert asiento_srv.total_haber_usd == Decimal("232.00")

    cuentas_srv_map = {d.cuenta_codigo: d for d in asiento_srv.detalles}
    assert "5.1.03" in cuentas_srv_map  # Otras Asignaciones (Gasto)
    assert cuentas_srv_map["5.1.03"].debe_usd == Decimal("200.00")
    assert "1.1.04" in cuentas_srv_map  # IVA Crédito Fiscal
    assert cuentas_srv_map["1.1.04"].debe_usd == Decimal("32.00")
    assert "2.1.01" in cuentas_srv_map  # Cuentas por Pagar Comerciales
    assert cuentas_srv_map["2.1.01"].haber_usd == Decimal("232.00")

    # Cleanup
    asiento_ids = [asiento_inv.id, asiento_srv.id]
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id.in_(asiento_ids)).delete(synchronize_session=False)
    db.query(AsientoContable).filter(AsientoContable.id.in_(asiento_ids)).delete(synchronize_session=False)
    db.query(CuentaPorPagar).filter(CuentaPorPagar.compra_id.in_([compra_inv_id, compra_srv_id])).delete(synchronize_session=False)
    db.query(Compra).filter(Compra.id.in_([compra_inv_id, compra_srv_id])).delete(synchronize_session=False)
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_compra_rechazada_en_periodo_cerrado_y_rollback_completo(setup_db):
    """Verifica que una compra en período cerrado falle y no guarde Compra, CxP ni Asiento."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cierre Compra {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Comprador",
        apellido="Test",
        email=f"comprador_{uuid.uuid4().hex[:6]}@test.com",
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

    proveedor = Proveedor(
        nombre="Proveedor Cierre S.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        contacto="Ventas",
        telefono="0212-1111111",
        tenant_id=tenant_id
    )
    db.add(proveedor)

    # Crear cierre para el período actual
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

    factura_bloqueada = f"FAC-BLOCKED-{uuid.uuid4().hex[:6]}"
    payload = {
        "proveedor_id": proveedor.id,
        "numero_factura": factura_bloqueada,
        "subtotal_usd": "300.00",
        "iva_usd": "48.00",
        "total_usd": "348.00",
        "tasa_cambio_bs": "50.00",
        "categoria": "BIENES_INVENTARIO",
        "fecha_emision": datetime.now(timezone.utc).isoformat()
    }

    res = client.post("/compras", json=payload)
    assert res.status_code in [400, 403], f"Expected 400 or 403, got {res.status_code}: {res.text}"
    assert "CERRADO" in res.text or "cerrado" in res.text

    # Verificar que NO quedó ningún rastro en BD (Rollback completo)
    compra_db = db.query(Compra).filter(Compra.numero_factura == factura_bloqueada, Compra.tenant_id == tenant_id).first()
    assert compra_db is None

    cxp_db = db.query(CuentaPorPagar).filter(CuentaPorPagar.numero_documento == factura_bloqueada, CuentaPorPagar.tenant_id == tenant_id).first()
    assert cxp_db is None

    asiento_db = db.query(AsientoContable).filter(AsientoContable.referencia == f"COMPRA-{factura_bloqueada}", AsientoContable.tenant_id == tenant_id).first()
    assert asiento_db is None

    # Cleanup
    db.query(CierrePeriodo).filter(CierrePeriodo.tenant_id == tenant_id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()


def test_compra_asiento_visible_en_diario_y_balance(setup_db):
    """Verifica que el asiento de compra aparezca en el Libro Diario y que el Balance cuadre."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Diario Balance {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Comprador",
        apellido="Test",
        email=f"comprador_{uuid.uuid4().hex[:6]}@test.com",
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

    proveedor = Proveedor(
        nombre="Comercializadora Balance C.A.",
        rif=f"J-{uuid.uuid4().hex[:8].upper()}",
        contacto="Ventas",
        telefono="0212-2222222",
        tenant_id=tenant_id
    )
    db.add(proveedor)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)

    factura = f"FAC-BAL-{uuid.uuid4().hex[:6]}"
    payload = {
        "proveedor_id": proveedor.id,
        "numero_factura": factura,
        "subtotal_usd": "500.00",
        "iva_usd": "80.00",
        "total_usd": "580.00",
        "tasa_cambio_bs": "50.00",
        "categoria": "BIENES_INVENTARIO"
    }

    res = client.post("/compras", json=payload)
    assert res.status_code == 200, res.text
    compra_id = res.json()["id"]

    # 1. Consultar GET /contabilidad/asientos
    res_asientos = client.get("/contabilidad/asientos")
    assert res_asientos.status_code == 200, res_asientos.text
    data_asientos = res_asientos.json()
    asiento_encontrado = next((a for a in data_asientos["data"] if a["referencia"] == f"COMPRA-{factura}"), None)
    assert asiento_encontrado is not None
    assert float(asiento_encontrado["total_debe_usd"]) == 580.0
    assert float(asiento_encontrado["total_haber_usd"]) == 580.0

    # 2. Consultar GET /contabilidad/balance-comprobacion
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    res_bal = client.get(f"/contabilidad/balance-comprobacion?periodo={current_period}")
    assert res_bal.status_code == 200, res_bal.text
    bal_data = res_bal.json()
    assert bal_data["totales"]["debe"] == 580.0
    assert bal_data["totales"]["haber"] == 580.0
    assert bal_data["totales"]["debe"] == bal_data["totales"]["haber"]

    # Cleanup
    asiento_id = asiento_encontrado["id"]
    db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == asiento_id).delete()
    db.query(AsientoContable).filter(AsientoContable.id == asiento_id).delete()
    db.query(CuentaPorPagar).filter(CuentaPorPagar.compra_id == compra_id).delete()
    db.query(Compra).filter(Compra.id == compra_id).delete()
    db.query(Proveedor).filter(Proveedor.id == proveedor.id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
