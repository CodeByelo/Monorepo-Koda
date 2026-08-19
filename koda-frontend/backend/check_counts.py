from backend.core.database import SessionLocal
from backend.models import erp_extended, core, operations, hr, fiscal, audit
from backend.models.operations import Cliente, Producto, Venta
db = SessionLocal()
try:
    print("Clientes:", db.query(Cliente).count())
    print("Productos:", db.query(Producto).count())
    print("Ventas:", db.query(Venta).count())
finally:
    db.close()
