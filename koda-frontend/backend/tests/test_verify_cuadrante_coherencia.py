"""
test_verify_cuadrante_coherencia.py
Verifica que obtener_ficha_360_producto y calcular_matriz_abc producen
exactamente el mismo cuadrante. Se ejecuta como pytest normal.
"""
import os, uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
for k in ["SECRET_KEY","AUDIT_LOG_SECRET","BOT_INTERNAL_API_KEY","ORG_SYNC_API_KEY",
          "LOGISTICS_INTERNAL_FORWARD_KEY","SSO_BRIDGE_INTERNAL_KEY"]:
    if not os.getenv(k):
        os.environ[k] = f"a_very_secret_key_{k.lower()}_at_least_32_chars_long"

from backend.core.database import Base
from backend.models.core import Organization, Profile
from backend.models.operations import Producto, Venta, VentaDetalle, Cliente
from backend.services.analitica_inventario import calcular_matriz_abc
from backend.routers.operaciones.inventario import obtener_ficha_360_producto


# Mapeo esperado de etiquetas en Ficha 360 según analitica_inventario.cuadrante
CUADRANTE_LABELS = {
    "stars":     "Estrellas (Alta Rotación / Alto Margen)",
    "questions": "Incógnitas (Baja Rotación / Alto Margen)",
    "cows":      "Vacas de Efectivo (Alta Rotación / Bajo Margen)",
    "dogs":      "Perros (Baja Rotación / Bajo Margen)",
}


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine("sqlite:///:memory:")
    @sa_event.listens_for(engine, "connect")
    def do_attach(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS public;")
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


def _setup_tenant_and_user(db):
    tid = uuid.uuid4()
    db.add(Organization(id=tid, name=f"Tenant {tid}", status="active"))
    db.flush()
    user = Profile(id=uuid.uuid4(), tenant_id=tid, username="tester", email="test@koda.com", rol_id=1)
    db.add(user)
    db.flush()
    return tid, user


def test_cuadrante_estrella_coincide_entre_ficha_y_abc(db_session):
    """Producto alta rotación + alto margen debe coincidir exactamente en ambas vistas."""
    db = db_session
    tid, user = _setup_tenant_and_user(db)

    cliente = Cliente(nombre="CLI", rif="J0001", tenant_id=tid)
    db.add(cliente)
    # 2 productos para que la media dinámica permita clasificar alta rotación / alto margen
    prod_estrella = Producto(nombre="Estrella Test", sku="E001",
                             precio_usd=Decimal("100"), costo_usd=Decimal("30"),
                             stock=Decimal("50"), tenant_id=tid)
    prod_perro = Producto(nombre="Perro Test", sku="D001",
                          precio_usd=Decimal("20"), costo_usd=Decimal("18"),
                          stock=Decimal("10"), tenant_id=tid)
    db.add_all([prod_estrella, prod_perro])
    db.flush()

    venta = Venta(
        tenant_id=tid,
        numero_factura="FAC-0001",
        cliente_id=cliente.id,
        fecha=datetime.now(timezone.utc) - timedelta(days=5),
        subtotal_usd=Decimal("7000.00"),
        iva_usd=Decimal("0.00"),
        igtf_usd=Decimal("0.00"),
        retencion_iva_usd=Decimal("0.00"),
        total_usd=Decimal("7000.00"),
        metodo_pago="Efectivo",
        tasa_cambio_bs=Decimal("36.50"),
        estado="ACTIVA"
    )
    db.add(venta)
    db.flush()
    db.add(VentaDetalle(
        tenant_id=tid,
        venta_id=venta.id,
        producto_id=prod_estrella.id,
        cantidad=Decimal("70"),
        precio_usd_capturado=Decimal("100")
    ))
    db.commit()

    # 1. Matriz ABC
    clasificados = calcular_matriz_abc(db, tid)
    abc_map = {c.producto.id: c for c in clasificados}
    c_estrella = abc_map[prod_estrella.id]

    # 2. Endpoint Ficha 360 real
    ficha = obtener_ficha_360_producto(id=prod_estrella.id, db=db, current_user=user)

    assert c_estrella.cuadrante == "stars"
    # Ficha 360 devuelve la etiqueta amigable del mapeo
    assert ficha["producto"]["cuadrante"] == CUADRANTE_LABELS["stars"]
    assert ficha["producto"]["rotacion_30d"] == c_estrella.rotacion


def test_cuadrante_producto_sin_ventas_es_dogs(db_session):
    """Producto sin ventas → rotación 0.0 y coherente entre Matriz ABC y Ficha 360."""
    db = db_session
    tid, user = _setup_tenant_and_user(db)

    p_vendido = Producto(nombre="Vendido", sku="V001", precio_usd=Decimal("100"), costo_usd=Decimal("20"),
                         stock=Decimal("10"), tenant_id=tid)
    p_sin_ventas = Producto(nombre="Sin Ventas", sku="N001", precio_usd=Decimal("10"), costo_usd=Decimal("9"),
                            stock=Decimal("5"), tenant_id=tid)
    db.add_all([p_vendido, p_sin_ventas])
    db.flush()

    venta = Venta(
        tenant_id=tid,
        numero_factura="FAC-0002",
        fecha=datetime.now(timezone.utc) - timedelta(days=2),
        subtotal_usd=Decimal("1000.00"),
        iva_usd=Decimal("0.00"),
        total_usd=Decimal("1000.00"),
        metodo_pago="Transferencia",
        tasa_cambio_bs=Decimal("36.50"),
        estado="ACTIVA"
    )
    db.add(venta)
    db.flush()
    db.add(VentaDetalle(
        tenant_id=tid,
        venta_id=venta.id,
        producto_id=p_vendido.id,
        cantidad=Decimal("10"),
        precio_usd_capturado=Decimal("100")
    ))
    db.commit()

    clasificados = calcular_matriz_abc(db, tid)
    abc_map = {c.producto.id: c for c in clasificados}
    c_sin = abc_map[p_sin_ventas.id]

    ficha = obtener_ficha_360_producto(id=p_sin_ventas.id, db=db, current_user=user)

    assert c_sin.rotacion == 0.0
    assert c_sin.cuadrante == "dogs"
    assert ficha["producto"]["cuadrante"] == CUADRANTE_LABELS["dogs"]
    assert ficha["producto"]["rotacion_30d"] == 0.0


def test_tres_cuadrantes_distintos_coherentes(db_session):
    """Verifica que para múltiples productos, Ficha 360 y Matriz ABC son idénticos."""
    db = db_session
    tid, user = _setup_tenant_and_user(db)

    p_star = Producto(nombre="Star", sku="ST", precio_usd=Decimal("100"), costo_usd=Decimal("10"), stock=50, tenant_id=tid)
    p_question = Producto(nombre="Question", sku="QU", precio_usd=Decimal("100"), costo_usd=Decimal("10"), stock=10, tenant_id=tid)
    p_dog = Producto(nombre="Dog", sku="DG", precio_usd=Decimal("10"), costo_usd=Decimal("9"), stock=5, tenant_id=tid)
    db.add_all([p_star, p_question, p_dog])
    db.flush()

    v1 = Venta(
        tenant_id=tid,
        numero_factura="FAC-0003",
        fecha=datetime.now(timezone.utc) - timedelta(days=1),
        subtotal_usd=Decimal("5000.00"),
        iva_usd=Decimal("0.00"),
        total_usd=Decimal("5000.00"),
        metodo_pago="Efectivo",
        tasa_cambio_bs=Decimal("36.50"),
        estado="ACTIVA"
    )
    db.add(v1)
    db.flush()
    db.add(VentaDetalle(
        tenant_id=tid,
        venta_id=v1.id,
        producto_id=p_star.id,
        cantidad=Decimal("50"),
        precio_usd_capturado=Decimal("100")
    ))
    db.commit()

    clasificados = calcular_matriz_abc(db, tid)
    abc_map = {c.producto.id: c for c in clasificados}

    for p in [p_star, p_question, p_dog]:
        c = abc_map[p.id]
        ficha = obtener_ficha_360_producto(id=p.id, db=db, current_user=user)
        nombre_cuadrante_esperado = CUADRANTE_LABELS[c.cuadrante]
        assert ficha["producto"]["cuadrante"] == nombre_cuadrante_esperado, (
            f"Discrepancia en {p.nombre}: ABC={c.cuadrante} ({nombre_cuadrante_esperado}) vs Ficha={ficha['producto']['cuadrante']}"
        )
        assert ficha["producto"]["rotacion_30d"] == c.rotacion
