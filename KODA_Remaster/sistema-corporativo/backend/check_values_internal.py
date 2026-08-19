import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core.database import SessionLocal
from models.erp_extended import DetalleAsiento, CuentaPorCobrar, CuentaPorPagar
from models.operations import Producto
from sqlalchemy import func

db = SessionLocal()
try:
    print("ASIENTO_DETALLES SUMMARY:")
    results = db.query(
        DetalleAsiento.cuenta_codigo,
        DetalleAsiento.cuenta_nombre,
        func.sum(DetalleAsiento.debe_usd),
        func.sum(DetalleAsiento.haber_usd)
    ).group_by(
        DetalleAsiento.cuenta_codigo,
        DetalleAsiento.cuenta_nombre
    ).all()
    for r in results:
        print(r)
        
    print("\nCXC:")
    cxc = db.query(CuentaPorCobrar).all()
    print(f"Total CXC: {len(cxc)}")
    for c in cxc[:10]:
        print(c.id, c.estado, c.monto_total_usd, c.monto_pagado_usd, c.fecha_vencimiento)
        
    print("\nCXP:")
    cxp = db.query(CuentaPorPagar).all()
    print(f"Total CXP: {len(cxp)}")
    for c in cxp[:10]:
        print(c.id, c.estado, c.monto_total_usd, c.monto_pagado_usd, c.fecha_vencimiento)
finally:
    db.close()
