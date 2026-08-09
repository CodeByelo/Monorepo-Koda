import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env
# Forzamos que se cargue explícitamente y sobreescriba en caso de dudas
load_dotenv(override=True)

# Obtener la URL de la base de datos de las variables de entorno (Obligatorio)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = False
if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
    is_sqlite = True
    DATABASE_URL = "sqlite:////app/backend/erp_bimonetario.db" if os.path.exists("/app/backend/erp_bimonetario.db") else "sqlite:///erp_bimonetario.db"
else:
    try:
        test_engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 3})
        with test_engine.connect():
            pass
        test_engine.dispose()
    except Exception as db_err:
        print(f"\033[93m[DB WARNING] No se pudo conectar a Supabase ({db_err}). Activando base de datos local SQLite de respaldo.\033[0m")
        is_sqlite = True
        DATABASE_URL = "sqlite:////app/backend/erp_bimonetario.db" if os.path.exists("/app/backend/erp_bimonetario.db") else "sqlite:///erp_bimonetario.db"

# Clase base declarativa para que los modelos hereden de ella
Base = declarative_base()

if is_sqlite:
    print(f"\033[92m[DB INFO] Motor SQL activo: SQLite ({DATABASE_URL})\033[0m")
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    from sqlalchemy import event
    @event.listens_for(Base.metadata, "before_create")
    def _strip_schema_for_sqlite(target, connection, **kw):
        for table in target.tables.values():
            table.schema = None

    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def _strip_public_schema_sqlite(conn, cursor, statement, parameters, context, execmany):
        if "public." in statement:
            statement = statement.replace("public.", "")
        return statement, parameters
else:
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
