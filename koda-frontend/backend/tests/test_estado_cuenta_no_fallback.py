"""
Verificacion del fix "estado de cuenta no debe mostrar un cliente al azar".

GET /cobranzas/estado-cuenta, cuando se llamaba sin cliente_id ni rif,
caia en un fallback silencioso que tomaba "el primer cliente del tenant"
(db.query(Cliente).filter(tenant_id=...).first(), sin ORDER BY, orden
arbitrario) y devolvia su saldo real, sus facturas reales y sus
movimientos reales. Un cliente que llegaba a la pantalla de "Estado de
Cuenta" sin haber elegido explicitamente a quien consultar terminaba
viendo la cuenta de otro cliente del mismo tenant como si fuera la suya
(esto fue reportado por un cliente real: "he visto dinero y alertas que
no son mias").

Ahora, sin cliente_id ni rif, el endpoint debe rechazar la peticion con
un 400 claro en vez de adivinar a quien mostrar.
"""
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY", "SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"a_very_secret_key_{key.lower()}_at_least_32_chars_long"

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.operations import Cliente
from backend.models.erp_extended import CuentaPorCobrar
from backend.routers.operaciones.cobranzas import estado_cuenta_cliente


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def do_attach(dbapi_connection, connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys = ON;")
        dbapi_connection.execute("ATTACH DATABASE ':memory:' AS public;")

    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


class _FakeUser:
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id


def _crear_cliente_con_cxc(db, tenant_id, nombre, monto):
    cliente = Cliente(nombre=nombre, rif=f"J-{uuid.uuid4().int % 10**8}", tenant_id=tenant_id)
    db.add(cliente)
    db.commit()
    db.add(CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento=f"FAC-{cliente.id}",
        monto_total_usd=Decimal(monto),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))
    db.commit()
    return cliente


def test_sin_cliente_id_ni_rif_devuelve_400_claro(db_session):
    tenant_id = uuid.uuid4()
    # Hay al menos un cliente en el tenant, para probar que el endpoint YA NO
    # cae en "tomar el primero que encuentre" cuando no se le dice a quien consultar.
    _crear_cliente_con_cxc(db_session, tenant_id, "Cliente Cualquiera", "1500.00")

    with pytest.raises(HTTPException) as exc_info:
        estado_cuenta_cliente(cliente_id=None, rif=None, db=db_session, current_user=_FakeUser(tenant_id))

    assert exc_info.value.status_code == 400
    assert "cliente" in exc_info.value.detail.lower()


def test_con_cliente_id_explicito_devuelve_solo_ese_cliente(db_session):
    tenant_id = uuid.uuid4()
    otro = _crear_cliente_con_cxc(db_session, tenant_id, "Otro Cliente", "1500.00")
    mio = _crear_cliente_con_cxc(db_session, tenant_id, "Mi Cliente", "42.00")

    resultado = estado_cuenta_cliente(cliente_id=mio.id, rif=None, db=db_session, current_user=_FakeUser(tenant_id))

    assert resultado["cliente"]["id"] == mio.id
    assert resultado["cliente"]["nombre"] == "Mi Cliente"
    assert resultado["kpis"][0]["value"] == "$42.00"
    assert otro.id != mio.id
