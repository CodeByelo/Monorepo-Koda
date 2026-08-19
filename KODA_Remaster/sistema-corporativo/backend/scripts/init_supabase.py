import asyncio
from database.postgres_connection import get_db_connection
import os

def run_sql_script(script_path):
    if not os.path.exists(script_path):
        print(f"Error: {script_path} not found.")
        return

    conn = get_db_connection()
    if not conn:
        return

    try:
        with open(script_path, 'r') as f:
            sql = f.read()
        
        with conn.cursor() as cur:
            cur.execute(sql)
            conn.commit()
            print("Successfully initialized Supabase schema.")
    except Exception as e:
        print(f"Error running script: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    script_path = os.path.join(os.path.dirname(__file__), "init_supabase_schema.sql")
    run_sql_script(script_path)
