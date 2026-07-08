import asyncpg
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path

async def check_schema():
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    conn = await asyncpg.connect(db_url)
    try:
        print("📊 Roles in database:")
        roles = await conn.fetch("SELECT * FROM roles")
        for r in roles:
            print(f"- ID: {r['id']}, Nombre: {r['nombre_rol']}")
            
        print("\n📊 Profiles in database (first 10):")
        profiles = await conn.fetch("SELECT id, username, rol_id, email FROM profiles LIMIT 10")
        for p in profiles:
            print(f"- Username: {p['username']}, Role ID: {p['rol_id']}, Email: {p['email']}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_schema())
