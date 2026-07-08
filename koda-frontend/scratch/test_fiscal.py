import sys
import os

# Set up path so we can import from backend
sys.path.append(os.path.abspath('/home/byelo/koda-backend/koda-frontend'))

from backend.core.database import SessionLocal
from backend.routers.fiscal import obtener_dashboard_fiscal

def test_dashboard():
    db = SessionLocal()
    try:
        # Test for current period 2026-07
        result = obtener_dashboard_fiscal(periodo="2026-07", db=db, current_user=None)
        
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    finally:
        db.close()

if __name__ == "__main__":
    test_dashboard()
