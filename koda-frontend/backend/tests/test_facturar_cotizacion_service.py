import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone, date
import pytest

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, Base, engine
from backend.models.core import Profile, TasaCambio, Tenant
from backend.models.operations import Producto, Cliente, Venta, VentaDetalle, KardexMovimiento
from backend.models.erp_extended import (
    Empresa, Cotizacion, CotizacionItem, StockPorAlmacen, Almacen,
    CuentaPorCobrar, CuentaContable, AuditoriaLog
)
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.fiscal import ReglaFiscal, CorrelativoFiscal
from backend.core.security import get_current_user


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def _crear_ambiente_cotizacion(db):
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        nombre_empresa=f"Empresa Cotizacion {uuid.uuid4().hex[:6]}",
        estado_licencia="ACTIVA"
    )
    db.add(tenant)
    db.flush()

    user = Profile(
        id=uuid.uuid4(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        nombre="Vendedor",
        apellido="Test",
        email=f"vendedor_{uuid.uuid4().hex[:6]}@test.com",
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

    # Crear almacén principal y almacén LOCAL
    almacen_local = Almacen(
        nombre="Tienda Principal",
        codigo=f"LOC-{uuid.uuid4().hex[:4]}",
        tipo="LOCAL",
        activo=True,
        tenant_id=tenant_id
    )
    db.add(almacen_local)
    db.flush()

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

    # Cuentas contables para que ContabilidadService genere asientos sin error
    cuentas_default = [
        ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
        ("1.1.02", "Cuentas por Cobrar Comerciales", "ACTIVO", 3),
        ("1.1.04", "Inventario de Mercancía", "ACTIVO", 3),
        ("2.1.03", "Débito Fiscal IVA", "PASIVO", 3),
        ("2.1.04", "IGTF por Pagar", "PASIVO", 3),
        ("4.1.01", "Ventas de Mercancía", "INGRESO", 3),
        ("5.1.01", "Costo de Ventas", "GASTO", 3),
    ]
    for cod, nom, tipo, niv in cuentas_default:
        existing = db.query(CuentaContable).filter(
            CuentaContable.codigo == cod,
            CuentaContable.tenant_id == tenant_id
        ).first()
        if not existing:
            db.add(CuentaContable(
                codigo=cod,
                nombre=nom,
                tipo=tipo,
                nivel=niv,
                activa=True,
                naturaleza="DEUDORA" if tipo in ["ACTIVO", "GASTO"] else "ACREEDORA",
                tenant_id=tenant_id
            ))

    cliente = Cliente(
        nombre="Cliente Cotizacion Test",
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
        nombre="Producto Prueba Cotizacion",
        precio_usd=Decimal("100.00"),
        costo_usd=Decimal("60.00"),
        stock=Decimal("50.00"),
        stock_minimo=Decimal("5"),
        es_exento=False,
        tenant_id=tenant_id
    )
    db.add(producto)
    db.flush()

    # Asignar stock en StockPorAlmacen
    stock_almacen = StockPorAlmacen(
        producto_id=producto.id,
        almacen_id=almacen_local.id,
        cantidad=Decimal("50.00"),
        tenant_id=tenant_id
    )
    db.add(stock_almacen)

    db.commit()
    return tenant, user, cliente, producto, almacen_local


def test_facturar_cotizacion_exitosa_descuenta_stock_y_genera_asiento(setup_db):
    """
    Facturar una cotización con un ítem de producto real y stock suficiente:
    - El stock del producto baja exactamente en la cantidad facturada.
    - StockPorAlmacen del almacén de venta baja también.
    - Se genera un KardexMovimiento.
    - Se genera el asiento contable (AsientoContable / AsientoDetalle).
    - Se crea la CuentaPorCobrar.
    - La cotización pasa a estado 'Facturada'.
    """
    db = SessionLocal()
    tenant, user, cliente, producto, almacen_local = _crear_ambiente_cotizacion(db)

    # Crear cotización en estado Aceptada
    cot = Cotizacion(
        numero_cotizacion=f"COT-{uuid.uuid4().hex[:6]}",
        cliente_id=cliente.id,
        fecha_emision=date.today(),
        fecha_vencimiento=date.today(),
        moneda="USD",
        tasa_cambio=Decimal("50.00"),
        subtotal=Decimal("200.00"),
        descuento_total=Decimal("0.00"),
        total=Decimal("232.00"),
        estado="Aceptada",
        tenant_id=tenant.id,
        creado_por=user.id
    )
    db.add(cot)
    db.flush()

    item = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=producto.id,
        descripcion="2 unidades de producto",
        cantidad=Decimal("2.00"),
        precio_unitario=Decimal("100.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("200.00")
    )
    db.add(item)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    stock_inicial_prod = producto.stock
    stock_inicial_alm = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == producto.id,
        StockPorAlmacen.almacen_id == almacen_local.id
    ).first().cantidad

    res = client_app.post(f"/ventas/cotizaciones/{cot.id}/facturar", json={"metodo_pago": "Transferencia"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    assert "numero_factura" in data
    assert data["estado_cotizacion"] == "Facturada"
    venta_id = data["venta_id"]

    db.refresh(producto)
    db.refresh(cot)

    # 1. Validar descuento de stock
    assert producto.stock == stock_inicial_prod - Decimal("2.00")
    stock_final_alm = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == producto.id,
        StockPorAlmacen.almacen_id == almacen_local.id
    ).first().cantidad
    assert stock_final_alm == stock_inicial_alm - Decimal("2.00")

    # 2. Validar KardexMovimiento
    kardex = db.query(KardexMovimiento).filter(
        KardexMovimiento.documento_referencia == data["numero_factura"],
        KardexMovimiento.tenant_id == tenant.id
    ).first()
    assert kardex is not None
    assert kardex.tipo_movimiento == "Venta"
    assert kardex.cantidad == Decimal("-2.00")
    assert kardex.almacen_id == almacen_local.id

    # 3. Validar AsientoContable
    asientos = db.query(AsientoContable).filter(
        AsientoContable.referencia == f"FAC-{data['numero_factura']}",
        AsientoContable.tenant_id == tenant.id
    ).all()
    assert len(asientos) >= 1  # Al menos asiento de venta (y costo de venta)
    detalles_asiento = db.query(AsientoDetalle).filter(
        AsientoDetalle.asiento_id.in_([a.id for a in asientos])
    ).all()
    assert len(detalles_asiento) > 0

    # 4. Validar CuentaPorCobrar
    cxc = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.venta_id == venta_id,
        CuentaPorCobrar.tenant_id == tenant.id
    ).first()
    assert cxc is not None
    assert cxc.numero_documento == data["numero_factura"]

    # 5. Validar estado cotización
    assert cot.estado == "Facturada"

    # 6. Validar AuditoriaLog con cotización referenciada
    log = db.query(AuditoriaLog).filter(
        AuditoriaLog.tenant_id == tenant.id,
        AuditoriaLog.accion == "VENTA_CREADA"
    ).order_by(AuditoriaLog.id.desc()).first()
    assert log is not None
    assert cot.numero_cotizacion in log.detalle
    assert data["numero_factura"] in log.detalle

    db.close()


def test_facturar_cotizacion_sin_producto_id_rechaza_400(setup_db):
    """
    Facturar una cotización con un ítem SIN producto_id:
    - Debe rechazar con 400.
    - No crear ninguna Venta ni tocar stock.
    """
    db = SessionLocal()
    tenant, user, cliente, producto, _ = _crear_ambiente_cotizacion(db)

    cot = Cotizacion(
        numero_cotizacion=f"COT-{uuid.uuid4().hex[:6]}",
        cliente_id=cliente.id,
        fecha_emision=date.today(),
        fecha_vencimiento=date.today(),
        moneda="USD",
        tasa_cambio=Decimal("50.00"),
        subtotal=Decimal("100.00"),
        descuento_total=Decimal("0.00"),
        total=Decimal("116.00"),
        estado="Aceptada",
        tenant_id=tenant.id,
        creado_por=user.id
    )
    db.add(cot)
    db.flush()

    item_sin_producto = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=None,  # Sin producto vinculante
        descripcion="Item generico sin id",
        cantidad=Decimal("1.00"),
        precio_unitario=Decimal("100.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("100.00")
    )
    db.add(item_sin_producto)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    stock_antes = producto.stock
    ventas_antes = db.query(Venta).filter(Venta.tenant_id == tenant.id).count()

    res = client_app.post(f"/ventas/cotizaciones/{cot.id}/facturar", json={})
    assert res.status_code == 400
    assert "no tiene un producto vinculado" in res.text

    db.refresh(producto)
    db.refresh(cot)
    ventas_despues = db.query(Venta).filter(Venta.tenant_id == tenant.id).count()

    assert producto.stock == stock_antes
    assert ventas_despues == ventas_antes
    assert cot.estado == "Aceptada"

    db.close()


def test_facturar_cotizacion_stock_insuficiente_rechaza_400_y_es_atomica(setup_db):
    """
    Facturar una cotización con stock insuficiente en algún ítem:
    - Debe rechazar con 400.
    - No descontar stock de ningún ítem (atomicidad).
    """
    db = SessionLocal()
    tenant, user, cliente, prod1, _ = _crear_ambiente_cotizacion(db)

    prod2 = Producto(
        sku=f"PROD2-{uuid.uuid4().hex[:6]}",
        nombre="Producto 2",
        precio_usd=Decimal("50.00"),
        costo_usd=Decimal("30.00"),
        stock=Decimal("1.00"),  # Solo 1 unidad disponible
        stock_minimo=Decimal("5"),
        es_exento=False,
        tenant_id=tenant.id
    )
    db.add(prod2)
    db.commit()

    cot = Cotizacion(
        numero_cotizacion=f"COT-{uuid.uuid4().hex[:6]}",
        cliente_id=cliente.id,
        fecha_emision=date.today(),
        fecha_vencimiento=date.today(),
        moneda="USD",
        tasa_cambio=Decimal("50.00"),
        subtotal=Decimal("350.00"),
        descuento_total=Decimal("0.00"),
        total=Decimal("406.00"),
        estado="Aceptada",
        tenant_id=tenant.id,
        creado_por=user.id
    )
    db.add(cot)
    db.flush()

    # Item 1 tiene suficiente stock (prod1 tiene 50, pide 2)
    item1 = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=prod1.id,
        descripcion="Prod 1 suficiente",
        cantidad=Decimal("2.00"),
        precio_unitario=Decimal("100.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("200.00")
    )
    # Item 2 NO tiene suficiente stock (prod2 tiene 1, pide 3)
    item2 = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=prod2.id,
        descripcion="Prod 2 insuficiente",
        cantidad=Decimal("3.00"),
        precio_unitario=Decimal("50.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("150.00")
    )
    db.add(item1)
    db.add(item2)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    stock_prod1_antes = prod1.stock
    stock_prod2_antes = prod2.stock

    res = client_app.post(f"/ventas/cotizaciones/{cot.id}/facturar", json={})
    assert res.status_code == 400
    assert "Stock insuficiente" in res.text

    db.refresh(prod1)
    db.refresh(prod2)
    db.refresh(cot)

    # Garantizar atomicidad: prod1 tampoco se descuenta
    assert prod1.stock == stock_prod1_antes
    assert prod2.stock == stock_prod2_antes
    assert cot.estado == "Aceptada"

    db.close()


def test_facturar_cotizacion_sin_cliente_rechaza_400(setup_db):
    """
    Facturar una cotización sin cliente vinculado:
    - Debe rechazar con 400.
    """
    db = SessionLocal()
    tenant, user, cliente, producto, _ = _crear_ambiente_cotizacion(db)

    cot = Cotizacion(
        numero_cotizacion=f"COT-{uuid.uuid4().hex[:6]}",
        cliente_id=None,  # Sin cliente
        fecha_emision=date.today(),
        fecha_vencimiento=date.today(),
        moneda="USD",
        tasa_cambio=Decimal("50.00"),
        subtotal=Decimal("100.00"),
        descuento_total=Decimal("0.00"),
        total=Decimal("116.00"),
        estado="Aceptada",
        tenant_id=tenant.id,
        creado_por=user.id
    )
    db.add(cot)
    db.flush()

    item = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=producto.id,
        descripcion="Item con producto",
        cantidad=Decimal("1.00"),
        precio_unitario=Decimal("100.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("100.00")
    )
    db.add(item)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    res = client_app.post(f"/ventas/cotizaciones/{cot.id}/facturar", json={})
    assert res.status_code == 400
    assert "cliente" in res.text.lower()

    db.close()


def test_facturar_cotizacion_usa_correlativo_fiscal_compartido(setup_db):
    """
    El número de factura generado al facturar una cotización debe consumir
    y compartir el mismo CorrelativoFiscal que /v1/facturacion/emitir y sales.py.
    """
    db = SessionLocal()
    tenant, user, cliente, producto, _ = _crear_ambiente_cotizacion(db)

    # Crear correlativo inicial
    correlativo = db.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "FACTURA",
        CorrelativoFiscal.tenant_id == tenant.id
    ).first()
    if not correlativo:
        correlativo = CorrelativoFiscal(
            tipo_documento="FACTURA",
            prefijo="FAC-",
            siguiente_numero=10,
            tenant_id=tenant.id
        )
        db.add(correlativo)
        db.commit()
    else:
        correlativo.siguiente_numero = 10
        db.commit()

    cot = Cotizacion(
        numero_cotizacion=f"COT-{uuid.uuid4().hex[:6]}",
        cliente_id=cliente.id,
        fecha_emision=date.today(),
        fecha_vencimiento=date.today(),
        moneda="USD",
        tasa_cambio=Decimal("50.00"),
        subtotal=Decimal("100.00"),
        descuento_total=Decimal("0.00"),
        total=Decimal("116.00"),
        estado="Aceptada",
        tenant_id=tenant.id,
        creado_por=user.id
    )
    db.add(cot)
    db.flush()

    item = CotizacionItem(
        cotizacion_id=cot.id,
        producto_id=producto.id,
        descripcion="Item prueba correlativo",
        cantidad=Decimal("1.00"),
        precio_unitario=Decimal("100.00"),
        descuento_porcentaje=Decimal("0.00"),
        total_fila=Decimal("100.00")
    )
    db.add(item)
    db.commit()

    def mock_user():
        return user

    app.dependency_overrides[get_current_user] = mock_user
    client_app = TestClient(app)

    # 1. Facturar vía cotización
    res_cot = client_app.post(f"/ventas/cotizaciones/{cot.id}/facturar", json={})
    assert res_cot.status_code == 200
    data_cot = res_cot.json()
    assert data_cot["numero_factura"] == "FAC-00000010"

    # 2. Emitir siguiente factura vía /v1/facturacion/emitir
    res_pos = client_app.post("/v1/facturacion/emitir", json={
        "cliente_id": cliente.id,
        "metodo_pago": "Transferencia",
        "detalles": [
            {
                "producto_id": producto.id,
                "cantidad": 1,
                "precio_unitario": 100.0
            }
        ]
    })
    assert res_pos.status_code == 201
    data_pos = res_pos.json()
    assert data_pos["numero_factura"] == "FAC-00000011"

    db.close()
