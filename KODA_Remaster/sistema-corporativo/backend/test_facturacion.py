import asyncio
import os
import sys
import uuid
import requests
from pathlib import Path
from jose import jwt
from datetime import datetime, timedelta, date

# Asegurar importaciones locales del backend
sys.path.insert(0, str(Path(__file__).resolve().parent))

import database.async_db as async_db

SECRET_KEY = os.getenv("JWT_SECRET", "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e")
ALGORITHM = "HS256"

def generate_mock_token(user_id: str, tenant_id: str, role: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "rol": role,
        "username": username,
        "exp": datetime.utcnow() + timedelta(minutes=5)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def setup_test_data(tenant_id: str) -> float:
    # Asegurar pool inicializado
    if not async_db.pool:
        await async_db.init_db_pool()
        
    async with async_db.pool.acquire() as conn:
        # 1. Asegurar que existe al menos una gerencia
        gerencia_exists = await conn.fetchval("SELECT COUNT(*) FROM gerencias WHERE tenant_id = $1::uuid", uuid.UUID(tenant_id))
        if gerencia_exists == 0:
            await conn.execute(
                "INSERT INTO gerencias (nombre, siglas, categoria, tenant_id) VALUES ('Gerencia Ventas', 'GV', 'Ventas', $1::uuid)",
                uuid.UUID(tenant_id)
            )
            
        # 2. Insertar una tasa BCV ficticia para USD de hoy
        today = date.today()
        test_tasa = 36.50
        await conn.execute(
            """
            INSERT INTO tasas_bcv (moneda, tasa, fecha_valor, created_at)
            VALUES ('USD', $1, $2, NOW())
            ON CONFLICT (moneda, fecha_valor) 
            DO UPDATE SET tasa = EXCLUDED.tasa
            """,
            test_tasa,
            today
        )
        print(f"📊 Tasa BCV de prueba configurada para hoy: USD = {test_tasa} Bs.")
        return test_tasa

async def verify_in_db(factura_id_str: str) -> dict:
    if not async_db.pool:
        await async_db.init_db_pool()
    async with async_db.pool.acquire() as conn:
        # Consultar la factura insertada
        factura = await conn.fetchrow(
            "SELECT * FROM facturas WHERE id = $1::uuid",
            uuid.UUID(factura_id_str)
        )
        if not factura:
            return None
        
        # Consultar los items
        items = await conn.fetch(
            "SELECT * FROM factura_items WHERE factura_id = $1::uuid",
            uuid.UUID(factura_id_str)
        )
        
        # Consultar el ledger para ver si se registró el evento.
        # Esperamos hasta 8 segundos (con reintentos) a que el worker asíncrono
        # del servidor FastAPI escriba el evento.
        event = None
        for _ in range(8):
            event = await conn.fetchrow(
                "SELECT * FROM koda_event_ledger WHERE aggregate_id = $1 AND event_type = 'factura.emitida' LIMIT 1",
                factura_id_str
            )
            if event:
                break
            await asyncio.sleep(1)
        
        return {
            "factura": dict(factura),
            "items": [dict(it) for it in items],
            "event": dict(event) if event else None
        }

async def main():
    print("--- INICIANDO PRUEBAS DE INTEGRACIÓN: EMISIÓN DE FACTURAS FISCALES ---")
    
    test_user_id = str(uuid.uuid4())
    test_username = "facturacion_test_user"
    
    # 1. Obtener/crear tenant_id de prueba
    if not async_db.pool:
        await async_db.init_db_pool()
    async with async_db.pool.acquire() as conn:
        test_tenant_id = await conn.fetchval("SELECT id::text FROM organizations LIMIT 1")
        if not test_tenant_id:
            test_tenant_id = str(uuid.uuid4())
            await conn.execute("INSERT INTO organizations (id, name) VALUES ($1::uuid, 'Test Org Billing')", test_tenant_id)
        else:
            test_tenant_id = str(test_tenant_id)

    # 2. Configurar tasas de prueba y gerencias
    test_tasa = await setup_test_data(test_tenant_id)
    
    # 3. Generar token
    token = generate_mock_token(test_user_id, test_tenant_id, "Usuario", test_username)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 4. Enviar request de emisión USD con IGTF
    client_id = str(uuid.uuid4())
    payload = {
        "cliente_id": client_id,
        "moneda_documento": "USD",
        "aplica_igtf": True,
        "detalles": [
            {
                "producto_id": "PROD-001",
                "descripcion": "Laptop Enterprise",
                "cantidad": 2,
                "precio_unitario": 500.00
            },
            {
                "producto_id": "PROD-002",
                "descripcion": "Mouse Inalámbrico",
                "cantidad": 5,
                "precio_unitario": 20.00
            }
        ]
    }
    
    print("\n🚀 Enviando petición POST /api/v1/facturacion/emitir...")
    res = requests.post("http://localhost:8000/api/v1/facturacion/emitir", json=payload, headers=headers)
    
    print(f"Response status: {res.status_code}")
    print(f"Response body: {res.text}")
    
    assert res.status_code == 201, f"Error: Se esperaba 201 pero se obtuvo {res.status_code}"
    data = res.json()
    factura_id = data["factura_id"]
    
    # Verificar cálculos matemáticos
    # Detalles:
    # 2 * 500.00 = 1000.00
    # 5 * 20.00 = 100.00
    # Base imponible = 1100.00
    # IVA (16%) = 176.00
    # IGTF (3%) = (1100 + 176) * 0.03 = 1276 * 0.03 = 38.28
    # Total = 1100.00 + 176.00 + 38.28 = 1314.28
    
    print("\n📐 Verificando cálculos matemáticos:")
    print(f"  Base Imponible calculada: {data['base_imponible']} (Esperado: 1100.0)")
    print(f"  Monto IVA calculado: {data['monto_iva']} (Esperado: 176.0)")
    print(f"  Monto IGTF calculado: {data['monto_igtf']} (Esperado: 38.28)")
    print(f"  Monto Total calculado: {data['monto_total']} (Esperado: 1314.28)")
    print(f"  Tasa BCV histórica: {data['tasa_cambio_historica']} (Esperado: {test_tasa})")
    
    assert data["base_imponible"] == 1100.0
    assert data["monto_iva"] == 176.0
    assert data["monto_igtf"] == 38.28
    assert data["monto_total"] == 1314.28
    assert data["tasa_cambio_historica"] == test_tasa
    print("✔️  Cálculos exactos verificados exitosamente.")

    # 5. Verificar base de datos e inyección de telemetría en el ledger inmutable
    print("\n🔍 Verificando registro y telemetría en Base de Datos...")
    db_data = await verify_in_db(factura_id)
    
    assert db_data is not None, "Error: La factura no fue encontrada en la base de datos."
    print("✔️  Factura encontrada en tabla 'facturas'.")
    
    factura_db = db_data["factura"]
    assert str(factura_db["cliente_id"]) == client_id
    assert float(factura_db["tasa_cambio_historica"]) == test_tasa
    assert float(factura_db["monto_total"]) == 1314.28
    print("✔️  Tasa histórica y cliente_id correctos en BD.")
    
    items_db = db_data["items"]
    assert len(items_db) == 2
    print(f"✔️  {len(items_db)} ítems de detalle insertados correctamente.")
    
    event_db = db_data["event"]
    assert event_db is not None, "Error: El evento 'factura.emitida' no fue registrado en el ledger inmutable."
    print("✔️  Evento 'factura.emitida' encontrado en el koda_event_ledger.")
    
    import json
    payload_db = json.loads(event_db["payload"])
    print(f"  Ledger Event Payload: {payload_db}")
    assert payload_db["base_imponible"] == 1100.0
    assert payload_db["monto_iva"] == 176.0
    assert payload_db["monto_igtf"] == 38.28
    assert payload_db.get("tasa_bcv_applied") == test_tasa or payload_db.get("tasa_bcv_aplicada") == test_tasa
    print("✔️  Payload del Ledger validado con éxito.")

    print("\n🎉 ¡TODAS LAS PRUEBAS DE INTEGRACIÓN DE FACTURACIÓN PASARON EXITOSAMENTE!")

if __name__ == "__main__":
    asyncio.run(main())
