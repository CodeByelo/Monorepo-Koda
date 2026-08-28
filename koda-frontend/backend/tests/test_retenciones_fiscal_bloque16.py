import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException

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
from backend.models.erp_extended import RetencionIVA, Empresa
from backend.routers.fiscal.retenciones import (
    crear_comprobante, exportar_retenciones, igtf, exportar_igtf
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


def test_bug1_crear_comprobante_con_proveedor_rif_y_nombre(db_session):
    """
    Bug 1: crear_comprobante no pasaba proveedor_rif ni proveedor_nombre a RetencionIVA,
    los cuales son NOT NULL en el modelo, causando IntegrityError en cada inserción.
    Verifica que se validen los campos y se persista exitosamente en base de datos.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    # 1. Si faltan proveedor_rif o proveedor_nombre -> 400
    body_invalido = {
        "periodo": "2026-08",
        "agente_rif": "J-12345678-0",
        "agente_nombre": "Agente Test",
        "numero_factura": "FAC-001",
        "base": 100.0,
        "alicuota": 16.0,
        "iva_retenido": 16.0
    }
    with pytest.raises(HTTPException) as exc_info:
        crear_comprobante(body=body_invalido, db=db_session, current_user=user)
    assert exc_info.value.status_code == 400
    assert "proveedor_rif" in exc_info.value.detail

    # 2. Con proveedor_rif y proveedor_nombre -> éxito y persistencia
    body_valido = {
        "periodo": "2026-08",
        "proveedor_rif": "J-99999999-9",
        "proveedor_nombre": "Proveedor Real S.A.",
        "agente_rif": "J-12345678-0",
        "agente_nombre": "Agente Test",
        "numero_factura": "FAC-001",
        "numero_comprobante": "20260800000001",
        "fecha_comprobante": "2026-08-15",
        "base": 100.0,
        "alicuota": 16.0,
        "iva_retenido": 16.0
    }
    res = crear_comprobante(body=body_valido, db=db_session, current_user=user)
    assert res["ok"] is True

    ret = db_session.query(RetencionIVA).filter(RetencionIVA.id == res["id"]).first()
    assert ret is not None
    assert ret.proveedor_rif == "J-99999999-9"
    assert ret.proveedor_nombre == "Proveedor Real S.A."
    assert ret.numero_comprobante == "20260800000001"


def test_bugs2_3_exportar_retenciones_fecha_y_comprobante_real(db_session):
    """
    Bug 2 y Bug 3:
    - Bug 2: la fecha en exportar_retenciones usaba datetime.now() en vez de r.fecha_comprobante.
    - Bug 3: el comprobante sintetizaba AAAAMM + id_global en vez de usar r.numero_comprobante.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    empresa = Empresa(
        razon_social="Mi Empresa C.A.",
        rif="J-30000000-0",
        tenant_id=tenant_id
    )
    # Retención con fecha histórica específica y número de comprobante formal
    ret = RetencionIVA(
        proveedor_rif="J-11111111-1",
        proveedor_nombre="Proveedor Uno",
        numero_factura="FAC-100",
        numero_comprobante="20260500001234",
        fecha_comprobante=datetime(2026, 5, 12, 10, 30, tzinfo=timezone.utc),
        base_usd=Decimal("100.00"),
        alicuota=Decimal("0.16"),
        monto_usd=Decimal("16.00"),
        tasa_cambio_bs=Decimal("50.00"),
        periodo="2026-05",
        estado="VALIDADO",
        tenant_id=tenant_id
    )
    db_session.add_all([empresa, ret])
    db_session.commit()

    resp = exportar_retenciones(periodo="2026-05", db=db_session, current_user=user)
    linea = resp.body.decode("utf-8").strip()
    campos = linea.split("|")

    # Campos formato SENIAT:
    # 0: RIF_Agente (J300000000)
    # 1: Periodo (202605)
    # 2: FechaDoc (2026-05-12) -> Bug 2
    # 12: NumComprobante (20260500001234) -> Bug 3
    assert campos[0] == "J300000000"
    assert campos[1] == "202605"
    assert campos[2] == "2026-05-12"
    assert campos[12] == "20260500001234"


def test_bugs4_5_6_7_igtf_calculos_y_validaciones(db_session):
    """
    Bugs 4, 5, 6, 7:
    - Bug 4: tasa BCV fallback dinámica con tasa_actual() en vez de 36.0.
    - Bug 5: base_usd para ventas con IGTF es subtotal + iva.
    - Bug 6: detección de IGTF usando derivar_aplica_igtf(metodo_pago).
    - Bug 7: periodo malformado devuelve HTTP 400.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    # 1. Bug 7: Periodo malformado debe lanzar 400
    with pytest.raises(HTTPException) as exc_info:
        igtf(periodo="invalido", quincena="1", db=db_session, current_user=user)
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info_exp:
        exportar_igtf(formato="txt", periodo="invalido", quincena="1", db=db_session, current_user=user)
    assert exc_info_exp.value.status_code == 400

    # 2. Configurar tasa BCV = 100.0 y cliente
    tasa_bcv = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("100.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    cli = Cliente(nombre="Cliente Divisa", rif="V-12345678-0", tenant_id=tenant_id)
    db_session.add_all([tasa_bcv, cli])
    db_session.flush()

    # Venta en DIVISAS con tasa_cambio_bs=0 (para probar Bug 4 fallback), igtf_usd guardado = 3.48
    # subtotal = 100.0, iva = 16.0 -> base_usd real = 116.0 (Bug 5)
    # metodo_pago = "DIVISAS" (Bug 6, evaluado por derivar_aplica_igtf)
    v = Venta(
        numero_factura="FAC-IGTF-001",
        cliente_id=cli.id,
        fecha=datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        igtf_usd=Decimal("3.48"),
        total_usd=Decimal("119.48"),
        metodo_pago="DIVISAS",
        tasa_cambio_bs=Decimal("0"), # Forzar fallback
        estado="ACTIVA",
        tenant_id=tenant_id
    )
    db_session.add(v)
    db_session.commit()

    res = igtf(periodo="2026-08", quincena="1", db=db_session, current_user=user)
    assert len(res["percepciones"]) == 1
    p = res["percepciones"][0]

    # Bug 5: base_usd debe ser 116.00 (subtotal 100 + iva 16)
    assert p["usd"] == 116.00
    # Bug 4: base_bs y igtf deben usar tasa 100.0 (no 36.0) -> base_bs = 116.0 * 100 = 11600.0
    assert p["bs"] == 11600.00
    # igtf_bs = 3.48 * 100 = 348.0
    assert p["igtf"] == 348.00

    # Probar exportación txt
    resp_exp = exportar_igtf(formato="txt", periodo="2026-08", quincena="1", db=db_session, current_user=user)
    linea_txt = resp_exp.body.decode("utf-8").strip()
    assert "V-12345678-0;FAC-IGTF-001;11600.00;348.00;2026-08-10" in linea_txt
