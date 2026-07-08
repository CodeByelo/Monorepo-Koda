import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    print("ERROR: DATABASE_URL no encontrada en el archivo .env")
    exit(1)

# Asegurar options=-csearch_path=public
if "?" in DATABASE_URL:
    if "options=-csearch_path=" not in DATABASE_URL:
        DATABASE_URL = f"{DATABASE_URL}&options=-csearch_path=public"
else:
    DATABASE_URL = f"{DATABASE_URL}?options=-csearch_path=public"

print(f"Intentando conectar a: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'Base de datos'}")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        print("Conectado con éxito!")
        
        # Obtener el usuario actual
        user_res = conn.execute(text("SELECT current_user;")).fetchone()
        current_user = user_res[0] if user_res else "desconocido"
        print(f"Usuario actual en la conexión: {current_user}")
        
        # Ejecutar GRANT para postgres y para el usuario actual si son distintos
        for user in ["postgres", current_user]:
            try:
                # Si el usuario tiene caracteres especiales como un punto, lo ponemos entre comillas dobles
                sql_user = f'"{user}"' if "." in user or "-" in user else user
                grant_sql = f"GRANT ALL ON ALL TABLES IN SCHEMA public TO {sql_user};"
                print(f"Ejecutando: {grant_sql}")
                conn.execute(text(grant_sql))
                
                # También dar permisos sobre secuencias y esquemas por si acaso
                conn.execute(text(f"GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO {sql_user};"))
                conn.execute(text(f"GRANT USAGE, CREATE ON SCHEMA public TO {sql_user};"))
                
                conn.commit()
                print(f"Permisos otorgados con éxito a {user}")
            except Exception as e:
                print(f"Error al otorgar permisos a {user}: {e}")
                
        # Verificar si la tabla cuentas_bancarias es visible y accesible
        print("\nVerificando si la tabla 'cuentas_bancarias' es accesible...")
        try:
            res = conn.execute(text("SELECT COUNT(*) FROM public.cuentas_bancarias;")).fetchone()
            print(f"¡Éxito! cuentas_bancarias tiene {res[0]} registros.")
        except Exception as e:
            print(f"Error al consultar public.cuentas_bancarias: {e}")

        try:
            res2 = conn.execute(text("SELECT COUNT(*) FROM cuentas_bancarias;")).fetchone()
            print(f"¡Éxito! cuentas_bancarias (sin prefijo de esquema) tiene {res2[0]} registros.")
        except Exception as e:
            print(f"Error al consultar cuentas_bancarias sin prefijo: {e}")

except Exception as err:
    print(f"Error crítico en la conexión o ejecución: {err}")
