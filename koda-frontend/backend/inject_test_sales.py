import sys
from decimal import Decimal
from datetime import datetime
from backend.core.database import SessionLocal
# Importar todos los modelos primero para inicializar todos los mappers de SQLAlchemy
from backend.models import erp_extended, core, operations, hr, fiscal, audit
from backend.models.operations import Cliente, Producto, Venta, VentaDetalle

def inject_sales():
    db = SessionLocal()
    try:
        # Obtener el cliente principal
        cliente = db.query(Cliente).filter(Cliente.rif == "J-31045678-0").first()
        if not cliente:
            print("Creando cliente de prueba principal...")
            cliente = Cliente(
                rif="J-31045678-0",
                nombre="SUPERMERCADOS GARZON, C.A.",
                telefono="0276-3441122",
                email="logistica@garzon.com",
                direccion="Av. Las Lomas, San Cristóbal, Táchira",
                es_contribuyente_especial=True
            )
            db.add(cliente)
            db.flush()

        # Obtener productos de prueba
        prod_harina = db.query(Producto).filter(Producto.sku == "HAR-001").first()
        prod_aceite = db.query(Producto).filter(Producto.sku == "ACE-002").first()
        prod_arroz = db.query(Producto).filter(Producto.sku == "ARR-003").first()

        if not prod_harina or not prod_aceite or not prod_arroz:
            print("Creando productos maestros de prueba...")
            if not prod_harina:
                prod_harina = Producto(sku="HAR-001", nombre="HARINA DE TRIGO KODA ENTERA 1KG", precio_usd=Decimal("1.45"), costo_usd=Decimal("0.95"), stock=Decimal("1500"), es_exento=True)
                db.add(prod_harina)
            if not prod_aceite:
                prod_aceite = Producto(sku="ACE-002", nombre="ACEITE VEGETAL KODA PREMIUM 1L", precio_usd=Decimal("3.15"), costo_usd=Decimal("1.90"), stock=Decimal("800"), es_exento=False)
                db.add(prod_aceite)
            if not prod_arroz:
                prod_arroz = Producto(sku="ARR-003", nombre="ARROZ BLANCO KODA TIPO A 1KG", precio_usd=Decimal("1.10"), costo_usd=Decimal("0.70"), stock=Decimal("2000"), es_exento=True)
                db.add(prod_arroz)
            db.flush()

        # Crear 5 facturas nuevas consecutivas
        nuevas_facturas = [
            ("FAC-2026-0004", [
                (prod_harina, 120, "1.45"),
                (prod_aceite, 40, "3.15")
            ], "Transferencia"),
            ("FAC-2026-0005", [
                (prod_arroz, 250, "1.10")
            ], "Divisa"),
            ("FAC-2026-0006", [
                (prod_harina, 500, "1.45"),
                (prod_arroz, 300, "1.10")
            ], "Pago Móvil"),
            ("FAC-2026-0007", [
                (prod_aceite, 150, "3.15")
            ], "Divisa"),
            ("FAC-2026-0008", [
                (prod_harina, 100, "1.45"),
                (prod_aceite, 20, "3.15"),
                (prod_arroz, 150, "1.10")
            ], "Efectivo")
        ]

        inserted_count = 0
        for num_fac, items, metodo in nuevas_facturas:
            # Validar si ya existe
            existing = db.query(Venta).filter(Venta.numero_factura == num_fac).first()
            if existing:
                print(f"Factura {num_fac} ya existe en el sistema. Omitiendo.")
                continue

            # Calcular totales
            subtotal = Decimal("0.00")
            for prod, cant, precio in items:
                subtotal += Decimal(str(cant)) * Decimal(str(precio))

            # Aplicar IVA si corresponde (16% para productos no exentos)
            iva = Decimal("0.00")
            for prod, cant, precio in items:
                if not prod.es_exento:
                    iva += Decimal(str(cant)) * Decimal(str(precio)) * Decimal("0.16")

            total = subtotal + iva

            # Crear Venta
            venta = Venta(
                cliente_id=cliente.id,
                numero_factura=num_fac,
                subtotal_usd=subtotal,
                iva_usd=iva,
                total_usd=total,
                metodo_pago=metodo,
                tasa_cambio_bs=Decimal("36.52"),
                estado="ACTIVA"
            )
            db.add(venta)
            db.flush()

            # Crear Detalles
            for prod, cant, precio in items:
                det = VentaDetalle(
                    venta_id=venta.id,
                    producto_id=prod.id,
                    cantidad=Decimal(str(cant)),
                    precio_usd_capturado=Decimal(str(precio))
                )
                db.add(det)

            print(f"-> Factura {num_fac} creada exitosamente (Monto: {total} USD)")
            inserted_count += 1

        db.commit()
        print(f"\n[INYECCIÓN EXITOSA] Se han inyectado {inserted_count} facturas de venta adicionales para logística.")
    except Exception as e:
        db.rollback()
        print(f"Error inyectando facturas: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    inject_sales()
