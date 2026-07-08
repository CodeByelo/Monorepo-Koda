from sqlalchemy.orm import Session
from fastapi import HTTPException
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from backend.models.accounting import AsientoContable, AsientoDetalle, CierrePeriodo
from backend.models.erp_extended import CuentaContable
from backend.models.operations import Producto

class ContabilidadService:
    @staticmethod
    def generar_asiento_venta(venta, db: Session):
        """
        Crea un asiento contable automático para el registro de una venta (factura).
        Afecta:
          - DEBE: 1.1.02 Cuentas por Cobrar Comerciales (monto neto de CxC = total - retención)
          - DEBE: 1.1.05 Anticipo de Retención de IVA (monto retención IVA, si aplica)
          - HABER: 4.1.01 Ventas de Mercancía (subtotal de la venta)
          - HABER: 2.1.02 IVA Débito Fiscal por Pagar (monto IVA)
          - HABER: 2.1.03 IGTF por Pagar (monto IGTF, si aplica)
        """
        periodo_asiento = (venta.fecha or datetime.now(timezone.utc)).strftime("%Y-%m")
        cierre = db.query(CierrePeriodo).filter(CierrePeriodo.periodo == periodo_asiento).first()
        if cierre:
            raise HTTPException(status_code=403, detail=f"No se pueden registrar asientos en el período {periodo_asiento} porque está CERRADO.")

        total_debe = Decimal("0.00")
        total_haber = Decimal("0.00")
        detalles = []

        subtotal = Decimal(str(venta.subtotal_usd or 0))
        iva = Decimal(str(venta.iva_usd or 0))
        igtf = Decimal(str(venta.igtf_usd or 0))
        retencion = Decimal(str(venta.retencion_iva_usd or 0))
        total_invoice = Decimal(str(venta.total_usd or 0))
        
        # Debe: Cuentas por Cobrar Comerciales (Total - Retención)
        cxc_monto = (total_invoice - retencion).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if cxc_monto > 0:
            detalles.append(AsientoDetalle(
                cuenta_codigo="1.1.02",
                cuenta_nombre="Cuentas por Cobrar Comerciales",
                debe_usd=cxc_monto,
                haber_usd=Decimal("0.00")
            ))
            total_debe += cxc_monto

        # Debe: Anticipo de Retención de IVA (si aplica)
        if retencion > 0:
            detalles.append(AsientoDetalle(
                cuenta_codigo="1.1.05",
                cuenta_nombre="Anticipo de Retención de IVA",
                debe_usd=retencion,
                haber_usd=Decimal("0.00")
            ))
            total_debe += retencion

        # Haber: Ventas de Mercancía
        if subtotal > 0:
            detalles.append(AsientoDetalle(
                cuenta_codigo="4.1.01",
                cuenta_nombre="Ventas de Mercancía",
                debe_usd=Decimal("0.00"),
                haber_usd=subtotal
            ))
            total_haber += subtotal

        # Haber: IVA Débito Fiscal por Pagar
        if iva > 0:
            detalles.append(AsientoDetalle(
                cuenta_codigo="2.1.02",
                cuenta_nombre="IVA Débito Fiscal por Pagar",
                debe_usd=Decimal("0.00"),
                haber_usd=iva
            ))
            total_haber += iva

        # Haber: IGTF por Pagar
        if igtf > 0:
            detalles.append(AsientoDetalle(
                cuenta_codigo="2.1.03",
                cuenta_nombre="IGTF por Pagar",
                debe_usd=Decimal("0.00"),
                haber_usd=igtf
            ))
            total_haber += igtf

        # Si el total del debe no es igual al haber debido a redondeos menores, ajustar en Ventas de Mercancía
        diff = total_debe - total_haber
        if abs(diff) > 0 and abs(diff) <= Decimal("0.02"):
            for det in detalles:
                if det.cuenta_codigo == "4.1.01":
                    det.haber_usd += diff
                    total_haber += diff
                    break

        asiento = AsientoContable(
            fecha=venta.fecha or datetime.now(timezone.utc),
            concepto=f"Registro de Venta - Factura {venta.numero_factura}",
            referencia=f"FAC-{venta.numero_factura}",
            total_debe_usd=total_debe,
            total_haber_usd=total_haber,
            tasa_cambio_bs=Decimal(str(venta.tasa_cambio_bs)),
            estado="ACTIVO",
            detalles=detalles
        )
        db.add(asiento)
        return asiento

    @staticmethod
    def generar_asiento_costo_ventas(venta, detalles_venta, db: Session):
        """
        Crea un asiento contable automático para registrar el costo de ventas y la salida de inventario.
        Afecta:
          - DEBE: 5.1.01 Costo de Ventas
          - HABER: 1.1.03 Inventario de Mercancía
        """
        total_costo = Decimal("0.00")
        for item in detalles_venta:
            producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
            if producto:
                costo_usd = Decimal(str(producto.costo_usd or 0))
                cantidad = Decimal(str(item.cantidad or 0))
                total_costo += costo_usd * cantidad

        if total_costo <= 0:
            return None

        total_costo = total_costo.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        detalles_asiento = [
            AsientoDetalle(
                cuenta_codigo="5.1.01",
                cuenta_nombre="Costo de Ventas",
                debe_usd=total_costo,
                haber_usd=Decimal("0.00")
            ),
            AsientoDetalle(
                cuenta_codigo="1.1.03",
                cuenta_nombre="Inventario de Mercancía",
                debe_usd=Decimal("0.00"),
                haber_usd=total_costo
            )
        ]

        asiento = AsientoContable(
            fecha=venta.fecha or datetime.now(timezone.utc),
            concepto=f"Costo de Ventas - Factura {venta.numero_factura}",
            referencia=f"FAC-{venta.numero_factura}",
            total_debe_usd=total_costo,
            total_haber_usd=total_costo,
            tasa_cambio_bs=Decimal(str(venta.tasa_cambio_bs)),
            estado="ACTIVO",
            detalles=detalles_asiento
        )
        db.add(asiento)
        return asiento

    @staticmethod
    def generar_asiento_pago(pago, db: Session):
        """
        Crea un asiento contable automático para el registro de un pago recibido.
        Afecta:
          - DEBE: 1.1.01 Caja y Bancos (monto del pago)
          - HABER: 1.1.02 Cuentas por Cobrar Comerciales (monto del pago)
        """
        cta_banco = db.query(CuentaContable).filter(CuentaContable.codigo == "1.1.01").first()
        if not cta_banco:
            raise HTTPException(status_code=400, detail="Cuenta contable 1.1.01 (Caja y Bancos) no encontrada.")
            
        cta_cxc = db.query(CuentaContable).filter(CuentaContable.codigo == "1.1.02").first()
        if not cta_cxc:
            raise HTTPException(status_code=400, detail="Cuenta contable 1.1.02 (Cuentas por Cobrar) no encontrada.")

        monto = Decimal(str(pago.monto_pagado_usd)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        asiento = AsientoContable(
            fecha=datetime.now(timezone.utc),
            concepto=f"Cobro de CxC - Cliente {pago.cliente_id} - Ref: {pago.referencia}",
            referencia=pago.referencia,
            total_debe_usd=monto,
            total_haber_usd=monto,
            tasa_cambio_bs=Decimal(str(pago.tasa_cambio_bs)),
            estado="ACTIVO",
            detalles=[
                AsientoDetalle(
                    cuenta_codigo="1.1.01",
                    cuenta_nombre=cta_banco.nombre,
                    debe_usd=monto,
                    haber_usd=Decimal("0.00")
                ),
                AsientoDetalle(
                    cuenta_codigo="1.1.02",
                    cuenta_nombre=cta_cxc.nombre,
                    debe_usd=Decimal("0.00"),
                    haber_usd=monto
                )
            ]
        )
        db.add(asiento)
        return asiento
