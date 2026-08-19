import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run_patch():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("Error: SUPABASE_DB_URL not found")
        return

    print(f"Connecting to {db_url.split('@')[-1]}...")

    sql = """
    BEGIN;

    -- 1. Create subscription_plans table
    CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        max_users INT NOT NULL DEFAULT 5,
        allowed_modules JSONB NOT NULL DEFAULT '["dashboard"]',
        price DECIMAL(10,2) DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 2. Insert default plans
    INSERT INTO subscription_plans (name, max_users, allowed_modules, price) VALUES
    ('Básico', 5, '["dashboard", "configuracion", "comunidad"]'::jsonb, 0.00),
    ('Pro', 20, '["dashboard", "configuracion", "comunidad", "ventas", "inventario", "compras"]'::jsonb, 49.99),
    ('Corporativo', 9999, '["all"]'::jsonb, 199.99)
    ON CONFLICT (name) DO UPDATE
    SET max_users = EXCLUDED.max_users,
        allowed_modules = EXCLUDED.allowed_modules;

    -- 3. Add plan_id to organizations
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_id INT REFERENCES subscription_plans(id);
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled'));

    -- 4. Set default plan for existing organizations (assume Pro for backward compatibility)
    DO $$
    DECLARE
        pro_plan_id INT;
    BEGIN
        SELECT id INTO pro_plan_id FROM subscription_plans WHERE name = 'Pro' LIMIT 1;
        UPDATE organizations SET plan_id = pro_plan_id WHERE plan_id IS NULL;
    END $$;

    COMMIT;
    """

    try:
        conn = await asyncpg.connect(db_url)
        print("Executing patch...")
        await conn.execute(sql)
        print("Patch executed successfully!")
        await conn.close()
    except Exception as e:
        print(f"Error executing patch: {e}")

if __name__ == "__main__":
    asyncio.run(run_patch())
