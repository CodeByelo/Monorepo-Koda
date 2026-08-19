import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env
# Forzamos que se cargue explícitamente y sobreescriba en caso de dudas
load_dotenv(override=True)

# Obtener la URL de la base de datos de las variables de entorno (Obligatorio)
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "[DATABASE ERROR CRÍTICO] La variable de entorno DATABASE_URL no está configurada. "
        "El sistema requiere PostgreSQL (Supabase) y no permite bases de datos SQLite locales en producción."
    )

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError(
        f"[DATABASE ERROR CRÍTICO] Formato inválido de base de datos: {DATABASE_URL[:15]}... "
        "El sistema solo soporta conexiones a PostgreSQL."
    )

# Parámetros de búsqueda para public schema
if "?" in DATABASE_URL:
    if "options=-csearch_path=" not in DATABASE_URL:
        DATABASE_URL = f"{DATABASE_URL}&options=-csearch_path=public"
else:
    DATABASE_URL = f"{DATABASE_URL}?options=-csearch_path=public"

print(f"\033[94m[DB INFO] Motor SQL activo: PostgreSQL ({DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'Supabase'})\033[0m")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,
    pool_timeout=10,
)

# Clase base declarativa para que los modelos hereden de ella
Base = declarative_base()

# Configurar la fábrica de sesiones (SessionLocal)
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)


import contextvars
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

# ContextVar for storing the tenant_id during the request lifecycle
current_tenant_id_var = contextvars.ContextVar("current_tenant_id", default=None)

@event.listens_for(Session, "do_orm_execute")
def _add_tenant_filter(execute_state):
    # Only intercept SELECTs and simple statements (not relationships or column loads directly if not needed,
    # but with_loader_criteria automatically handles the depth)
    if execute_state.is_select or execute_state.is_update or execute_state.is_delete:
        tenant_id = current_tenant_id_var.get()
        if tenant_id:
            # Applies to any class mapped to Base that has the tenant_id attribute
            # We explicitly exclude Profile, Organization and other global tables from filtering here 
            # if we wanted to, but the lambda conditional check is safer:
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    Base,
                    lambda cls: cls.tenant_id == tenant_id if hasattr(cls, 'tenant_id') and cls.__name__ not in ('Profile', 'Organization') else True,
                    include_aliases=True,
                    track_closure_variables=False
                )
            )

from sqlalchemy.orm import Mapper
@event.listens_for(Mapper, "before_insert")
@event.listens_for(Mapper, "before_update")
def receive_before_insert_update(mapper, connection, target):
    if hasattr(target, 'tenant_id') and target.__class__.__name__ not in ('Profile', 'Organization'):
        # Only overwrite or set if it's currently None, or always enforce it?
        # Always enforce it to be secure, or just set if None.
        # Actually, let's enforce it securely to prevent tenant spoofing.
        tenant_id = current_tenant_id_var.get()
        if tenant_id:
            target.tenant_id = tenant_id

# Dependencia (Dependency) para obtener la sesión de la base de datos en los endpoints de FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
