import sys
sys.path.append("/app")
from backend.core.database import SessionLocal
from backend.routers.sales import obtener_venta_por_numero

db = SessionLocal()
try:
    res = obtener_venta_por_numero(numero_factura="FAC-2026-0004", db=db, current_user=None)
    print("SUCCESS:", res.numero_factura, "Total:", res.total_usd)
except Exception as e:
    print("ERROR:", str(e))
finally:
    db.close()
