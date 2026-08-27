import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.operations import Producto, Cliente, Venta
from backend.models.erp_extended import Empresa
from backend.models.fiscal import ReglaFiscal
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _crear_ambiente_facturacion(db):
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa POS {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    db.add(tenant)
    db.flush()

    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Cajero",
        apellido="Test",
        email=f"cajero_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(user)

    empresa = Empresa(
        razon_social="Empresa Test C.A.",
        rif="J-12345678-9",
        direccion="Caracas, Venezuela",
        tenant_id=tenant_id
    )
    db.add(empresa)

    tasa = TasaCambio(
        tenant_id=tenant_id,
        valor_ves=Decimal("50.00"),
        fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)

    regla_iva = ReglaFiscal(
        nombre="IVA",
        tasa=Decimal("0.16"),
        activa=True,
        tenant_id=tenant_id
    )
    regla_igtf = ReglaFiscal(
        nombre="IGTF",
        tasa=Decimal("0.03"),
        activa=True,
        tenant_id=tenant_id
    )
    db.add(regla_iva)
    db.add(regla_igtf)

    cliente = Cliente(
        nombre="Cliente Factura Test",
        rif="V-98765432-1",
        telefono="04141234567",
        email="cliente@test.com",
        direccion="Av. Principal",
        es_contribuyente_especial=False,
        tenant_id=tenant_id
    )
    db.add(cliente)

    producto = Producto(
        sku=f"PROD-{uuid.uuid4().hex[:6]}",
        nombre="Producto Prueba POS",
        precio_usd=Decimal("100.00"),
        costo_usd=Decimal("60.00"),
        stock=Decimal("100"),
        stock_minimo=Decimal("5"),
        es_exento=False,
        tenant_id=tenant_id
    )
    db.add(producto)
    db.commit()

    return tenant, user, cliente, producto


def test_emitir_factura_solo_usd_persiste_y_no_aplica_igtf_si_no_es_divisa(setup_db):
    """1. Emitir con SOLO_USD y pago Transferencia guarda SOLO_USD y no aplica IGTF."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "cliente_id": cliente.id,
        "metodo_pago": "Transferencia",
        "moneda_documento": "SOLO_USD",
        "tasa_cambio_bs": 50.0,
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    }
    res = client_app.post("/v1/facturacion/emitir", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    venta = db.query(Venta).filter(Venta.id == data["id"]).first()
    assert venta is not None
    assert venta.moneda_documento == "SOLO_USD"
    assert Decimal(str(venta.igtf_usd)) == Decimal("0.00")

    db.close()


def test_emitir_factura_solo_ves_persiste_correctamente(setup_db):
    """2. Emitir con SOLO_VES guarda SOLO_VES correctamente en BD."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "cliente_id": cliente.id,
        "metodo_pago": "PagoMovil",
        "moneda_documento": "SOLO_VES",
        "tasa_cambio_bs": 50.0,
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    }
    res = client_app.post("/v1/facturacion/emitir", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    venta = db.query(Venta).filter(Venta.id == data["id"]).first()
    assert venta is not None
    assert venta.moneda_documento == "SOLO_VES"

    db.close()


def test_emitir_factura_bimonetario_persiste_correctamente(setup_db):
    """3. Emitir con BIMONETARIO (o sin mandarlo) guarda BIMONETARIO."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "cliente_id": cliente.id,
        "metodo_pago": "Efectivo",
        "moneda_documento": "BIMONETARIO",
        "tasa_cambio_bs": 50.0,
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    }
    res = client_app.post("/v1/facturacion/emitir", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    venta = db.query(Venta).filter(Venta.id == data["id"]).first()
    assert venta is not None
    assert venta.moneda_documento == "BIMONETARIO"

    # Caso default sin mandar moneda_documento
    payload_def = {
        "cliente_id": cliente.id,
        "metodo_pago": "Efectivo",
        "tasa_cambio_bs": 50.0,
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    }
    res_def = client_app.post("/v1/facturacion/emitir", json=payload_def)
    assert res_def.status_code == 201, res_def.text
    venta_def = db.query(Venta).filter(Venta.id == res_def.json()["id"]).first()
    assert venta_def.moneda_documento == "BIMONETARIO"

    db.close()


def test_emitir_factura_moneda_documento_invalida_da_422(setup_db):
    """4. Mandar moneda_documento inválida devuelve 422 del schema."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "cliente_id": cliente.id,
        "metodo_pago": "Transferencia",
        "moneda_documento": "cualquier_cosa",
        "tasa_cambio_bs": 50.0,
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    }
    res = client_app.post("/v1/facturacion/emitir", json=payload)
    assert res.status_code == 422

    db.close()


def test_emitir_factura_divisa_sigue_aplicando_igtf_sin_importar_moneda_documento(setup_db):
    """5. Pago en Divisa con SOLO_VES sigue aplicando IGTF > 0."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    payload = {
        "cliente_id": cliente.id,
        "metodo_pago": "Divisa",
        "moneda_documento": "SOLO_VES",
        "tasa_cambio_bs": 50.0,
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    }
    res = client_app.post("/v1/facturacion/emitir", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    venta = db.query(Venta).filter(Venta.id == data["id"]).first()
    assert venta is not None
    assert Decimal(str(venta.igtf_usd)) > Decimal("0.00")

    db.close()


def _extraer_texto_pdf(contenido_bytes: bytes) -> str:
    import io
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(contenido_bytes))
    texto_completo = ""
    for page in reader.pages:
        texto_completo += page.extract_text() or ""
    return texto_completo


def test_pdf_factura_se_genera_sin_error_en_los_3_formatos(setup_db):
    """6. El PDF de factura se genera correctamente y su CONTENIDO refleja el formato de moneda."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    formatos = ["BIMONETARIO", "SOLO_USD", "SOLO_VES"]
    for formato in formatos:
        payload = {
            "cliente_id": cliente.id,
            "metodo_pago": "Efectivo",
            "moneda_documento": formato,
            "tasa_cambio_bs": 50.0,
            "detalles": [
                {
                    "producto_id": producto.id,
                    "cantidad": 1,
                    "precio_unitario": 100.0
                }
            ]
        }
        res = client_app.post("/v1/facturacion/emitir", json=payload)
        assert res.status_code == 201, res.text
        venta_id = res.json()["id"]

        pdf_res = client_app.get(f"/ventas/{venta_id}/pdf")
        assert pdf_res.status_code == 200, f"Fallo al generar PDF para {formato}: {pdf_res.text}"
        assert pdf_res.headers.get("content-type") == "application/pdf"
        assert len(pdf_res.content) > 0

        texto_pdf = _extraer_texto_pdf(pdf_res.content)

        if formato == "SOLO_USD":
            assert "TOTAL GENERAL (USD):" in texto_pdf
            assert "$" in texto_pdf
            assert "TOTAL EQUIVALENTE" not in texto_pdf
            assert "TOTAL GENERAL (Bs.):" not in texto_pdf
            assert "TOTAL (Bs.)" not in texto_pdf
        elif formato == "SOLO_VES":
            assert "TOTAL GENERAL (Bs.):" in texto_pdf
            assert "Bs." in texto_pdf
            assert "TOTAL GENERAL (USD):" not in texto_pdf
            assert "TOTAL (USD)" not in texto_pdf
            assert "TOTAL EQUIVALENTE" not in texto_pdf
        elif formato == "BIMONETARIO":
            assert "TOTAL GENERAL (USD):" in texto_pdf
            assert "$" in texto_pdf
            assert "TOTAL EQUIVALENTE (Bs.):" in texto_pdf
            assert "Bs." in texto_pdf

    db.close()


def test_ticket_factura_se_genera_y_verifica_contenido_en_los_3_formatos(setup_db):
    """7. El Ticket POS se genera y su CONTENIDO refleja el formato de moneda."""
    db = SessionLocal()
    tenant, user, cliente, producto = _crear_ambiente_facturacion(db)

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    formatos = ["BIMONETARIO", "SOLO_USD", "SOLO_VES"]
    for formato in formatos:
        payload = {
            "cliente_id": cliente.id,
            "metodo_pago": "Efectivo",
            "moneda_documento": formato,
            "tasa_cambio_bs": 50.0,
            "detalles": [
                {
                    "producto_id": producto.id,
                    "cantidad": 1,
                    "precio_unitario": 100.0
                }
            ]
        }
        res = client_app.post("/v1/facturacion/emitir", json=payload)
        assert res.status_code == 201, res.text
        venta_id = res.json()["id"]

        ticket_res = client_app.get(f"/ventas/{venta_id}/ticket")
        assert ticket_res.status_code == 200, f"Fallo al generar Ticket para {formato}: {ticket_res.text}"
        assert ticket_res.headers.get("content-type") == "application/pdf"
        assert len(ticket_res.content) > 0

        texto_ticket = _extraer_texto_pdf(ticket_res.content)

        if formato == "SOLO_USD":
            assert "TOTAL A PAGAR (USD):" in texto_ticket
            assert "Total ($)" in texto_ticket
            assert "TOTAL EN BOLÍVARES:" not in texto_ticket
            assert "TOTAL A PAGAR (Bs.):" not in texto_ticket
            assert "Tasa de Cambio:" not in texto_ticket
        elif formato == "SOLO_VES":
            assert "TOTAL A PAGAR (Bs.):" in texto_ticket
            assert "Total (Bs.)" in texto_ticket
            assert "TOTAL A PAGAR (USD):" not in texto_ticket
            assert "Total ($)" not in texto_ticket
            assert "TOTAL EN BOLÍVARES:" not in texto_ticket
        elif formato == "BIMONETARIO":
            assert "TOTAL A PAGAR (USD):" in texto_ticket
            assert "TOTAL EN BOLÍVARES:" in texto_ticket
            assert "Tasa de Cambio:" in texto_ticket

    db.close()


def test_igtf_no_depende_de_moneda_pago_redundante_en_sales():
    """8. Verifica que derivar_aplica_igtf dependa exclusivamente de metodo_pago."""
    from backend.services.facturacion_service import derivar_aplica_igtf
    assert derivar_aplica_igtf("Divisa", "VES") is True
    assert derivar_aplica_igtf("Divisa", "USD") is True
    assert derivar_aplica_igtf("Divisa", None) is True
    assert derivar_aplica_igtf("Efectivo", "USD") is False
    assert derivar_aplica_igtf("Transferencia", "USD") is False
    assert derivar_aplica_igtf("PagoMovil", "USD") is False

