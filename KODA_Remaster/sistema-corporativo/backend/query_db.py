import asyncio
import asyncpg

async def main():
    db_url = "postgresql://postgres.ssyvprumeqfnxttlcjmg:SistemaKodaBy3lo_1910@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    
    print("=== GERENCIAS ===")
    g_rows = await conn.fetch("SELECT id, nombre, tenant_id FROM gerencias;")
    for r in g_rows:
        print(dict(r))
        
    print("\n=== PROFILES ===")
    p_rows = await conn.fetch("""
        SELECT p.username, p.nombre, p.apellido, p.rol_id, p.gerencia_id, g.nombre as gerencia_nombre, p.tenant_id
        FROM profiles p
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        ORDER BY p.tenant_id, p.username;
    """)
    for r in p_rows:
        print(dict(r))
    await conn.close()

asyncio.run(main())
