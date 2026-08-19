import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from backend.core.database import engine

def migrate():
    with engine.begin() as conn:
        try:
            print("Agregando columnas a ventas en postgres (si es que hace falta algo)...")
            # En caso de que se necesite algo en ventas
            pass
        except Exception as e:
            print("Error migrando:", e)

if __name__ == "__main__":
    migrate()
