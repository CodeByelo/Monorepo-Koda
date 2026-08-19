import os
import sys
from decimal import Decimal
from datetime import datetime, timezone
from fastapi.testclient import TestClient

# Asegurar PYTHONPATH para que reconozca 'backend'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.main import app, seed_extended_data
from backend.core.database import SessionLocal
from backend.models.erp_extended import CuentaContable, AsientoContable, DetalleAsiento

# Inicializar cliente de prueba de FastAPI
client = TestClient(app)

def test_financial_reports():
    print("=== INICIANDO PRUEBAS DE INTEGRACIÓN DE REPORTES FINANCIEROS ===")
    
    # 1. Asegurar catálogo de cuentas
    seed_extended_data()
    
    db = SessionLocal()
    try:
        # Asegurar que Costo de Ventas 5.1.01 existe en catálogo contable
        costo_cta = db.query(CuentaContable).filter(CuentaContable.codigo == "5.1.01").first()
        if not costo_cta:
            costo_cta = CuentaContable(
                codigo="5.1.01",
                nombre="Costo de Ventas",
                tipo="COSTO",
                naturaleza="DEUDORA",
                nivel=3,
                activa=True
            )
            db.add(costo_cta)
            db.commit()
            db.refresh(costo_cta)
            print("Cuenta 5.1.01 sembrada con éxito.")

        # Obtener los balances iniciales de los reportes para calcular valores relativos
        print("Obteniendo balances iniciales...")
        initial_summary = client.get("/reportes/dashboard-resumen").json()
        initial_bancos = Decimal(str(initial_summary["saldo_bancos_usd"]))
        initial_cxc = Decimal(str(initial_summary["saldo_cxc_usd"]))
        print(f"Bancos inicial: {initial_bancos}, CxC inicial: {initial_cxc}")

        initial_income = client.get("/reportes/estado-resultados").json()
        initial_ingresos = Decimal(str(initial_income["ingresos_totales_usd"]))
        initial_costos = Decimal(str(initial_income["costos_totales_usd"]))
        initial_net = Decimal(str(initial_income["utilidad_neta_usd"]))
        print(f"Ingresos iniciales: {initial_ingresos}, Costos iniciales: {initial_costos}, Utilidad neta inicial: {initial_net}")

        # 2. Insertar transacciones de prueba controladas
        print("Creando transacciones y asientos de prueba...")
        
        # Asiento 1: Venta (DEBE: 1.1.02 CxC = 300.00 / HABER: 4.1.01 Ingresos = 300.00)
        asiento_v = AsientoContable(
            fecha=datetime.now(timezone.utc),
            concepto="Venta de prueba para reportes",
            referencia="FAC-RPT-001",
            total_debe_usd=Decimal("300.00"),
            total_haber_usd=Decimal("300.00"),
            tasa_cambio_bs=Decimal("36.50"),
            estado="ACTIVO"
        )
        db.add(asiento_v)
        db.flush()
        
        det1_v = DetalleAsiento(
            asiento_id=asiento_v.id,
            cuenta_codigo="1.1.02",
            cuenta_nombre="Cuentas por Cobrar",
            debe_usd=Decimal("300.00"),
            haber_usd=Decimal("0.00")
        )
        det2_v = DetalleAsiento(
            asiento_id=asiento_v.id,
            cuenta_codigo="4.1.01",
            cuenta_nombre="Ingresos por Ventas",
            debe_usd=Decimal("0.00"),
            haber_usd=Decimal("300.00")
        )
        db.add(det1_v)
        db.add(det2_v)

        # Asiento 2: Costo de Venta (DEBE: 5.1.01 Costo = 120.00 / HABER: 1.1.01 Banco = 120.00)
        asiento_c = AsientoContable(
            fecha=datetime.now(timezone.utc),
            concepto="Costo de venta de prueba",
            referencia="COS-RPT-001",
            total_debe_usd=Decimal("120.00"),
            total_haber_usd=Decimal("120.00"),
            tasa_cambio_bs=Decimal("36.50"),
            estado="ACTIVO"
        )
        db.add(asiento_c)
        db.flush()

        det1_c = DetalleAsiento(
            asiento_id=asiento_c.id,
            cuenta_codigo="5.1.01",
            cuenta_nombre="Costo de Ventas",
            debe_usd=Decimal("120.00"),
            haber_usd=Decimal("0.00")
        )
        det2_c = DetalleAsiento(
            asiento_id=asiento_c.id,
            cuenta_codigo="1.1.01",
            cuenta_nombre="Banco",
            debe_usd=Decimal("0.00"),
            haber_usd=Decimal("120.00")
        )
        db.add(det1_c)
        db.add(det2_c)

        # Asiento 3: Pago de Venta (DEBE: 1.1.01 Banco = 300.00 / HABER: 1.1.02 CxC = 300.00)
        asiento_p = AsientoContable(
            fecha=datetime.now(timezone.utc),
            concepto="Pago de CxC de prueba",
            referencia="PAG-RPT-001",
            total_debe_usd=Decimal("300.00"),
            total_haber_usd=Decimal("300.00"),
            tasa_cambio_bs=Decimal("36.50"),
            estado="ACTIVO"
        )
        db.add(asiento_p)
        db.flush()

        det1_p = DetalleAsiento(
            asiento_id=asiento_p.id,
            cuenta_codigo="1.1.01",
            cuenta_nombre="Banco",
            debe_usd=Decimal("300.00"),
            haber_usd=Decimal("0.00")
        )
        det2_p = DetalleAsiento(
            asiento_id=asiento_p.id,
            cuenta_codigo="1.1.02",
            cuenta_nombre="Cuentas por Cobrar",
            debe_usd=Decimal("0.00"),
            haber_usd=Decimal("300.00")
        )
        db.add(det1_p)
        db.add(det2_p)

        db.commit()
        print("Asientos e historial contable de prueba comprometidos.")

        # 3. Invocar y Validar GET /reportes/balance-comprobacion
        print("\nProbando GET /reportes/balance-comprobacion...")
        res_bc = client.get("/reportes/balance-comprobacion")
        assert res_bc.status_code == 200
        data_bc = res_bc.json()
        print(f"Balance de comprobación: Total Debe={data_bc['total_debe_usd']}, Total Haber={data_bc['total_haber_usd']}, Cuadrado={data_bc['cuadrado']}")
        assert data_bc["cuadrado"] is True, "El balance de comprobación debería estar cuadrado"

        # 4. Invocar y Validar GET /reportes/estado-resultados
        print("\nProbando GET /reportes/estado-resultados...")
        res_er = client.get("/reportes/estado-resultados")
        assert res_er.status_code == 200
        data_er = res_er.json()
        print(f"Estado de Resultados: Ingresos={data_er['ingresos_totales_usd']}, Costos={data_er['costos_totales_usd']}, Utilidad Neta={data_er['utilidad_neta_usd']}")
        
        # Validar incrementos relativos
        diff_ingresos = Decimal(str(data_er["ingresos_totales_usd"])) - initial_ingresos
        diff_costos = Decimal(str(data_er["costos_totales_usd"])) - initial_costos
        diff_net = Decimal(str(data_er["utilidad_neta_usd"])) - initial_net
        
        assert diff_ingresos == Decimal("300.00")
        assert diff_costos == Decimal("120.00")
        assert diff_net == Decimal("180.00")
        print("¡Estado de resultados calculado correctamente!")

        # 5. Invocar y Validar GET /reportes/dashboard-resumen
        print("\nProbando GET /reportes/dashboard-resumen...")
        res_ds = client.get("/reportes/dashboard-resumen")
        assert res_ds.status_code == 200
        data_ds = res_ds.json()
        print(f"Dashboard: Bancos={data_ds['saldo_bancos_usd']}, CxC={data_ds['saldo_cxc_usd']}")
        
        # Banco: +300 (pago) - 120 (costo) = +180
        diff_bancos = Decimal(str(data_ds["saldo_bancos_usd"])) - initial_bancos
        # CxC: +300 (venta) - 300 (pago) = +0
        diff_cxc = Decimal(str(data_ds["saldo_cxc_usd"])) - initial_cxc
        
        assert diff_bancos == Decimal("180.00")
        assert diff_cxc == Decimal("0.00")
        print("¡Métricas del dashboard calculadas correctamente!")

        # 6. Limpieza de datos
        print("\nLimpiando datos de prueba...")
        db.delete(det1_p)
        db.delete(det2_p)
        db.delete(asiento_p)
        
        db.delete(det1_c)
        db.delete(det2_c)
        db.delete(asiento_c)
        
        db.delete(det1_v)
        db.delete(det2_v)
        db.delete(asiento_v)
        
        db.commit()
        print("=== PRUEBAS DE INTEGRACIÓN DE REPORTES COMPLETADAS CON ÉXITO ===")

    except Exception as e:
        print(f"FALLO DE PRUEBA: {e}")
        db.rollback()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    test_financial_reports()
