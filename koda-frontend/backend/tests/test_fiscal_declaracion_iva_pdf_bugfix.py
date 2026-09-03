import uuid
from decimal import Decimal
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.erp_extended import DeclaracionIVA, Empresa
from backend.models.operations import Venta
from backend.core.security import get_current_user


def setup_module(module):
    Base.metadata.create_all(bind=engine)


def test_pdf_muestra_mismo_monto_bs_que_antes_del_fix():
    """El PDF de una declaración FINALIZADA debe mostrar el mismo monto en
    Bs. que el usuario vio al finalizar, aunque ahora internamente
    debito_fiscal_usd/credito_fiscal_mes_usd/retenciones_usd guarden dolares
    reales en vez del monto en Bs. (BUGFIX). Es decir: el fix no debe
    cambiar ningun numero que el usuario final vea."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, nombre_empresa=f"Empresa PDF {uuid.uuid4().hex[:6]}", estado_licencia="ACTIVA")
    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Contador",
        apellido="Test",
        email=f"contador_{uuid.uuid4().hex[:6]}@test.com",
        password_hash="fake",
        rol_id=2,
        tenant_id=tenant_id
    )
    db.add(tenant)
    db.flush()
    db.add(user)

    tasa = TasaCambio(
        tenant_id=tenant_id, valor_ves=Decimal("40.00"), fuente="BCV_OFICIAL",
        fecha=datetime.now(timezone.utc)
    )
    db.add(tasa)

    venta = Venta(
        tenant_id=tenant_id,
        numero_factura=f"FAC-{uuid.uuid4().hex[:8]}",
        fecha=datetime(2026, 8, 10, tzinfo=timezone.utc),
        subtotal_usd=Decimal("200.00"),
        iva_usd=Decimal("32.00"),
        igtf_usd=Decimal("0.00"),
        total_usd=Decimal("232.00"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("40.00"),
        estado="ACTIVA",
    )
    db.add(venta)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res_fin = client_app.post(
        "/fiscal/declaracion-iva/finalizar",
        json={"periodo": "2026-08", "retenciones": 40.0},  # 40 Bs.
    )
    assert res_fin.status_code == 200, res_fin.text

    # Monto en Bs. que el usuario debe ver: debito = 32 USD * 40 = 1280 Bs.
    esperado_debito_bs = Decimal("1280.00")

    res_pdf = client_app.get("/fiscal/declaracion-iva/pdf", params={"periodo": "2026-08"})
    assert res_pdf.status_code == 200, res_pdf.text
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert len(res_pdf.content) > 500  # PDF real generado, no vacio

    decl = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == "2026-08", DeclaracionIVA.tenant_id == tenant_id
    ).first()
    tasa_decl = Decimal(str(decl.tasa_cambio_bs))
    debito_bs_reconvertido = (Decimal(str(decl.debito_fiscal_usd)) * tasa_decl).quantize(Decimal("0.01"))
    assert debito_bs_reconvertido == esperado_debito_bs

    # Cleanup
    db.query(DeclaracionIVA).filter(DeclaracionIVA.id == decl.id).delete()
    db.query(Venta).filter(Venta.tenant_id == tenant_id).delete()
    db.query(TasaCambio).filter(TasaCambio.tenant_id == tenant_id).delete()
    db.query(Profile).filter(Profile.id == user.id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()
    db.close()
