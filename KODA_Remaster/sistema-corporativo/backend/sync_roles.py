import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def sync_roles():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("Error: SUPABASE_DB_URL not found in .env")
        return

    try:
        conn = await asyncpg.connect(db_url, ssl=False, statement_cache_size=0)
        
        print("Sincronizando tabla de ROLES...")
        
        # Eliminar roles existentes que no coincidan con el esquema nuevo si es necesario
        # En este caso, simplemente actualizaremos los nombres de los IDs conocidos
        # y añadiremos los faltantes.
        
        role_mapping = {
            1: "CEO",
            2: "Administrador",
            3: "Usuario",
            4: "Desarrollador",
            5: "Gerente",
        }
        
        for r_id, r_name in role_mapping.items():
            # Intentar actualizar
            result = await conn.execute(
                "UPDATE roles SET nombre_rol = $1 WHERE id = $2", 
                r_name, r_id
            )
            if result == "UPDATE 0":
                # Si no existe, insertar
                await conn.execute(
                    "INSERT INTO roles (id, nombre_rol) VALUES ($1, $2)", 
                    r_id, r_name
                )
                print(f"Insertado: ID {r_id} -> {r_name}")
            else:
                print(f"Actualizado: ID {r_id} -> {r_name}")
        
        # Opcional: Eliminar roles sobrantes
        await conn.execute("DELETE FROM roles WHERE id > 5")
        
        print("\nVerificando cambios...")
        roles = await conn.fetch("SELECT * FROM roles ORDER BY id")
        for r in roles:
            print(f"ID: {r['id']} | Nombre: {r['nombre_rol']}")
            
        await conn.close()
        print("\n✅ Sincronización completada con éxito.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(sync_roles())
