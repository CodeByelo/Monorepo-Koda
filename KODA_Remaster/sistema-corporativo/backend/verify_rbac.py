import asyncio
import os
import sys
import uuid
import requests
from dotenv import load_dotenv
from pathlib import Path
from jose import jwt
from datetime import datetime, timezone, timedelta

# Ensure local imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

SECRET_KEY = os.getenv("JWT_SECRET", "tu_clave_secreta_muy_segura_cambiala_en_produccion")
ALGORITHM = "HS256"

def generate_mock_token(user_id: str, tenant_id: str, role: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "rol": role,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def test_api_routes(test_tenant_id, admin_user_id, dev_user_id, regular_user_id):
    print("\n--- INICIANDO PRUEBAS DE SEGURIDAD EN CAPA API (FASTAPI) ---")
    
    admin_token = generate_mock_token(str(admin_user_id), str(test_tenant_id), "Administrador", "admin_tester")
    dev_token = generate_mock_token(str(dev_user_id), str(test_tenant_id), "Desarrollador", "dev_tester")
    user_token = generate_mock_token(str(regular_user_id), str(test_tenant_id), "Usuario", "user_tester")

    base_url = "http://localhost:8000"

    endpoints_to_test = [
        # (method, path, body, description, expected_admin_status, expected_dev_status)
        ("GET", "/security/logs", None, "Listar logs de seguridad", 403, 200),
        ("PUT", "/org-structure", {"org_structure": []}, "Editar estructura organizativa", 403, 200),
        ("PUT", "/org-management-details", {"management_details": {}}, "Editar detalles de gerencia", 403, 200),

        ("PUT", "/announcement", {"badge": "info", "title": "test", "description": "test", "status": "active", "urgency": "low"}, "Editar anuncios de seguridad", 403, 200),
        ("PUT", f"/users/{regular_user_id}/role", {"rol_id": 3}, "Cambiar rol de usuario", 403, 200),
        ("POST", "/users/admin/employees", {"username": f"newemp_{uuid.uuid4().hex[:5]}", "nombre": "Emp", "apellido": "Test", "email": f"emp_{uuid.uuid4().hex[:5]}@test.com", "password": "securepw123", "rol_id": 3}, "Crear empleado", 403, 200)
    ]

    for method, path, body, desc, exp_admin, exp_dev in endpoints_to_test:
        print(f"\nProbando endpoint: {desc} ({method} {path})")
        
        # 1. Probar con Administrador (debe dar 403)
        headers = {"Authorization": f"Bearer {admin_token}"}
        res = requests.request(method, f"{base_url}{path}", json=body, headers=headers)
        print(f"  - Administrador -> HTTP {res.status_code} (Esperado {exp_admin})")
        assert res.status_code == exp_admin, f"Fallo en Administrador para {desc}: se obtuvo {res.status_code}"

        # 2. Probar con Desarrollador (debe dar 200)
        headers = {"Authorization": f"Bearer {dev_token}"}
        res_dev = requests.request(method, f"{base_url}{path}", json=body, headers=headers)
        print(f"  - Desarrollador -> HTTP {res_dev.status_code} (Esperado {exp_dev})")
        assert res_dev.status_code == exp_dev, f"Fallo en Desarrollador para {desc}: se obtuvo {res_dev.status_code}"

    print("\n🎉 ¡TODAS LAS PRUEBAS DE RUTA API PASARON EXITOSAMENTE!")

async def main():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    # Resolver IDs reales o mock del tenant
    import asyncpg
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        test_tenant_id = await conn.fetchval("SELECT id FROM organizations LIMIT 1")
        if not test_tenant_id:
            test_tenant_id = uuid.uuid4()
            await conn.execute("INSERT INTO organizations (id, nombre) VALUES ($1, 'Test Organization')", test_tenant_id)
        
        # Generar IDs aleatorios para perfiles de test
        admin_user_id = uuid.uuid4()
        dev_user_id = uuid.uuid4()
        regular_user_id = uuid.uuid4()

        # Limpiar cualquier perfil huérfano de ejecuciones fallidas previas
        await conn.execute("DELETE FROM user_organizations WHERE user_id IN (SELECT id FROM profiles WHERE username IN ('admin_tester_profile', 'dev_tester_profile', 'user_tester_profile'));")
        await conn.execute("DELETE FROM profiles WHERE username IN ('admin_tester_profile', 'dev_tester_profile', 'user_tester_profile');")

        # Insertar perfiles temporales en la DB
        await conn.execute(
            """
            INSERT INTO profiles (id, username, rol_id, tenant_id, estado) VALUES
            ($1, 'admin_tester_profile', 2, $4, true),
            ($2, 'dev_tester_profile', 4, $4, true),
            ($3, 'user_tester_profile', 3, $4, true);
            """,
            admin_user_id, dev_user_id, regular_user_id, test_tenant_id
        )
        
        # Insertar en user_organizations para cumplir referencias de tenant
        await conn.execute(
            """
            INSERT INTO user_organizations (user_id, organization_id, role) VALUES
            ($1, $4, 'member'),
            ($2, $4, 'member'),
            ($3, $4, 'member');
            """,
            admin_user_id, dev_user_id, regular_user_id, test_tenant_id
        )
    finally:
        await conn.close()

    try:
        # Ejecutar tests de HTTP routes
        await test_api_routes(test_tenant_id, admin_user_id, dev_user_id, regular_user_id)
        
    finally:
        # Limpiar perfiles de prueba
        conn = await asyncpg.connect(db_url, statement_cache_size=0)
        try:
            print("\nLimpiando perfiles de prueba...")
            await conn.execute("DELETE FROM user_organizations WHERE user_id IN ($1, $2, $3);", admin_user_id, dev_user_id, regular_user_id)
            await conn.execute("DELETE FROM profiles WHERE id IN ($1, $2, $3);", admin_user_id, dev_user_id, regular_user_id)
            print("✔️  Base de datos limpia.")
        finally:
            await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
