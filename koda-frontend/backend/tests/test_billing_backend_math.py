import sys
import os
from pathlib import Path
import uuid
from decimal import Decimal

# Asegurar que /app esté en el PYTHONPATH
sys.path.insert(0, "/app")

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.database import SessionLocal, get_db
from backend.models.operations import Producto, Venta, VentaDetalle, Cliente
from backend.models.core import Profile, TasaCambio
from backend.core.security import get_current_user_from_token

# Mock de autenticación para que devuelva un perfil válido en los tests
def mock_get_current_user():
    session = SessionLocal()
    try:
        user = session.query(Profile).first()
        if not user:
            # Crear un perfil de prueba temporal
            user = Profile(
                username="test_auth_user",
                nombre="Test",
                apellido="Auth",
                email="test_auth@koda.com",
                password_hash="...",
                rol="Admin",
                tenant_id=uuid.uuid4()
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        return user
    finally:
        session.close()

# Inyectar el mock en la dependencia de FastAPI
app.dependency_overrides[get_current_user_from_token] = mock_get_current_user

client = TestClient(app)

def cleanup_test_data(session):
    from backend.models.operations import KardexMovimiento
    from backend.models.erp_extended import CuentaPorCobrar
    
    test_prod_ids = [p.id for p in session.query(Producto).filter(Producto.sku.in_(["TEST-A", "TEST-B"])).all()]
    if test_prod_ids:
        # Delete kardex movements
        session.query(KardexMovimiento).filter(KardexMovimiento.producto_id.in_(test_prod_ids)).delete(synchronize_session=False)
        
        # Find related ventas
        details = session.query(VentaDetalle).filter(VentaDetalle.producto_id.in_(test_prod_ids)).all()
        venta_ids = list(set([d.venta_id for d in details if d.venta_id]))
        
        if venta_ids:
            # Delete Accounts Receivable (CxC)
            session.query(CuentaPorCobrar).filter(CuentaPorCobrar.venta_id.in_(venta_ids)).delete(synchronize_session=False)
            # Delete Venta details
            session.query(VentaDetalle).filter(VentaDetalle.venta_id.in_(venta_ids)).delete(synchronize_session=False)
            # Delete Ventas
            session.query(Venta).filter(Venta.id.in_(venta_ids)).delete(synchronize_session=False)
            
        # Delete products
        session.query(Producto).filter(Producto.id.in_(test_prod_ids)).delete(synchronize_session=False)
    session.commit()

def main():
    print("--- INICIANDO PRUEBAS DE LOGICA Y MATEMATICAS DE FACTURACION ---")
    
    session = SessionLocal()
    try:
        # 1. Preparar tasa de cambio oficial (por ejemplo 36.50)
        tasa = session.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
        if not tasa:
            tasa = TasaCambio(valor_ves=36.50, fuente="BCV Test")
            session.add(tasa)
            session.commit()
            session.refresh(tasa)
        tasa_val = Decimal(str(tasa.valor_ves))
        print(f"📊 Tasa BCV Oficial en DB: {tasa_val} Bs/$")
        
        # 2. Insertar productos de prueba
        # Limpiar registros previos si existen
        cleanup_test_data(session)
        
        # Producto A: precio 10.00 USD, costo 5.00, stock 100, no exento (16% IVA)
        prod_a = Producto(
            sku="TEST-A",
            nombre="Test Prod A (Gravado)",
            precio_usd=Decimal("10.00"),
            costo_usd=Decimal("5.00"),
            stock=Decimal("100.00"),
            es_exento=False
        )
        # Producto B: precio 20.00 USD, costo 10.00, stock 100, exento (0% IVA)
        prod_b = Producto(
            sku="TEST-B",
            nombre="Test Prod B (Exento)",
            precio_usd=Decimal("20.00"),
            costo_usd=Decimal("10.00"),
            stock=Decimal("100.00"),
            es_exento=True
        )
        session.add(prod_a)
        session.add(prod_b)
        session.commit()
        session.refresh(prod_a)
        session.refresh(prod_b)
        print(f"✔️  Productos de prueba creados: TEST-A (${prod_a.precio_usd}) y TEST-B (${prod_b.precio_usd})")
        
        # 3. Obtener o crear un cliente de prueba en la base de datos
        cliente = session.query(Cliente).first()
        if not cliente:
            cliente = Cliente(
                rif="J-12345678-9",
                nombre="Cliente de Prueba",
                telefono="0212-5555555",
                email="cliente@test.com",
                direccion="Caracas, Venezuela"
            )
            session.add(cliente)
            session.commit()
            session.refresh(cliente)
        cliente_id = cliente.id
        print(f"👤 Cliente de prueba para la venta: {cliente.nombre} (ID: {cliente_id})")

        # 4. Solicitar factura enviando solo IDs y cantidades
        # Solicitud 1: Pago en divisa (aplica IGTF 3%)
        # Payload NO contiene subtotales, totales, IVA ni precios unitarios.
        payload = {
            "cliente_id": cliente_id,
            "metodo_pago": "Divisa",
            "moneda_pago": "USD",
            "dias_credito": 0,
            "detalles": [
                {"producto_id": prod_a.id, "cantidad": 2.00}, # 2 * 10.00 = 20.00 USD
                {"producto_id": prod_b.id, "cantidad": 1.00}  # 1 * 20.00 = 20.00 USD
            ]
        }
        
        print("\n1. Enviando orden de facturacion (Pago en USD)...")
        headers = {"X-Idempotency-Key": str(uuid.uuid4())}
        response = client.post("/ventas/facturar", json=payload, headers=headers)
        assert response.status_code == 201, f"Error: Se esperaba 201 pero se obtuvo {response.status_code}. Detalle: {response.text}"
        
        data = response.json()
        print(f"   Respuesta del Servidor: {data}")
        
        # Expectativas matemáticas:
        # Subtotal Gravado = 20.00 USD
        # Subtotal Exento = 20.00 USD
        # Subtotal Total = 40.00 USD
        # IVA (16% de 20.00) = 3.20 USD
        # IGTF (3% de Subtotal + IVA = 43.20) = 43.20 * 0.03 = 1.296 -> redondeado a 1.30 USD
        # Total = 40.00 + 3.20 + 1.30 = 44.50 USD
        assert float(data["subtotal_usd"]) == 40.00, f"Subtotal incorrecto: {data['subtotal_usd']}"
        assert float(data["iva_usd"]) == 3.20, f"IVA incorrecto: {data['iva_usd']}"
        assert float(data["igtf_usd"]) == 1.30, f"IGTF incorrecto: {data['igtf_usd']}"
        assert float(data["total_usd"]) == 44.50, f"Total incorrecto: {data['total_usd']}"
        print("✔️  Calculo de totales, IVA e IGTF en USD calculado correctamente en el backend!")
        
        # 5. Verificar que se descontó el stock correctamente
        session.refresh(prod_a)
        session.refresh(prod_b)
        assert prod_a.stock == Decimal("98.00"), f"Stock incorrecto para TEST-A: {prod_a.stock}"
        assert prod_b.stock == Decimal("99.00"), f"Stock incorrecto para TEST-B: {prod_b.stock}"
        print("✔️  Stock descontado del inventario con bloqueo de fila de forma segura!")
        
        # 6. Probar que si intentamos enviar precios o totales manipulados, son ignorados
        print("\n2. Intentando enviar precios y totales manipulados desde el frontend...")
        payload_manipulado = {
            "cliente_id": cliente_id,
            "metodo_pago": "Efectivo",
            "moneda_pago": "Bs",
            "subtotal_usd": 1.00, # Manipulado!
            "total_usd": 1.00,    # Manipulado!
            "detalles": [
                {"producto_id": prod_a.id, "cantidad": 1.00, "precio_usd": 1.00} # Precio manipulado!
            ]
        }
        headers2 = {"X-Idempotency-Key": str(uuid.uuid4())}
        response_man = client.post("/ventas/facturar", json=payload_manipulado, headers=headers2)
        assert response_man.status_code == 201, f"Error: Se esperaba 201 pero se obtuvo {response_man.status_code}"
        
        data_man = response_man.json()
        # El precio oficial del TEST-A es 10.00, por lo que el subtotal real debe ser 10.00 (el manipulado era 1.00)
        # IVA de 10.00 = 1.60
        # IGTF de Efectivo Bs = 0.00
        # Total = 10.00 + 1.60 = 11.60
        assert float(data_man["subtotal_usd"]) == 10.00, f"Error: El backend acepto el subtotal manipulado: {data_man['subtotal_usd']}"
        assert float(data_man["total_usd"]) == 11.60, f"Error: El backend acepto el total manipulado: {data_man['total_usd']}"
        print("✔️  Ataque de manipulacion de precios / totales bloqueado! El backend calculo todo con los valores oficiales de la BD.")
        
        # Limpieza final
        cleanup_test_data(session)
        print("\n🎉 ¡TODAS LAS PRUEBAS DE LOGICA Y MATEMATICAS DE FACTURACION PASARON EXITOSAMENTE!")
        
    finally:
        session.close()

if __name__ == "__main__":
    main()
