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
from backend.models.operations import Cliente, Producto, Venta, VentaDetalle
from backend.models.erp_extended import Cotizacion, CotizacionItem, OrdenVenta, NotaEntrega
from backend.models.fiscal import CorrelativoFiscal
from backend.schemas.operations import CotizacionCreate, NotaEntregaCreate
from backend.routers.operaciones.ventas import (
    crear_cotizacion,
    convertir_cotizacion_a_orden,
    crear_nota_entrega,
    generar_nota_entrega_desde_venta
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


def test_bug1_tasa_cambio_tenant_isolation_en_crear_cotizacion(db_session):
    """
    Bug 1: crear_cotizacion usaba la TasaCambio más reciente sin filtrar por tenant_id.
    Verifica que si el tenant A no tiene tasa propia pero existe una global (tenant_id IS NULL),
    usa la tasa global; y si el tenant B tiene su propia tasa, usa la suya aislada.
    """
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    # Tasa global antigua (784.66)
    tasa_global = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("784.66"),
        fecha=datetime.now(timezone.utc) - timedelta(days=1),
        tenant_id=None
    )
    # Tasa específica tenant B (900.00)
    tasa_b = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("900.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_b_id
    )
    db_session.add_all([tasa_global, tasa_b])

    cliente_a = Cliente(rif="J-11111111-1", nombre="Cliente A", tenant_id=tenant_a_id)
    cliente_b = Cliente(rif="J-22222222-2", nombre="Cliente B", tenant_id=tenant_b_id)
    db_session.add_all([cliente_a, cliente_b])
    db_session.commit()

    user_a = MagicMock()
    user_a.tenant_id = tenant_a_id
    user_a.id = uuid.uuid4()

    user_b = MagicMock()
    user_b.tenant_id = tenant_b_id
    user_b.id = uuid.uuid4()

    cot_payload_a = CotizacionCreate.model_validate({
        "client": "Cliente A",
        "emissionDate": "2026-08-28",
        "dueDate": "2026-09-28",
        "currency": "USD",
        "items": [{"description": "Item A", "quantity": 1.0, "price": 10.0}],
        "subtotal": Decimal("10.00"),
        "discountTotal": Decimal("0.00"),
        "totalFinal": Decimal("10.00")
    })
    cot_payload_b = CotizacionCreate.model_validate({
        "client": "Cliente B",
        "emissionDate": "2026-08-28",
        "dueDate": "2026-09-28",
        "currency": "USD",
        "items": [{"description": "Item B", "quantity": 1.0, "price": 10.0}],
        "subtotal": Decimal("10.00"),
        "discountTotal": Decimal("0.00"),
        "totalFinal": Decimal("10.00")
    })

    res_a = crear_cotizacion(cot_in=cot_payload_a, db=db_session, current_user=user_a)
    cot_a_db = db_session.query(Cotizacion).filter(Cotizacion.id == res_a["id"]).first()
    assert float(cot_a_db.tasa_cambio) == 784.66

    res_b = crear_cotizacion(cot_in=cot_payload_b, db=db_session, current_user=user_b)
    cot_b_db = db_session.query(Cotizacion).filter(Cotizacion.id == res_b["id"]).first()
    assert float(cot_b_db.tasa_cambio) == 900.00


def test_bug2_correlativo_fiscal_atomico_para_las_4_funciones(db_session):
    """
    Bug 2: Se reemplazó db.query(...).count() por CorrelativoFiscal con with_for_update() en 4 lugares:
    1. crear_cotizacion
    2. convertir_cotizacion_a_orden
    3. crear_nota_entrega
    4. generar_nota_entrega_desde_venta
    """
    tenant_id = uuid.uuid4()
    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id
    mock_user.id = uuid.uuid4()

    cliente = Cliente(rif="J-33333333-3", nombre="Cliente Test", tenant_id=tenant_id)
    producto = Producto(sku="PROD-01", nombre="Producto Test", precio_usd=Decimal("10.00"), costo_usd=Decimal("5.00"), tenant_id=tenant_id)
    db_session.add_all([cliente, producto])
    db_session.commit()

    # 1. crear_cotizacion (2 consecutivas)
    cot1_payload = CotizacionCreate.model_validate({
        "client": "Cliente Test",
        "emissionDate": "2026-08-28",
        "dueDate": "2026-09-28",
        "currency": "USD",
        "items": [{"description": "Item 1", "quantity": 1.0, "price": 10.0}],
        "subtotal": Decimal("10.00"),
        "discountTotal": Decimal("0.00"),
        "totalFinal": Decimal("10.00")
    })
    cot2_payload = CotizacionCreate.model_validate({
        "client": "Cliente Test",
        "emissionDate": "2026-08-28",
        "dueDate": "2026-09-28",
        "currency": "USD",
        "items": [{"description": "Item 2", "quantity": 1.0, "price": 10.0}],
        "subtotal": Decimal("10.00"),
        "discountTotal": Decimal("0.00"),
        "totalFinal": Decimal("10.00")
    })

    res_cot1 = crear_cotizacion(cot_in=cot1_payload, db=db_session, current_user=mock_user)
    res_cot2 = crear_cotizacion(cot_in=cot2_payload, db=db_session, current_user=mock_user)

    cot1 = db_session.query(Cotizacion).filter(Cotizacion.id == res_cot1["id"]).first()
    cot2 = db_session.query(Cotizacion).filter(Cotizacion.id == res_cot2["id"]).first()
    assert cot1.numero_cotizacion == "COT-2026-0001"
    assert cot2.numero_cotizacion == "COT-2026-0002"

    # Marcar cotizaciones como Aceptada para poder convertirlas a Orden
    cot1.estado = "Aceptada"
    cot2.estado = "Aceptada"
    db_session.commit()

    # Check CorrelativoFiscal registrado para COTIZACION
    corr_cot = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "COTIZACION",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_cot is not None
    assert corr_cot.siguiente_numero == 3

    # 2. convertir_cotizacion_a_orden (2 convertidas)
    res_ov1 = convertir_cotizacion_a_orden(id=cot1.id, db=db_session, current_user=mock_user)
    res_ov2 = convertir_cotizacion_a_orden(id=cot2.id, db=db_session, current_user=mock_user)

    ov1 = db_session.query(OrdenVenta).filter(OrdenVenta.id == res_ov1["orden_id"]).first()
    ov2 = db_session.query(OrdenVenta).filter(OrdenVenta.id == res_ov2["orden_id"]).first()
    year = datetime.now(timezone.utc).year
    assert ov1.numero == f"OV-{year}-0001"
    assert ov2.numero == f"OV-{year}-0002"

    corr_ov = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == f"ORDEN_VENTA_{year}",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_ov is not None
    assert corr_ov.siguiente_numero == 3

    # 3. crear_nota_entrega
    ne_payload = NotaEntregaCreate.model_validate({
        "client": "Cliente Test",
        "emissionDate": "2026-08-28",
        "logistics": {
            "carrier": "MRW",
            "vehiclePlate": "ABC-123",
            "destination": "Caracas",
            "notes": "Test Nota",
            "customFields": []
        },
        "items": [
            {"description": "Item Test", "quantity": 2.0}
        ]
    })
    res_ne1 = crear_nota_entrega(nota_in=ne_payload, db=db_session, current_user=mock_user)
    assert res_ne1["numero_nota"] == f"NE-{year}-0001"

    # 4. generar_nota_entrega_desde_venta
    venta = Venta(
        cliente_id=cliente.id,
        numero_factura="FAC-00000001",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        igtf_usd=Decimal("0.00"),
        total_usd=Decimal("116.00"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("784.66"),
        estado="EMITIDA",
        tenant_id=tenant_id
    )
    db_session.add(venta)
    db_session.commit()

    res_ne2 = generar_nota_entrega_desde_venta(id=venta.id, db=db_session, current_user=mock_user)
    assert res_ne2["numero_nota"] == f"NE-{year}-0002"

    corr_ne = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == f"NOTA_ENTREGA_{year}",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_ne is not None
    assert corr_ne.siguiente_numero == 3
