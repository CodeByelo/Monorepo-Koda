"""Semilla de datos extendidos para todos los módulos ERP."""
from datetime import datetime, timedelta
from decimal import Decimal

from backend.core.database import SessionLocal
from backend.models.operations import Cliente, Proveedor, Producto, Venta
from backend.models.core import Profile, TasaCambio
from backend.models.hr import Empleado
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.erp_extended import (
    Almacen, TransferenciaInventario, RequisicionCompra, NotaCredito, AnticipoCliente,
    Vendedor, CentroCosto, CuentaBancaria, MovimientoBancario, Cotizacion, OrdenVenta,
    LoteProducto, ConteoFisico, TransferenciaTesoreria, PrestamoUVC, PresupuestoPartida,
    RetencionIVA, CuentaPorCobrar,
)
from backend.core.security import get_password_hash


def seed_extended_data():
    from backend.models.erp_extended import CuentaContable
    
    db = SessionLocal()
    try:
        cuentas = [
            {"codigo": "1.1.01", "nombre": "Banco", "tipo": "ACTIVO", "naturaleza": "DEUDORA", "nivel": 3, "activa": True},
            {"codigo": "1.1.02", "nombre": "Cuentas por Cobrar", "tipo": "ACTIVO", "naturaleza": "DEUDORA", "nivel": 3, "activa": True},
            {"codigo": "4.1.01", "nombre": "Ingresos por Ventas", "tipo": "INGRESO", "naturaleza": "ACREEDORA", "nivel": 3, "activa": True},
        ]
        for c in cuentas:
            exist = db.query(CuentaContable).filter(CuentaContable.codigo == c["codigo"]).first()
            if not exist:
                print(f"[SEED INFO] Registrando cuenta contable: {c['codigo']} - {c['nombre']}")
                db.add(CuentaContable(**c))

        # Seed RetencionIVA if not present
        if not db.query(RetencionIVA).first():
            ret_iva = [
                RetencionIVA(
                    proveedor_rif="J-31234567-8",
                    proveedor_nombre="DISTRIBUIDORA ALIMENTOS POLAR, C.A.",
                    numero_factura="FAC-2026-0001",
                    base_usd=Decimal("500.00"),
                    alicuota=Decimal("0.1600"),
                    monto_usd=Decimal("60.00"),
                    tasa_cambio_bs=Decimal("36.52"),
                    periodo="2026-05",
                    estado="PENDIENTE"
                ),
                RetencionIVA(
                    proveedor_rif="J-50012345-6",
                    proveedor_nombre="INVERSIONES EL SOL, S.A.",
                    numero_factura="FAC-2026-0002",
                    base_usd=Decimal("300.00"),
                    alicuota=Decimal("0.1600"),
                    monto_usd=Decimal("36.00"),
                    tasa_cambio_bs=Decimal("36.52"),
                    periodo="2026-05",
                    estado="PENDIENTE"
                )
            ]
            db.add_all(ret_iva)
            print("[SEED INFO] Seeded RetencionIVA.")

        # Seed RetencionISLR if not present
        from backend.models.erp_extended import RetencionISLR
        if not db.query(RetencionISLR).first():
            ret_islr = [
                RetencionISLR(
                    proveedor_rif="J-41234567-9",
                    proveedor_nombre="SERVICIOS Y TECNOLOGIA KODA, C.A.",
                    numero_factura="FAC-2026-0101",
                    numero_control="00-00101",
                    base_usd=Decimal("1000.00"),
                    concepto_codigo="001",
                    alicuota=Decimal("0.0300"),
                    monto_usd=Decimal("30.00"),
                    tasa_cambio_bs=Decimal("36.52"),
                    periodo="2026-05",
                    estado="PENDIENTE"
                ),
                RetencionISLR(
                    proveedor_rif="V-12345678-9",
                    proveedor_nombre="JUAN VICENTE GOMEZ",
                    numero_factura="FAC-2026-0102",
                    numero_control="00-00102",
                    base_usd=Decimal("1500.00"),
                    concepto_codigo="003",
                    alicuota=Decimal("0.3400"),
                    monto_usd=Decimal("510.00"),
                    tasa_cambio_bs=Decimal("36.52"),
                    periodo="2026-05",
                    estado="PENDIENTE"
                )
            ]
            db.add_all(ret_islr)
            print("[SEED INFO] Seeded RetencionISLR.")

        # Seed Almacenes if empty
        if not db.query(Almacen).first():
            almacenes = [
                Almacen(
                    codigo="ALM-CENTRAL",
                    nombre="Almacén Principal Caracas",
                    responsable="Carlos Mendoza",
                    direccion="Av. Francisco de Miranda, Chacao",
                    activo=True
                ),
                Almacen(
                    codigo="ALM-VALENCIA",
                    nombre="Sucursal Valencia Centro",
                    responsable="Ana Rodríguez",
                    direccion="Zona Industrial Carabobo, Valencia",
                    activo=True
                ),
                Almacen(
                    codigo="ALM-MARACAIBO",
                    nombre="Distribuidora Occidente",
                    responsable="Luis Valera",
                    direccion="Sector Hato del Yaque, Maracaibo",
                    activo=True
                )
            ]
            db.add_all(almacenes)
            print("[SEED INFO] Seeded initial warehouses.")

        db.commit()
    except Exception as e:
        db.rollback()
        print("[SEED ERROR] Error seeding extended data:", e)
    finally:
        db.close()

