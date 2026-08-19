import os
import sys
from decimal import Decimal
from datetime import datetime
from fastapi.testclient import TestClient

# Asegurar PYTHONPATH para que reconozca 'backend'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.main import app, seed_extended_data
from backend.core.database import SessionLocal
from backend.models.erp_extended import CuentaContable, CuentaBancaria, CuentaPorCobrar, AsientoContable, DetalleAsiento, MovimientoBancario
from backend.models.operations import Cliente

# Inicializar cliente de prueba de FastAPI
client = TestClient(app)

def test_integration():
    print("=== INICIANDO INTEGRACIÓN DE PRUEBAS DE CONTABILIDAD ===")
    
    # 1. Asegurar semilla ejecutada
    seed_extended_data()
    
    db = SessionLocal()
    try:
        # Verificar cuentas creadas
        for code in ["1.1.01", "1.1.02", "4.1.01"]:
            cta = db.query(CuentaContable).filter(CuentaContable.codigo == code).first()
            assert cta is not None, f"Cuenta {code} no se sembró!"
            print(f"Cuenta confirmada: {cta.codigo} - {cta.nombre}")

        # 2. Crear Cliente de prueba único para garantizar el aislamiento
        import uuid
        unique_id = uuid.uuid4().hex[:6]
        cliente = Cliente(nombre=f"Cliente Prueba Contable {unique_id}", rif=f"V-{unique_id}")
        db.add(cliente)
        db.commit()
        db.refresh(cliente)
        print(f"Cliente de prueba único creado: ID={cliente.id}, Nombre={cliente.nombre}")

        # 3. Obtener Cuenta Bancaria activa de prueba (o crear si no existe)
        cuenta_bancaria = db.query(CuentaBancaria).filter(CuentaBancaria.activa == True).first()
        if not cuenta_bancaria:
            cuenta_bancaria = CuentaBancaria(
                banco="Banco de Prueba",
                numero_cuenta="1234-5678-90-1234567890",
                moneda="USD",
                saldo_actual_usd=Decimal("1000.00"),
                activa=True
            )
            db.add(cuenta_bancaria)
            db.commit()
            db.refresh(cuenta_bancaria)
        saldo_inicial = cuenta_bancaria.saldo_actual_usd
        print(f"Cuenta bancaria de prueba: ID={cuenta_bancaria.id}, Saldo inicial={saldo_inicial}")

        # 4. Crear Cuenta Por Cobrar PENDIENTE
        cxc = CuentaPorCobrar(
            cliente_id=cliente.id,
            numero_documento="DOC-TEST-999",
            monto_total_usd=Decimal("150.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("36.50"),
            fecha_vencimiento=datetime.now(),
            estado="PENDIENTE"
        )
        db.add(cxc)
        db.commit()
        db.refresh(cxc)
        print(f"CxC creada: ID={cxc.id}, Monto={cxc.monto_total_usd}, Estado={cxc.estado}")

        # Guardar total de asientos contables antes del pago
        cant_asientos_antes = db.query(AsientoContable).count()

        # 5. Realizar el pago mediante el Router POST /pagos/registrar
        payload = {
            "cliente_id": cliente.id,
            "monto_pagado_usd": 150.00,
            "tasa_cambio_bs": 36.50,
            "cuenta_bancaria_id": cuenta_bancaria.id,
            "referencia": "REF-TEST-999"
        }
        
        print("Enviando petición a POST /pagos/registrar...")
        response = client.post("/pagos/registrar", json=payload)
        print(f"Respuesta del servidor (Status {response.status_code}): {response.json()}")
        assert response.status_code == 200
        
        db.refresh(cxc)
        db.refresh(cuenta_bancaria)
        
        # Verificar estado CxC y cuenta bancaria
        print(f"CxC tras pago: Estado={cxc.estado}, Pagado={cxc.monto_pagado_usd}")
        assert cxc.estado == "PAGADA"
        assert cxc.monto_pagado_usd == Decimal("150.00")
        
        print(f"Saldo cuenta bancaria tras pago: {cuenta_bancaria.saldo_actual_usd}")
        assert cuenta_bancaria.saldo_actual_usd == saldo_inicial + Decimal("150.00")

        # Verificar movimiento bancario registrado
        movimiento = db.query(MovimientoBancario).filter(MovimientoBancario.referencia == "REF-TEST-999").first()
        assert movimiento is not None
        print(f"Movimiento bancario registrado: Monto={movimiento.monto_usd}, Tipo={movimiento.tipo}")

        # 6. Verificar Asiento Contable creado
        cant_asientos_despues = db.query(AsientoContable).count()
        assert cant_asientos_despues == cant_asientos_antes + 1
        print("¡Asiento Contable insertado con éxito!")

        asiento = db.query(AsientoContable).filter(AsientoContable.referencia == "REF-TEST-999").first()
        assert asiento is not None
        print(f"Asiento Contable: ID={asiento.id}, Concepto='{asiento.concepto}', Total Debe={asiento.total_debe_usd}, Total Haber={asiento.total_haber_usd}")
        
        # Verificar AsientoDetalle
        detalles = db.query(DetalleAsiento).filter(DetalleAsiento.asiento_id == asiento.id).all()
        assert len(detalles) == 2
        
        debe = next(d for d in detalles if d.debe_usd > 0)
        haber = next(d for d in detalles if d.haber_usd > 0)
        
        print(f"Detalle Debe: Cuenta={debe.cuenta_codigo} ({debe.cuenta_nombre}), Monto={debe.debe_usd}")
        print(f"Detalle Haber: Cuenta={haber.cuenta_codigo} ({haber.cuenta_nombre}), Monto={haber.haber_usd}")
        
        assert debe.cuenta_codigo == "1.1.01"
        assert debe.debe_usd == Decimal("150.00")
        assert haber.cuenta_codigo == "1.1.02"
        assert haber.haber_usd == Decimal("150.00")
        
        # 7. Probar Rollback en caso de cuenta faltante
        # Eliminamos la cuenta 1.1.01 para provocar un error de cuenta no encontrada
        db.delete(db.query(CuentaContable).filter(CuentaContable.codigo == "1.1.01").first())
        db.commit()
        
        # Creamos otra CxC para probar
        cxc_err = CuentaPorCobrar(
            cliente_id=cliente.id,
            numero_documento="DOC-ERR-888",
            monto_total_usd=Decimal("100.00"),
            monto_pagado_usd=Decimal("0.00"),
            tasa_cambio_bs=Decimal("36.50"),
            fecha_vencimiento=datetime.now(),
            estado="PENDIENTE"
        )
        db.add(cxc_err)
        db.commit()
        db.refresh(cxc_err)
        
        # Guardar saldos antes de fallar
        saldo_banco_antes = cuenta_bancaria.saldo_actual_usd
        
        payload_err = {
            "cliente_id": cliente.id,
            "monto_pagado_usd": 100.00,
            "tasa_cambio_bs": 36.50,
            "cuenta_bancaria_id": cuenta_bancaria.id,
            "referencia": "REF-ERR-888"
        }
        
        print("Enviando petición errónea (sin cuenta 1.1.01)...")
        response_err = client.post("/pagos/registrar", json=payload_err)
        print(f"Respuesta del servidor (Status {response_err.status_code}): {response_err.json()}")
        assert response_err.status_code == 400
        assert "Cuenta contable 1.1.01" in response_err.json()["detail"]
        
        # Asegurar rollback correcto de la CxC y el saldo bancario
        db.refresh(cxc_err)
        db.refresh(cuenta_bancaria)
        assert cxc_err.estado == "PENDIENTE"
        assert cxc_err.monto_pagado_usd == Decimal("0.00")
        assert cuenta_bancaria.saldo_actual_usd == saldo_banco_antes
        
        # Limpieza de la base de datos para no dejar rastro de prueba
        print("Pruebas completadas con éxito. Limpiando datos de prueba...")
        db.delete(cxc_err)
        db.delete(cxc)
        db.delete(cliente)
        
        # Re-crear cuenta borrada para restaurar el estado original
        db.add(CuentaContable(codigo="1.1.01", nombre="Banco", tipo="ACTIVO", naturaleza="DEUDORA", nivel=3, activa=True))
        db.commit()
        print("=== PRUEBAS DE INTEGRACIÓN FINALIZADAS CON ÉXITO ===")

    except Exception as e:
        print(f"FALLO DE PRUEBA: {e}")
        db.rollback()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    test_integration()
