import asyncpg
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path

async def main():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    print("Connecting to database...")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        migration_file = Path(__file__).parent / "database" / "migrations" / "007_facturas_schema.sql"
        print(f"Reading migration file {migration_file}...")
        sql = migration_file.read_text()
        print("Executing migration...")
        await conn.execute(sql)
        print("✅ Migration applied successfully!")
    except Exception as e:
        print(f"❌ Error applying migration: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
