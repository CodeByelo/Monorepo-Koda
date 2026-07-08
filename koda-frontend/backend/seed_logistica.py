import hashlib
from typing import Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from backend.core.database import SessionLocal
from backend.models import erp_extended, core, operations, hr, fiscal, audit
from backend.models.operations import Cliente, Producto, Venta, VentaDetalle
from backend.models.erp_extended import (
    Vehiculo, Chofer, TurnoDespacho, RegistroMantenimiento,
    TurnoVentaAsociacion, TurnoGasto, LogisticaLedger, CuarentenaLogistica
)

def calcular_hash_evento(prev_hash: str, turno_id: int, est_ant: Optional[str], est_nue: str, motivo: str) -> str:
    payload = f"{prev_hash}|{turno_id}|{est_ant or ''}|{est_nue}|{motivo}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()

def seed_logistica():
    db = SessionLocal()
    try:
        print("[SEED LOGISTICA] Limpiando tablas de logística antiguas...")
        db.query(CuarentenaLogistica).delete()
        db.query(LogisticaLedger).delete()
        db.query(TurnoGasto).delete()
        db.query(TurnoVentaAsociacion).delete()
        db.query(TurnoDespacho).delete()
        db.query(RegistroMantenimiento).delete()
        db.query(Vehiculo).delete()
        db.query(Chofer).delete()
        
        # Limpiar ventas y clientes de pruebas antiguas para evitar duplicidades
        db.query(VentaDetalle).delete()
        db.query(Venta).delete()
        db.query(Cliente).delete()
        db.query(Producto).delete()
        
        db.commit()

        print("[SEED LOGISTICA] Creando datos maestros de prueba...")
        
        # 1. Crear Cliente
        cliente = Cliente(
            rif="J-31045678-0",
            nombre="SUPERMERCADOS GARZON, C.A.",
            telefono="0276-3441122",
            email="logistica@garzon.com",
            direccion="Av. Las Lomas, San Cristóbal, Táchira",
            es_contribuyente_especial=True
        )
        db.add(cliente)
        db.flush() # Para obtener el ID

        # 2. Crear Productos
        prod_harina = Producto(
            sku="HAR-001",
            nombre="HARINA DE TRIGO KODA ENTERA 1KG",
            precio_usd=Decimal("1.45"),
            costo_usd=Decimal("0.95"),
            stock=Decimal("1500"),
            es_exento=True
        )
        prod_aceite = Producto(
            sku="ACE-002",
            nombre="ACEITE VEGETAL KODA PREMIUM 1L",
            precio_usd=Decimal("3.15"),
            costo_usd=Decimal("1.90"),
            stock=Decimal("800"),
            es_exento=False
        )
        prod_arroz = Producto(
            sku="ARR-003",
            nombre="ARROZ BLANCO KODA TIPO A 1KG",
            precio_usd=Decimal("1.10"),
            costo_usd=Decimal("0.70"),
            stock=Decimal("2000"),
            es_exento=True
        )
        db.add_all([prod_harina, prod_aceite, prod_arroz])
        db.flush()

        # 3. Crear Ventas (Facturas)
        venta1 = Venta(
            cliente_id=cliente.id,
            numero_factura="FAC-2026-0001",
            subtotal_usd=Decimal("450.00"),
            iva_usd=Decimal("0.00"),
            total_usd=Decimal("450.00"),
            metodo_pago="Transferencia",
            tasa_cambio_bs=Decimal("36.52"),
            estado="ACTIVA"
        )
        venta2 = Venta(
            cliente_id=cliente.id,
            numero_factura="FAC-2026-0002",
            subtotal_usd=Decimal("280.00"),
            iva_usd=Decimal("16.00"),
            total_usd=Decimal("296.00"),
            metodo_pago="Divisa",
            tasa_cambio_bs=Decimal("36.52"),
            estado="ACTIVA"
        )
        venta3 = Venta(
            cliente_id=cliente.id,
            numero_factura="FAC-2026-0003",
            subtotal_usd=Decimal("600.00"),
            iva_usd=Decimal("0.00"),
            total_usd=Decimal("600.00"),
            metodo_pago="Divisa",
            tasa_cambio_bs=Decimal("36.52"),
            estado="ACTIVA"
        )
        db.add_all([venta1, venta2, venta3])
        db.flush()

        # Detalles de venta
        det1 = VentaDetalle(venta_id=venta1.id, producto_id=prod_harina.id, cantidad=Decimal("300"), precio_usd_capturado=Decimal("1.45"))
        det2 = VentaDetalle(venta_id=venta2.id, producto_id=prod_aceite.id, cantidad=Decimal("80"), precio_usd_capturado=Decimal("3.15"))
        det3 = VentaDetalle(venta_id=venta3.id, producto_id=prod_arroz.id, cantidad=Decimal("500"), precio_usd_capturado=Decimal("1.10"))
        db.add_all([det1, det2, det3])

        # 4. Crear Vehículos de la Flota
        v1 = Vehiculo(
            nombre="MACK GRANITE VOLQUETA",
            placa="A52BT3",
            tipo="CAMION",
            marca="MACK",
            modelo="GRANITE",
            anio=2024,
            color="Blanco",
            capacidad_kg=Decimal("18000"),
            estado="DISPONIBLE",
            km_actuales=Decimal("12500"),
            proximo_servicio_km=Decimal("15000"),
            activo=True
        )
        v2 = Vehiculo(
            nombre="CHEVROLET FVR DE CARGA",
            placa="G43HJ9",
            tipo="CAMION",
            marca="CHEVROLET",
            modelo="FVR",
            anio=2023,
            color="Verde",
            capacidad_kg=Decimal("9000"),
            estado="EN_RUTA",
            km_actuales=Decimal("45600"),
            proximo_servicio_km=Decimal("50000"),
            activo=True
        )
        v3 = Vehiculo(
            nombre="CHEVROLET NPR FURGON",
            placa="K22LM3",
            tipo="FURGON",
            marca="CHEVROLET",
            modelo="NPR",
            anio=2022,
            color="Blanco",
            capacidad_kg=Decimal("5000"),
            estado="DISPONIBLE",
            km_actuales=Decimal("78900"),
            proximo_servicio_km=Decimal("85000"),
            activo=True
        )
        db.add_all([v1, v2, v3])
        db.flush()

        # 5. Crear Choferes
        c1 = Chofer(
            nombre="JOSE GREGORIO PEREZ",
            cedula="V-12345678",
            telefono="0412-5551122",
            licencia_tipo="5ta",
            licencia_vence=datetime.now().date() + timedelta(days=365),
            estado="DISPONIBLE",
            activo=True
        )
        c2 = Chofer(
            nombre="CARLOS ALBERTO MENDOZA",
            cedula="V-87654321",
            telefono="0414-9993344",
            licencia_tipo="5ta",
            licencia_vence=datetime.now().date() + timedelta(days=200),
            estado="DISPONIBLE",
            activo=True
        )
        c3 = Chofer(
            nombre="LUIS ENRIQUE MARTINEZ",
            cedula="V-15222333",
            telefono="0416-8885566",
            licencia_tipo="4ta",
            licencia_vence=datetime.now().date() - timedelta(days=10), # Vencido para generar alerta
            estado="EN_RUTA",
            activo=True
        )
        db.add_all([c1, c2, c3])
        db.flush()

        # 6. Crear Turnos de Despacho
        # Turno 1: Entregado y Liquidado (hace 2 días)
        t1 = TurnoDespacho(
            numero_turno="TRN-2026-001",
            vehiculo_id=v1.id,
            chofer_id=c1.id,
            nota_entrega_ref="NE-2026-0001",
            fecha_salida=datetime.now() - timedelta(days=2),
            fecha_retorno=datetime.now() - timedelta(days=1),
            destino="Zona Industrial Ureña, Táchira",
            ruta_descripcion="Autopista José Antonio Páez -> Frontera Táchira",
            observaciones="Cargar mercancía en almacén central con cuidado.",
            estado="ENTREGADO",
            telegram_notificado=True,
            km_retorno=Decimal("12680")
        )
        # Turno 2: En ruta (hoy en la mañana)
        t2 = TurnoDespacho(
            numero_turno="TRN-2026-002",
            vehiculo_id=v2.id,
            chofer_id=c3.id,
            nota_entrega_ref="NE-2026-0002",
            fecha_salida=datetime.now() - timedelta(hours=6),
            destino="Av. Los Próceres, Mérida, Mérida",
            ruta_descripcion="Carretera Trasandina Mérida",
            observaciones="Manifiesto consolidado de carga seca.",
            estado="EN_RUTA",
            telegram_notificado=True
        )
        # Turno 3: Programado (mañana)
        t3 = TurnoDespacho(
            numero_turno="TRN-2026-003",
            vehiculo_id=v3.id,
            chofer_id=c2.id,
            nota_entrega_ref="NE-2026-0003",
            fecha_salida=datetime.now() + timedelta(days=1),
            destino="Av. Codazzi, Barinas, Barinas",
            ruta_descripcion="Troncal 5 via Barinas",
            observaciones="Despacho de primera hora en la mañana.",
            estado="PROGRAMADO",
            telegram_notificado=False
        )
        db.add_all([t1, t2, t3])
        db.flush()

        # 7. Asociaciones a Ventas/Facturas (Multi-parada)
        aso1 = TurnoVentaAsociacion(turno_id=t1.id, venta_id=venta1.id, orden_parada=1, estado_entrega="ENTREGADO")
        aso2 = TurnoVentaAsociacion(turno_id=t2.id, venta_id=venta2.id, orden_parada=1, estado_entrega="PENDIENTE")
        aso3 = TurnoVentaAsociacion(turno_id=t3.id, venta_id=venta3.id, orden_parada=1, estado_entrega="PENDIENTE")
        db.add_all([aso1, aso2, aso3])

        # 8. Gastos Operativos del Turno 1 (Liquidado)
        g1 = TurnoGasto(turno_id=t1.id, categoria="COMBUSTIBLE", monto_usd=Decimal("120.00"), litros_combustible=Decimal("180.00"), descripcion="Gasoil Estación de Servicio San Cristóbal")
        g2 = TurnoGasto(turno_id=t1.id, categoria="PEAJES", monto_usd=Decimal("15.50"), descripcion="Peaje Vega de Aza + Peaje Libertad")
        g3 = TurnoGasto(turno_id=t1.id, categoria="VIATICOS", monto_usd=Decimal("50.00"), descripcion="Comida chofer y ayudante")
        db.add_all([g1, g2, g3])

        # 9. Bitácora Ledger Inmutable SHA-256 para Turno 1
        h0 = "0000000000000000000000000000000000000000000000000000000000000000"
        h1 = calcular_hash_evento(h0, t1.id, None, "PROGRAMADO", "Creación de viaje y asignación inicial.")
        h2 = calcular_hash_evento(h1, t1.id, "PROGRAMADO", "EN_RUTA", "Conductor inició tránsito en autopista.")
        h3 = calcular_hash_evento(h2, t1.id, "EN_RUTA", "ENTREGADO", "Entrega física de mercancía certificada en destino.")
        
        ledger_events = [
            LogisticaLedger(turno_id=t1.id, estado_anterior=None, estado_nuevo="PROGRAMADO", usuario="ADMIN_DESPACHO", motivo="Creación de viaje y asignación inicial.", hash_seguridad=h1),
            LogisticaLedger(turno_id=t1.id, estado_anterior="PROGRAMADO", estado_nuevo="EN_RUTA", usuario="JOSE PEREZ", motivo="Conductor inició tránsito en autopista.", hash_seguridad=h2),
            LogisticaLedger(turno_id=t1.id, estado_anterior="EN_RUTA", estado_nuevo="ENTREGADO", usuario="OPERADOR_SISTEMA", motivo="Entrega física de mercancía certificada en destino y gastos liquidados.", hash_seguridad=h3),
        ]
        db.add_all(ledger_events)

        # 10. Logística Inversa / Cuarentena
        q1 = CuarentenaLogistica(
            turno_id=t1.id,
            producto_id=prod_harina.id,
            cantidad=Decimal("50.0"),
            motivo="1 caja con humedad y 2 empaques rotos detectados en Ureña",
            estado="PENDIENTE_REVISION"
        )
        q2 = CuarentenaLogistica(
            turno_id=t1.id,
            producto_id=prod_aceite.id,
            cantidad=Decimal("15.0"),
            motivo="Devolución por fecha de vencimiento próxima",
            estado="APROBADO_REINGRESO"
        )
        db.add_all([q1, q2])

        # 11. Registros de Mantenimiento de prueba
        m1 = RegistroMantenimiento(
            vehiculo_id=v1.id,
            tipo="PREVENTIVO",
            descripcion="Cambio de aceite de motor y filtros de aire/combustible MACK original.",
            costo_usd=Decimal("380.00"),
            km_al_servicio=Decimal("10000"),
            proximo_km=Decimal("15000"),
            fecha=datetime.now() - timedelta(days=60)
        )
        m2 = RegistroMantenimiento(
            vehiculo_id=v2.id,
            tipo="CORRECTIVO",
            descripcion="Cambio de pastillas de freno delanteras y rectificación de discos.",
            costo_usd=Decimal("220.00"),
            km_al_servicio=Decimal("40000"),
            proximo_km=Decimal("50000"),
            fecha=datetime.now() - timedelta(days=30)
        )
        db.add_all([m1, m2])

        db.commit()
        print("[SEED LOGISTICA] ¡Datos de Logística de prueba sembrados exitosamente!")

    except Exception as err:
        db.rollback()
        print(f"[SEED LOGISTICA ERROR] Ocurrió un fallo inyectando los datos: {err}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_logistica()
