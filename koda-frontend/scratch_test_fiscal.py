from backend.core.database import SessionLocal
from backend.routers.fiscal_ext import fiscal_dashboard
from backend.routers.modulos_ext import movimientos_banco

db = SessionLocal()
try:
    print(fiscal_dashboard(periodo="2026-06", db=db))
except Exception as e:
    import traceback
    traceback.print_exc()

try:
    print(movimientos_banco(periodo="2026-06", db=db))
except Exception as e:
    import traceback
    traceback.print_exc()
