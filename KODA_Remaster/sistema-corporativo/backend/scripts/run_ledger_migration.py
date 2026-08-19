import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import asyncpg

# Set paths inside the Docker container
ENV_PATH = Path("/app/.env")
MIGRATION_PATH = Path("/app/database/migrations/005_immutable_ledger.sql")

# Load env variables
load_dotenv(dotenv_path=ENV_PATH)
db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")

async def run_migration():
    if not db_url:
        print("ERROR: No database URL found in env.", file=sys.stderr)
        sys.exit(1)
        
    print(f"Connecting to database...")
    ssl_mode = os.getenv("DB_SSL_MODE", "disable").lower()
    ssl_value = "require" if ssl_mode == "require" else None
    
    try:
        conn = await asyncpg.connect(dsn=db_url, ssl=ssl_value)
        print("Connected successfully. Reading migration SQL...")
        
        sql = MIGRATION_PATH.read_text(encoding="utf-8")
        print("Executing SQL migration...")
        await conn.execute(sql)
        print("Migration executed successfully!")
        
        # Verify tables created
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name LIKE 'koda_event_ledger%'
        """)
        print("Created tables:")
        for t in tables:
            print(f" - {t['table_name']}")
            
        await conn.close()
    except Exception as e:
        print(f"CRITICAL ERROR running migration: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_migration())
