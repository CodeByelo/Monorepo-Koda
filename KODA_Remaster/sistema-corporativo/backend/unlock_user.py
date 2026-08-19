import asyncpg
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path

async def main():
    env_path = Path("/app/.env")
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    print(f"Connecting to database...")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        username_norm = "hrodriguez"
        
        # 1. Delete from login_lockouts
        print(f"Deleting login lockouts for '{username_norm}'...")
        res_lockout = await conn.execute(
            "DELETE FROM login_lockouts WHERE LOWER(username) = LOWER($1)",
            username_norm
        )
        print(f"Lockouts deleted: {res_lockout}")
        
        # 2. Update state in profiles
        print(f"Activating user profiles for '{username_norm}'...")
        res_profiles = await conn.execute(
            "UPDATE profiles SET estado = True WHERE LOWER(username) = LOWER($1)",
            username_norm
        )
        print(f"Profiles updated: {res_profiles}")
        
        # 3. Query profiles to check final status
        row = await conn.fetchrow(
            "SELECT id, username, estado FROM profiles WHERE LOWER(username) = LOWER($1)",
            username_norm
        )
        if row:
            print(f"Current profile status: id={row['id']}, username={row['username']}, estado={row['estado']}")
        else:
            print(f"Profile for '{username_norm}' not found!")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
