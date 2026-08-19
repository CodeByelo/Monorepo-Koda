"""
Simple script to apply the profile creation trigger to Supabase database.
Run this script to set up automatic profile creation on user registration.
"""
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def apply_trigger():
    """Apply the profile creation trigger to Supabase"""
    # Get SQL file path
    script_dir = os.path.dirname(__file__)
    sql_file = os.path.join(script_dir, "create_profile_trigger.sql")
    
    if not os.path.exists(sql_file):
        print(f"Error: SQL file not found at {sql_file}")
        return False
    
    # Read SQL script
    with open(sql_file, 'r', encoding='utf-8') as f:
        sql_script = f.read()
    
    # Build connection string from environment
    db_url = f"postgresql://{os.getenv('SUPABASE_DB_USER')}:{os.getenv('SUPABASE_DB_PASSWORD')}@{os.getenv('SUPABASE_DB_HOST')}:{os.getenv('SUPABASE_DB_PORT')}/{os.getenv('SUPABASE_DB_NAME')}"
    
    try:
        print("Connecting to Supabase database...")
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor, sslmode='require')
        cur = conn.cursor()
        
        print("Applying profile creation trigger...")
        cur.execute(sql_script)
        conn.commit()
        
        print("\n✅ Successfully applied profile creation trigger!")
        print("   - Function: public.handle_new_user()")
        print("   - Trigger: on_auth_user_created")
        print("   - New users will automatically get a profile with 'Usuario' role (id=3)")
        print("\nYou can now test registration and the profile will be created automatically!")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"\n❌ Error applying trigger: {e}")
        print("\nAlternative: You can manually run the SQL in Supabase Dashboard:")
        print("1. Go to https://supabase.com/dashboard")
        print("2. Select your project")
        print("3. Go to SQL Editor")
        print(f"4. Copy and paste the contents of: {sql_file}")
        print("5. Click 'Run'")
        return False

if __name__ == "__main__":
    success = apply_trigger()
    exit(0 if success else 1)
