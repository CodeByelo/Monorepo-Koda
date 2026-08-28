import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
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
from backend.models.operations import Venta, Cliente
from backend.models.core import TasaCambio
from backend.models.erp_extended import CuentaPorCobrar, CuentaBancaria, MovimientoBancario
from backend.routers.operaciones.cobranzas import _sync_cxc_desde_ventas, procesar_aplicacion


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


def test_bug1_sync_cxc_preserva_cliente_id_real(db_session):
    """
    Bug 1: _sync_cxc_desde_ventas asignaba todas las CxC al primer cliente del tenant (clientes[0]).
    Verifica que cada CxC generada toma el cliente_id real de su venta correspondiente.
    """
    tenant_id = uuid.uuid4()

    cli1 = Cliente(nombre="Cliente Uno", rif="J-11111111-1", tenant_id=tenant_id)
    cli2 = Cliente(nombre="Cliente Dos", rif="J-22222222-2", tenant_id=tenant_id)
    db_session.add_all([cli1, cli2])
    db_session.flush()

    v1 = Venta(
        numero_factura="FAC-CRED-001",
        cliente_id=cli1.id,
        subtotal_usd=Decimal("100"),
        iva_usd=Decimal("16"),
        total_usd=Decimal("116"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("36.5"),
        estado="ACTIVA",
        tenant_id=tenant_id
    )
    v2 = Venta(
        numero_factura="FAC-CRED-002",
        cliente_id=cli2.id,
        subtotal_usd=Decimal("200"),
        iva_usd=Decimal("32"),
        total_usd=Decimal("232"),
        metodo_pago="PagoMovil",
        tasa_cambio_bs=Decimal("36.5"),
        estado="ACTIVA",
        tenant_id=tenant_id
    )
    # Venta sin cliente asignado (cliente_id = None)
    v3 = Venta(
        numero_factura="FAC-CRED-003",
        cliente_id=None,
        subtotal_usd=Decimal("50"),
        iva_usd=Decimal("8"),
        total_usd=Decimal("58"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("36.5"),
        estado="ACTIVA",
        tenant_id=tenant_id
    )
    db_session.add_all([v1, v2, v3])
    db_session.commit()

    _sync_cxc_desde_ventas(db_session, tenant_id)

    cxc_list = db_session.query(CuentaPorCobrar).filter(CuentaPorCobrar.tenant_id == tenant_id).order_by(CuentaPorCobrar.id).all()
    # Solo las 2 ventas con cliente_id válido generan CxC
    assert len(cxc_list) == 2

    cxc1 = next(c for c in cxc_list if c.numero_documento == "FAC-CRED-001")
    cxc2 = next(c for c in cxc_list if c.numero_documento == "FAC-CRED-002")

    assert cxc1.cliente_id == cli1.id
    assert cxc2.cliente_id == cli2.id


def test_bug2_procesar_aplicacion_fallback_tasa_bcv(db_session):
    """
    Bug 2: procesar_aplicacion usaba fallback de tasa hardcodeado a 1.0 al crear MovimientoBancario
    si cxc.tasa_cambio_bs era falsy.
    Verifica que se usa la tasa_actual() del tenant (ej. 784.66) como fallback.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    cli = Cliente(nombre="Cliente Test", rif="J-33333333-3", tenant_id=tenant_id)
    db_session.add(cli)
    db_session.flush()

    from backend.models.erp_extended import CuentaContable
    cta_banco = CuentaContable(
        codigo="1.1.01",
        nombre="Caja y Bancos",
        tipo="ACTIVO",
        tenant_id=tenant_id
    )
    cta_cxc = CuentaContable(
        codigo="1.1.02",
        nombre="Cuentas por Cobrar",
        tipo="ACTIVO",
        tenant_id=tenant_id
    )
    banco = CuentaBancaria(
        banco="Banesco USD",
        numero_cuenta="0134-0000-0000",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    tasa_activa = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("784.66"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    # CxC con tasa_cambio_bs en 0 / None
    cxc = CuentaPorCobrar(
        cliente_id=cli.id,
        numero_documento="FAC-SIN-TASA",
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("0"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add_all([cta_banco, cta_cxc, banco, tasa_activa, cxc])
    db_session.commit()

    body = {
        "factura_id": "FAC-SIN-TASA",
        "monto": "100.00",
        "metodos": [
            {
                "type": "Transferencia",
                "amount": "100.00",
                "account": "Banesco USD",
                "ref": "REF-BAN-1"
            }
        ]
    }

    res = procesar_aplicacion(body=body, db=db_session, current_user=user)
    assert res["ok"] is True

    mov = db_session.query(MovimientoBancario).filter(MovimientoBancario.tenant_id == tenant_id).first()
    assert mov is not None
    assert float(mov.tasa_cambio_bs) == 784.66
