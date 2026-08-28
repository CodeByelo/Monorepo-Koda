import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
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
from backend.models.operations import Producto, Proveedor
from backend.models.erp_extended import (
    Almacen, Compra, RecepcionStock, DevolucionProveedor, RequisicionCompra
)
from backend.models.fiscal import CorrelativoFiscal
from backend.schemas.operations import RecepcionStockCreate, DevolucionProveedorCreate
from backend.routers.operaciones.compras import (
    procesar_recepcion, crear_devolucion, create_requisicion, RequisicionCreate
)
from fastapi import HTTPException


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


def test_bug1_procesar_recepcion_valida_almacen_tenant(db_session):
    """
    Bug 1: procesar_recepcion aceptaba almacen_id de otro tenant sin validar.
    Verifica que pasar un almacen_id perteneciente a Tenant B con un usuario de Tenant A lanza HTTP 404.
    """
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    # Producto y almacén de Tenant A
    prod_a = Producto(sku="SKU-A", nombre="Prod A", precio_usd=Decimal("15.00"), costo_usd=Decimal("10.00"), stock=Decimal("100.00"), tenant_id=tenant_a_id)
    alm_a = Almacen(codigo="ALM-A", nombre="Almacen A", tenant_id=tenant_a_id)

    # Almacén de Tenant B
    alm_b = Almacen(codigo="ALM-B", nombre="Almacen B", tenant_id=tenant_b_id)

    db_session.add_all([prod_a, alm_a, alm_b])
    db_session.commit()

    user_a = MagicMock()
    user_a.tenant_id = tenant_a_id

    # Intentar recibir en almacén de Tenant B debe fallar con 404
    req_cross = RecepcionStockCreate(
        producto_id=prod_a.id,
        almacen_id=alm_b.id,
        cantidad=Decimal("10.00"),
        costo_factura=Decimal("12.00"),
        orden_compra="OC-001"
    )
    with pytest.raises(HTTPException) as exc_info:
        procesar_recepcion(req=req_cross, db=db_session, current_user=user_a)
    assert exc_info.value.status_code == 404
    assert "Almacén no encontrado" in exc_info.value.detail

    # Recibir en almacén propio debe ser exitoso
    req_ok = RecepcionStockCreate(
        producto_id=prod_a.id,
        almacen_id=alm_a.id,
        cantidad=Decimal("10.00"),
        costo_factura=Decimal("12.00"),
        orden_compra="OC-001"
    )
    res = procesar_recepcion(req=req_ok, db=db_session, current_user=user_a)
    assert res["ok"] is True


def test_bug2_correlativo_fiscal_en_hoja_recepcion_devolucion_y_requisicion(db_session):
    """
    Bug 2: procesar_recepcion (hoja_id), crear_devolucion (numero_devolucion) y create_requisicion (numero)
    usaban count()/max(id) sin lock.
    Verifica que se usa CorrelativoFiscal atómico con tipos de documento:
    'RECEPCION_STOCK', 'DEVOLUCION_PROVEEDOR', 'REQUISICION_COMPRA'.
    """
    tenant_id = uuid.uuid4()
    user = MagicMock()
    user.tenant_id = tenant_id

    prod = Producto(sku="SKU-PROD", nombre="Prod", precio_usd=Decimal("15.00"), costo_usd=Decimal("10.00"), stock=Decimal("100.00"), tenant_id=tenant_id)
    alm = Almacen(codigo="ALM-1", nombre="Almacen 1", tenant_id=tenant_id)
    prov = Proveedor(nombre="Prov 1", rif="J-12345678-0", tenant_id=tenant_id)
    db_session.add_all([prod, alm, prov])
    db_session.commit()

    # 1. Crear 2 Recepciones
    req1 = RecepcionStockCreate(producto_id=prod.id, almacen_id=alm.id, cantidad=Decimal("5"), costo_factura=Decimal("10"), orden_compra="OC1")
    req2 = RecepcionStockCreate(producto_id=prod.id, almacen_id=alm.id, cantidad=Decimal("5"), costo_factura=Decimal("10"), orden_compra="OC2")
    procesar_recepcion(req=req1, db=db_session, current_user=user)
    procesar_recepcion(req=req2, db=db_session, current_user=user)

    recs = db_session.query(RecepcionStock).filter(RecepcionStock.tenant_id == tenant_id).order_by(RecepcionStock.id).all()
    assert len(recs) == 2
    assert recs[0].hoja_id == "REC-0001"
    assert recs[1].hoja_id == "REC-0002"

    corr_rec = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "RECEPCION_STOCK",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_rec.siguiente_numero == 3

    # 2. Crear 2 Devoluciones
    dev1 = DevolucionProveedorCreate(proveedor_id=prov.id, motivo="Defectuoso", monto_usd=Decimal("50"))
    dev2 = DevolucionProveedorCreate(proveedor_id=prov.id, motivo="Defectuoso", monto_usd=Decimal("50"))
    crear_devolucion(dev_in=dev1, db=db_session, current_user=user)
    crear_devolucion(dev_in=dev2, db=db_session, current_user=user)

    devs = db_session.query(DevolucionProveedor).filter(DevolucionProveedor.tenant_id == tenant_id).order_by(DevolucionProveedor.id).all()
    assert len(devs) == 2
    assert devs[0].numero_devolucion == "DEV-0001"
    assert devs[1].numero_devolucion == "DEV-0002"

    corr_dev = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "DEVOLUCION_PROVEEDOR",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_dev.siguiente_numero == 3

    # 3. Crear 2 Requisiciones
    rq1 = RequisicionCreate(solicitante="Juan", area="Ventas", descripcion="Compra de insumos 1", monto_estimado=Decimal("100"), prioridad="NORMAL")
    rq2 = RequisicionCreate(solicitante="Pedro", area="Compras", descripcion="Compra de insumos 2", monto_estimado=Decimal("200"), prioridad="ALTA")
    create_requisicion(req=rq1, db=db_session, current_user=user)
    create_requisicion(req=rq2, db=db_session, current_user=user)

    reqs = db_session.query(RequisicionCompra).filter(RequisicionCompra.tenant_id == tenant_id).order_by(RequisicionCompra.id).all()
    assert len(reqs) == 2
    assert reqs[0].numero == "REQ-00000001"
    assert reqs[1].numero == "REQ-00000002"

    corr_req = db_session.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "REQUISICION_COMPRA",
        CorrelativoFiscal.tenant_id == tenant_id
    ).first()
    assert corr_req.siguiente_numero == 3


def test_bug3_crear_devolucion_valida_factura_tenant(db_session):
    """
    Bug 3: crear_devolucion no validaba factura_id contra el tenant del usuario.
    Verifica que pasar una factura_id de Tenant B con un usuario de Tenant A responde 404.
    """
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    prov_a = Proveedor(nombre="Prov A", rif="J-11111111-1", tenant_id=tenant_a_id)
    prov_b = Proveedor(nombre="Prov B", rif="J-22222222-2", tenant_id=tenant_b_id)
    db_session.add_all([prov_a, prov_b])
    db_session.flush()

    compra_b = Compra(
        proveedor_id=prov_b.id,
        numero_factura="FAC-B-001",
        subtotal_usd=Decimal("100"),
        iva_usd=Decimal("16"),
        total_usd=Decimal("116"),
        tasa_cambio_bs=Decimal("36.5"),
        tenant_id=tenant_b_id
    )
    db_session.add(compra_b)
    db_session.commit()

    user_a = MagicMock()
    user_a.tenant_id = tenant_a_id

    dev_cross = DevolucionProveedorCreate(
        proveedor_id=prov_a.id,
        factura_id=compra_b.id,
        motivo="Factura ajena",
        monto_usd=Decimal("50")
    )

    with pytest.raises(HTTPException) as exc_info:
        crear_devolucion(dev_in=dev_cross, db=db_session, current_user=user_a)
    assert exc_info.value.status_code == 404
    assert "Factura de compra no encontrada" in exc_info.value.detail
