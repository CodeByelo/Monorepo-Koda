import asyncio
import asyncpg
import os

async def check_main_db():
    # DATABASE_URL from KODA_Remaster
    dsn = "postgresql://postgres.xvwsucgkdtbcapoonufh:HDHH3nry_1910@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    
    print("Connecting to main Koda Remaster DB...")
    conn = await asyncpg.connect(dsn)
    try:
        print("Connected!")
        # List all users
        rows = await conn.fetch("SELECT id, username, email, estado, rol_id FROM profiles")
        print("\n=== USERS IN MAIN DB ===")
        for r in rows:
            print(f"ID: {r['id']}, Username: {r['username']}, Email: {r['email']}, Estado: {r['estado']}, RolID: {r['rol_id']}")
            
        # Get roles
        roles = await conn.fetch("SELECT id, nombre_rol FROM roles")
        print("\n=== ROLES IN MAIN DB ===")
        for role in roles:
            print(f"ID: {role['id']}, Role: {role['nombre_rol']}")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_main_db())
