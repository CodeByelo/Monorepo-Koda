import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def dump_roles():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("Error: SUPABASE_DB_URL not found in .env")
        return

    try:
        # PGBouncer doesn't support prepared statements, disabling cache
        conn = await asyncpg.connect(db_url, ssl=False, statement_cache_size=0)
        roles = await conn.fetch("SELECT * FROM roles ORDER BY id")
        print("\n=== ROLES TABLE ===")
        for r in roles:
            print(f"ID: {r['id']} | Nombre: {r['nombre_rol']}")
        
        users = await conn.fetch("""
            SELECT p.username, p.email, p.rol_id, r.nombre_rol 
            FROM profiles p 
            JOIN roles r ON p.rol_id = r.id
            ORDER BY p.username
        """)
        print("\n=== USERS (PROFILES) ===")
        for u in users:
            print(f"User: {u['username']} | Email: {u['email']} | RolID: {u['rol_id']} | RolName: {u['nombre_rol']}")
            
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(dump_roles())
