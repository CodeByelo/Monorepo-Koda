import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = "postgresql://postgres.ssyvprumeqfnxttlcjmg:SistemaKodaBy3lo_1910@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()
res = db.execute(text("SELECT id, cuenta_origen_id, cuenta_destino_id, monto_usd, tasa_cambio_bs, concepto, estado FROM public.transferencias_tesoreria")).fetchall()

print(f"Total transferencias: {len(res)}")
for row in res:
    print(dict(row._mapping))
