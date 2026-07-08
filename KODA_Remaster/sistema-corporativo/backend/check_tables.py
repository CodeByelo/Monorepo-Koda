import asyncpg
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path

async def main():
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        tables = ['gerencias', 'empleados', 'koda_event_ledger', 'recibos_nomina', 'facturas', 'profiles', 'organizations']
        for t in tables:
            print(f"\nColumns in '{t}':")
            cols = await conn.fetch(f"""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = '{t}'
            """)
            for c in cols:
                print(f"  - {c['column_name']} ({c['data_type']}) nullable={c['is_nullable']}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
