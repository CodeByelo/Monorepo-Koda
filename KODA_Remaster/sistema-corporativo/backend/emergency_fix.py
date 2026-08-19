import asyncio
import asyncpg
import os
import sys

async def run():
    url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if not url:
        print("Missing DATABASE_URL (preferred) or SUPABASE_DB_URL.")
        return
    print(f"Connecting to database...")
    try:
        conn = await asyncio.wait_for(asyncpg.connect(url), timeout=20)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    try:
        print("Creating table documento_adjuntos...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS documento_adjuntos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                documento_id UUID REFERENCES documentos(id) ON DELETE CASCADE,
                url_archivo TEXT NOT NULL,
                fecha_creacion TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        
        print("Migrating data from documentos to documento_adjuntos...")
        # Solo insertar si no existen ya (para evitar duplicados en reintentos)
        await conn.execute("""
            INSERT INTO documento_adjuntos (documento_id, url_archivo)
            SELECT id, url_archivo 
            FROM documentos 
            WHERE url_archivo IS NOT NULL 
            AND url_archivo != ''
            AND NOT EXISTS (
                SELECT 1 FROM documento_adjuntos da WHERE da.documento_id = documentos.id
            )
        """)
        
        print("Verifying tables...")
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        table_names = [t[0] for t in tables]
        print(f"Tables in public schema: {table_names}")
        
        if "documento_adjuntos" in table_names:
            print("SUCCESS: table documento_adjuntos exists.")
        else:
            print("ERROR: table documento_adjuntos MISSING.")
            
    except Exception as e:
        print(f"Database error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
