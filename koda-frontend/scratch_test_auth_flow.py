import jwt
import backend.core.security
from backend.services.auth import get_current_user_from_token
from backend.core.database import SessionLocal
import os

# Set Env vars
SECRET_KEY = "b336338e3e4a2c0023ff01ff8c87c2b535d25ffb6507a2a514757c913506cdb5"
ALGORITHM = "HS256"

# Create a mock token signed with this secret key, mimicking Koda Remaster
payload = {
    "sub": "aef52640-096f-4367-b913-07e292387638",
    "role": "Desarrollador",
    "tenant_id": None, # Developer usually has None or some tenant
    "tenant_name": None,
    "email": "henryddaniel1910@gmail.com",
    "username": "Hrodriguez"
}

token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
print("Generated Token:", token)

db = SessionLocal()
try:
    user = get_current_user_from_token(token, db)
    print("SUCCESS! User:", user.email, "IsActive:", user.is_active)
except Exception as e:
    print("FAILED with Exception:", type(e), str(e))
finally:
    db.close()
