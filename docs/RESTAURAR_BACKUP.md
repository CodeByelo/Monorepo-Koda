# Guía de Restauración de Backups de Base de Datos (PostgreSQL / Supabase)

Este documento detalla el procedimiento paso a paso para descargar, descomprimir y restaurar un backup generado automáticamente por el workflow nocturno de GitHub Actions (`.github/workflows/backup-nocturno.yml`).

---

> [!CAUTION]
> **ADVERTENCIA CRÍTICA: RESTAURACIÓN DESTRUCTIVA**
> Ejecutar una restauración con `pg_restore` (especialmente con banderas como `--clean`) sobre una base de datos existente **SOBREESCRIBE Y ELIMINA** los datos actuales. 
> - **NUNCA** restaures directamente sobre la base de producción a menos que se trate de un desastre total comprobado.
> - Se recomienda enfáticamente restaurar primero sobre un proyecto de Supabase nuevo o vacío para verificar la integridad del backup.

---

## 1. Descargar el Artifact desde GitHub Actions

1. Ve al repositorio en GitHub: `https://github.com/CodeByelo/Monorepo-Koda`.
2. Haz clic en la pestaña **Actions** en el menú superior.
3. En la barra lateral izquierda, selecciona el workflow **"Backup Nocturno de Base de Datos"**.
4. Haz clic en la ejecución correspondiente a la fecha y hora que deseas restaurar (aparecerá con un check verde ✓).
5. En la parte inferior de la página de la ejecución, en la sección **Artifacts**, haz clic sobre **`backup-koda-db`** para descargarlo.
   
> [!WARNING]
> **Ventana de Retención (30 días)**:
> Los artifacts de GitHub Actions tienen un tiempo de vida configurado de **30 días**. Transcurrido este período, GitHub elimina automáticamente el archivo y no podrá recuperarse desde la interfaz.

---

## 2. Descomprimir el Archivo

El artifact descargado de GitHub es un archivo ZIP que contiene el dump comprimido con gzip (`backup_YYYY-MM-DD_HHMM.dump.gz`).

### En Linux / macOS / WSL:
```bash
# 1. Descomprimir el ZIP descargado
unzip backup-koda-db.zip

# 2. Descomprimir el archivo .dump.gz
gunzip backup_*.dump.gz
```

Esto dejará el archivo binario nativo de PostgreSQL: `backup_YYYY-MM-DD_HHMM.dump`.

### En Windows (PowerShell):
```powershell
# 1. Extraer el ZIP
Expand-Archive -Path backup-koda-db.zip -DestinationPath ./backup_restauracion

# 2. Descomprimir con gzip (o usar 7-Zip si está instalado)
cd backup_restauracion
tar -xzf backup_*.dump.gz
```

---

## 3. Comando de Restauración (`pg_restore`)

El backup se genera en formato personalizado de PostgreSQL (`--format=custom`). Este formato es binario, optimizado y requiere la herramienta `pg_restore` (no `psql`).

### Comando Recomendado para Restaurar:

```bash
pg_restore \
  --dbname="TU_DATABASE_URL_DESTINO" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --verbose \
  backup_YYYY-MM-DD_HHMM.dump
```

### Explicación de los Parámetros:
- `--dbname="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DB]"`: Cadena de conexión a la base de datos destino.
- `--no-owner`: Evita intentar asignar propietarios de objetos que podrían no coincidir en la nueva instancia.
- `--no-privileges`: Omite la restauración de privilegios de acceso para prevenir fallos por roles faltantes.
- `--clean`: Borra las tablas y esquemas antes de recrearlos. *(¡Atención! Destructivo).*
- `--if-exists`: Añade la cláusula `IF EXISTS` al ejecutar los `DROP` para evitar errores si las tablas aún no existen.
- `--verbose`: Muestra el progreso detallado de la restauración en consola.

---

## 4. Validación Preventiva (Prueba de Restauración)

> [!TIP]
> **Regla de Oro**: Un backup que nunca se ha probado restaurar **no es un backup confiable**.

Recomendamos realizar un simulacro periódico:
1. Crea un proyecto gratuito temporal en [Supabase](https://supabase.com).
2. Obtén la cadena de conexión URI del nuevo proyecto (Settings → Database → Connection string → URI).
3. Ejecuta el comando `pg_restore` contra esa base vacía.
4. Verifica que las tablas críticas (`profiles`, `organizations`, `productos`, `ventas`, etc.) tengan los registros esperados.
5. Elimina el proyecto temporal una vez validado.
