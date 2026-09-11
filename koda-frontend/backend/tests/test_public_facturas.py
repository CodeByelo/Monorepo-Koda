import os
import uuid
import pytest
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for key in [
    "SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY",
    "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY",
    "SSO_BRIDGE_INTERNAL_KEY", "TELEGRAM_LINK_INTERNAL_API_KEY",
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
]:
    if not os.getenv(key):
        os.environ[key] = f"dummy_secret_key_at_least_32_chars_{key.lower()}"

from backend.core.database import Base
from backend.models.operations import Venta
from backend.models.erp_extended import Empresa
from backend.routers.public_facturas import (
    consultar_factura_publica,
    _ip_request_history,
    _RATE_LIMIT_MAX_REQUESTS,
    public_facturas_router,
)


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

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


def make_dummy_request(client_ip="192.168.1.100") -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "client": (client_ip, 12345),
        "headers": [(b"host", b"localhost")]
    })


def test_public_factura_exitosa(db_session):
    _ip_request_history.clear()
    tenant_id = uuid.uuid4()
    qr_token = uuid.uuid4()

    empresa = Empresa(
        tenant_id=tenant_id,
        rif="J-12345678-9",
        razon_social="DISTRIBUIDORA KODA C.A.",
        nombre_comercial="Koda Store",
    )
    db_session.add(empresa)

    venta = Venta(
        tenant_id=tenant_id,
        numero_factura="FAC-00000123",
        fecha=datetime.now(timezone.utc),
        subtotal_usd=Decimal("100.00"),
        iva_usd=Decimal("16.00"),
        total_usd=Decimal("116.00"),
        metodo_pago="Efectivo",
        tasa_cambio_bs=Decimal("36.5000"),
        estado="ACTIVA",
        qr_token=qr_token,
    )
    db_session.add(venta)
    db_session.commit()

    request = make_dummy_request("10.0.0.1")
    data = consultar_factura_publica(qr_token=str(qr_token), request=request, db=db_session)

    # Validar campos expuestos permitidos
    assert data.empresa_emisor == "DISTRIBUIDORA KODA C.A."
    assert data.empresa_rif == "J-12345678-9"
    assert data.numero_factura == "FAC-00000123"
    assert data.total_usd == 116.0
    assert data.total_bs == round(116.0 * 36.5, 2)
    assert data.tasa_cambio_bs == 36.5
    assert data.estado == "ACTIVA"

    data_dict = data.model_dump()
    # Verificar que NO se expone ningún dato sensible del cliente ni del sistema
    for forbidden_key in [
        "cliente", "cliente_id", "cedula", "telefono", "email",
        "metodo_pago", "pago_movil", "pago_movil_referencia",
        "access_token", "token", "jwt", "cookie", "detalles", "items"
    ]:
        assert forbidden_key not in data_dict


def test_public_factura_token_inexistente_404_generico(db_session):
    _ip_request_history.clear()
    request = make_dummy_request("10.0.0.2")

    # UUID inexistente
    inexistente = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc1:
        consultar_factura_publica(qr_token=inexistente, request=request, db=db_session)
    assert exc1.value.status_code == 404
    assert exc1.value.detail == "Factura no encontrada."

    # String arbitrario mal formado (no debe filtrar excepciones técnicas)
    with pytest.raises(HTTPException) as exc2:
        consultar_factura_publica(qr_token="token-invalido-o-malicioso-123", request=request, db=db_session)
    assert exc2.value.status_code == 404
    assert exc2.value.detail == "Factura no encontrada."


def test_public_factura_solo_lectura_rechaza_metodos_escritura():
    # Auditar rutas registradas en public_facturas_router:
    # Solo debe existir la ruta GET /{qr_token} y ningún endpoint POST/PUT/PATCH/DELETE
    allowed_methods = {"GET", "HEAD", "OPTIONS"}
    for route in public_facturas_router.routes:
        methods = getattr(route, "methods", set())
        for m in methods:
            assert m in allowed_methods, f"Método no permitido {m} encontrado en public_facturas_router!"


def test_public_factura_rate_limit(db_session):
    _ip_request_history.clear()
    fake_token = str(uuid.uuid4())
    request = make_dummy_request("10.0.0.3")

    # Realizar 20 peticiones (dentro del límite)
    for _ in range(_RATE_LIMIT_MAX_REQUESTS):
        try:
            consultar_factura_publica(qr_token=fake_token, request=request, db=db_session)
        except HTTPException as e:
            assert e.status_code == 404

    # La 21ª petición debe ser rechazada con 429
    with pytest.raises(HTTPException) as exc_limit:
        consultar_factura_publica(qr_token=fake_token, request=request, db=db_session)

    assert exc_limit.value.status_code == 429
    assert "Demasiadas solicitudes" in exc_limit.value.detail
    assert "Retry-After" in exc_limit.value.headers

