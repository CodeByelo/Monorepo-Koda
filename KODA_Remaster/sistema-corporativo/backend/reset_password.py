import asyncpg
import asyncio
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Add /app to sys.path so we can import auth.security
sys.path.append("/app")
from auth.security import get_password_hash

async def main():
    env_path = Path("/app/.env")
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    new_password = "Daniel1910**"
    username_norm = "ceo_final01"
    
    print(f"Hashing new password...")
    hashed_pw = get_password_hash(new_password)
    
    print(f"Connecting to database...")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        # 1. Update password in profiles
        print(f"Updating password hash in profiles for '{username_norm}'...")
        res_pw = await conn.execute(
            "UPDATE profiles SET password_hash = $1 WHERE LOWER(username) = LOWER($2)",
            hashed_pw, username_norm
        )
        print(f"Password update result: {res_pw}")
        
        # 2. Reset lockout attempts
        print(f"Resetting login lockouts for '{username_norm}'...")
        res_lockout = await conn.execute(
            "DELETE FROM login_lockouts WHERE LOWER(username) = LOWER($1)",
            username_norm
        )
        print(f"Lockout delete result: {res_lockout}")
        
        # 3. Double-check status
        row = await conn.fetchrow(
            "SELECT username, estado FROM profiles WHERE LOWER(username) = LOWER($1)",
            username_norm
        )
        if row:
            print(f"Verify user: username={row['username']}, estado={row['estado']}")
        else:
            print(f"User not found after update!")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
