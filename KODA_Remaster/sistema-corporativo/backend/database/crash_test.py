import asyncio
import asyncpg
import os
from dotenv import load_dotenv
from pathlib import Path

# Cargar .env desde la raíz del backend
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

async def crash_test():
    db_url = os.getenv("SUPABASE_DB_URL")
    print(f"🚀 Intentando conectar a: {db_url.split('@')[1]}")
    conn = await asyncpg.connect(db_url)
    print("✅ ¡CONEXIÓN EXITOSA!")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(crash_test())
