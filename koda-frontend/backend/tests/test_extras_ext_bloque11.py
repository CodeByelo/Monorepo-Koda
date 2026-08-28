import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock
import pytest

# Asegurar variables de entorno dummy si no están definidas para permitir la importación de módulos
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.core import TasaCambio
from backend.models.operations import Cliente, Producto, Venta, AjusteInventario
from backend.models.erp_extended import CuentaPorCobrar, Vendedor, NotaCredito
from backend.models.fiscal import CorrelativoFiscal
from backend.routers.extras_ext import (
    obtener_facturas_vendedor,
    principal_dashboard,
    crear_nota_credito,
    crear_vendedor,
    NotaCreditoCreate,
    VendedorCreate
)


@pytest.fixture(scope="function")
def test_engine():
    """Engine SQLite en memoria con schema public atado."""
    engine = create_engine("sqlite:///:memory:")
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


def test_bug1_obtener_facturas_vendedor_saldo_pendiente_calculado(db_session):
    """
    Bug 1: CuentaPorCobrar no tiene saldo_pendiente_usd.
    obtener_facturas_vendedor accedía a cxc.saldo_pendiente_usd lanzando AttributeError.
    Verifica que se calcula cxc.monto_total_usd - cxc.monto_pagado_usd correctamente.
    """
    tenant_id = uuid.uuid4()
    vendedor = Vendedor(nombre="Vendedor Test Bug 1", codigo="VEN-001", tenant_id=tenant_id)
    cliente = Cliente(rif="J-12345678-1", nombre="Cliente Bug 1", tenant_id=tenant_id)
    db_session.add_all([vendedor, cliente])
    db_session.commit()

    venta = Venta(
        cliente_id=cliente.id,
        vendedor_id=vendedor.id,
        numero_factura="FAC-BUG1-001",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        igtf_usd=Decimal("0.00"),
        total_usd=Decimal("116.00"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("784.66"),
        estado="ACTIVA",
        tenant_id=tenant_id
    )
    db_session.add(venta)
    db_session.commit()

    # CxC con pago parcial ($50.00 pagado de $116.00 total)
    cxc = CuentaPorCobrar(
        venta_id=venta.id,
        cliente_id=cliente.id,
        numero_documento="FAC-BUG1-001",
        monto_total_usd=Decimal("116.00"),
        monto_pagado_usd=Decimal("50.00"),
        tasa_cambio_bs=Decimal("784.66"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc) + timedelta(days=30),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add(cxc)
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    # No debe lanzar AttributeError: 'CuentaPorCobrar' object has no attribute 'saldo_pendiente_usd'
    res = obtener_facturas_vendedor(vendedor_id=vendedor.id, db=db_session, current_user=mock_user)
    assert len(res["facturas"]) == 1
    assert res["facturas"][0]["estado_pago"] == "PARCIAL"


def test_bug2_principal_dashboard_egresos_7d_calculado_desde_producto_costo(db_session):
    """
    Bug 2: AjusteInventario no tiene costo_total.
    principal_dashboard hacía getattr(aj, 'costo_total', None) dando 0.
    Verifica que se calcula abs(aj.cantidad) * producto.costo_usd para mermas (cantidad < 0).
    """
    tenant_id = uuid.uuid4()
    producto = Producto(
        sku="PROD-BUG2",
        nombre="Producto Merma Test",
        precio_usd=Decimal("20.00"),
        costo_usd=Decimal("15.00"),
        tenant_id=tenant_id
    )
    db_session.add(producto)
    db_session.commit()

    # Ajuste de merma de -10 unidades
    ajuste = AjusteInventario(
        producto_id=producto.id,
        cantidad=-10,
        motivo="Dañado en transporte",
        estado="APROBADO",
        fecha_solicitud=datetime.now(timezone.utc) - timedelta(days=2),
        tenant_id=tenant_id
    )
    db_session.add(ajuste)
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    res = principal_dashboard(db=db_session, current_user=mock_user)
    # egresos_7d debe ser 10 * 15.00 = 150.0 en resumen_operaciones.egresos
    assert res["resumen_operaciones"]["egresos"] == 150.0


def test_bug3_crear_nota_credito_correlativo_fiscal_nc_nd(db_session):
    """
    Bug 3: crear_nota_credito usaba count() en lugar de CorrelativoFiscal con with_for_update().
    Verifica que llamadas sucesivas de NC y ND generen correlativos atómicos consecutivos con prefijo apropiado.
    """
    from backend.models.erp_extended import CuentaContable
    tenant_id = uuid.uuid4()
    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id
    mock_user.id = uuid.uuid4()

    # Cuentas contables requeridas por ContabilidadService
    cta_ventas = CuentaContable(codigo="4.1.01", nombre="Ventas de Mercancía", tipo="INGRESO", tenant_id=tenant_id)
    cta_cxc = CuentaContable(codigo="1.1.02", nombre="Cuentas por Cobrar Comerciales", tipo="ACTIVO", tenant_id=tenant_id)
    cliente = Cliente(rif="J-99999999-9", nombre="Cliente NC", tenant_id=tenant_id)
    db_session.add_all([cta_ventas, cta_cxc, cliente])
    db_session.commit()

    venta = Venta(
        cliente_id=cliente.id,
        numero_factura="FAC-NC-001",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("200.00"),
        iva_usd=Decimal("32.00"),
        igtf_usd=Decimal("0.00"),
        total_usd=Decimal("232.00"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("784.66"),
        estado="ACTIVA",
        tenant_id=tenant_id
    )
    db_session.add(venta)
    db_session.commit()

    # 1. Nota de Crédito 1
    nc1_payload = NotaCreditoCreate(
        numero_factura="FAC-NC-001",
        monto=Decimal("50.00"),
        motivo="Devolución parcial",
        tipo="CREDITO"
    )
    res_nc1 = crear_nota_credito(payload=nc1_payload, db=db_session, current_user=mock_user)
    assert res_nc1["id"] == "NC-00000001"

    # 2. Nota de Crédito 2
    nc2_payload = NotaCreditoCreate(
        numero_factura="FAC-NC-001",
        monto=Decimal("30.00"),
        motivo="Descuento omitido",
        tipo="CREDITO"
    )
    res_nc2 = crear_nota_credito(payload=nc2_payload, db=db_session, current_user=mock_user)
    assert res_nc2["id"] == "NC-00000002"

    # 3. Nota de Débito 1
    nd1_payload = NotaCreditoCreate(
        numero_factura="FAC-NC-001",
        monto=Decimal("10.00"),
        motivo="Cargo mora",
        tipo="DEBITO"
    )
    res_nd1 = crear_nota_credito(payload=nd1_payload, db=db_session, current_user=mock_user)
    assert res_nd1["id"] == "ND-00000001"

    # Verificación en CorrelativoFiscal
    corr_nc = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "NOTA_CREDITO",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_nc.siguiente_numero == 3

    corr_nd = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "NOTA_DEBITO",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_nd.siguiente_numero == 2


def test_bug4_crear_vendedor_correlativo_fiscal_codigo(db_session):
    """
    Bug 4: crear_vendedor usaba count() para el código automático.
    Verifica que se genera con CorrelativoFiscal (tipo_documento='VENDEDOR', prefijo='VEN-').
    """
    tenant_id = uuid.uuid4()
    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    v1_payload = VendedorCreate(nombre="Vendedor Auto 1")
    v2_payload = VendedorCreate(nombre="Vendedor Auto 2")

    res_v1 = crear_vendedor(body=v1_payload, db=db_session, current_user=mock_user)
    res_v2 = crear_vendedor(body=v2_payload, db=db_session, current_user=mock_user)

    assert res_v1.codigo == "VEN-001"
    assert res_v2.codigo == "VEN-002"

    corr_ven = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "VENDEDOR",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_ven.siguiente_numero == 3
