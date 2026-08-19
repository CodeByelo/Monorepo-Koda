import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from backend.core.database import engine

def migrate():
    with engine.begin() as conn:
        try:
            print("Agregando columnas a compras en postgres...")
            conn.execute(text("ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero_control VARCHAR(50)"))
            print("Columnas agregadas con éxito!")
        except Exception as e:
            print("Error migrando:", e)

if __name__ == "__main__":
    migrate()
