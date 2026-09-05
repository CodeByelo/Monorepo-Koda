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
from backend.models.operations import Proveedor
from backend.models.core import TasaCambio
from backend.models.erp_extended import CuentaPorPagar, CuentaBancaria, MovimientoBancario, CuentaContable
from backend.routers.operaciones.pagos import (
    aprobar_orden, AprobarOrdenRequest, procesar_lotes, programacion_pagos,
    crear_cuenta_por_pagar_manual, CuentaPorPagarManualRequest
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


def test_bug1_aprobar_orden_deuda_fija_bs_convierte_a_usd(db_session):
    """
    Bug 1: aprobar_orden sobre una CxP de deuda fija en Bs (tasa_cambio_bs=1.0)
    restaba el monto crudo en Bs directamente como dólares del banco.
    Verifica que con tasa BCV = 100.0, una deuda de Bs. 500 descuenta exactamente USD 5.00 del banco.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    prov = Proveedor(nombre="Proveedor Fijo", rif="J-12345678-9", tenant_id=tenant_id)
    db_session.add(prov)
    db_session.flush()

    # Cuentas contables para el asiento
    cta_banco = CuentaContable(codigo="1.1.01", nombre="Caja y Bancos", tipo="ACTIVO", tenant_id=tenant_id)
    cta_cxp = CuentaContable(codigo="2.1.01", nombre="Cuentas por Pagar", tipo="PASIVO", tenant_id=tenant_id)

    banco = CuentaBancaria(
        banco="Banco Provincial",
        numero_cuenta="0108-0000-0000",
        saldo_actual_usd=Decimal("1000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    tasa_bcv = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("100.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    # CxP fija en Bs (tasa_cambio_bs=1.0) por Bs. 500.00
    cxp_fija = CuentaPorPagar(
        proveedor_id=prov.id,
        numero_documento="FAC-BS-500",
        monto_total_usd=Decimal("500.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("1.0"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add_all([cta_banco, cta_cxp, banco, tasa_bcv, cxp_fija])
    db_session.commit()

    req = AprobarOrdenRequest(
        orden_id=f"OP-{cxp_fija.id:06d}",
        banco_id=banco.id,
        referencia="TRANSF-001",
        metodo="Transferencia"
    )

    res = aprobar_orden(body=req, db=db_session, current_user=user)
    assert res["ok"] is True

    # El saldo del banco debe ser 1000.00 - 5.00 = 995.00 USD (no 1000 - 500 = 500)
    db_session.refresh(banco)
    assert float(banco.saldo_actual_usd) == 995.00

    mov = db_session.query(MovimientoBancario).filter(MovimientoBancario.tenant_id == tenant_id).first()
    assert mov is not None
    assert float(mov.monto_usd) == 5.00
    assert float(mov.tasa_cambio_bs) == 100.00


def test_bug2_procesar_lotes_mixto_suma_correcta_usd(db_session):
    """
    Bug 2: procesar_lotes sumaba bolívares crudos con dólares reales al liquidar en lote.
    Verifica que con tasa BCV = 100.0:
    - CxP 1 (Indexada): $850 USD
    - CxP 2 (Indexada): $1000 USD
    - CxP 3 (Fija en Bs): Bs. 500 (= $5 USD)
    Total debitado del banco debe ser exactamente $1,855.00 USD (no $2,350.00 USD).
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    prov = Proveedor(nombre="Proveedor Mixto", rif="J-98765432-1", tenant_id=tenant_id)
    db_session.add(prov)
    db_session.flush()

    cta_banco = CuentaContable(codigo="1.1.01", nombre="Caja y Bancos", tipo="ACTIVO", tenant_id=tenant_id)
    cta_cxp = CuentaContable(codigo="2.1.01", nombre="Cuentas por Pagar", tipo="PASIVO", tenant_id=tenant_id)

    banco = CuentaBancaria(
        banco="Banesco USD",
        numero_cuenta="0134-0000-0000",
        saldo_actual_usd=Decimal("5000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    tasa_bcv = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("100.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )

    cxp1 = CuentaPorPagar(
        proveedor_id=prov.id,
        numero_documento="FAC-USD-850",
        monto_total_usd=Decimal("850.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("100.0"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    cxp2 = CuentaPorPagar(
        proveedor_id=prov.id,
        numero_documento="FAC-USD-1000",
        monto_total_usd=Decimal("1000.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("100.0"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    cxp3 = CuentaPorPagar(
        proveedor_id=prov.id,
        numero_documento="FAC-BS-500",
        monto_total_usd=Decimal("500.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("1.0"),  # Fija en Bs
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add_all([cta_banco, cta_cxp, banco, tasa_bcv, cxp1, cxp2, cxp3])
    db_session.commit()

    res = procesar_lotes(
        body={"referencia": "LOTE-TEST-MIXTO", "cuentas_por_pagar_ids": [cxp1.id, cxp2.id, cxp3.id]},
        db=db_session,
        current_user=user
    )
    assert res["ok"] is True

    # 5000.00 - (850 + 1000 + 5.00) = 5000 - 1855 = 3145.00
    db_session.refresh(banco)
    assert float(banco.saldo_actual_usd) == 3145.00

    mov = db_session.query(MovimientoBancario).filter(MovimientoBancario.tenant_id == tenant_id).first()
    assert mov is not None
    assert float(mov.monto_usd) == 1855.00


def test_bug3_programacion_pagos_convierte_deuda_fija(db_session):
    """
    Bug 3: programacion_pagos mostraba deuda fija de Bs como dólares sin convertir ($350.00 en vez de $3.50).
    Verifica que con tasa BCV = 100.0, una deuda de Bs. 350 se formatea como '$3.50' y la suma total refleja $3.50.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    prov = Proveedor(nombre="Proveedor Fijo", rif="J-55555555-5", tenant_id=tenant_id)
    db_session.add(prov)
    db_session.flush()

    tasa_bcv = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("100.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    cxp_fija = CuentaPorPagar(
        proveedor_id=prov.id,
        numero_documento="FAC-BS-350",
        monto_total_usd=Decimal("350.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("1.0"),
        fecha_emision=datetime.now(timezone.utc),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id
    )
    db_session.add_all([tasa_bcv, cxp_fija])
    db_session.commit()

    res = programacion_pagos(db=db_session, current_user=user)
    assert res["deuda_indexada"] == 3.50

    vencidos = res["columnas"]["vencido_hoy"]
    assert len(vencidos) == 1
    assert vencidos[0]["amount"] == "$3.50"


def test_fix_d_procesar_lotes_seleccion_parcial_y_fondos_insuficientes(db_session):
    """
    FIX D:
    1. POST /pagos/lotes/procesar con lista de 2 de 5 IDs pendientes debe liquidar
       solo las 2 seleccionadas, dejando las otras 3 sin tocar (PENDIENTE).
    2. Debe fallar con 400 si el saldo de la cuenta bancaria es menor al total de las facturas seleccionadas.
    3. Debe fallar con 400 si no se envían cuentas_por_pagar_ids o la lista está vacía.
    """
    from fastapi import HTTPException

    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    prov = Proveedor(nombre="Proveedor Lotes", rif="J-11223344-5", tenant_id=tenant_id)
    db_session.add(prov)
    db_session.flush()

    cta_banco = CuentaContable(codigo="1.1.01", nombre="Caja y Bancos", tipo="ACTIVO", tenant_id=tenant_id)
    cta_cxp = CuentaContable(codigo="2.1.01", nombre="Cuentas por Pagar", tipo="PASIVO", tenant_id=tenant_id)

    # Banco con saldo suficiente para 2 facturas ($200), pero no para $500
    banco = CuentaBancaria(
        banco="Banesco USD",
        numero_cuenta="0134-1111-2222",
        saldo_actual_usd=Decimal("300.00"),
        activa=True,
        tenant_id=tenant_id
    )
    tasa_bcv = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("40.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )

    # Creamos 5 facturas pendientes de $100 cada una
    facturas = []
    for i in range(1, 6):
        facturas.append(CuentaPorPagar(
            proveedor_id=prov.id,
            numero_documento=f"FAC-LOTE-{i}",
            monto_total_usd=Decimal("100.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("40.0"),
            fecha_emision=datetime.now(timezone.utc),
            fecha_vencimiento=datetime.now(timezone.utc),
            estado="PENDIENTE",
            tenant_id=tenant_id
        ))

    db_session.add_all([cta_banco, cta_cxp, banco, tasa_bcv] + facturas)
    db_session.commit()

    # 1. Error si lista vacía o ausente
    with pytest.raises(HTTPException) as exc_vacio:
        procesar_lotes(body={"referencia": "LOTE-VACIO"}, db=db_session, current_user=user)
    assert exc_vacio.value.status_code == 400
    assert "Debe seleccionar al menos una factura" in exc_vacio.value.detail

    # 2. Error por fondos insuficientes si seleccionamos 4 facturas ($400 > saldo $300)
    cuatro_ids = [f.id for f in facturas[:4]]
    with pytest.raises(HTTPException) as exc_fondos:
        procesar_lotes(
            body={"referencia": "LOTE-EXCESIVO", "cuentas_por_pagar_ids": cuatro_ids},
            db=db_session,
            current_user=user
        )
    assert exc_fondos.value.status_code == 400
    assert "Fondos insuficientes" in exc_fondos.value.detail

    # 3. Procesar exitosamente 2 facturas ($200 <= saldo $300)
    dos_ids = [facturas[0].id, facturas[1].id]
    res = procesar_lotes(
        body={"referencia": "LOTE-2-DE-5", "cuentas_por_pagar_ids": dos_ids},
        db=db_session,
        current_user=user
    )
    assert res["ok"] is True
    assert "2 facturas liquidadas" in res["message"]

    # Verificar banco: 300 - 200 = 100
    db_session.refresh(banco)
    assert float(banco.saldo_actual_usd) == 100.00

    # Verificar que solo las 2 seleccionadas fueron PAGADAS y las otras 3 siguen PENDIENTES
    for f in facturas[:2]:
        db_session.refresh(f)
        assert f.estado == "PAGADA"
        assert float(f.monto_pagado_usd) == 100.00

    for f in facturas[2:]:
        db_session.refresh(f)
        assert f.estado == "PENDIENTE"
        assert float(f.monto_pagado_usd) == 0.00


def test_crear_cuenta_por_pagar_manual_valida_desviacion_tasa(db_session):
    """
    FIX D (Batch 3): crear_cuenta_por_pagar_manual debe rechazar con 400
    si tasa_cambio_bs se desvía más de 15% de la tasa oficial vigente, y aceptar si es razonable.
    """
    from fastapi import HTTPException

    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    prov = Proveedor(nombre="Proveedor Tasa Check", rif="J-99887766-5", tenant_id=tenant_id)
    tasa_oficial = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("50.00"),
        fecha=datetime.now(timezone.utc),
        tenant_id=tenant_id
    )
    db_session.add_all([prov, tasa_oficial])
    db_session.commit()

    # 1. Tasa desviada: 36.52 vs oficial 50.00 (desviación ~27% > 15%) -> 400
    req_desviado = CuentaPorPagarManualRequest(
        proveedor_id=prov.id,
        numero_documento="FAC-DESVIADA-01",
        monto_total_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("36.52"),
        dias_credito=15
    )
    with pytest.raises(HTTPException) as exc_info:
        crear_cuenta_por_pagar_manual(body=req_desviado, db=db_session, current_user=user)
    assert exc_info.value.status_code == 400
    assert "difiere demasiado de la tasa oficial vigente" in exc_info.value.detail

    # 2. Tasa razonable: 49.00 vs oficial 50.00 (desviación 2% <= 15%) -> OK
    req_ok = CuentaPorPagarManualRequest(
        proveedor_id=prov.id,
        numero_documento="FAC-OK-01",
        monto_total_usd=Decimal("100.00"),
        tasa_cambio_bs=Decimal("49.00"),
        dias_credito=15
    )
    res = crear_cuenta_por_pagar_manual(body=req_ok, db=db_session, current_user=user)
    assert res["ok"] is True

