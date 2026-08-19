import os
import sys

# Add the current directory to sys.path to allow imports from backend
sys.path.append(os.getcwd())

from backend.database.postgres_connection import get_db_connection

def apply_sql(file_path):
    conn = get_db_connection()
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            with open(file_path, 'r', encoding='utf-8') as f:
                sql = f.read()
                print(f"Executing SQL from {file_path}...")
                cur.execute(sql)
                print("SQL executed successfully.")
    except Exception as e:
        print(f"Error executing SQL: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        sql_file = sys.argv[1]
    else:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        sql_file = os.path.join(current_dir, "database", "create_profiles.sql")
    apply_sql(sql_file)
