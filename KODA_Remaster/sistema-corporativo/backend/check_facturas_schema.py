import asyncpg
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path

async def check_schema():
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        tables_to_check = ['clientes', 'ventas', 'venta_detalles']
        for table in tables_to_check:
            exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )
            """, table)
            print(f"Table '{table}' exists: {exists}")
            if exists:
                columns = await conn.fetch("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = $1
                """, table)
                print(f"  Columns of '{table}':")
                for col in columns:
                    print(f"    - {col['column_name']} ({col['data_type']})")
    except Exception as e:
        print(f"Error checking table details: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_schema())
