import asyncpg
import asyncio
import os
from dotenv import load_dotenv

# Cargar variables de entorno si es necesario
load_dotenv()

async def run_migration():
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("❌ Error: SUPABASE_DB_URL no encontrada.")
        return

    print("🚀 Iniciando migración de Base de Datos...")
    
    conn = await asyncpg.connect(db_url)
    try:
        async with conn.transaction():
            # 1. Agregar columna de contenido
            print("📝 Agregando columna 'contenido'...")
            await conn.execute("""
                ALTER TABLE documentos 
                ADD COLUMN IF NOT EXISTS contenido TEXT;
            """)
            
            # 2. Agregar columna de leído
            print("👁️ Agregando columna 'leido'...")
            await conn.execute("""
                ALTER TABLE documentos 
                ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT FALSE;
            """)
            
            # 3. Asegurar que receptor_id sea UUID
            # (Si ya existe, esto no hará nada o fallará si el tipo es incompatible, 
            # pero en Supabase solemos usar UUID para perfiles)
            print("🔗 Verificando columna 'receptor_id'...")
            await conn.execute("""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documentos' AND column_name='receptor_id') THEN
                        ALTER TABLE documentos ADD COLUMN receptor_id UUID REFERENCES profiles(id);
                    END IF;
                END $$;
            """)

        print("✅ Migración completada con éxito.")
    except Exception as e:
        print(f"❌ Error durante la migración: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_migration())
