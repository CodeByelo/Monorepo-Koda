"""
backend/scripts/restore_backup.py
──────────────────────────────────
Procedimiento de RESTAURACIÓN manual para los respaldos generados por
backend/services/backup_service.py y subidos al bucket privado "backups" de
Supabase Storage.

PASO 0 — Descargar el respaldo
    El bucket "backups" NO es público (a diferencia de "productos"). Para
    descargar un archivo:
      - Desde el Dashboard de Supabase: Storage → backups → seleccionar
        backup-YYYYMMDD-HHMMSS.{sql,json} → Download (requiere estar
        autenticado como owner/miembro del proyecto).
      - O con la service_role key vía API:
          curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
               -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
               "$SUPABASE_URL/storage/v1/object/backups/backup-20260813-030000.json" \
               -o backup-20260813-030000.json

CASO A — El archivo es .sql (pg_dump nativo estaba disponible al respaldar)
    Restaurar es un solo comando de psql contra la base destino (debe estar
    vacía/nueva; pg_dump plano no borra tablas existentes):

        psql "$DATABASE_URL" < backup-20260813-030000.sql

    ADVERTENCIA: probar primero contra una base de staging/vacía. No ejecutar
    directamente sobre producción sin revisar el contenido del .sql.

CASO B — El archivo es .json (fallback nativo Python, sin pg_dump disponible)
    Usar este mismo script:

        python -m backend.scripts.restore_backup /ruta/backup-....json \
            --database-url postgresql://usuario:password@host:5432/nombre_db

    Si no se pasa --database-url, se usa la variable de entorno DATABASE_URL.
    Usar --dry-run primero para ver cuántas filas se restaurarían por tabla
    sin escribir nada:

        python -m backend.scripts.restore_backup backup-....json --dry-run

NOTAS IMPORTANTES DEL RESTORE JSON
    - Las tablas se restauran en el orden guardado en la clave
      "orden_restauracion" del propio dump (es el orden seguro de foreign
      keys que da SQLAlchemy — Base.metadata.sorted_tables), así que las
      tablas padre siempre se insertan antes que las que dependen de ellas.
    - Se usa INSERT ... ON CONFLICT DO NOTHING (Postgres): si una fila con la
      misma clave primaria ya existe en destino, se omite en vez de fallar.
      Esto está pensado para restaurar sobre una base NUEVA/VACÍA (disaster
      recovery), no para hacer un merge fino de datos con una base que ya
      tiene datos parciales.
    - Si el schema de los modelos cambió después de generado el dump (nuevas
      columnas NOT NULL sin default, tablas renombradas, etc.), el restore
      puede fallar en tablas puntuales; revisar el mensaje de error por tabla
      e intervenir manualmente si hace falta.
    - Se recomienda probar este restore contra un staging al menos una vez
      cada tanto, para confirmar que sigue siendo compatible con el schema
      vigente (un respaldo que nadie ha intentado restaurar nunca es un
      respaldo no verificado).
"""
import argparse
import json
import os
import sys


def restaurar(json_path: str, database_url: str, dry_run: bool = False) -> None:
    from sqlalchemy import MetaData, create_engine
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    with open(json_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    tablas = payload.get("tablas", {})
    orden = payload.get("orden_restauracion") or list(tablas.keys())

    print(f"Respaldo generado en: {payload.get('generado_en', 'desconocido')}")
    print(f"Motor de origen: {payload.get('motor_origen', 'desconocido')}")
    print(f"Total de filas en el dump: {payload.get('total_filas', 'desconocido')}")

    engine = create_engine(database_url)
    metadata = MetaData()
    metadata.reflect(bind=engine)

    with engine.begin() as conn:
        for nombre_tabla in orden:
            filas = tablas.get(nombre_tabla)
            if not filas or isinstance(filas, dict):
                # dict == {"__error__": "..."} -> esa tabla falló al respaldarse, se omite
                continue
            if nombre_tabla not in metadata.tables:
                print(f"[SKIP] Tabla '{nombre_tabla}' no existe en la base destino, se omite.")
                continue
            tabla = metadata.tables[nombre_tabla]
            accion = "DRY-RUN" if dry_run else "RESTORE"
            print(f"[{accion}] {nombre_tabla}: {len(filas)} filas")
            if dry_run:
                continue
            insertadas = 0
            for fila in filas:
                try:
                    stmt = pg_insert(tabla).values(**fila).on_conflict_do_nothing()
                    conn.execute(stmt)
                    insertadas += 1
                except Exception as fila_err:
                    print(f"  [ERROR fila en '{nombre_tabla}']: {fila_err}")
            print(f"  -> {insertadas}/{len(filas)} filas insertadas (conflictos omitidos)")

    print("Restauración completada." if not dry_run else "Dry-run completado, no se escribió nada.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Restaura un respaldo .json de Koda ERP (fallback nativo Python) en una base Postgres destino."
    )
    parser.add_argument("archivo_json", help="Ruta al archivo backup-*.json descargado de Supabase Storage")
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="URL de conexión Postgres destino (por defecto: variable de entorno DATABASE_URL)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar conteos por tabla, no insertar nada")
    args = parser.parse_args()

    if not args.database_url:
        print("ERROR: debes indicar --database-url o definir DATABASE_URL en el entorno.", file=sys.stderr)
        sys.exit(1)

    restaurar(args.archivo_json, args.database_url, dry_run=args.dry_run)
