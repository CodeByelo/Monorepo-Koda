import os
import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in ["SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY", "ORG_SYNC_API_KEY"]:
    if not os.getenv(key):
        os.environ[key] = f"dummy_secret_key_at_least_32_chars_{key.lower()}"

from backend.core.database import Base
from backend.models.core import Profile
from backend.models.erp_extended import NotificacionSistema, NotificacionSistemaLectura
from backend.routers.developer import (
    create_global_notification,
    list_global_notifications,
    toggle_global_notification,
    NotificacionSistemaCreate,
    NotificacionSistemaUpdate,
    require_developer_role,
)
from backend.routers.notificaciones_sistema import (
    get_mis_notificaciones_pendientes,
    get_historial_notificaciones,
    marcar_notificacion_leida,
)
from fastapi import HTTPException


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine("sqlite:///:memory:")
    @event.listens_for(engine, "connect")
    def do_attach(dbapi_connection, connection_record):
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


def test_require_developer_role():
    """Valida que solo usuarios con rol desarrollador/dev/developer pasen la guardia."""
    dev_user = Profile(id=uuid.uuid4(), username="dev", email="dev@koda.com", rol_id=4)
    assert require_developer_role(dev_user) == dev_user

    admin_user = Profile(id=uuid.uuid4(), username="admin", email="admin@koda.com", rol_id=2)
    with pytest.raises(HTTPException) as exc:
        require_developer_role(admin_user)
    assert exc.value.status_code == 403


def test_global_notifications_lifecycle_and_cross_tenant(db_session):
    """
    Prueba el ciclo completo:
    1. Dev publica una notificación global (sin tenant_id).
    2. Usuario Tenant A y Usuario Tenant B ven la notificación en mis-pendientes.
    3. Usuario Tenant A la marca como leída.
    4. Usuario Tenant A ya NO la ve en mis-pendientes (popup no sale).
    5. Usuario Tenant B SÍ la sigue viendo en mis-pendientes (a él sí le sale).
    6. Marcado de lectura es idempotente.
    7. Dev desactiva la notificación (activa=False); ya no sale para nadie.
    """
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    dev_user = Profile(id=uuid.uuid4(), username="dev1", email="dev@koda.com", rol_id=4)
    user_a = Profile(id=uuid.uuid4(), username="user_a", email="a@tenant-a.com", rol_id=3, tenant_id=tenant_a)
    user_b = Profile(id=uuid.uuid4(), username="user_b", email="b@tenant-b.com", rol_id=5, tenant_id=tenant_b)

    db_session.add_all([dev_user, user_a, user_b])
    db_session.commit()

    # 1. Dev crea la notificación
    data = NotificacionSistemaCreate(
        titulo="Optimización de Facturación",
        mensaje="Se mejoró la velocidad de emisión al 100%.",
        activa=True
    )
    notif = create_global_notification(data, db=db_session, dev_user=dev_user)
    assert notif.id is not None
    assert notif.titulo == "Optimización de Facturación"
    assert notif.activa is True
    assert notif.creado_por == dev_user.id

    # 2. Ambos usuarios de diferentes tenants la tienen pendiente
    pendientes_a = get_mis_notificaciones_pendientes(db=db_session, current_user=user_a)
    assert len(pendientes_a) == 1
    assert pendientes_a[0].id == notif.id

    pendientes_b = get_mis_notificaciones_pendientes(db=db_session, current_user=user_b)
    assert len(pendientes_b) == 1
    assert pendientes_b[0].id == notif.id

    # En historial, para ambos aparece con leida=False
    hist_a = get_historial_notificaciones(db=db_session, current_user=user_a)
    assert len(hist_a) == 1
    assert hist_a[0].leida is False

    # 3. Usuario A la marca como leída
    res = marcar_notificacion_leida(notif.id, db=db_session, current_user=user_a)
    assert res.ok is True

    # 4. Usuario A ya no la tiene en pendientes, y en historial figura leida=True
    pendientes_a_despues = get_mis_notificaciones_pendientes(db=db_session, current_user=user_a)
    assert len(pendientes_a_despues) == 0

    hist_a_despues = get_historial_notificaciones(db=db_session, current_user=user_a)
    assert hist_a_despues[0].leida is True

    # 5. Usuario B de otro tenant todavía la tiene pendiente y leida=False
    pendientes_b_despues = get_mis_notificaciones_pendientes(db=db_session, current_user=user_b)
    assert len(pendientes_b_despues) == 1
    assert pendientes_b_despues[0].id == notif.id

    hist_b_despues = get_historial_notificaciones(db=db_session, current_user=user_b)
    assert hist_b_despues[0].leida is False

    # 6. Idempotencia: marcar de nuevo por Usuario A no produce error
    res_repetida = marcar_notificacion_leida(notif.id, db=db_session, current_user=user_a)
    assert res_repetida.ok is True

    # 7. Dev desactiva la notificación
    update_data = NotificacionSistemaUpdate(activa=False)
    toggle_global_notification(notif.id, update_data, db=db_session, dev_user=dev_user)

    # Ahora usuario B tampoco la tiene pendiente porque ya no está activa
    pendientes_b_inactiva = get_mis_notificaciones_pendientes(db=db_session, current_user=user_b)
    assert len(pendientes_b_inactiva) == 0
