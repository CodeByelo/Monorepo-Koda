from backend.core.database import SessionLocal
from backend.models.core import Profile

def list_users():
    db = SessionLocal()
    try:
        users = db.query(Profile).all()
        for u in users:
            print(f"ID: {u.id}, Email: {u.email}, Rol: {getattr(u, 'rol', None)}")
    finally:
        db.close()

if __name__ == "__main__":
    list_users()
