import os
import sys

# Ensure PYTHONPATH includes project root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.database import SessionLocal
from backend.routers.extras_ext import (
    listar_bancos,
    listar_movimientos_bancarios,
    resumen_conciliacion,
    movimientos_pendientes_conciliar,
    obtener_arqueo,
    obtener_caja_chica,
    tasa_actual,
    historial_tasas,
    cuentas_por_cobrar_list,
    kpis_cobranzas,
    dashboard_tesoreria
)

db = SessionLocal()

tests = [
    ("listar_bancos", lambda: listar_bancos(db=db)),
    ("listar_movimientos_bancarios", lambda: listar_movimientos_bancarios(db=db)),
    ("resumen_conciliacion", lambda: resumen_conciliacion(db=db)),
    ("movimientos_pendientes_conciliar", lambda: movimientos_pendientes_conciliar(db=db)),
    ("obtener_arqueo", lambda: obtener_arqueo(db=db)),
    ("obtener_caja_chica", lambda: obtener_caja_chica(db=db)),
    ("tasa_actual", lambda: tasa_actual(db=db)),
    ("historial_tasas", lambda: historial_tasas(db=db)),
    ("cuentas_por_cobrar_list", lambda: cuentas_por_cobrar_list(db=db)),
    ("kpis_cobranzas", lambda: kpis_cobranzas(db=db)),
    ("dashboard_tesoreria", lambda: dashboard_tesoreria(db=db))
]

print("=== TESTING NEW TREASURY ROUTE HANDLERS ===")
success = True
for name, func in tests:
    try:
        res = func()
        print(f"✅ {name:40} -> Success (returned type: {type(res).__name__})")
    except Exception as e:
        print(f"❌ {name:40} -> 💥 Error: {e}")
        success = False

db.close()

if success:
    print("✅ All handlers executed successfully!")
else:
    print("❌ Some handlers failed!")
