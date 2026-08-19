from backend.core.database import SessionLocal, engine
from backend.models.erp_extended import Cheque
from sqlalchemy import text

db = SessionLocal()
try:
    # Add column if not exists
    db.execute(text("ALTER TABLE public.cuentas_bancarias ADD COLUMN IF NOT EXISTS cuarentena_usd NUMERIC(15, 2) DEFAULT 0.00 NOT NULL;"))
    
    # Create cheques table
    Cheque.__table__.create(engine, checkfirst=True)
    
    db.commit()
    print("Database updated successfully.")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
