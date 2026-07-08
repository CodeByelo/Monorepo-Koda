from sqlalchemy.orm import Session
from fastapi import HTTPException
from decimal import Decimal
from datetime import datetime, timezone
from backend.models.erp_extended import AsientoContable, DetalleAsiento, CuentaContable

class ContabilidadService:
    @staticmethod
    def generar_asiento_venta(venta, db: Session):
        """
        Crea un asiento contable para el registro de una venta.
        Afecta:
          - DEBE: 1.1.02 (Cuentas por Cobrar)
          - HABER: 4.1.01 (Ingresos por Ventas)
        """
        # 1. Buscar las cuentas contables requeridas
        cta_cxc = db.query(CuentaContable).filter(CuentaContable.codigo == "1.1.02").first()
        if not cta_cxc:
            raise HTTPException(
                status_code=400,
                detail="Cuenta contable 1.1.02 (Cuentas por Cobrar) no encontrada."
            )
            
        cta_ingresos = db.query(CuentaContable).filter(CuentaContable.codigo == "4.1.01").first()
        if not cta_ingresos:
            raise HTTPException(
                status_code=400,
                detail="Cuenta contable 4.1.01 (Ingresos por Ventas) no encontrada."
            )

        monto = Decimal(str(venta.total_usd))

        # 2. Crear cabecera de AsientoContable
        asiento = AsientoContable(
            fecha=venta.fecha if hasattr(venta, "fecha") and venta.fecha else datetime.now(timezone.utc),
            concepto=f"Registro de Venta - Factura {venta.numero_factura}",
            referencia=f"FAC-{venta.numero_factura}",
            total_debe_usd=monto,
            total_haber_usd=monto,
            tasa_cambio_bs=Decimal(str(venta.tasa_cambio_bs)),
            estado="ACTIVO"
        )
        db.add(asiento)
        db.flush()  # Para obtener el id del asiento contable

        # 3. Crear detalles (DetalleAsiento / AsientoDetalle)
        # Detalle al DEBE: Cuentas por Cobrar
        detalle_debe = DetalleAsiento(
            asiento_id=asiento.id,
            cuenta_codigo="1.1.02",
            cuenta_nombre=cta_cxc.nombre,
            debe_usd=monto,
            haber_usd=Decimal("0.00")
        )
        
        # Detalle al HABER: Ingresos por Ventas
        detalle_haber = DetalleAsiento(
            asiento_id=asiento.id,
            cuenta_codigo="4.1.01",
            cuenta_nombre=cta_ingresos.nombre,
            debe_usd=Decimal("0.00"),
            haber_usd=monto
        )
        
        db.add(detalle_debe)
        db.add(detalle_haber)
        return asiento

    @staticmethod
    def generar_asiento_pago(pago, db: Session):
        """
        Crea un asiento contable para el registro de un pago.
        Afecta:
          - DEBE: 1.1.01 (Banco)
          - HABER: 1.1.02 (Cuentas por Cobrar)
        """
        # 1. Buscar las cuentas contables requeridas
        cta_banco = db.query(CuentaContable).filter(CuentaContable.codigo == "1.1.01").first()
        if not cta_banco:
            raise HTTPException(
                status_code=400,
                detail="Cuenta contable 1.1.01 (Banco) no encontrada."
            )
            
        cta_cxc = db.query(CuentaContable).filter(CuentaContable.codigo == "1.1.02").first()
        if not cta_cxc:
            raise HTTPException(
                status_code=400,
                detail="Cuenta contable 1.1.02 (Cuentas por Cobrar) no encontrada."
            )

        monto = Decimal(str(pago.monto_pagado_usd))

        # 2. Crear cabecera de AsientoContable
        asiento = AsientoContable(
            fecha=datetime.now(timezone.utc),
            concepto=f"Pago de CxC - Cliente {pago.cliente_id} - Ref: {pago.referencia}",
            referencia=pago.referencia,
            total_debe_usd=monto,
            total_haber_usd=monto,
            tasa_cambio_bs=Decimal(str(pago.tasa_cambio_bs)),
            estado="ACTIVO"
        )
        db.add(asiento)
        db.flush()  # Para obtener el id del asiento contable

        # 3. Crear detalles
        # Detalle al DEBE: Banco
        detalle_debe = DetalleAsiento(
            asiento_id=asiento.id,
            cuenta_codigo="1.1.01",
            cuenta_nombre=cta_banco.nombre,
            debe_usd=monto,
            haber_usd=Decimal("0.00")
        )
        
        # Detalle al HABER: Cuentas por Cobrar
        detalle_haber = DetalleAsiento(
            asiento_id=asiento.id,
            cuenta_codigo="1.1.02",
            cuenta_nombre=cta_cxc.nombre,
            debe_usd=Decimal("0.00"),
            haber_usd=monto
        )
        
        db.add(detalle_debe)
        db.add(detalle_haber)
        return asiento
