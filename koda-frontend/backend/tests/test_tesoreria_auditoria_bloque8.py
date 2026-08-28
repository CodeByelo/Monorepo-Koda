import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
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
from backend.models.core import Tenant, Profile, TasaCambio
from backend.models.erp_extended import (
    CuentaPorPagar, FondoCajaChica, CuentaBancaria, MovimientoBancario,
    TransferenciaTesoreria, ColocacionInversion, PrestamoUVC, Proveedor
)
from backend.routers.operaciones.tesoreria import (
    flujo_caja_tesoreria,
    importar_extracto_bancario,
    movimiento_caja_chica,
    confirmar_transferencia,
    registrar_movimiento_caja,
    resumen_inversiones,
    registrar_inversion,
    resumen_prestamos_uvc
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


def test_bug1_flujo_caja_naive_vencimiento_no_explota(db_session):
    """
    Bug 1: CuentaPorPagar.fecha_vencimiento es naive.
    flujo_caja_tesoreria convertía r.fecha_vencimiento sin _as_aware antes de comparar
    con datetime.now(timezone.utc), lanzando TypeError.
    """
    tenant_id = uuid.uuid4()
    prov = Proveedor(rif="J-12345678-9", nombre="Proveedor Test Bug 1", tenant_id=tenant_id)
    db_session.add(prov)
    db_session.commit()

    # fecha_vencimiento naive (atrás en el tiempo para que sea vencida)
    cxp = CuentaPorPagar(
        numero_documento="CXP-BUG1-001",
        proveedor_id=prov.id,
        fecha_emision=datetime.now() - timedelta(days=60),
        fecha_vencimiento=datetime.now() - timedelta(days=30),  # Naive!
        monto_total_usd=Decimal("100.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.00"),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add(cxp)
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    # No debe lanzar TypeError: can't compare offset-naive and offset-aware datetimes
    res = flujo_caja_tesoreria(db=db_session, current_user=mock_user)
    assert "proyecciones" in res
    assert len(res["proyecciones"]) == 1
    assert res["proyecciones"][0]["isCritical"] is True


def test_bug2_importar_extracto_fecha_sin_guion_no_explota(db_session):
    """
    Bug 2: Si fecha_str no contiene "-", la rama fallback producía datetime.now(timezone.utc) (aware),
    que al restarse con cand.fecha (naive) lanzaba TypeError.
    """
    tenant_id = uuid.uuid4()
    cuenta = CuentaBancaria(
        banco="Banco Test Bug 2",
        numero_cuenta="1234567890",
        saldo_actual_usd=Decimal("1000.00"),
        tenant_id=tenant_id
    )
    db_session.add(cuenta)
    db_session.commit()

    cand = MovimientoBancario(
        cuenta_id=cuenta.id,
        concepto="Movimiento Pendiente",
        monto_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("40.00"),
        tipo="INGRESO",
        fecha=datetime.now() - timedelta(days=1),  # Naive!
        estado="ACTIVO",
        tenant_id=tenant_id
    )
    db_session.add(cand)
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    body = {
        "cuenta_id": cuenta.id,
        "movimientos": [
            {
                "fecha": "28/08/2026",  # Sin guión "-" !
                "referencia": "REF123",
                "concepto": "Deposito",
                "monto": 100.0
            }
        ]
    }

    # No debe lanzar TypeError en abs((cand.fecha - fecha_mov).days)
    res = importar_extracto_bancario(body=body, db=db_session, current_user=mock_user)
    assert res["ok"] is True


def test_bug3_with_for_update_en_queries_saldo(db_session):
    """
    Bug 3: Verifica que las queries que mutan saldo en endpoints clave incorporen with_for_update.
    """
    tenant_id = uuid.uuid4()
    fondo = FondoCajaChica(
        nombre="Fondo Locks",
        responsable="Responsable Test",
        asignado_usd=Decimal("500.00"),
        disponible_usd=Decimal("500.00"),
        tenant_id=tenant_id
    )
    db_session.add(fondo)
    db_session.commit()

    cuenta1 = CuentaBancaria(banco="Banco Lock 1", numero_cuenta="1111", saldo_actual_usd=Decimal("1000.00"), tenant_id=tenant_id)
    cuenta2 = CuentaBancaria(banco="Banco Lock 2", numero_cuenta="2222", saldo_actual_usd=Decimal("500.00"), tenant_id=tenant_id)
    db_session.add_all([cuenta1, cuenta2])
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    # 1. movimiento_caja_chica
    res_mcc = movimiento_caja_chica(body={"fondo_id": f"FD-{fondo.id}", "monto": 50.0, "concepto": "Test Lock"}, db=db_session, current_user=mock_user)
    assert res_mcc["ok"] is True
    assert float(fondo.disponible_usd) == 450.0

    # 2. registrar_movimiento_caja
    res_rmc = registrar_movimiento_caja(body={"cuenta_id": cuenta1.id, "monto_usd": 100.0, "tipo": "INGRESO"}, db=db_session, current_user=mock_user)
    assert res_rmc["ok"] is True
    assert float(cuenta1.saldo_actual_usd) == 1100.0

    # 3. confirmar_transferencia
    trf = TransferenciaTesoreria(
        cuenta_origen_id=cuenta1.id,
        cuenta_destino_id=cuenta2.id,
        monto_usd=Decimal("200.00"),
        tasa_cambio_bs=Decimal("40.00"),
        concepto="Transferencia Test",
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add(trf)
    db_session.commit()

    with patch("backend.routers.operaciones.tesoreria.ContabilidadService") as mock_cs:
        res_ct = confirmar_transferencia(id=trf.id, db=db_session, current_user=mock_user)
        assert res_ct["ok"] is True
        assert float(cuenta1.saldo_actual_usd) == 900.0
        assert float(cuenta2.saldo_actual_usd) == 700.0

    # 4. importar_extracto_bancario
    res_ieb = importar_extracto_bancario(body={"cuenta_id": cuenta1.id, "movimientos": []}, db=db_session, current_user=mock_user)
    assert res_ieb["ok"] is True


def test_bug4_fondo_id_invalid_returns_400(db_session):
    """
    Bug 4: Si fondo_id es ausente o malformado ("FD-abc", ""), debe responder 400 y NO caer en fid = 1.
    """
    mock_user = MagicMock()
    mock_user.tenant_id = uuid.uuid4()

    # Caso 1: string invalido
    with pytest.raises(HTTPException) as exc1:
        movimiento_caja_chica(body={"fondo_id": "FD-abc", "monto": 10.0}, db=db_session, current_user=mock_user)
    assert exc1.value.status_code == 400
    assert "fondo_id inválido" in exc1.value.detail

    # Caso 2: ausente/vacio
    with pytest.raises(HTTPException) as exc2:
        movimiento_caja_chica(body={"monto": 10.0}, db=db_session, current_user=mock_user)
    assert exc2.value.status_code == 400
    assert "fondo_id inválido" in exc2.value.detail


def test_bug5_division_por_cero_inversiones(db_session):
    """
    Bug 5:
    1. registrar_inversion con tasa_cambio_inicial <= 0 responde 400.
    2. resumen_inversiones no explota con ZeroDivisionError si existe una colocación en BD con tasa_cambio_inicial = 0.
    """
    tenant_id = uuid.uuid4()
    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    # Part 1: registrar_inversion valida > 0
    with pytest.raises(HTTPException) as exc:
        registrar_inversion(body={"tasa_cambio_inicial": 0}, db=db_session, current_user=mock_user)
    assert exc.value.status_code == 400
    assert "tasa de cambio inicial debe ser mayor a 0" in exc.value.detail

    # Part 2: resumen_inversiones maneja fila existente con tasa_cambio_inicial = 0
    inv0 = ColocacionInversion(
        nombre="Inversion Tasa Cero",
        plazo_dias=30,
        capital_bs=Decimal("1000.00"),
        tasa_interes_anual=Decimal("10.00"),
        tasa_cambio_inicial=Decimal("0.00"),  # Tasa 0 en BD!
        estado="ACTIVO",
        tenant_id=tenant_id
    )
    db_session.add(inv0)
    db_session.commit()

    # No debe lanzar ZeroDivisionError
    res = resumen_inversiones(db=db_session, current_user=mock_user)
    assert "colocaciones" in res
    assert len(res["colocaciones"]) == 1


def test_bug6_tasa_uvc_global_fallback(db_session):
    """
    Bug 6: Si el tenant no tiene 2 tasas propias pero existe una tasa global (tenant_id IS NULL),
    resumen_prestamos_uvc debe incluir la tasa global para calcular tasa_uvc_ayer y var_24h.
    """
    tenant_id = uuid.uuid4()

    # Tasa global antigua
    tasa_global = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("40.00"),
        fecha=datetime.now() - timedelta(days=1),
        tenant_id=None  # Global!
    )
    # Tasa propia reciente
    tasa_propia = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("50.00"),
        fecha=datetime.now(),
        tenant_id=tenant_id
    )
    db_session.add_all([tasa_global, tasa_propia])
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id

    res = resumen_prestamos_uvc(db=db_session, current_user=mock_user)
    # tasa_uvc_hoy = 50.0, tasa_uvc_ayer = 40.0 -> var_24h = ((50 - 40)/40)*100 = +25.00%
    assert res["metricas"]["var_24h"] == "+25.00%"
