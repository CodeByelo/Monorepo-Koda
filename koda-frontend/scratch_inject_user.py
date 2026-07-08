import os
from backend.core.database import SessionLocal
from backend.models.core import Profile
import uuid

def inject_user():
    db = SessionLocal()
    try:
        user_id = uuid.UUID('aef52640-096f-4367-b913-07e292387638')
        user = db.query(Profile).filter(Profile.id == user_id).first()
        if not user:
            print("User not found. Creating...")
            new_user = Profile(
                id=user_id,
                email="henryddaniel1910@gmail.com",
                full_name="Usuario Master (Koda Remaster)",
                role="admin",
                is_active=True
            )
            db.add(new_user)
            db.commit()
            print("User created successfully!")
        else:
            print("User already exists.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    inject_user()
