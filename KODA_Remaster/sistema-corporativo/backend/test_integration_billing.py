import asyncio
import os
import sys
import uuid
import requests
from pathlib import Path
from jose import jwt
from datetime import datetime, timedelta

# Asegurar importaciones locales del backend
sys.path.insert(0, str(Path(__file__).resolve().parent))

import database.async_db as async_db

SECRET_KEY = os.getenv("JWT_SECRET", "tu_clave_secreta_muy_segura_cambiala_en_produccion")
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

async def check_db_for_event(user_id: str) -> bool:
    # Inicializar el pool si no está listo
    if not async_db.pool:
        await async_db.init_db_pool()
    
    async with async_db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, evento, detalles, estado 
            FROM security_events 
            WHERE user_id = $1::uuid AND evento = 'FILE_UPLOAD_SPOOFING'
            ORDER BY created_at DESC LIMIT 1
            """,
            uuid.UUID(user_id)
        )
        if row:
            print(f"📊 Registro de brecha encontrado en DB: ID={row['id']}, Evento='{row['evento']}', Estado='{row['estado']}'")
            print(f"   Detalles: {row['detalles']}")
            return True
        return False

async def main():
    print("--- INICIANDO PRUEBAS DE INTEGRACIÓN: PROTECCIÓN DE RUTAS Y SPOOFING ---")
    
    # IDs de prueba únicos
    test_user_id = str(uuid.uuid4())
    test_username = "audit_sec_test_user"
    
    if not async_db.pool:
        await async_db.init_db_pool()
    async with async_db.pool.acquire() as conn:
        test_tenant_id = await conn.fetchval("SELECT id::text FROM organizations LIMIT 1")
        if not test_tenant_id:
            test_tenant_id = str(uuid.uuid4())
            await conn.execute("INSERT INTO organizations (id, name, slug) VALUES ($1::uuid, 'Test Org', 'test-org')", test_tenant_id)
        else:
            test_tenant_id = str(test_tenant_id)
            
    # 1. Probar ruta sin autenticación (Debe dar 401)
    print("\n1. Probando subida sin cabecera de autenticación...")
    files = {"file": ("reporte.xlsx", b"some-dummy-content", "application/octet-stream")}
    res_no_auth = requests.post("http://localhost:8000/billing/upload", files=files)
    assert res_no_auth.status_code == 401, f"Error: Se esperaba 401 pero se obtuvo {res_no_auth.status_code}"
    print("✔️  Acceso sin Token RECHAZADO con 401 (Correcto)")

    # 2. Generar Token legítimo
    token = generate_mock_token(test_user_id, test_tenant_id, "Usuario", test_username)
    
    # 3. Probar subida de un archivo legítimo
    print("\n2. Probando subida de archivo con firma binaria correcta (XLSX)...")
    real_xlsx_header = b"PK\x03\x04 y contenido danado"
    files = {"file": ("reporte.xlsx", real_xlsx_header, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    headers_real = {
        "Authorization": f"Bearer {token}",
        "X-Idempotency-Key": str(uuid.uuid4())
    }
    res_real = requests.post("http://localhost:8000/billing/upload", files=files, headers=headers_real)
    assert res_real.status_code in (422, 200), f"Error: Se esperaba 422 o 200 pero se obtuvo {res_real.status_code}"
    print(f"✔️  Firma binaria correcta: PASÓ LA BARRERA BINARIA (Código {res_real.status_code}) (Correcto)")

    # 4. Probar subida de un archivo Spoofing (Extensión XLSX pero cabecera de ejecutable MZ)
    print("\n3. Probando subida de archivo spoofing (ejecutable renombrado a .xlsx)...")
    spoofed_xlsx = b"MZ\x90\x00\x03\x00\x00\x00..."  # Cabecera DOS PE executable
    files = {"file": ("reporte.xlsx", spoofed_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    headers_spoofed = {
        "Authorization": f"Bearer {token}",
        "X-Idempotency-Key": str(uuid.uuid4())
    }
    res_spoofed = requests.post("http://localhost:8000/billing/upload", files=files, headers=headers_spoofed)
    assert res_spoofed.status_code == 400, f"Error: Se esperaba 400 pero se obtuvo {res_spoofed.status_code}"
    print("✔️  Intento de spoofing RECHAZADO con 400 (Correcto)")

    # 5. Verificar que se haya registrado el evento crítico en la base de datos
    print("\n4. Verificando el registro de la brecha en la base de datos...")
    await asyncio.sleep(1) # Esperar a que se procese la escritura
    logged = await check_db_for_event(test_user_id)
    assert logged == True, "Error: El evento de spoofing no se registró en la base de datos"
    print("✔️  Evento de spoofing REGISTRADO en DB exitosamente (Correcto)")

    print("\n🎉 ¡TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON EXITOSAMENTE!")

if __name__ == "__main__":
    from pathlib import Path
    asyncio.run(main())
