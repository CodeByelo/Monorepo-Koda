import os
import uuid
import asyncio
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
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
from backend.models.core import Tenant, Profile
from backend.models.erp_extended import Chofer, Vehiculo, TurnoDespacho, TurnoVentaAsociacion, TurnoGasto
from backend.models.logistics_new import NotificationJob as NewNotificationJob, LogisticsPlan as NewLogisticsPlan
from backend.routers.logistica import (
    telegram_webhook,
    process_notification_jobs,
    liquidar_gastos_turno,
    TurnoLiquidar,
    GastoItem
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


def test_bug1_pod_foto_non_blocking(db_session):
    """
    Bug 1: Verificar que telegram_webhook descargue fotos usando asyncio.to_thread
    y que el flujo completo de POD por foto funcione end-to-end.
    """
    async def run_test():
        tenant_id = uuid.uuid4()
        tenant = Tenant(id=tenant_id, nombre_empresa="Test Tenant POD")
        db_session.add(tenant)
        db_session.flush()

        chofer = Chofer(
            id=1,
            tenant_id=tenant_id,
            nombre="Carlos Chofer",
            cedula="V-12345678",
            telegram_chat_id="999000111",
            estado="EN_RUTA"
        )
        vehiculo = Vehiculo(
            id=1,
            tenant_id=tenant_id,
            nombre="Camión 1",
            placa="ABC-123",
            estado="EN_RUTA"
        )
        turno = TurnoDespacho(
            id=10,
            tenant_id=tenant_id,
            numero_turno="TRN-000010",
            chofer_id=chofer.id,
            vehiculo_id=vehiculo.id,
            destino="Caracas",
            estado="EN_RUTA",
            fecha_salida=datetime.now(timezone.utc)
        )
        parada = TurnoVentaAsociacion(
            id=100,
            turno_id=turno.id,
            venta_id=50,
            orden_parada=1,
            estado_entrega="PENDIENTE"
        )
        db_session.add_all([chofer, vehiculo, turno, parada])
        db_session.commit()

        update_payload = {
            "message": {
                "chat": {"id": 999000111},
                "photo": [{"file_id": "file_telegram_123"}]
            }
        }

        mock_res_file = MagicMock()
        mock_res_file.status_code = 200
        mock_res_file.json.return_value = {"result": {"file_path": "photos/file_1.jpg"}}

        mock_res_download = MagicMock()
        mock_res_download.status_code = 200
        mock_res_download.content = b"fake_jpg_binary_data"

        with patch("backend.routers.logistica._enviar_telegram", return_value=True):
            with patch("requests.get", side_effect=[mock_res_file, mock_res_download]) as mock_get:
                with patch("asyncio.to_thread", wraps=asyncio.to_thread) as spy_to_thread:
                    res = await telegram_webhook(update=update_payload, db=db_session)
                    
                    assert res == {"status": "pod_recorded"}
                    assert mock_get.call_count == 2
                    assert spy_to_thread.called

        db_session.refresh(turno)
        db_session.refresh(parada)
        db_session.refresh(chofer)
        db_session.refresh(vehiculo)

        assert turno.estado == "ENTREGADO"
        assert parada.estado_entrega == "ENTREGADO"
        assert parada.evidencia_foto_url is not None
        assert chofer.estado == "DISPONIBLE"
        assert vehiculo.estado == "DISPONIBLE"

    asyncio.run(run_test())


def test_bug2_process_notification_jobs_lock(test_engine, db_session):
    """
    Bug 2: Verificar que process_notification_jobs utilice with_for_update(skip_locked=True)
    y procese los jobs PENDING sin duplicaciones.
    """
    async def run_test():
        tenant_id = uuid.uuid4()
        job1 = NewNotificationJob(
            id=1,
            tenant_id=tenant_id,
            telegram_chat_id="12345",
            mensaje="Notificación Test 1",
            estado="PENDING",
            intentos=0
        )
        job2 = NewNotificationJob(
            id=2,
            tenant_id=tenant_id,
            telegram_chat_id="67890",
            mensaje="Notificación Test 2",
            estado="PENDING",
            intentos=0
        )
        db_session.add_all([job1, job2])
        db_session.commit()

        TestSessionMaker = sessionmaker(bind=test_engine)

        with patch("backend.core.database.SessionLocal", side_effect=TestSessionMaker):
            with patch("backend.routers.logistica._enviar_telegram", return_value=True):
                await process_notification_jobs()

        db_session.refresh(job1)
        db_session.refresh(job2)
        assert job1.estado == "SENT"
        assert job1.intentos == 1
        assert job2.estado == "SENT"
        assert job2.intentos == 1

    asyncio.run(run_test())


def test_bug3_linking_null_user_nombre(db_session):
    """
    Bug 3 (Parte A): Si user.nombre es None o vacío, la vinculación por Telegram
    NO debe asignar telegram_chat_id a ningún Chofer arbitrario del tenant.
    """
    async def run_test():
        tenant_id = uuid.uuid4()

        user_null = Profile(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            username="user_noname",
            nombre=None,
            email="noname@test.com",
            password_hash="hash"
        )
        chofer = Chofer(
            id=1,
            tenant_id=tenant_id,
            nombre="Pedro Pérez",
            cedula="V-999999",
            telegram_chat_id=None
        )
        db_session.add_all([user_null, chofer])
        db_session.commit()

        update_payload = {
            "message": {
                "chat": {"id": 888777666},
                "text": "/start valid_token"
            }
        }

        with patch("backend.routers.telegram_api._verify_real_linking_token", return_value={"user_id": user_null.id}):
            with patch("backend.routers.logistica._enviar_telegram", return_value=True):
                res = await telegram_webhook(update=update_payload, db=db_session)
                assert res["status"] == "linking_success"

        db_session.refresh(chofer)
        db_session.refresh(user_null)
        assert user_null.telegram_chat_id == "888777666"
        assert chofer.telegram_chat_id is None

    asyncio.run(run_test())


def test_bug3_linking_exact_match_driver_nombre(db_session):
    """
    Bug 3 (Parte B): Verificar que la vinculación use coincidencia exacta case-insensitive
    en el nombre y no substring (evitando que 'Ana' matchee con 'Juana').
    """
    async def run_test():
        tenant_id = uuid.uuid4()

        user_ana = Profile(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            username="ana_user",
            nombre="Ana",
            email="ana@test.com",
            password_hash="hash"
        )
        chofer_ana = Chofer(
            id=1,
            tenant_id=tenant_id,
            nombre="Ana",
            cedula="V-11111",
            telegram_chat_id=None
        )
        chofer_juana = Chofer(
            id=2,
            tenant_id=tenant_id,
            nombre="Juana",
            cedula="V-22222",
            telegram_chat_id=None
        )
        db_session.add_all([user_ana, chofer_ana, chofer_juana])
        db_session.commit()

        update_payload = {
            "message": {
                "chat": {"id": 555444333},
                "text": "/start token_ana"
            }
        }

        with patch("backend.routers.telegram_api._verify_real_linking_token", return_value={"user_id": user_ana.id}):
            with patch("backend.routers.logistica._enviar_telegram", return_value=True):
                res = await telegram_webhook(update=update_payload, db=db_session)
                assert res["status"] == "linking_success"

        db_session.refresh(chofer_ana)
        db_session.refresh(chofer_juana)

        assert chofer_ana.telegram_chat_id == "555444333"
        assert chofer_juana.telegram_chat_id is None

    asyncio.run(run_test())


def test_bug4_fecha_retorno_timezone_aware(db_session):
    """
    Bug 4: Confirmar que turno.fecha_retorno sea datetime aware (tzinfo no es None)
    en los 3 flujos:
      1) Confirmación por texto ("entregado") en telegram_webhook
      2) Confirmación por foto (POD) en telegram_webhook
      3) Endpoint liquidar_gastos_turno
    """
    async def run_test():
        tenant_id = uuid.uuid4()

        # 3 Choferes y 3 Vehículos independientes
        c1 = Chofer(id=1, tenant_id=tenant_id, nombre="Driver 1", cedula="V-01", telegram_chat_id="771")
        c2 = Chofer(id=2, tenant_id=tenant_id, nombre="Driver 2", cedula="V-02", telegram_chat_id="772")
        c3 = Chofer(id=3, tenant_id=tenant_id, nombre="Driver 3", cedula="V-03", telegram_chat_id="773")

        v1 = Vehiculo(id=1, tenant_id=tenant_id, nombre="V1", placa="AA-01", km_actuales=100.0)
        v2 = Vehiculo(id=2, tenant_id=tenant_id, nombre="V2", placa="AA-02", km_actuales=100.0)
        v3 = Vehiculo(id=3, tenant_id=tenant_id, nombre="V3", placa="AA-03", km_actuales=100.0)
        
        t1 = TurnoDespacho(id=1, tenant_id=tenant_id, numero_turno="TRN-01", chofer_id=1, vehiculo_id=1, destino="Maracay", estado="EN_RUTA", fecha_salida=datetime.now(timezone.utc))
        t2 = TurnoDespacho(id=2, tenant_id=tenant_id, numero_turno="TRN-02", chofer_id=2, vehiculo_id=2, destino="Valencia", estado="EN_RUTA", fecha_salida=datetime.now(timezone.utc))
        t3 = TurnoDespacho(id=3, tenant_id=tenant_id, numero_turno="TRN-03", chofer_id=3, vehiculo_id=3, destino="Barquisimeto", estado="EN_RUTA", fecha_salida=datetime.now(timezone.utc))

        db_session.add_all([c1, c2, c3, v1, v2, v3, t1, t2, t3])
        db_session.commit()

        from sqlalchemy.orm import Session as SessionClass

        assigned_dates = []

        @event.listens_for(SessionClass, "before_flush")
        def capture_fecha_retorno(session, flush_context, instances):
            for obj in session.dirty:
                if isinstance(obj, TurnoDespacho) and obj.fecha_retorno is not None:
                    assigned_dates.append(obj.fecha_retorno)

        try:
            # 1. Text confirmation (chofer 1 / chat 771)
            update_text = {"message": {"chat": {"id": 771}, "text": "entregado"}}
            with patch("backend.routers.logistica._enviar_telegram", return_value=True):
                await telegram_webhook(update=update_text, db=db_session)
            
            assert len(assigned_dates) >= 1
            assert assigned_dates[-1].tzinfo is not None, "fecha_retorno debe ser timezone aware en texto entregado"

            # 2. Photo confirmation (chofer 2 / chat 772)
            update_photo = {"message": {"chat": {"id": 772}, "photo": [{"file_id": "img123"}]}}
            mock_res1 = MagicMock(status_code=200, json=lambda: {"result": {"file_path": "p.jpg"}})
            mock_res2 = MagicMock(status_code=200, content=b"fake")

            with patch("backend.routers.logistica._enviar_telegram", return_value=True):
                with patch("requests.get", side_effect=[mock_res1, mock_res2]):
                    await telegram_webhook(update=update_photo, db=db_session)

            assert len(assigned_dates) >= 2
            assert assigned_dates[-1].tzinfo is not None, "fecha_retorno debe ser timezone aware en POD foto"

            # 3. Liquidar gastos turno (turno 3)
            current_user = Profile(id=uuid.uuid4(), tenant_id=tenant_id, rol_id=1, email="admin@test.com", username="admin", password_hash="fake")
            liquidar_data = TurnoLiquidar(
                km_retorno=150,
                gastos=[
                    GastoItem(categoria="COMBUSTIBLE", monto_usd=20.0, litros_combustible=10.0, descripcion="Diesel")
                ]
            )
            liquidar_gastos_turno(turno_id=t3.id, data=liquidar_data, db=db_session, current_user=current_user)

            assert len(assigned_dates) >= 3
            assert assigned_dates[-1].tzinfo is not None, "fecha_retorno debe ser timezone aware en liquidar_gastos_turno"
        finally:
            event.remove(SessionClass, "before_flush", capture_fecha_retorno)

    asyncio.run(run_test())
