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
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.routers.contabilidad.reportes import (
    balance_comprobacion,
    balance_general,
    flujo_caja,
    exportar_flujo,
    monitor_forense
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


def test_bugs1_2_tasa_global_fallback_en_balance_comprobacion_y_general(db_session):
    """
    Bugs 1 y 2: Un tenant sin TasaCambio propia pero con una TasaCambio global (tenant_id IS NULL)
    debe usar la tasa global en balance_comprobacion y balance_general en vez de caer en 36.52.
    """
    tenant_id = uuid.uuid4()

    # Tasa global de 784.66
    tasa_global = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("784.66"),
        fecha=datetime.now(timezone.utc),
        tenant_id=None
    )
    db_session.add(tasa_global)
    db_session.commit()

    # Asiento descuadrado para forzar descuadre en balance_comprobacion (debe=100.00, haber=90.00 -> diff=10.00)
    asiento = AsientoContable(
        concepto="Asiento descuadrado",
        referencia="ASI-BUG1",
        fecha=datetime.now(timezone.utc),
        total_debe_usd=Decimal("100.00"),
        total_haber_usd=Decimal("90.00"),
        tasa_cambio_bs=Decimal("40.00"),
        estado="ACTIVO",
        tenant_id=tenant_id
    )
    db_session.add(asiento)
    db_session.commit()

    det = AsientoDetalle(
        asiento_id=asiento.id,
        cuenta_codigo="1.1.01",
        cuenta_nombre="Bancos",
        debe_usd=Decimal("100.00"),
        haber_usd=Decimal("90.00"),
        tenant_id=tenant_id
    )
    db_session.add(det)
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    periodo = datetime.now().strftime("%Y-%m")

    # 1. balance_comprobacion: diff_val = 10.00. Con tasa global 784.66 la diferencia en Bs es Bs. 7,846.60
    res_bc = balance_comprobacion(periodo=periodo, db=db_session, current_user=mock_user)
    esperado_desc = f"Bs. {10.0 * 784.66:,.2f}"
    assert res_bc["lectura"][0]["title"] == "Descuadre Detectado"
    assert esperado_desc in res_bc["lectura"][0]["desc"]
    assert "365.20" not in res_bc["lectura"][0]["desc"]

    # 2. balance_general: la cuenta 1.1.01 ("Bancos", Activo Corriente) tiene saldo_usd = 10.00 (100 - 90).
    # Con la tasa global 784.66, total_activo (totales.activos_ves) debe ser 7,846.60 (10.00 * 784.66), no 365.20 (10.00 * 36.52).
    res_bg = balance_general(periodo=periodo, db=db_session, current_user=mock_user)
    assert res_bg["totales"]["activos_usd"] == 10.0
    assert res_bg["totales"]["activos_ves"] == pytest.approx(10.0 * 784.66, 0.01)
    assert res_bg["totales"]["activos_ves"] != pytest.approx(10.0 * 36.52, 0.01)


def test_bug3_flujo_caja_exportar_pdf_y_excel_sin_claves_duplicadas(db_session):
    """
    Bug 3: flujo_caja devolvía dict con claves duplicadas ("inversion", "financiamiento"),
    pisando los floats numéricos con listas. exportar_flujo en pdf y excel lanzaba TypeError
    al intentar formatear list con :,.2f o number_format.
    """
    tenant_id = uuid.uuid4()
    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    periodo = datetime.now().strftime("%Y-%m")

    # Verificamos respuesta de flujo_caja
    res_fc = flujo_caja(periodo=periodo, db=db_session, current_user=mock_user)
    assert isinstance(res_fc["inversion"], float)
    assert isinstance(res_fc["financiamiento"], float)
    assert isinstance(res_fc["inversion_detalle"], list)
    assert isinstance(res_fc["financiamiento_detalle"], list)

    # Verificamos exportar_flujo en PDF
    resp_pdf = exportar_flujo(periodo=periodo, formato="pdf", db=db_session, current_user=mock_user)
    assert resp_pdf.media_type == "application/pdf"

    # Verificamos exportar_flujo en Excel
    resp_excel = exportar_flujo(periodo=periodo, formato="excel", db=db_session, current_user=mock_user)
    assert resp_excel.media_type in ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]


def test_bug4_monitor_forense_eager_loading(db_session):
    """
    Bug 4: monitor_forense debe ejecutar correctamente con joinedload en AsientoContable.detalles.
    """
    tenant_id = uuid.uuid4()

    asiento = AsientoContable(
        concepto="Asiento de prueba forense",
        referencia="ASI-TEST-001",
        fecha=datetime.now(timezone.utc),
        total_debe_usd=Decimal("100.00"),
        total_haber_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("40.00"),
        estado="ACTIVO",
        tenant_id=tenant_id
    )
    db_session.add(asiento)
    db_session.commit()

    det1 = AsientoDetalle(
        asiento_id=asiento.id,
        cuenta_codigo="1.1.01",
        cuenta_nombre="Bancos",
        debe_usd=Decimal("100.00"),
        haber_usd=Decimal("0.00"),
        tenant_id=tenant_id
    )
    det2 = AsientoDetalle(
        asiento_id=asiento.id,
        cuenta_codigo="2.1.01",
        cuenta_nombre="Cuentas por Pagar",
        debe_usd=Decimal("0.00"),
        haber_usd=Decimal("100.00"),
        tenant_id=tenant_id
    )
    db_session.add_all([det1, det2])
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    res = monitor_forense(db=db_session, current_user=mock_user)
    assert "checks" in res
    assert len(res["checks"]) >= 2
