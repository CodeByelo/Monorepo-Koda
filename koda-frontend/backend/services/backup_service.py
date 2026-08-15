"""
backend/services/backup_service.py
───────────────────────────────────
Respaldo automático (y manual) de la base de datos hacia Supabase Storage.

Punto de entrada único: `ejecutar_backup(...)`. Lo usan por igual:
  - El job programado en backend/core/scheduler.py (APScheduler, cada
    BACKUP_INTERVAL_HOURS horas).
  - El botón "Respaldar ahora" del panel de administración
    (backend/routers/admin_ext.py::ejecutar_respaldo).

FORMATO DEL RESPALDO
─────────────────────
Se intenta primero un dump nativo con `pg_dump` (formato SQL plano, el más
fácil de restaurar con `psql`). Si el binario `pg_dump` no está disponible en
el entorno de ejecución (por ejemplo, un runtime Python "puro" sin
postgresql-client instalado), se usa un fallback 100% Python: recorre TODAS
las tablas registradas en `Base.metadata` (en el orden seguro de foreign keys
que da `Base.metadata.sorted_tables`) y serializa cada fila a JSON.

El fallback JSON respalda TODA la base (todos los tenants), no solo el tenant
que dispara el respaldo manual. Se eligió así deliberadamente:
  1. Es un respaldo de recuperación ante desastres (disaster recovery), no
     una exportación de datos para el usuario final — su propósito es poder
     reconstruir la base completa si Supabase/Postgres se corrompe o se
     pierde, no producir un archivo "mío" por tenant.
  2. Varias tablas centrales (profiles, empresa/tenants, etc.) no llevan
     tenant_id; filtrar por tenant dejaría la reconstrucción de esas FKs
     compartidas incompleta o ambigua.
  3. El volumen de datos actual del cliente es pequeño; un dump completo es
     barato de generar, subir y almacenar.

Ver backend/scripts/restore_backup.py para el procedimiento de RESTAURACIÓN
completo (tanto para el formato .sql de pg_dump como para el fallback .json).
"""
import json
import logging
import os
import shutil
import subprocess
import tempfile
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

import requests
from sqlalchemy import select

from backend.core.database import Base, DATABASE_URL, SessionLocal, engine
from backend.models.erp_extended import AuditoriaLog

logger = logging.getLogger("koda_backend")

# ── Configuración (variables de entorno, sin secretos hardcodeados) ────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
# Bucket dedicado a respaldos. A diferencia de "productos", este bucket NO debe
# ser público (contiene datos financieros sensibles de todos los tenants). Debe
# crearse manualmente en Supabase Storage con "Public bucket" desactivado.
SUPABASE_STORAGE_BUCKET_BACKUPS = os.getenv("SUPABASE_STORAGE_BUCKET_BACKUPS", "backups")

BACKUP_INTERVAL_HOURS = int(os.getenv("BACKUP_INTERVAL_HOURS", "24"))
BACKUP_RETENTION_COUNT = int(os.getenv("BACKUP_RETENTION_COUNT", "14"))


class _DumpJSONEncoder(json.JSONEncoder):
    """Codificador JSON que sabe serializar los tipos que SQLAlchemy/Postgres
    devuelven y que `json` no soporta de forma nativa."""

    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, UUID):
            return str(o)
        if isinstance(o, (bytes, bytearray)):
            return o.hex()
        return super().default(o)


def _pg_dump_disponible() -> bool:
    """True solo si el binario pg_dump existe en PATH y la base activa es Postgres
    (no tiene sentido usar pg_dump contra el fallback SQLite local)."""
    return bool(shutil.which("pg_dump")) and bool(DATABASE_URL) and DATABASE_URL.startswith("postgresql")


def _generar_dump_pg_dump() -> tuple[bytes, str]:
    """Ejecuta pg_dump nativo (formato SQL plano, texto) contra DATABASE_URL."""
    fd, tmp_path = tempfile.mkstemp(suffix=".sql")
    os.close(fd)
    try:
        cmd = [
            "pg_dump",
            DATABASE_URL,
            "--no-owner",
            "--no-privileges",
            "--format=plain",
            "--file",
            tmp_path,
        ]
        resultado = subprocess.run(cmd, capture_output=True, timeout=600)
        if resultado.returncode != 0:
            stderr = resultado.stderr.decode(errors="ignore")[:2000]
            raise RuntimeError(f"pg_dump terminó con código {resultado.returncode}: {stderr}")
        with open(tmp_path, "rb") as f:
            contenido = f.read()
        if not contenido:
            raise RuntimeError("pg_dump generó un archivo vacío")
        return contenido, "sql"
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _generar_dump_json() -> tuple[bytes, str]:
    """Fallback Python-nativo: exporta todas las tablas registradas en
    Base.metadata a un único JSON estructurado como {tabla: [filas...]}."""
    db = SessionLocal()
    tablas: dict = {}
    total_filas = 0
    try:
        conn = db.connection()
        for tabla in Base.metadata.sorted_tables:
            try:
                result = conn.execute(select(tabla))
                columnas = result.keys()
                filas = [dict(zip(columnas, fila)) for fila in result.fetchall()]
                tablas[tabla.name] = filas
                total_filas += len(filas)
            except Exception as tabla_err:
                logger.warning("No se pudo respaldar la tabla '%s': %s", tabla.name, tabla_err)
                tablas[tabla.name] = {"__error__": str(tabla_err)}
    finally:
        db.close()

    payload = {
        "formato": "koda-json-dump-v1",
        "generado_en": datetime.now(timezone.utc).isoformat(),
        "motor_origen": engine.name,
        "total_filas": total_filas,
        # Orden seguro de FKs para restaurar tabla por tabla (ver restore_backup.py)
        "orden_restauracion": [t.name for t in Base.metadata.sorted_tables],
        "tablas": tablas,
    }
    contenido = json.dumps(payload, cls=_DumpJSONEncoder, ensure_ascii=False).encode("utf-8")
    return contenido, "json"


def _elegir_formato_y_generar() -> tuple[bytes, str]:
    """Prefiere pg_dump nativo; si no está disponible o falla, cae al fallback JSON."""
    if _pg_dump_disponible():
        try:
            return _generar_dump_pg_dump()
        except Exception as exc:
            logger.warning("pg_dump falló, usando fallback JSON nativo: %s", exc)
    return _generar_dump_json()


def _headers_supabase(content_type: str) -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": content_type,
    }


def _subir_a_supabase(contenido: bytes, nombre_archivo: str) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "No se puede subir el respaldo: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno."
        )
    content_type = "application/sql" if nombre_archivo.endswith(".sql") else "application/json"
    upload_url = (
        f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET_BACKUPS}/{nombre_archivo}"
    )
    headers = _headers_supabase(content_type)
    headers["x-upsert"] = "true"
    try:
        resp = requests.post(upload_url, headers=headers, data=contenido, timeout=120)
    except requests.RequestException as exc:
        raise RuntimeError(f"No se pudo contactar Supabase Storage: {exc}") from exc
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Error al subir el respaldo a Supabase Storage ({resp.status_code}): {resp.text[:500]}"
        )


def _listar_respaldos_supabase() -> list:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []
    list_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/list/{SUPABASE_STORAGE_BUCKET_BACKUPS}"
    headers = _headers_supabase("application/json")
    body = {"prefix": "", "limit": 1000, "sortBy": {"column": "name", "order": "desc"}}
    try:
        resp = requests.post(list_url, headers=headers, json=body, timeout=30)
    except requests.RequestException as exc:
        logger.warning("No se pudo listar respaldos en Supabase Storage: %s", exc)
        return []
    if resp.status_code != 200:
        logger.warning(
            "No se pudo listar respaldos en Supabase Storage (%s): %s", resp.status_code, resp.text[:300]
        )
        return []
    items = resp.json() or []
    return [it for it in items if isinstance(it, dict) and str(it.get("name", "")).startswith("backup-")]


def _aplicar_retencion() -> int:
    """Mantiene solo los BACKUP_RETENTION_COUNT respaldos más recientes en el bucket;
    borra el resto. El nombre `backup-YYYYMMDD-HHMMSS.ext` es ordenable lexicográficamente
    por fecha, así que un sort descendente por nombre es suficiente."""
    items = _listar_respaldos_supabase()
    if len(items) <= BACKUP_RETENTION_COUNT:
        return 0
    items_ordenados = sorted(items, key=lambda it: it.get("name", ""), reverse=True)
    a_borrar = [it["name"] for it in items_ordenados[BACKUP_RETENTION_COUNT:]]
    if not a_borrar:
        return 0
    delete_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET_BACKUPS}"
    headers = _headers_supabase("application/json")
    try:
        resp = requests.delete(delete_url, headers=headers, json={"prefixes": a_borrar}, timeout=30)
    except requests.RequestException as exc:
        logger.warning("No se pudieron borrar respaldos antiguos: %s", exc)
        return 0
    if resp.status_code not in (200, 201):
        logger.warning("No se pudieron borrar respaldos antiguos (%s): %s", resp.status_code, resp.text[:300])
        return 0
    return len(a_borrar)


def _formatear_tamano(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{round(num_bytes / (1024 * 1024), 2)} MB"
    return f"{round(num_bytes / 1024, 1)} KB"


def ejecutar_backup(origen: str = "scheduler", tenant_id=None, usuario: str = "system", ip: str | None = None) -> dict:
    """Genera un respaldo real, lo sube a Supabase Storage, aplica retención y
    deja constancia en AuditoriaLog. Usado tanto por el scheduler como por el
    endpoint manual POST /admin/respaldos/ejecutar."""
    ts = datetime.now(timezone.utc)
    nombre_base = f"backup-{ts.strftime('%Y%m%d-%H%M%S')}"
    resultado = {"ok": False, "origen": origen, "fecha": ts.isoformat()}

    db = SessionLocal()
    try:
        try:
            contenido, extension = _elegir_formato_y_generar()
        except Exception as gen_err:
            logger.error("Fallo generando el respaldo: %s", gen_err)
            db.add(
                AuditoriaLog(
                    tenant_id=tenant_id,
                    usuario=usuario,
                    accion="RESPALDO_ERROR",
                    modulo="SISTEMA",
                    detalle=f"Fallo al generar respaldo ({origen}): {gen_err}",
                    ip=ip,
                )
            )
            db.commit()
            resultado["error"] = str(gen_err)
            return resultado

        nombre_archivo = f"{nombre_base}.{extension}"
        try:
            _subir_a_supabase(contenido, nombre_archivo)
        except Exception as up_err:
            logger.error("Fallo subiendo el respaldo a Supabase Storage: %s", up_err)
            db.add(
                AuditoriaLog(
                    tenant_id=tenant_id,
                    usuario=usuario,
                    accion="RESPALDO_ERROR",
                    modulo="SISTEMA",
                    detalle=(
                        f"Respaldo generado ({extension}, {_formatear_tamano(len(contenido))}) "
                        f"pero falló la subida a Supabase Storage: {up_err}"
                    ),
                    ip=ip,
                )
            )
            db.commit()
            resultado["error"] = str(up_err)
            return resultado

        try:
            borrados = _aplicar_retencion()
        except Exception as ret_err:
            logger.warning("Fallo aplicando retención de respaldos: %s", ret_err)
            borrados = 0

        tamano_legible = _formatear_tamano(len(contenido))
        db.add(
            AuditoriaLog(
                tenant_id=tenant_id,
                usuario=usuario,
                accion="RESPALDO",
                modulo="SISTEMA",
                detalle=(
                    f"Respaldo {'automático' if origen == 'scheduler' else 'manual'} completado: "
                    f"{nombre_archivo} ({tamano_legible}, formato {extension}) subido al bucket "
                    f"privado '{SUPABASE_STORAGE_BUCKET_BACKUPS}' de Supabase Storage. "
                    f"Respaldos antiguos purgados por retención: {borrados}."
                ),
                ip=ip,
            )
        )
        db.commit()

        resultado.update(
            {
                "ok": True,
                "archivo": nombre_archivo,
                "formato": extension,
                "tamano_bytes": len(contenido),
                "tamano": tamano_legible,
                "bucket": SUPABASE_STORAGE_BUCKET_BACKUPS,
                "purgados": borrados,
            }
        )
        return resultado
    finally:
        db.close()


async def ejecutar_backup_programado() -> None:
    """Wrapper async para que APScheduler (AsyncIOScheduler) pueda invocar la
    función síncrona `ejecutar_backup` sin bloquear el loop de eventos."""
    import asyncio

    loop = asyncio.get_event_loop()
    resultado = await loop.run_in_executor(None, lambda: ejecutar_backup(origen="scheduler", usuario="scheduler"))
    if resultado.get("ok"):
        logger.info(
            "Respaldo automático completado: %s (%s, %s). Purgados: %s",
            resultado.get("archivo"),
            resultado.get("formato"),
            resultado.get("tamano"),
            resultado.get("purgados"),
        )
    else:
        logger.error("Respaldo automático FALLÓ: %s", resultado.get("error"))
