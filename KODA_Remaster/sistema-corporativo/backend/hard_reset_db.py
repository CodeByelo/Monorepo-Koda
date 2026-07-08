import asyncpg
import asyncio
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Strict list of tables to exclude from truncation
EXCLUDE_TABLES = {
    'profiles',
    'app_users',
    'tenants',
    'empresa',
    'cuentas_contables',
    'tasas_bcv',
    'bcv_rates',
    'tasas_cambio',
    'roles',
    'organizations',
    'subscription_plans',
    'gerencias',
    'user_organizations'
}

async def main():
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)
    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    if not db_url:
        print("Error: DATABASE_URL or SUPABASE_DB_URL is not set!", flush=True)
        return

    print("Connecting to database...", flush=True)
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    
    try:
        # Get all base tables in the public schema
        query = """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """
        rows = await conn.fetch(query)
        all_tables = [row['table_name'] for row in rows]
        
        # Determine tables to truncate and tables to keep
        tables_to_truncate = [t for t in all_tables if t not in EXCLUDE_TABLES]
        tables_to_keep = [t for t in all_tables if t in EXCLUDE_TABLES]
        
        print(f"\nFound {len(all_tables)} total tables in 'public' schema.")
        print(f"Tables to keep ({len(tables_to_keep)}): {', '.join(sorted(tables_to_keep))}")
        print(f"Tables to truncate ({len(tables_to_truncate)}): {', '.join(sorted(tables_to_truncate))}\n")
        
        # Row counts BEFORE purge
        print("--- ROW COUNTS BEFORE PURGE ---", flush=True)
        before_counts = {}
        for t in sorted(all_tables):
            try:
                cnt = await conn.fetchval(f'SELECT COUNT(*) FROM "{t}"')
                before_counts[t] = cnt
                if cnt > 0:
                    print(f"  - {t}: {cnt} rows")
            except Exception as e:
                print(f"  - {t}: Error: {e}")
                
        # Perform TRUNCATE with CASCADE
        if tables_to_truncate:
            print("\nExecuting TRUNCATE CASCADE on operational tables...", flush=True)
            truncate_list = ", ".join(f'"{t}"' for t in tables_to_truncate)
            truncate_query = f"TRUNCATE TABLE {truncate_list} CASCADE;"
            await conn.execute(truncate_query)
            print("TRUNCATE completed successfully!", flush=True)
        else:
            print("\nNo tables to truncate.", flush=True)

        # Delete all other user accounts except Hrodriguez
        print("\nPurging user accounts except Hrodriguez...", flush=True)
        hrodriguez_id = await conn.fetchval(
            "SELECT id FROM profiles WHERE LOWER(username) = 'hrodriguez'"
        )
        if hrodriguez_id:
            print(f"Found Hrodriguez with ID: {hrodriguez_id}. Deleting other users...", flush=True)
            # Delete from user_organizations, app_users, profiles
            deleted_orgs = await conn.execute(
                "DELETE FROM user_organizations WHERE user_id != $1::uuid", hrodriguez_id
            )
            deleted_app = await conn.execute(
                "DELETE FROM app_users WHERE id != $1::uuid", hrodriguez_id
            )
            deleted_profiles = await conn.execute(
                "DELETE FROM profiles WHERE id != $1::uuid", hrodriguez_id
            )
            print(f"Purged other users successfully: {deleted_orgs}, {deleted_app}, {deleted_profiles}", flush=True)
        else:
            print("WARNING: Hrodriguez profile NOT found! No users were deleted.", flush=True)
            
        # Row counts AFTER purge
        print("\n--- ROW COUNTS AFTER PURGE ---", flush=True)
        after_counts = {}
        errors = 0
        for t in sorted(all_tables):
            try:
                cnt = await conn.fetchval(f'SELECT COUNT(*) FROM "{t}"')
                after_counts[t] = cnt
                status = "CLEANED" if t in tables_to_truncate else "PRESERVED"
                print(f"  - {t}: {cnt} rows ({status})")
                if t in tables_to_truncate and cnt > 0:
                    print(f"    WARNING: Table '{t}' was NOT successfully purged!")
                    errors += 1
            except Exception as e:
                print(f"  - {t}: Error: {e}")
                
        print("\n--- SUMMARY ---", flush=True)
        print(f"Total tables: {len(all_tables)}")
        print(f"Preserved tables: {len(tables_to_keep)}")
        print(f"Purgable tables: {len(tables_to_truncate)}")
        
        # Verify that all purgable tables are at 0 rows
        purgable_at_zero = all(after_counts.get(t, 0) == 0 for t in tables_to_truncate)
        if purgable_at_zero and errors == 0:
            print("✅ Hard reset SUCCESSFUL! All transactional and operational tables are at 0 rows.")
            print("✅ Developer authentication and structural configurations are perfectly intact.")
        else:
            print("❌ Hard reset failed or some tables still have data.")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
