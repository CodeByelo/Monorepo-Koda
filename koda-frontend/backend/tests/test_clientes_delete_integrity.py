"""
Verificación independiente del fix "eliminar clientes con historial devuelve
un 500 generico" (punch-list item: "Eliminar los clientes que están en
mora"). Antes, DELETE /clientes/{id} para un cliente con facturas/CxC
asociadas dejaba que Postgres levantara IntegrityError sin capturar, lo que
FastAPI convertía en un 500 con detalle interno. Ahora debe devolver un 400
con un mensaje de negocio claro, y seguir permitiendo el borrado normal de
clientes sin historial.
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
from backend.routers.clientes import eliminar_cliente


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


def test_eliminar_cliente_con_historial_devuelve_400_claro(db_session):
    tenant_id = uuid.uuid4()
    cliente = Cliente(nombre="Cliente en mora", rif=f"J-{uuid.uuid4().int % 10**8}", tenant_id=tenant_id)
    db_session.add(cliente)
    db_session.commit()

    db_session.add(CuentaPorCobrar(
        cliente_id=cliente.id,
        numero_documento="CXC-MORA-001",
        monto_total_usd=Decimal("500.00"),
        monto_pagado_usd=Decimal("0.00"),
        tasa_cambio_bs=Decimal("40.0000"),
        fecha_vencimiento=datetime.now(timezone.utc),
        estado="PENDIENTE",
        tenant_id=tenant_id,
    ))
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        eliminar_cliente(cliente_id=cliente.id, db=db_session, current_user=_FakeUser(tenant_id))

    assert exc_info.value.status_code == 400
    assert "no se puede eliminar" in exc_info.value.detail.lower()

    # El cliente sigue existiendo: el rollback no lo dejo a medio borrar.
    assert db_session.query(Cliente).filter(Cliente.id == cliente.id).first() is not None


def test_eliminar_cliente_sin_historial_funciona_normal(db_session):
    tenant_id = uuid.uuid4()
    cliente = Cliente(nombre="Cliente limpio", rif=f"J-{uuid.uuid4().int % 10**8}", tenant_id=tenant_id)
    db_session.add(cliente)
    db_session.commit()
    cliente_id = cliente.id

    result = eliminar_cliente(cliente_id=cliente_id, db=db_session, current_user=_FakeUser(tenant_id))

    assert result == {"message": "Cliente eliminado exitosamente"}
    assert db_session.query(Cliente).filter(Cliente.id == cliente_id).first() is None
