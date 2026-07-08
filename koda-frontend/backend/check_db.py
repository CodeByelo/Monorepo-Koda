import sys
sys.path.append("/app")
from backend.core.database import SessionLocal
from backend.models.operations import Venta
from backend.models.erp_extended import CuentaPorCobrar

db = SessionLocal()
try:
    print("=== VENTAS ===")
    ventas = db.query(Venta).all()
    for v in ventas:
        print(f"ID: {v.id}, Numero: {v.numero_factura}, Cliente ID: {v.cliente_id}, Total: {v.total_usd}")
        
    print("\n=== CUENTAS POR COBRAR ===")
    cxc = db.query(CuentaPorCobrar).all()
    for c in cxc:
        print(f"ID: {c.id}, Documento: {c.numero_documento}, Cliente ID: {c.cliente_id}, Total: {c.monto_total}")
finally:
    db.close()
