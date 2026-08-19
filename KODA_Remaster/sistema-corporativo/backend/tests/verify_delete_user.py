import asyncio
import os
import uuid
import asyncpg
import httpx
from jose import jwt
import sys

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from auth.supabase_auth import SECRET_KEY, ALGORITHM

async def test_all():
    db_url = os.getenv("SUPABASE_DB_URL")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    
    # 1. Fetch Hrodriguez's ID and verify we have a developer
    dev_user = await conn.fetchrow("SELECT id FROM profiles WHERE username = $1", "Hrodriguez")
    if not dev_user:
        print("FAIL: Developer Hrodriguez not found in database!")
        await conn.close()
        return
    dev_id = str(dev_user["id"])
    print(f"Developer Hrodriguez ID: {dev_id}")
    
    # 2. Get a valid tenant_id for the user creation
    tenant_row = await conn.fetchrow("SELECT tenant_id FROM profiles WHERE tenant_id IS NOT NULL LIMIT 1")
    if tenant_row:
        tenant_id = str(tenant_row["tenant_id"])
    else:
        tenant_id = str(uuid.uuid4())
    print(f"Using Tenant ID: {tenant_id}")
    
    # 3. Create a JWT token for Hrodriguez
    payload = {
        "sub": dev_id,
        "role": "Desarrollador",
        "username": "Hrodriguez",
        "email": "henryddaniel1910@gmail.com"
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    headers = {"Authorization": f"Bearer {token}"}
    
    # Clean up any potential leftover test user
    await conn.execute("DELETE FROM profiles WHERE username = $1", "testuser123_temp")
    
    # Run tests using AsyncClient with ASGITransport in the SAME event loop!
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 4. Try to delete oneself (should return 400)
        response_self = await client.delete(f"/dev/users/{dev_id}", headers=headers)
        print(f"Self-deletion response status: {response_self.status_code}, detail: {response_self.json()}")
        assert response_self.status_code == 400
        assert response_self.json()["detail"] == "No puede eliminarse a sí mismo."
        print("SUCCESS: Self-deletion check works.")
        
        # 5. Create a new test user to delete
        create_payload = {
            "username": "testuser123_temp",
            "nombre": "Test",
            "apellido": "User",
            "email": "testuser123_temp@empresa.com",
            "password": "TestPassword123!",
            "rol_id": 3,
            "tenant_id": tenant_id
        }
        
        response_create = await client.post("/dev/users", json=create_payload, headers=headers)
        print(f"Create user response status: {response_create.status_code}")
        assert response_create.status_code == 200
        
        # Get created user ID
        created_user = await conn.fetchrow("SELECT id FROM profiles WHERE username = $1", "testuser123_temp")
        assert created_user is not None
        created_id = str(created_user["id"])
        print(f"Created user ID: {created_id}")
        
        # 6. Delete the created user via endpoint
        response_delete = await client.delete(f"/dev/users/{created_id}", headers=headers)
        print(f"Delete user response status: {response_delete.status_code}, detail: {response_delete.json()}")
        assert response_delete.status_code == 200
        assert response_delete.json()["status"] == "success"
        
        # Verify user is deleted from profiles
        deleted_user_check = await conn.fetchrow("SELECT id FROM profiles WHERE id = $1::uuid", created_id)
        assert deleted_user_check is None
        print("SUCCESS: User creation, deletion, and DB verification work perfectly.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(test_all())
