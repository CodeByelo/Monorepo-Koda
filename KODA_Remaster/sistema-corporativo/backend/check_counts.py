import asyncpg
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path

async def main():
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    conn = await asyncpg.connect(db_url)
    try:
        tables = [
            'organizations',
            'profiles',
            'gerencias',
            'empleados',
            'asientos_contables',
            'asiento_detalles',
            'koda_event_ledger'
        ]
        for t in tables:
            try:
                count = await conn.fetchval(f"SELECT COUNT(*) FROM {t}")
                print(f"Table '{t}': {count} rows")
            except Exception as e:
                print(f"Table '{t}': Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
