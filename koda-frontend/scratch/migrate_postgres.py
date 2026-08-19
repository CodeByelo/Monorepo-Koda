import sys
import os

# Asegurar que importamos desde el backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from backend.core.database import engine

def migrate():
    with engine.begin() as conn:
        try:
            print("Agregando columnas a retenciones_iva en postgres...")
            conn.execute(text("ALTER TABLE retenciones_iva ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'RECIBIDA'"))
            conn.execute(text("ALTER TABLE retenciones_iva ADD COLUMN IF NOT EXISTS agente_rif VARCHAR(50)"))
            conn.execute(text("ALTER TABLE retenciones_iva ADD COLUMN IF NOT EXISTS agente_nombre VARCHAR(150)"))
            conn.execute(text("ALTER TABLE retenciones_iva ADD COLUMN IF NOT EXISTS numero_comprobante VARCHAR(50)"))
            conn.execute(text("ALTER TABLE retenciones_iva ADD COLUMN IF NOT EXISTS fecha_comprobante TIMESTAMP"))
            print("Columnas agregadas con éxito!")
        except Exception as e:
            print("Error migrando:", e)

if __name__ == "__main__":
    migrate()
