import sys
sys.path.append("/home/byelo/koda-backend/koda-frontend")
from backend.core.database import SessionLocal
from backend.models.core import Profile
from sqlalchemy import text

db = SessionLocal()
try:
    # Query without setting app.current_tenant_id
    users_before = db.query(Profile).all()
    print(f"Users BEFORE setting tenant_id: {len(users_before)}")
    
    # Set app.current_tenant_id
    db.execute(text("SELECT set_config('app.current_tenant_id', '89fd839a-bd5e-419b-abb1-393987fc2d7e', true)"))
    
    # Query after setting app.current_tenant_id
    users_after = db.query(Profile).all()
    print(f"Users AFTER setting tenant_id: {len(users_after)}")
    for u in users_after:
        print(f"  - {u.nombre} ({u.email})")
finally:
    db.close()
