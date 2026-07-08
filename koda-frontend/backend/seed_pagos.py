import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from backend.core.database import SessionLocal
from backend.models.operations import Proveedor
from backend.models.erp_extended import CuentaPorPagar, CuentaBancaria

def seed_pagos():
    db = SessionLocal()
    try:
        print("[SEED PAGOS] Limpiando tablas de pagos antiguas...")
        db.query(CuentaPorPagar).delete()
        db.query(CuentaBancaria).delete()
        db.query(Proveedor).delete()
        db.commit()

        print("[SEED PAGOS] Creando proveedores...")
        p1 = Proveedor(
            rif="J-30012345-1",
            nombre="HARINAS MONACA C.A.",
            telefono="0212-9998877",
            email="cobros@monaca.com.ve",
            direccion="Zona Industrial I, Barquisimeto, Lara"
        )
        p2 = Proveedor(
            rif="J-30067890-2",
            nombre="ACEITES DIANA C.A.",
            telefono="0241-8887766",
            email="facturas@aceitesdiana.com",
            direccion="Zona Industrial Carabobo, Valencia, Carabobo"
        )
        p3 = Proveedor(
            rif="J-30099999-3",
            nombre="EMPAQUES CARACAS R.S.",
            telefono="0212-5554433",
            email="ventas@empaquescaracas.com",
            direccion="Av. Principal de Los Ruices, Caracas"
        )
        db.add_all([p1, p2, p3])
        db.flush()

        print("[SEED PAGOS] Creando cuentas bancarias...")
        cb1 = CuentaBancaria(
            banco="BANESCO",
            numero_cuenta="0134-0001-01-0001234567",
            moneda="VED",
            saldo_actual_usd=Decimal("5000.00"),
            activa=True
        )
        cb2 = CuentaBancaria(
            banco="PROVINCIAL",
            numero_cuenta="0108-0002-02-0007654321",
            moneda="USD",
            saldo_actual_usd=Decimal("12500.00"),
            activa=True
        )
        db.add_all([cb1, cb2])
        db.flush()

        print("[SEED PAGOS] Creando cuentas por pagar...")
        now = datetime.now(timezone.utc)
        cxp1 = CuentaPorPagar(
            proveedor_id=p1.id,
            numero_documento="FAC-MON-9988",
            monto_total_usd=Decimal("850.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("36.52"),
            fecha_emision=now - timedelta(days=15),
            fecha_vencimiento=now - timedelta(days=3), # Vencido
            estado="PENDIENTE"
        )
        cxp2 = CuentaPorPagar(
            proveedor_id=p2.id,
            numero_documento="FAC-DIA-5544",
            monto_total_usd=Decimal("1200.00"),
            monto_pagado_usd=Decimal("200.00"),
            tasa_cambio_bs=Decimal("36.52"),
            fecha_emision=now - timedelta(days=10),
            fecha_vencimiento=now + timedelta(days=5), # Por vencer
            estado="ABONADA"
        )
        cxp3 = CuentaPorPagar(
            proveedor_id=p3.id,
            numero_documento="FAC-EMP-1122",
            monto_total_usd=Decimal("350.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("1.00"), # Deuda Fija (Bs.)
            fecha_emision=now - timedelta(days=5),
            fecha_vencimiento=now + timedelta(days=12),
            estado="PENDIENTE"
        )
        db.add_all([cxp1, cxp2, cxp3])
        db.commit()
        print("[SEED PAGOS] Seed completado con éxito.")
    except Exception as e:
        print("[SEED PAGOS] Error al ejecutar seed:", e)
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_pagos()
