import sys
import os

# Añadir el directorio raíz al path para poder importar backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.database import SessionLocal
from backend.routers.dashboard_ext import get_dashboard_metrics

def main():
    print("Iniciando prueba de métricas de dashboard...")
    db = SessionLocal()
    try:
        res = get_dashboard_metrics(db)
        print("Métricas obtenidas con éxito:")
        print(res)
    except Exception as e:
        print("ERROR DETECTADO:", e)
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
