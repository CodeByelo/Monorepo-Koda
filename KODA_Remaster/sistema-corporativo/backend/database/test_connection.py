import asyncio
import asyncpg
import os
from dotenv import load_dotenv
from pathlib import Path

# Cargar .env desde la raíz del backend
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

async def test_supabase_connection():
    print("🚀 Iniciando Test de Conexión a Supabase...")
    
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("❌ Error: SUPABASE_DB_URL no encontrada en el archivo .env")
        return

    print(f"🔗 Intentando conectar a: {db_url.split('@')[1]}...") # No imprimir password
    
    try:
        conn = await asyncpg.connect(db_url, statement_cache_size=0)
        print("✅ ¡CONEXIÓN EXITOSA!")
        
        # Probar que las tablas existan
        print("📊 Verificando esquema público...")
        rows = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        tables = [r['table_name'] for r in rows]
        print(f"   Tablas encontradas: {tables}")
        
        required = ['organizations', 'profiles', 'user_organizations', 'documentos']
        missing = [t for t in required if t not in tables]
        if missing:
            print(f"⚠️ Faltan tablas críticas: {missing}")
        else:
            print("✅ Todas las tablas críticas están presentes.")
            
        await conn.close()
        print("\n🎉 Test finalizado correctamente.")
        
    except Exception as e:
        import traceback
        print(f"❌ ERROR DE CONEXIÓN: {type(e).__name__}: {e}")
        print("\n🔍 Stacktrace:")
        traceback.print_exc()
        print("\n💡 Sugerencias:")
        print("1. Verifica que tu IP esté permitida en Supabase (o usa 0.0.0.0/0 en Network Restrictions).")
        print("2. Revisa que el password en el .env sea correcto.")
        print("3. Asegúrate de haber ejecutado el script setup_database.sql en el editor SQL.")

if __name__ == "__main__":
    asyncio.run(test_supabase_connection())
