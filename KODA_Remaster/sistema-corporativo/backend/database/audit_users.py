import asyncio
import asyncpg
import os
from dotenv import load_dotenv
from pathlib import Path

# Cargar .env
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

async def audit_users():
    db_url = os.getenv("SUPABASE_DB_URL")
    try:
        conn = await asyncpg.connect(db_url)
        print("\n🔍 AUDITORÍA DE USUARIOS - ALPHA V.0.2")
        print("-" * 40)
        
        # 1. Verificar public.profiles
        profiles_count = await conn.fetchval("SELECT count(*) FROM public.profiles")
        print(f"👥 Usuarios en public.profiles: {profiles_count}")
        
        if profiles_count > 0:
            profiles = await conn.fetch("SELECT email, nombre, created_at FROM public.profiles")
            for p in profiles:
                print(f"   - {p['email']} ({p['nombre']})")
        
        # 2. Verificar auth.users (Requiere permisos de superuser/service role en DB)
        try:
            auth_count = await conn.fetchval("SELECT count(*) FROM auth.users")
            print(f"🔑 Usuarios en auth.users: {auth_count}")
        except Exception:
            print("🔑 auth.users: Acceso restringido (requiere consola Supabase)")

        # 3. Verificar organizaciones
        org_count = await conn.fetchval("SELECT count(*) FROM public.organizations")
        print(f"🏢 Organizaciones creadas: {org_count}")
        
        await conn.close()
        print("-" * 40)
        
        if profiles_count == 0:
            print("\n💡 EL SISTEMA ESTÁ LIMPIO.")
            print("Debes crear tu primer usuario en el Dashboard de Supabase.")
            
    except Exception as e:
        print(f"❌ Error al consultar: {e}")

if __name__ == "__main__":
    asyncio.run(audit_users())
