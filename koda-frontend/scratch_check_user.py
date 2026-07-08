from backend.core.database import SessionLocal
from backend.models.core import Profile
import uuid

def check_user():
    db = SessionLocal()
    try:
        user_id = uuid.UUID('aef52640-096f-4367-b913-07e292387638')
        user = db.query(Profile).filter(Profile.id == user_id).first()
        if user:
            print(f"User Found! ID: {user.id}, Email: {user.email}, Role: {user.role}, IsActive: {user.is_active}")
        else:
            print("User NOT found!")
    finally:
        db.close()

if __name__ == "__main__":
    check_user()
