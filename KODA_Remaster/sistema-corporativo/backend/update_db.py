import os
import asyncio
import asyncpg

async def main():
    db_url = os.getenv('SUPABASE_DB_URL')
    if not db_url:
        print("No SUPABASE_DB_URL found")
        return
    conn = await asyncpg.connect(db_url)
    await conn.execute("ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_permissions JSONB DEFAULT '[]'::jsonb;")
    print("Column added successfully")
    
    # Let's also check what roles exist
    roles = await conn.fetch("SELECT * FROM roles;")
    print("Roles:")
    for role in roles:
        print(dict(role))
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
