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
from backend.models.core import Profile, TasaCambio
from backend.models.erp_extended import (
    NumeracionSerie,
    NotificacionRegla,
    ImportacionJob,
    Vendedor,
    CuentaBancaria,
    MovimientoBancario,
)
from backend.models.fiscal import CorrelativoFiscal
from backend.schemas.core import UserCreate
from backend.routers.admin_ext import (
    _seed_admin_defaults,
    admin_dashboard,
    listar_usuarios,
    crear_usuario,
    crear_importacion,
    ImportacionCreate,
    FilaImportacion,
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


def test_bugs1_2_seed_admin_defaults_multi_tenant_isolation(db_session):
    """
    Bugs 1 y 2:
    - _seed_admin_defaults aislaba mal los registros y hacia UPDATE sin filtro de tenant_id.
    - Verifica que el seed asigna tenant_id a cada registro.
    - Verifica que el UPDATE de reglas canal=EMAIL a TELEGRAM no toca registros de otros tenants.
    """
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()
    tenant_c_id = uuid.uuid4()

    # Tenant C tiene una regla previa con canal EMAIL
    regla_c = NotificacionRegla(
        nombre="Regla Tenant C",
        canal="EMAIL",
        activa=True,
        plantilla="Test C",
        tenant_id=tenant_c_id
    )
    db_session.add(regla_c)
    db_session.commit()

    user_a = MagicMock()
    user_a.tenant_id = tenant_a_id
    user_a.rol = "Admin"

    user_b = MagicMock()
    user_b.tenant_id = tenant_b_id
    user_b.rol = "Admin"

    # Sembrar para Tenant A y Tenant B
    _seed_admin_defaults(db_session, tenant_id=tenant_a_id)
    _seed_admin_defaults(db_session, tenant_id=tenant_b_id)

    # Verificar que el UPDATE de Tenant A o B no modificó la regla de Tenant C
    regla_c_db = db_session.query(NotificacionRegla).filter(NotificacionRegla.tenant_id == tenant_c_id).first()
    assert regla_c_db.canal == "EMAIL"

    # Verificar visibilidad de series sembradas para A y no para B
    series_a = db_session.query(NumeracionSerie).filter(NumeracionSerie.tenant_id == tenant_a_id).all()
    series_b = db_session.query(NumeracionSerie).filter(NumeracionSerie.tenant_id == tenant_b_id).all()
    assert len(series_a) == 4
    assert len(series_b) == 4
    assert set(s.tenant_id for s in series_a) == {tenant_a_id}
    assert set(s.tenant_id for s in series_b) == {tenant_b_id}


def test_bug3_crear_usuario_vendedor_correlativo_fiscal(db_session):
    """
    Bug 3: crear_usuario con es_vendedor=True usaba count() para el código de Vendedor.
    Verifica que se usa CorrelativoFiscal (tipo_documento='VENDEDOR', prefijo='VEN-').
    """
    tenant_id = uuid.uuid4()
    admin_user = MagicMock()
    admin_user.tenant_id = tenant_id
    admin_user.email = "admin@test.com"
    mock_request = MagicMock()
    mock_request.client.host = "127.0.0.1"
    mock_request.headers = {}

    u1_in = UserCreate(
        nombre="Vendedor Uno",
        email="vendedor1@test.com",
        password="password123",
        rol="Admin",
        es_vendedor=True
    )
    u2_in = UserCreate(
        nombre="Vendedor Dos",
        email="vendedor2@test.com",
        password="password123",
        rol="Admin",
        es_vendedor=True
    )

    crear_usuario(request=mock_request, user_in=u1_in, db=db_session, current_admin=admin_user)
    crear_usuario(request=mock_request, user_in=u2_in, db=db_session, current_admin=admin_user)

    vendedores = db_session.query(Vendedor).filter(Vendedor.tenant_id == tenant_id).order_by(Vendedor.id).all()
    assert len(vendedores) == 2
    assert vendedores[0].codigo == "VEN-001"
    assert vendedores[1].codigo == "VEN-002"

    corr_ven = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "VENDEDOR",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_ven.siguiente_numero == 3


def test_bugs4_5_6_crear_importacion_banco_pagos(db_session):
    """
    Bugs 4, 5 y 6:
    - Bug 4: usaba cuenta_id=1 hardcodeada. Ahora valida la CuentaBancaria activa del tenant.
    - Bug 5: usaba tasa_cambio_bs=36.5. Ahora usa tasa_actual().
    - Bug 6: si el monto o la fecha están corruptos, rechaza la fila y la suma a registros_error.
    """
    tenant_id = uuid.uuid4()
    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id
    mock_user.id = uuid.uuid4()

    mock_request = MagicMock()
    mock_request.client.host = "127.0.0.1"
    mock_request.headers = {}

    # 1. Tenant SIN cuenta bancaria activa -> Debe lanzar 400
    import_body = ImportacionCreate(
        tipo="Banco/Pagos",
        archivo="extracto.csv",
        registros_ok=0,
        registros_error=0,
        filas=[FilaImportacion(fecha="28/08/2026", referencia="REF1", descripcion="Pago OK", monto="100.00")]
    )
    with pytest.raises(Exception) as exc_info:
        crear_importacion(request=mock_request, body=import_body, current_user=mock_user, db=db_session)
    assert "El tenant no tiene ninguna cuenta bancaria activa" in str(exc_info.value)

    # 2. Configurar CuentaBancaria con ID = 999 (distinta de 1) y TasaCambio global (784.66)
    cuenta_bancaria = CuentaBancaria(
        id=999,
        banco="Banco Mercantil",
        numero_cuenta="0105-0000-0000",
        saldo_actual_usd=Decimal("5000.00"),
        activa=True,
        tenant_id=tenant_id
    )
    tasa_global = TasaCambio(
        fuente="BCV",
        valor_ves=Decimal("784.66"),
        fecha=datetime.now(timezone.utc),
        tenant_id=None
    )
    db_session.add_all([cuenta_bancaria, tasa_global])
    db_session.commit()

    # 3. Importar filas: 1 OK, 1 con monto corrupto, 1 con fecha corrupta
    import_body_mix = ImportacionCreate(
        tipo="Banco/Pagos",
        archivo="extracto_mix.csv",
        registros_ok=0,
        registros_error=0,
        filas=[
            FilaImportacion(fecha="28/08/2026", referencia="REF-OK", descripcion="Transf Valida", monto="$150.50"),
            FilaImportacion(fecha="28/08/2026", referencia="REF-BAD-MONTO", descripcion="Monto Invalido", monto="INVALIDO"),
            FilaImportacion(fecha="FECHA_RARA", referencia="REF-BAD-FECHA", descripcion="Fecha Invalida", monto="50.00"),
        ]
    )

    res = crear_importacion(request=mock_request, body=import_body_mix, current_user=mock_user, db=db_session)
    job = db_session.query(ImportacionJob).filter(ImportacionJob.id == res["job_id"]).first()
    assert job.registros_ok == 1
    assert job.registros_error == 2

    # Verificar MovimientoBancario creado
    movs = db_session.query(MovimientoBancario).filter(MovimientoBancario.tenant_id == tenant_id).all()
    assert len(movs) == 1
    assert movs[0].cuenta_id == 999
    assert float(movs[0].monto_usd) == 150.50
    assert float(movs[0].tasa_cambio_bs) == 784.66


def test_bug7_listar_usuarios_estado_real(db_session):
    """
    Bug 7: listar_usuarios devolvía "estado": "Activo" hardcodeado para todos.
    Verifica que Profile.estado (1 -> 'Activo', 0 -> 'Inactivo') se reporta correctamente.
    """
    tenant_id = uuid.uuid4()
    u_activo = Profile(
        username="activo_user",
        nombre="Usuario Activo",
        email="activo@test.com",
        rol_id=3,
        estado=1,
        tenant_id=tenant_id
    )
    u_inactivo = Profile(
        username="inactivo_user",
        nombre="Usuario Inactivo",
        email="inactivo@test.com",
        rol_id=3,
        estado=0,
        tenant_id=tenant_id
    )
    db_session.add_all([u_activo, u_inactivo])
    db_session.commit()

    mock_user = MagicMock()
    mock_user.tenant_id = tenant_id
    mock_user.rol = "Admin"
    mock_user.id = uuid.uuid4()

    res = listar_usuarios(db=db_session, current_user=mock_user)
    assert len(res) == 2

    u_act_res = next(u for u in res if u["email"] == "activo@test.com")
    u_inact_res = next(u for u in res if u["email"] == "inactivo@test.com")

    assert u_act_res["estado"] == "Activo"
    assert u_inact_res["estado"] == "Inactivo"
