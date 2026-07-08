from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from backend.models.erp_extended import DetalleAsiento

class ReporteService:
    @staticmethod
    def obtener_balance_comprobacion(db: Session):
        """
        Agrupa los detalles de los asientos por código de cuenta contable,
        calcula la suma de cargos (Debe) y abonos (Haber) de cada una
        y valida que el balance general esté cuadrado (Total Debe == Total Haber).
        """
        # Agrupar asiento_detalles por cuenta
        resultados = db.query(
            DetalleAsiento.cuenta_codigo,
            DetalleAsiento.cuenta_nombre,
            func.sum(DetalleAsiento.debe_usd).label("debe_total"),
            func.sum(DetalleAsiento.haber_usd).label("haber_total")
        ).group_by(
            DetalleAsiento.cuenta_codigo,
            DetalleAsiento.cuenta_nombre
        ).order_by(
            DetalleAsiento.cuenta_codigo.asc()
        ).all()

        cuentas = []
        total_debe = Decimal("0.00")
        total_haber = Decimal("0.00")

        for r in resultados:
            debe = Decimal(str(r.debe_total or "0.00"))
            haber = Decimal(str(r.haber_total or "0.00"))
            
            # Para cuentas activas/gastos/costos, el saldo neto es Debe - Haber.
            # Para pasivo/patrimonio/ingreso es Haber - Debe.
            # Dejamos saldo neto relativo a la cuenta (Debe - Haber como valor de referencia base)
            saldo_neto = debe - haber
            
            cuentas.append({
                "cuenta_codigo": r.cuenta_codigo,
                "cuenta_nombre": r.cuenta_nombre,
                "debe_usd": debe,
                "haber_usd": haber,
                "saldo_neto_usd": saldo_neto
            })
            total_debe += debe
            total_haber += haber

        # Validar si el balance está cuadrado
        cuadrado = abs(total_debe - total_haber) < Decimal("0.0001")

        return {
            "cuentas": cuentas,
            "total_debe_usd": total_debe,
            "total_haber_usd": total_haber,
            "cuadrado": cuadrado
        }

    @staticmethod
    def obtener_estado_resultados(db: Session):
        """
        Filtra las cuentas de Ingresos (código 4) y Costos/Gastos (código 5)
        para calcular la utilidad bruta y neta acumulada en base al libro diario.
        """
        # Filtrar detalles de cuentas con prefijo 4 o 5
        resultados = db.query(
            DetalleAsiento.cuenta_codigo,
            func.sum(DetalleAsiento.debe_usd).label("debe_total"),
            func.sum(DetalleAsiento.haber_usd).label("haber_total")
        ).filter(
            DetalleAsiento.cuenta_codigo.like("4%") | DetalleAsiento.cuenta_codigo.like("5%")
        ).group_by(
            DetalleAsiento.cuenta_codigo
        ).all()

        ingresos_totales = Decimal("0.00")
        costos_totales = Decimal("0.00")
        gastos_totales = Decimal("0.00")

        for r in resultados:
            debe = Decimal(str(r.debe_total or "0.00"))
            haber = Decimal(str(r.haber_total or "0.00"))

            # Cuenta contable de Ingresos (ej. 4.1.01) -> Naturaleza acreedora (Haber - Debe)
            if r.cuenta_codigo.startswith("4"):
                ingresos_totales += (haber - debe)
            # Cuenta de Costos (ej. 5.1.01) -> Naturaleza deudora (Debe - Haber)
            elif r.cuenta_codigo.startswith("5.1"):
                costos_totales += (debe - haber)
            # Otras cuentas de gastos (ej. 5.2.01, etc.) -> Naturaleza deudora (Debe - Haber)
            elif r.cuenta_codigo.startswith("5"):
                gastos_totales += (debe - haber)

        utilidad_bruta = ingresos_totales - costos_totales
        utilidad_neta = utilidad_bruta - gastos_totales

        return {
            "ingresos_totales_usd": ingresos_totales,
            "costos_totales_usd": costos_totales,
            "gastos_totales_usd": gastos_totales,
            "utilidad_bruta_usd": utilidad_bruta,
            "utilidad_neta_usd": utilidad_neta
        }

    @staticmethod
    def dashboard_resumen(db: Session):
        """
        Extrae el saldo acumulado en Bancos (cuenta 1.1.01) y
        el acumulado en Cuentas por Cobrar (cuenta 1.1.02) desde el libro diario.
        """
        resultados = db.query(
            DetalleAsiento.cuenta_codigo,
            func.sum(DetalleAsiento.debe_usd).label("debe_total"),
            func.sum(DetalleAsiento.haber_usd).label("haber_total")
        ).filter(
            DetalleAsiento.cuenta_codigo.in_(["1.1.01", "1.1.02"])
        ).group_by(
            DetalleAsiento.cuenta_codigo
        ).all()

        saldo_bancos = Decimal("0.00")
        saldo_cxc = Decimal("0.00")

        for r in resultados:
            debe = Decimal(str(r.debe_total or "0.00"))
            haber = Decimal(str(r.haber_total or "0.00"))
            saldo = debe - haber  # Al ser cuentas activas, naturaleza deudora

            if r.cuenta_codigo == "1.1.01":
                saldo_bancos = saldo
            elif r.cuenta_codigo == "1.1.02":
                saldo_cxc = saldo

        return {
            "saldo_bancos_usd": saldo_bancos,
            "saldo_cxc_usd": saldo_cxc
        }
