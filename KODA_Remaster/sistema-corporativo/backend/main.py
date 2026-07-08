import os
import sys
import logging
import ipaddress
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from pathlib import Path

# Cargar .env explícitamente desde la carpeta backend
env_path = Path(__file__).parent / ".env"
print(f"\n🔍 Buscando .env en: {env_path}")
print(f"📁 Existe: {env_path.exists()}\n")

load_dotenv(dotenv_path=env_path)
print("DATABASE_URL cargada: " + (os.getenv("SUPABASE_DB_URL") or "Vacio/None"))
DEV_ROLE_MASTER_PASSWORD = os.getenv("DEV_ROLE_MASTER_PASSWORD", "")

from fastapi import FastAPI, Depends, HTTPException, Request, Query, UploadFile, File as FastAPIFile, Form
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import jwt
import traceback

# Asegurar que el directorio backend esté en el PYTHONPATH
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


# AHORA sí importar módulos que dependen de variables de entorno
from database.async_db import get_db_connection, init_db_pool
import database.async_db as async_db
from middleware.tenant import get_tenant_context, trace_id_var
from services.rate_limiter import rate_limiter_middleware
from database.supabase_client import get_supabase_admin_client


def _extract_client_ip(request: Request) -> Optional[str]:
    """
    Obtiene IP real del cliente considerando proxies (Render/Vercel/Cloudflare).
    Prioridad:
    - CF-Connecting-IP
    - X-Real-IP
    - X-Forwarded-For (primer valor no vacio)
    - request.client.host
    """
    candidates = [
        request.headers.get("cf-connecting-ip"),
        request.headers.get("x-real-ip"),
    ]

    xff = request.headers.get("x-forwarded-for")
    if xff:
        candidates.extend([part.strip() for part in xff.split(",") if part.strip()])

    if request.client and request.client.host:
        candidates.append(request.client.host)

    for raw in candidates:
        if not raw:
            continue
        ip = raw
        if ":" in ip and "." not in ip:
            ip = ip.split("%")[0]
        try:
            ipaddress.ip_address(ip)
            return ip
        except ValueError:
            continue
    return None
from src import schemas
from routers import auth_router, users_router, gerencias_router, billing_router, developer_router, ledger_router, analytics_router, facturacion_router, nomina_router, telegram_router
from routers.ledger_router import event_buffer, KodaEventInternal, AggregateType, EventSeverity
from auth.supabase_auth import get_current_user
from utils.idempotency import require_idempotency
from pydantic import BaseModel

import json
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"
DEFAULT_JWT_SECRET = "tu_clave_secreta_muy_segura_cambiala_en_produccion"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10MB por archivo
MAX_UPLOAD_FILES = int(os.getenv("MAX_UPLOAD_FILES", "5"))
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "documentos")


def validate_magic_bytes(file_bytes: bytes, filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return file_bytes.startswith(b"%PDF")
    elif ext in (".xlsx", ".docx"):
        return file_bytes.startswith(b"PK\x03\x04")
    elif ext in (".xls", ".doc"):
        return file_bytes.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    elif ext == ".png":
        return file_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext in (".jpg", ".jpeg"):
        return file_bytes.startswith(b"\xff\xd8\xff")
    elif ext == ".webp":
        return len(file_bytes) >= 12 and file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP"
    return False


def _safe_json_dumps(payload: dict) -> str:
    try:
        return json.dumps(payload, ensure_ascii=False, default=str)
    except Exception:
        return json.dumps({"raw": str(payload)}, ensure_ascii=False)


async def _resolve_user_context(conn, user_id: Optional[str]):
    if not user_id:
        return None, None, None
    try:
        row = await conn.fetchrow(
            "SELECT username, gerencia_id, tenant_id FROM profiles WHERE id = $1::uuid",
            user_id,
        )
        if not row:
            return None, None, None
        return row.get("username"), row.get("gerencia_id"), row.get("tenant_id")
    except Exception:
        return None, None, None


async def _log_security_event(
    conn,
    *,
    tenant_id: Optional[str],
    user_id: Optional[str],
    username: Optional[str],
    evento: str,
    detalles: Optional[str] = None,
    estado: str = "info",
    page: Optional[str] = None,
    ip_origen: Optional[str] = None,
    gerencia_id: Optional[int] = None,
) -> None:
    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen, gerencia_id, event_type)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            tenant_id,
            user_id,
            username or "anon",
            evento,
            detalles,
            estado,
            page,
            ip_origen,
            gerencia_id,
            evento,
        )
    except Exception:
        pass

# ===================================================================
# CONFIGURACIÓN DE LOGGING ESTRUCTURADO JSON ENTERPRISE
# ===================================================================
from middleware.context import (
    get_current_tenant_id,
    get_current_user_id,
    get_current_trace_id,
    tenant_id_var,
    user_id_var,
    extract_user_from_token,
)
import time
import uuid

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "tenant_id": get_current_tenant_id(),
            "user_id": get_current_user_id(),
            "trace_id": get_current_trace_id(),
        }
        if hasattr(record, 'duration_ms'):
            log_entry["duration_ms"] = record.duration_ms

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

logger = logging.getLogger("sistema_corporativo")
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False

app = FastAPI(
    title="Sistema Corporativo API - MultiTenant Edition",
    description="API Enterprise con aislamiento RLS y escalado multi-tenant",
    version="2.0.0"
)

@app.middleware("http")
async def add_observability_context(request: Request, call_next):
    start_time = time.time()
    trace_id = str(uuid.uuid4())
    token = trace_id_var.set(trace_id)
    user_token = None
    tenant_token = None

    try:
        request_user_id, request_tenant_id, _ = await extract_user_from_token(request)
        if request_user_id:
            user_token = user_id_var.set(request_user_id)
        if request_tenant_id:
            tenant_token = tenant_id_var.set(request_tenant_id)

        await rate_limiter_middleware(request)
        response = await call_next(request)
        duration_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"HTTP {request.method} {request.url.path} - {response.status_code}",
            extra={"duration_ms": duration_ms}
        )
        return response
    finally:
        if tenant_token is not None:
            tenant_id_var.reset(tenant_token)
        if user_token is not None:
            user_id_var.reset(user_token)
        trace_id_var.reset(token)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'self';"
    )
    if os.getenv("NODE_ENV", "").lower() == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

# ===================================================================
# CONFIGURACIÓN DE SEGURIDAD
# ===================================================================
from auth.security import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_refresh_token, verify_totp, generate_totp_secret, revoke_refresh_token

# ===================================================================
# MIDDLEWARES
# ===================================================================
# Configurar CORS para permitir localhost:3000 y otros orígenes comunes
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://10.0.2.15:3000",
    "http://10.0.2.15:8000",
    "https://koda-remaster.vercel.app",
    "https://sistema-corpoelect-backend.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://(koda-remaster|sistema-corpoelect)(-[a-zA-Z0-9-]+)?\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro centralizado de accesos (historiales de accesos).
@app.middleware("http")
async def audit_access_middleware(request: Request, call_next):
    response = await call_next(request)
    try:
        path = request.url.path
        if request.method == "OPTIONS" or request.method == "GET":
            return response
        if path.startswith("/health") or path.startswith("/db-check"):
            return response
        if path.startswith("/uploads"):
            return response
        if path.startswith("/security/logs"):
            return response

        auth_header = request.headers.get("Authorization")
        if not auth_header:
            session_cookie = request.cookies.get("session")
            if session_cookie:
                auth_header = f"Bearer {session_cookie}"
        if not auth_header or not auth_header.startswith("Bearer "):
            return response

        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET), algorithms=["HS256"])
        except Exception:
            return response

        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        username = payload.get("username") or payload.get("user") or payload.get("email")
        gerencia_id = payload.get("gerencia_id")
        ip = _extract_client_ip(request)

        if async_db.pool is None:
            try:
                await async_db.init_db_pool()
            except Exception:
                pass
            if async_db.pool is None:
                return response

        async with async_db.pool.acquire() as conn:
            if not username or gerencia_id is None or tenant_id is None:
                fetched_username, fetched_gerencia_id, fetched_tenant_id = await _resolve_user_context(conn, user_id)
                if not username:
                    username = fetched_username
                if gerencia_id is None:
                    gerencia_id = fetched_gerencia_id
                if tenant_id is None:
                    tenant_id = fetched_tenant_id
            if not username and user_id:
                username = f"user:{user_id}"

            detalles = _safe_json_dumps({
                "action": "ACCESS",
                "method": request.method,
                "path": path,
                "query": request.url.query,
                "status_code": response.status_code,
                "gerencia_id": gerencia_id,
            })
            await _log_security_event(
                conn,
                tenant_id=str(tenant_id) if tenant_id else None,
                user_id=str(user_id) if user_id else None,
                username=username,
                evento="ACCESS",
                detalles=detalles,
                estado="info" if response.status_code < 400 else "warning",
                page=path,
                ip_origen=ip,
                gerencia_id=int(gerencia_id) if gerencia_id is not None else None,
            )
    except Exception:
        pass
    return response

# Servir archivos estáticos para adjuntos
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# INCLUSIÓN DE ROUTERS
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(gerencias_router.router)
app.include_router(billing_router.router)
app.include_router(developer_router.router)
app.include_router(ledger_router.router)
app.include_router(ledger_router.auditoria_router)
app.include_router(analytics_router.router)
app.include_router(facturacion_router.router)
app.include_router(nomina_router.router)
app.include_router(telegram_router.router)

# Tasa BCV
from routers import rates_router
app.include_router(rates_router.router)

print("\n📋 RUTAS REGISTRADAS EN FASTAPI:")
for route in app.routes:
    if hasattr(route, 'methods'):
        print(f"  {list(route.methods)} {route.path}")
print()

@app.on_event("startup")
async def startup():
    jwt_secret = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
    if (not jwt_secret) or (jwt_secret == DEFAULT_JWT_SECRET) or (len(jwt_secret) < 32):
        raise RuntimeError("JWT_SECRET inseguro o no configurado correctamente (minimo 32 caracteres y no default)")
    if (not DEV_ROLE_MASTER_PASSWORD) or (DEV_ROLE_MASTER_PASSWORD == "JJDKoda**") or (len(DEV_ROLE_MASTER_PASSWORD) < 12):
        raise RuntimeError("DEV_ROLE_MASTER_PASSWORD inseguro o no configurado (minimo 12 caracteres y no default)")

    await init_db_pool()
    try:
        if async_db.pool is None:
            raise RuntimeError("DB pool no inicializado en startup")
        async with async_db.pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS bot_knowledge (
                    id BIGSERIAL PRIMARY KEY,
                    question TEXT NOT NULL UNIQUE,
                    answer TEXT NOT NULL,
                    updated_by TEXT,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            try:
                await conn.execute("ALTER TABLE bot_knowledge ADD COLUMN IF NOT EXISTS embedding vector(768)")
            except Exception:
                pass
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS security_events (
                    id BIGSERIAL PRIMARY KEY,
                    tenant_id UUID,
                    user_id UUID,
                    username TEXT,
                    evento TEXT NOT NULL,
                    detalles TEXT,
                    estado TEXT DEFAULT 'info',
                    page TEXT,
                    ip_origen TEXT,
                    gerencia_id INTEGER,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS login_lockouts (
                    username TEXT PRIMARY KEY,
                    failed_count INT NOT NULL DEFAULT 0,
                    locked_until TIMESTAMPTZ
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS dashboard_announcement (
                    id INT PRIMARY KEY DEFAULT 1,
                    badge TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    urgency TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#dc2626',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT dashboard_announcement_singleton CHECK (id = 1)
                )
            """)

            # ── Tablas de roles / perfiles / gerencias / organizaciones ──
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS roles (
                    id SERIAL PRIMARY KEY,
                    nombre_rol TEXT NOT NULL UNIQUE
                )
            """)
            await conn.execute("""
                INSERT INTO roles (id, nombre_rol) VALUES
                    (1, 'CEO'), (2, 'Administrador'), (3, 'Usuario'),
                    (4, 'Desarrollador'), (5, 'Gerente')
                ON CONFLICT (id) DO UPDATE SET nombre_rol = EXCLUDED.nombre_rol
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS organizations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    nombre TEXT,
                    config JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            org_count = await conn.fetchval("SELECT COUNT(*) FROM organizations")
            if org_count == 0:
                await conn.execute("""
                    INSERT INTO organizations (nombre) VALUES ('Organización Principal')
                """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS gerencias (
                    id SERIAL PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    siglas TEXT,
                    categoria TEXT,
                    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
                    CONSTRAINT gerencias_nombre_tenant_unique UNIQUE (nombre, tenant_id)
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS provisioning_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    token_hash VARCHAR(255) NOT NULL,
                    max_users INT NOT NULL,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    is_used BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS profiles (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    username TEXT NOT NULL UNIQUE,
                    nombre TEXT,
                    apellido TEXT,
                    email TEXT,
                    password_hash TEXT,
                    rol_id INTEGER REFERENCES roles(id) DEFAULT 3,
                    gerencia_id INTEGER REFERENCES gerencias(id),
                    estado BOOLEAN DEFAULT TRUE,
                    tenant_id UUID,
                    permisos JSONB DEFAULT '[]'::jsonb,
                    ultima_conexion TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_organizations (
                    user_id UUID NOT NULL,
                    organization_id UUID NOT NULL,
                    role TEXT DEFAULT 'member',
                    PRIMARY KEY (user_id, organization_id)
                )
            """)

            # ── Tablas de documentos ──
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS documentos (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    titulo TEXT,
                    title TEXT,
                    correlativo TEXT,
                    tipo_documento TEXT DEFAULT 'Informe',
                    estado TEXT DEFAULT 'pendiente',
                    prioridad TEXT DEFAULT 'media',
                    remitente_id UUID,
                    receptor_id UUID,
                    receptor_gerencia_id INTEGER,
                    url_archivo TEXT,
                    contenido TEXT,
                    leido BOOLEAN DEFAULT FALSE,
                    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
                    fecha_caducidad TIMESTAMPTZ,
                    fecha_ultima_actividad TIMESTAMPTZ DEFAULT NOW(),
                    tenant_id UUID,
                    user_id UUID
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS documento_adjuntos (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
                    url_archivo TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # ── Tabla de tickets ──
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS tickets (
                    id BIGSERIAL PRIMARY KEY,
                    titulo TEXT NOT NULL,
                    descripcion TEXT,
                    area TEXT,
                    prioridad TEXT DEFAULT 'MEDIA',
                    estado TEXT DEFAULT 'abierto',
                    solicitante_id UUID,
                    tecnico_id UUID,
                    observaciones TEXT,
                    solicitante_nombre_cache TEXT,
                    solicitante_gerencia_cache TEXT,
                    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # ── Tabla de hojas de ruta ──
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS hojas_de_ruta (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    asunto TEXT NOT NULL,
                    fecha_limite TIMESTAMPTZ NOT NULL,
                    acciones TEXT[] DEFAULT '{}',
                    coordinaciones TEXT[] DEFAULT '{}',
                    remitente_id UUID NOT NULL,
                    remitente_nombre TEXT,
                    destinatario_id UUID,
                    destinatario_nombre TEXT,
                    tenant_id UUID,
                    estado TEXT DEFAULT 'pendiente',
                    completado_at TIMESTAMPTZ,
                    observaciones_resolucion TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            # Migration: add coordinaciones and status columns if they don't exist yet
            try:
                await conn.execute(
                    "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS coordinaciones TEXT[] DEFAULT '{}'"
                )
                await conn.execute(
                    "ALTER TABLE hojas_de_ruta ALTER COLUMN destinatario_id DROP NOT NULL"
                )
                await conn.execute(
                    "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente'"
                )
                await conn.execute(
                    "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS completado_at TIMESTAMPTZ"
                )
                await conn.execute(
                    "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS observaciones_resolucion TEXT"
                )
            except Exception:
                pass

            # Garantizar columnas de MFA
            try:
                await conn.execute("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret TEXT")
                await conn.execute("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE")
            except Exception as mfa_col_err:
                logger.warning(f"No se pudieron crear columnas de MFA: {mfa_col_err}")

            # Aplicar migración de endurecimiento RLS 004
            try:
                migration_path = Path(__file__).parent / "database" / "migrations" / "004_rls_hardening.sql"
                if migration_path.exists():
                    sql = migration_path.read_text(encoding="utf-8")
                    await conn.execute(sql)
                    logger.info("✅ Migración RLS 004 aplicada con éxito.")
                else:
                    logger.warning("⚠️ No se encontró la migración 004_rls_hardening.sql.")
            except Exception as rls_err:
                logger.error(f"❌ Error al aplicar migración RLS 004: {rls_err}")

            # Aplicar migración de Telegram Bot 011
            try:
                telegram_migration_path = Path(__file__).parent / "database" / "migrations" / "011_telegram_bot_schema.sql"
                if telegram_migration_path.exists():
                    sql = telegram_migration_path.read_text(encoding="utf-8")
                    await conn.execute(sql)
                    logger.info("✅ Migración RLS 011 aplicada con éxito.")
                else:
                    logger.warning("⚠️ No se encontró la migración 011_telegram_bot_schema.sql.")
            except Exception as telegram_err:
                logger.error(f"❌ Error al aplicar migración RLS 011: {telegram_err}")

    except Exception as exc:
        logger.warning(f"No se pudo garantizar tablas base en startup: {exc}")
    logger.info("Database Connection Pool Initialized")

    # ── Tabla de tasas BCV (conexión propia, inmune a fallos de migraciones anteriores) ──
    try:
        async with async_db.pool.acquire() as bcv_conn:
            await bcv_conn.execute("""
                CREATE TABLE IF NOT EXISTS bcv_rates (
                    id          SERIAL PRIMARY KEY,
                    currency    TEXT NOT NULL UNIQUE,
                    rate        NUMERIC(18, 6) NOT NULL,
                    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    source      TEXT DEFAULT 'pyBCV'
                )
            """)
        logger.info("✅ Tabla bcv_rates verificada/creada.")
    except Exception as bcv_table_err:
        logger.error(f"❌ Error al crear tabla bcv_rates: {bcv_table_err}")

    # ── Iniciar el nuevo APScheduler (sincronización automática tasas_bcv) ──
    try:
        import asyncio
        from core.scheduler import scheduler
        from services.bcv_service import fetch_and_save_bcv_rates

        scheduler.start()
        app.state.bcv_scheduler = scheduler
        logger.info("✅ APScheduler iniciado. Automatización de tasas programada (Lun-Vie 8:00 AM y 1:00 PM VET).")

        async def check_and_sync_startup():
            try:
                # Comprobar si hay tasas registradas para hoy en tasas_bcv
                async with async_db.pool.acquire() as conn:
                    from datetime import datetime, timezone, timedelta
                    vet_tz = timezone(timedelta(hours=-4))
                    today_vet = datetime.now(vet_tz).date()

                    count = await conn.fetchval(
                        "SELECT COUNT(*) FROM tasas_bcv WHERE fecha_valor = $1",
                        today_vet
                    )
                    if count == 0:
                        logger.info(f"🔄 Sincronización inicial del arranque: No hay tasas para hoy ({today_vet}). Ejecutando extracción...")
                        await fetch_and_save_bcv_rates()
                    else:
                        logger.info(f"ℹ️ Sincronización inicial omitida: Ya existen {count} tasas registradas para hoy ({today_vet}).")
            except Exception as startup_sync_err:
                logger.error(f"❌ Error durante la verificación/extracción inicial de tasas BCV: {startup_sync_err}")

        # Ejecutar en segundo plano de forma no bloqueante
        asyncio.create_task(check_and_sync_startup())

    except Exception as sched_err:
        logger.error(f"❌ No se pudo iniciar el scheduler BCV: {sched_err}")
        app.state.bcv_scheduler = None

    # Iniciar buffer de eventos de telemetría
    try:
        await event_buffer.start()
        logger.info("✅ EventBuffer de telemetría iniciado.")
    except Exception as buffer_err:
        logger.error(f"❌ No se pudo iniciar el EventBuffer: {buffer_err}")

# ===================================================================
# SHUTDOWN — Apagar el scheduler BCV limpiamente
# ===================================================================

@app.on_event("shutdown")
async def shutdown():
    scheduler = getattr(app.state, "bcv_scheduler", None)
    if scheduler is not None:
        try:
            scheduler.shutdown(wait=False)
            logger.info("⏹️ APScheduler BCV detenido correctamente.")
        except Exception as stop_err:
            logger.warning(f"⚠️ Error al detener el APScheduler BCV: {stop_err}")

    # Detener y descargar el buffer de eventos de telemetría
    try:
        await event_buffer.stop()
        logger.info("⏹️ EventBuffer de telemetría detenido y descargado.")
    except Exception as buffer_err:
        logger.error(f"⚠️ Error al detener el EventBuffer: {buffer_err}")

# ===================================================================
# UTILIDADES
# ===================================================================
# Security utilities imported from auth.security

# ===================================================================
# GLOBAL EXCEPTION HANDLER
# ===================================================================
from fastapi.responses import JSONResponse

def _apply_cors_headers(request: Request, response: JSONResponse) -> JSONResponse:
    origin = request.headers.get("origin")
    allow_origin = False
    if origin:
        if origin in origins or "*" in origins:
            allow_origin = True
        else:
            try:
                if re.match(r"^https://(koda-remaster|sistema-corpoelect)(-[a-zA-Z0-9-]+)?\.vercel\.app$", origin):
                    allow_origin = True
            except re.error:
                allow_origin = False

    if allow_origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Si la excepción es una HTTPException (ej. 429 del rate limiter, 401, 403, etc.)
    # la dejamos pasar al handler específico de HTTPException para que retorne
    # la respuesta correcta y NO la enmascaremos como un 500.
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)

    ref_code = str(uuid.uuid4())[:8]
    error_trace = traceback.format_exc()
    # Print explícito para asegurar que se ve en la terminal
    print(f"\n❌ CRITICAL GLOBAL ERROR [Ref: {ref_code}]: {str(exc)}\n{error_trace}\n")
    logger.error(f"GLOBAL ERROR [Ref: {ref_code}]: {str(exc)}\n{error_trace}")

    response_content = {
        "detail": f"Error interno del servidor. Código de referencia: {ref_code}"
    }

    response = JSONResponse(
        status_code=500,
        content=response_content
    )
    return _apply_cors_headers(request, response)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code == 500:
        ref_code = str(uuid.uuid4())[:8]
        error_trace = traceback.format_exc()
        if "NoneType: None" in error_trace or not error_trace.strip():
            error_trace = f"HTTPException 500 raised with detail: {exc.detail}"
        print(f"\n❌ HTTP 500 ERROR [Ref: {ref_code}]: {exc.detail}\n{error_trace}\n")
        logger.error(f"HTTP 500 ERROR [Ref: {ref_code}]: {exc.detail}\n{error_trace}")

        response_content = {
            "detail": f"Error interno del servidor. Código de referencia: {ref_code}"
        }

        response = JSONResponse(
            status_code=500,
            content=response_content
        )
        return _apply_cors_headers(request, response)

    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )
    return _apply_cors_headers(request, response)

# ===================================================================
# ENDPOINTS
# ===================================================================
import asyncio

@app.post("/test-idempotency-endpoint")
@require_idempotency
async def test_idempotency_endpoint(request: Request, payload: dict):
    delay = payload.get("delay", 0)
    if delay > 0:
        await asyncio.sleep(delay)
    return {"result": "success", "data": payload.get("data"), "timestamp": datetime.utcnow().isoformat()}

@app.get("/db-check")
@app.get("/health")
async def health_check(conn = Depends(get_db_connection)):
    try:
        await conn.execute("SELECT 1")
        return {"status": "ok", "message": "Conectado al Backend y Base de Datos (Enterprise Mode)", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "error", "message": str(e), "database": "error"}

@app.post("/api/register", response_model=schemas.UsuarioResponse)
async def register_user(
    user: schemas.UsuarioCreate,
    conn = Depends(get_db_connection)
):
    try:
        existing = await conn.fetchrow(
            "SELECT id FROM profiles WHERE username = $1 OR email = $2",
            user.username, user.email
        )
        if existing:
            raise HTTPException(status_code=400, detail="Usuario o Email ya registrado")

        tenant_id = await conn.fetchval(
            "SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1"
        )
        if not tenant_id:
            raise HTTPException(status_code=500, detail="No existe organization base para asignar tenant_id")

        # Mapear gerencia si viene por nombre
        g_id = user.gerencia_id
        if not g_id and user.gerencia_nombre:
            g_id = await conn.fetchval(
                "SELECT id FROM gerencias WHERE nombre = $1 AND (tenant_id = $2::uuid OR tenant_id IS NULL)",
                user.gerencia_nombre,
                tenant_id
            )
            if not g_id:
                # Si no existe, crearla dinámicamente
                g_id = await conn.fetchval(
                    "INSERT INTO gerencias (nombre, tenant_id) VALUES ($1, $2::uuid) RETURNING id",
                    user.gerencia_nombre,
                    tenant_id
                )

        if user.rol_id == 4:
            raise HTTPException(status_code=403, detail="El rol de Desarrollador solo puede ser asignado desde el Panel de Desarrollo.")

        hashed_pw = get_password_hash(user.password)

        default_rol = 3
        assigned_rol_id = user.rol_id or default_rol

        # Obtener los permisos por defecto del rol
        default_permissions = await conn.fetchval(
            "SELECT default_permissions FROM roles WHERE id = $1",
            assigned_rol_id
        ) or "[]"

        query = """
            INSERT INTO profiles (username, nombre, apellido, email, password_hash, rol_id, gerencia_id, estado, tenant_id, permisos)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
            RETURNING id, username, nombre, apellido, email, rol_id, gerencia_id, estado, tenant_id, permisos
        """
        row = await conn.fetchrow(
            query,
            user.username, user.nombre, user.apellido, user.email,
            hashed_pw, assigned_rol_id, g_id, True, tenant_id, default_permissions
        )

        try:
            await _log_security_event(
                conn,
                tenant_id=row.get("tenant_id"),
                user_id=row.get("id"),
                username=row.get("username") or row.get("email"),
                evento="REGISTER",
                detalles=f"Registro de usuario {row.get('email')}",
                estado="success",
                page="/api/register",
                ip_origen=None,
            )
        except Exception:
            pass
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        try:
            await _log_security_event(
                conn,
                tenant_id=None,
                user_id=None,
                username=user.email,
                evento="REGISTER_FAILED",
                detalles=str(e),
                estado="error",
                page="/api/register",
                ip_origen=None,
            )
        except Exception:
            pass
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno durante el registro: {str(e)}")

@app.post("/login")
@app.post("/api/login")
async def login_compat(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    conn = Depends(get_db_connection)
):
    username_input = str(form_data.username or "").strip()
    username_norm = username_input.lower()

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS login_lockouts (
            username TEXT PRIMARY KEY,
            failed_count INT NOT NULL DEFAULT 0,
            locked_until TIMESTAMPTZ
        )
    """)
    lock_row = await conn.fetchrow(
        "SELECT failed_count, locked_until FROM login_lockouts WHERE username = $1",
        username_norm,
    )
    now_utc = datetime.now(timezone.utc)
    if lock_row and lock_row["locked_until"] and lock_row["locked_until"] > now_utc:
        raise HTTPException(
            status_code=423,
            detail={
                "message": "Usuario bloqueado contacte a un administrador",
                "failed_count": int(lock_row["failed_count"] or 3),
                "remaining_attempts": 0,
                "is_locked": True,
            },
        )

    client_ip = _extract_client_ip(request)

    query = """
        SELECT p.id, p.username, p.password_hash, p.nombre, p.apellido, p.email, p.rol_id, r.nombre_rol, p.tenant_id,
               o.name as tenant_name,
               p.permisos,
               p.gerencia_id, g.nombre as gerencia_nombre,
               p.estado, p.mfa_enabled, p.totp_secret
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        LEFT JOIN organizations o ON p.tenant_id = o.id
        WHERE LOWER(p.username) = LOWER($1)
    """
    user = await conn.fetchrow(query, username_input)

    if user and user["estado"] is False:
        raise HTTPException(status_code=403, detail="Usuario inactivo. Contacte a un administrador")

    if not user or not verify_password(form_data.password, user["password_hash"]):
        failed_count = (lock_row["failed_count"] if lock_row else 0) + 1
        is_locked = failed_count >= 3
        locked_until = datetime.now(timezone.utc) + timedelta(days=3650) if is_locked else None
        await conn.execute(
            """
            INSERT INTO login_lockouts (username, failed_count, locked_until)
            VALUES ($1, $2, $3)
            ON CONFLICT (username)
            DO UPDATE SET failed_count = EXCLUDED.failed_count, locked_until = EXCLUDED.locked_until
            """,
            username_norm,
            failed_count,
            locked_until,
        )
        try:
            await _ensure_security_events_table(conn)
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
                """,
                user["tenant_id"] if user else None,
                user["id"] if user else None,
                user["username"] if user else username_input,
                "LOGIN_FALLIDO" if not is_locked else "USUARIO_BLOQUEADO",
                f"Intento fallido #{failed_count}" if not is_locked else "Bloqueado tras 3 intentos fallidos",
                "warning" if not is_locked else "danger",
                "/login",
                client_ip,
            )
        except Exception:
            pass
        if is_locked:
            raise HTTPException(
                status_code=423,
                detail={
                    "message": "Usuario bloqueado contacte a un administrador",
                    "failed_count": int(failed_count),
                    "remaining_attempts": 0,
                    "is_locked": True,
                },
            )
        remaining_attempts = max(0, 3 - int(failed_count))
        raise HTTPException(
            status_code=401,
            detail={
                "message": f"Credenciales incorrectas. Intento {failed_count} de 3.",
                "failed_count": int(failed_count),
                "remaining_attempts": int(remaining_attempts),
                "is_locked": False,
            },
        )

    await conn.execute("DELETE FROM login_lockouts WHERE username = $1", username_norm)

    role_norm = _normalize_text(user["nombre_rol"])
    is_dev = role_norm in {"desarrollador", "dev", "developer"}

    # Si tiene MFA habilitado y NO es desarrollador, devolvemos token MFA temporal
    if user.get("mfa_enabled") and not is_dev:
        mfa_token = create_access_token(
            data={
                "sub": str(user["id"]),
                "mfa_required": True,
                "role": user["nombre_rol"]
            },
            expires_delta=timedelta(minutes=3)
        )
        return {
            "mfa_required": True,
            "mfa_token": mfa_token,
            "username": user["username"]
        }

    # Flujo normal o desarrollador (MFA bypass)
    access_token = create_access_token(
        data={
            "sub": str(user["id"]),
            "role": user["nombre_rol"],
            "tenant_id": str(user["tenant_id"]) if user["tenant_id"] else None,
            "tenant_name": user["tenant_name"],
            "gerencia_id": user["gerencia_id"],
            "username": user["username"],
            "email": user["email"],
        }
    )

    refresh_token = await create_refresh_token(
        user_id=str(user["id"]),
        metadata={
            "role": user["nombre_rol"],
            "tenant_id": str(user["tenant_id"]) if user["tenant_id"] else None,
            "tenant_name": user["tenant_name"],
            "gerencia_id": user["gerencia_id"],
            "username": user["username"],
            "email": user["email"],
        }
    )

    await conn.execute(
        "UPDATE profiles SET ultima_conexion = $1 WHERE id = $2",
        datetime.now(),
        user["id"],
    )
    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen)
            VALUES ($1::uuid, $2::uuid, $3, 'LOGIN_OK', 'Inicio de sesion exitoso', 'success', '/login', $4)
            """,
            user["tenant_id"],
            user["id"],
            user["username"],
            client_ip,
        )
    except Exception:
        pass

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]),
            "username": user["username"],
            "nombre": user["nombre"],
            "apellido": user["apellido"],
            "email": user["email"],
            "role": user["nombre_rol"],
            "tenant_id": str(user["tenant_id"]) if user["tenant_id"] else None,
            "tenant_name": user["tenant_name"],
            "gerencia_id": user["gerencia_id"],
            "gerencia_depto": user["gerencia_nombre"],
            "permissions": _parse_permissions(user["permisos"]),
        },
    }


@app.get("/auth/validate")
async def validate_auth_session(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalido")

    profile = await conn.fetchrow(
        """
        SELECT p.id, p.username, p.nombre, p.apellido, p.email, p.estado, p.permisos,
               p.gerencia_id, COALESCE(g.nombre, 'Sin Asignar') as gerencia_depto,
               COALESCE(r.nombre_rol, 'Usuario') as role,
               p.tenant_id, o.name as tenant_name
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        LEFT JOIN organizations o ON p.tenant_id = o.id
        WHERE p.id = $1::uuid
        LIMIT 1
        """,
        user_id,
    )

    if not profile:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    lock_row = await conn.fetchrow(
        "SELECT locked_until FROM login_lockouts WHERE username = LOWER($1)",
        profile["username"],
    )
    if lock_row and lock_row["locked_until"] and lock_row["locked_until"] > datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="Usuario bloqueado")

    if profile["estado"] is False:
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    return {
        "authenticated": True,
        "user": {
            "id": str(profile["id"]),
            "username": profile["username"],
            "nombre": profile["nombre"],
            "apellido": profile["apellido"],
            "email": profile["email"],
            "role": profile["role"],
            "gerencia_id": profile["gerencia_id"],
            "gerencia_depto": profile["gerencia_depto"],
            "tenant_id": str(profile["tenant_id"]) if profile["tenant_id"] else None,
            "tenant_name": profile["tenant_name"],
            "permissions": _parse_permissions(profile["permisos"]),
        },
    }


def _is_privileged_role(role_name: Optional[str]) -> bool:
    if not role_name:
        return False
    role = str(role_name).strip().lower()
    return role in {
        "desarrollador",
        "dev",
        "developer",
        "administrativo",
        "ceo",
        "admin",
        "administrador",
    }


def _parse_permissions(permisos_val) -> List[str]:
    if not permisos_val:
        return []
    if isinstance(permisos_val, list):
        return permisos_val
    if isinstance(permisos_val, str):
        try:
            parsed = json.loads(permisos_val)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    return []


async def _is_privileged_user(conn, current_user: dict) -> bool:
    if _is_privileged_role(current_user.get("role")):
        return True
    user_id = current_user.get("sub")
    if not user_id:
        return False
    rol_id = await conn.fetchval("SELECT rol_id FROM profiles WHERE id = $1::uuid", user_id)
    return rol_id in {1, 2, 4}


def _is_admin_master_role(role_name: Optional[str]) -> bool:
    if not role_name:
        return False
    role = str(role_name).strip().lower()
    return role in {"desarrollador", "dev", "developer"}


async def _is_admin_master_user(conn, current_user: dict) -> bool:
    if _is_admin_master_role(current_user.get("role")):
        return True
    user_id = current_user.get("sub")
    if not user_id:
        return False
    rol_id = await conn.fetchval("SELECT rol_id FROM profiles WHERE id = $1::uuid", user_id)
    return rol_id == 4



async def _user_has_permission(conn, current_user: dict, permission: str) -> bool:
    if _normalize_text(current_user.get("role")) in {"desarrollador", "dev", "developer"}:
        return True

    user_id = current_user.get("sub")
    if not user_id or not permission:
        return False

    perms = await conn.fetchval(
        "SELECT permisos FROM profiles WHERE id = $1::uuid",
        user_id,
    )
    perms_list = _parse_permissions(perms)
    return permission in perms_list



def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    text = str(value).lower().strip()
    return " ".join(text.split())


async def _is_tech_user(conn, user_id: str) -> bool:
    dept = await conn.fetchval("""
        SELECT COALESCE(g.nombre, '')
        FROM profiles p
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        WHERE p.id = $1::uuid
    """, user_id)
    return "tecnolog" in _normalize_text(dept)




_ensured_tables = set()


async def _ensure_security_events_table(conn) -> None:
    if "security_events" in _ensured_tables:
        return
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS security_events (
            id BIGSERIAL PRIMARY KEY,
            tenant_id UUID,
            user_id UUID,
            username TEXT,
            evento TEXT NOT NULL,
            detalles TEXT,
            estado TEXT DEFAULT 'info',
            page TEXT,
            ip_origen TEXT,
            gerencia_id INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS tenant_id UUID")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS user_id UUID")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS username TEXT")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS evento TEXT")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS detalles TEXT")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'info'")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS page TEXT")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS ip_origen TEXT")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS gerencia_id INTEGER")
    await conn.execute("ALTER TABLE security_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    _ensured_tables.add("security_events")


async def _ensure_ticket_events_table(conn) -> None:
    if "ticket_events" in _ensured_tables:
        return
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS ticket_events (
            id BIGSERIAL PRIMARY KEY,
            ticket_id INTEGER NOT NULL,
            tenant_id UUID,
            actor_user_id UUID,
            actor_username TEXT,
            action TEXT NOT NULL,
            old_status TEXT,
            new_status TEXT,
            observaciones TEXT,
            details TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    _ensured_tables.add("ticket_events")


async def _ensure_documento_respuestas_tables(conn) -> None:
    if "documento_respuestas" in _ensured_tables:
        return
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS documento_respuestas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
            tenant_id UUID NOT NULL,
            user_id UUID NOT NULL,
            contenido TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS documento_respuesta_adjuntos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            respuesta_id UUID NOT NULL REFERENCES documento_respuestas(id) ON DELETE CASCADE,
            url_archivo TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    _ensured_tables.add("documento_respuestas")


async def _ensure_document_events_table(conn) -> None:
    if "document_events" in _ensured_tables:
        return
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS document_events (
            id BIGSERIAL PRIMARY KEY,
            documento_id UUID NOT NULL,
            tenant_id UUID,
            actor_user_id UUID,
            actor_username TEXT,
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    _ensured_tables.add("document_events")


async def _log_document_event(
    conn,
    documento_id: uuid.UUID,
    tenant_id: Optional[str],
    actor_user_id: Optional[str],
    actor_username: Optional[str],
    action: str,
    details: Optional[str] = None,
) -> None:
    await _ensure_document_events_table(conn)
    await conn.execute(
        """
        INSERT INTO document_events (
            documento_id, tenant_id, actor_user_id, actor_username, action, details
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6)
        """,
        documento_id,
        tenant_id,
        actor_user_id,
        actor_username,
        action,
        details,
    )


def _extract_storage_buckets(payload) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [b for b in payload if isinstance(b, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [b for b in data if isinstance(b, dict)]
        buckets = payload.get("buckets")
        if isinstance(buckets, list):
            return [b for b in buckets if isinstance(b, dict)]
    return []


def _extract_storage_path(value: Optional[str], bucket_name: str) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.startswith("/uploads/"):
        return None
    raw_no_qs = raw.split("?", 1)[0]

    # If stored as a full URL, try to extract from known URL patterns.
    if raw_no_qs.startswith("http"):
        # Supabase storage URL patterns:
        #   .../storage/v1/object/public/<bucket>/<path>
        #   .../storage/v1/object/sign/<bucket>/<path>?...
        if "/storage/v1/object/" in raw_no_qs:
            try:
                tail = raw_no_qs.split("/storage/v1/object/", 1)[1]
                parts = tail.split("/", 2)
                if len(parts) >= 3:
                    _, bucket, path = parts[0], parts[1], parts[2]
                    if bucket == bucket_name:
                        return path
            except Exception:
                return None

        # Backwards-compatible: backend proxy style URLs like:
        #   https://<api-host>/<bucket>/<path>
        try:
            from urllib.parse import urlparse

            parsed = urlparse(raw_no_qs)
            url_path = parsed.path or ""
            marker = f"/{bucket_name}/"
            idx = url_path.find(marker)
            if idx != -1:
                candidate = url_path[idx + 1 :].lstrip("/")
                return candidate or None
        except Exception:
            return None

        # Unknown remote URL; do not treat as a storage object path.
        return None

    # Normalize local-ish paths.
    if raw_no_qs.startswith("/"):
        raw_no_qs = raw_no_qs[1:]
    if not raw_no_qs:
        return None
    return raw_no_qs


def _extract_signed_url(result: Any) -> Optional[str]:
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        for key in ("signedURL", "signedUrl", "signed_url"):
            if key in result and result[key]:
                return result[key]
        data = result.get("data")
        if isinstance(data, dict):
            for key in ("signedURL", "signedUrl", "signed_url"):
                if key in data and data[key]:
                    return data[key]
    return None


def _create_signed_url(client, bucket_name: str, storage_path: str, expires_in: int) -> Optional[str]:
    try:
        result = client.storage.from_(bucket_name).create_signed_url(storage_path, expires_in)
        return _extract_signed_url(result)
    except Exception as e:
        logger.error(f"No se pudo firmar URL para '{storage_path}': {e}")
        return None


def _ensure_storage_bucket(client, bucket_name: str) -> None:
    try:
        buckets_payload = client.storage.list_buckets()
        buckets = _extract_storage_buckets(buckets_payload)
        if any(b.get("name") == bucket_name for b in buckets):
            return
        try:
            client.storage.create_bucket(bucket_name, {"public": False})
            logger.warning(f"Bucket '{bucket_name}' creado automaticamente en Supabase Storage (private).")
        except Exception as create_error:
            logger.error(f"No se pudo crear el bucket '{bucket_name}': {create_error}")
    except Exception as list_error:
        logger.error(f"No se pudo verificar buckets de Supabase: {list_error}")


def _store_local_upload(data: bytes, ext: str, folder_prefix: str) -> str:
    safe_prefix = folder_prefix.strip("/").replace("\\", "/")
    base_dir = Path("uploads") / safe_prefix if safe_prefix else Path("uploads")
    base_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    file_path = base_dir / filename
    file_path.write_bytes(data)
    relative = f"{safe_prefix}/{filename}" if safe_prefix else filename
    return f"/uploads/{relative}"


async def _upload_to_supabase_storage(
    file: UploadFile,
    folder_prefix: str,
    conn=None,
    current_user: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> str:
    bucket = DEFAULT_STORAGE_BUCKET
    client = get_supabase_admin_client()
    _ensure_storage_bucket(client, bucket)
    ext = Path(file.filename).suffix.lower()
    storage_path = f"{folder_prefix}/{uuid.uuid4()}{ext}"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    # Validar magic bytes (firmas reales de archivo)
    if not validate_magic_bytes(data, file.filename):
        if conn and current_user:
            try:
                user_id = current_user.get("sub")
                tenant_id = current_user.get("tenant_id")
                username = current_user.get("username")
                gerencia_id = current_user.get("gerencia_id")
                if not username or not tenant_id:
                    username_res, gerencia_res, tenant_res = await _resolve_user_context(conn, user_id)
                    username = username or username_res
                    gerencia_id = gerencia_id or gerencia_res
                    tenant_id = tenant_id or tenant_res
                await _log_security_event(
                    conn,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    username=username,
                    evento="FILE_UPLOAD_SPOOFING",
                    detalles=f"Intento de spoofing detectado al subir archivo: {file.filename}. La firma binaria no coincide con la extensión.",
                    estado="critical",
                    page=f"/upload/{folder_prefix}",
                    ip_origen=ip_address,
                    gerencia_id=gerencia_id
                )
            except Exception as log_err:
                logger.warning(f"Error logging spoofing event: {log_err}")
        raise HTTPException(
            status_code=400,
            detail="El contenido del archivo no coincide con su extensión permitida."
        )
    try:
        result = client.storage.from_(bucket).upload(
            storage_path,
            data,
            {"content-type": file.content_type or "application/octet-stream"},
        )
        if isinstance(result, dict) and result.get("error"):
            raise RuntimeError(result.get("error"))
        # For private buckets, we store the storage path and sign URLs when returning data.
        return storage_path
    except Exception as upload_error:
        logger.warning(
            f"Fallo upload a Supabase (bucket '{bucket}'): {upload_error}. "
            "Iniciando fallback a almacenamiento local..."
        )
        try:
            local_path = _store_local_upload(data, ext, folder_prefix)
            logger.info(f"Fallback local exitoso: {local_path}")
            return local_path
        except Exception as local_err:
            logger.error(f"Fallo también el almacenamiento local: {local_err}")
            raise HTTPException(
                status_code=503,
                detail="No se pudo almacenar el archivo ni en Supabase ni de forma local."
            )


@app.get("/documentos/{id}/eventos")
async def listar_eventos_documento(
    id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        await _ensure_document_events_table(conn)
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        if not tenant_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_id,
            )
        rows = await conn.fetch(
            """
            SELECT id, documento_id, actor_username, action, details, created_at
            FROM document_events
            WHERE documento_id = $1
              AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
            ORDER BY created_at ASC
            """,
            id,
            tenant_id,
        )
        return [dict(r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _ensure_tickets_schema(conn) -> None:
    if "tickets_schema" in _ensured_tables:
        return
    await conn.execute("""
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS solicitante_nombre_cache TEXT,
        ADD COLUMN IF NOT EXISTS solicitante_gerencia_cache TEXT
    """)
    await conn.execute("""
        UPDATE tickets t
        SET
            solicitante_nombre_cache = COALESCE(t.solicitante_nombre_cache, p.nombre || ' ' || p.apellido, p.username),
            solicitante_gerencia_cache = COALESCE(t.solicitante_gerencia_cache, g.nombre)
        FROM profiles p
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        WHERE p.id = t.solicitante_id
          AND (t.solicitante_nombre_cache IS NULL OR t.solicitante_gerencia_cache IS NULL)
    """)
    # Sync profiles -> app_users for FK integrity (created_by -> app_users.id)
    try:
        await conn.execute("""
            INSERT INTO app_users (id, email, full_name, role, organization_id, password_hash, active)
            SELECT
                p.id,
                p.email,
                COALESCE(p.nombre || ' ' || p.apellido, p.username, 'Usuario'),
                CASE r.nombre_rol
                    WHEN 'CEO' THEN 'owner'
                    WHEN 'Administrador' THEN 'manager'
                    WHEN 'Desarrollador' THEN 'developer'
                    WHEN 'Gerente' THEN 'manager'
                    WHEN 'Usuario' THEN 'viewer'
                    ELSE 'viewer'
                END,
                p.tenant_id,
                'synced_from_profiles',
                true
            FROM profiles p
            LEFT JOIN roles r ON p.rol_id = r.id
            LEFT JOIN app_users a ON p.id = a.id
            WHERE a.id IS NULL
              AND p.tenant_id IS NOT NULL
        """)
    except Exception as sync_err:
        logger.warning(f"Could not auto-sync profiles -> app_users: {sync_err}")
    _ensured_tables.add("tickets_schema")


async def _log_ticket_event(
    conn,
    ticket_id: int,
    tenant_id: Optional[str],
    actor_user_id: Optional[str],
    actor_username: Optional[str],
    action: str,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    observaciones: Optional[str] = None,
    details: Optional[str] = None,
) -> None:
    await _ensure_ticket_events_table(conn)
    await conn.execute(
        """
        INSERT INTO ticket_events (
            ticket_id, tenant_id, actor_user_id, actor_username, action,
            old_status, new_status, observaciones, details
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
        """,
        ticket_id,
        tenant_id,
        actor_user_id,
        actor_username,
        action,
        old_status,
        new_status,
        observaciones,
        details,
    )


def _clean_observation(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned if cleaned else None


async def _ensure_announcement_table(conn) -> None:
    if "announcement_table" in _ensured_tables:
        return
    # Check if tenant_id column exists
    has_tenant_id = await conn.fetchval("""
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name='dashboard_announcement' AND column_name='tenant_id'
        );
    """)
    if not has_tenant_id:
        await conn.execute("DROP TABLE IF EXISTS dashboard_announcement CASCADE;")
        
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_announcement (
            tenant_id UUID PRIMARY KEY,
            badge TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            urgency TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#dc2626',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    _ensured_tables.add("announcement_table")


async def _resolve_org_id(conn, tenant_id: Optional[str] = None) -> Optional[str]:
    if tenant_id:
        try:
            exists = await conn.fetchval("SELECT id FROM organizations WHERE id = $1::uuid", uuid.UUID(str(tenant_id)))
            if exists:
                return str(exists)
        except Exception:
            pass
    return await conn.fetchval("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1")

async def _get_org_gerencia_names(conn, org_id: Optional[str]) -> List[str]:
    if not org_id:
        return []
    cfg = await conn.fetchval("SELECT config FROM organizations WHERE id = $1::uuid", org_id)
    org_structure = (cfg or {}).get("org_structure") if isinstance(cfg, dict) else None
    if not isinstance(org_structure, list):
        return []

    names: List[str] = []
    seen = set()
    for group in org_structure:
        items = (group or {}).get("items") if isinstance(group, dict) else None
        if not isinstance(items, list):
            continue
        for item in items:
            name = str(item or "").strip()
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            names.append(name)
    return names


class TicketCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    prioridad: Optional[str] = "media"
    observaciones: Optional[str] = None


class TicketUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    prioridad: Optional[str] = None
    observaciones: Optional[str] = None


class TicketStatusUpdate(BaseModel):
    estado: str
    observaciones: Optional[str] = None




class AnnouncementPayload(BaseModel):
    badge: str
    title: str
    description: str
    status: str
    urgency: str
    color: str = "#dc2626"


class OrgStructurePayload(BaseModel):
    org_structure: List[Dict[str, Any]]


class OrgManagementDetailsPayload(BaseModel):
    management_details: Dict[str, Any]


class SecurityLogPayload(BaseModel):
    evento: str
    detalles: Optional[str] = ""
    estado: Optional[str] = "info"
    page: Optional[str] = ""

# ===================================================================
# HEALTH CHECKS ENTERPRISE
# ===================================================================

@app.get("/health/live")
async def liveness():
    return {"status": "alive", "timestamp": datetime.utcnow().isoformat()}

@app.get("/health/ready")
async def readiness(conn = Depends(get_db_connection)):
    try:
        await conn.execute("SELECT 1")
        return {
            "status": "ready",
            "components": {
                "database": "ok",
                "pool_size": async_db.pool.get_size() if async_db.pool else 0
            }
        }
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail="Service Not Ready")

# ===================================================================
# ENDPOINTS DE AUTENTICACIÓN Y TENANCY
# ===================================================================

@app.post("/api/auth/switch-organization")
async def switch_organization(
    org_id: schemas.SwitchOrgRequest,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id = current_user.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    query = """
        SELECT EXISTS(
            SELECT 1 FROM user_organizations
            WHERE user_id = $1 AND organization_id = $2
        )
    """
    exists = await conn.fetchval(query, user_id, org_id.organization_id)

    if not exists:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta organización")

    role_row = await conn.fetchrow(
        "SELECT role FROM user_organizations WHERE user_id = $1 AND organization_id = $2",
        user_id, org_id.organization_id
    )

    new_token = create_access_token(
        data={
            "sub": user_id,
            "tenant_id": str(org_id.organization_id),
            "role": role_row['role'] if role_row else 'member'
        }
    )
    try:
        await _ensure_security_events_table(conn)
        username = await conn.fetchval(
            "SELECT username FROM profiles WHERE id = $1::uuid",
            user_id,
        )
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'ORGANIZACION_CAMBIADA', $4, 'info', '/dashboard')
            """,
            org_id.organization_id,
            user_id,
            username or current_user.get("username") or "anon",
            f"Cambio de organizacion a {org_id.organization_id}",
        )
    except Exception:
        pass

    logger.info(f"User switched to organization {org_id.organization_id}")

    return {
        "access_token": new_token,
        "token_type": "bearer",
        "tenant_id": str(org_id.organization_id)
    }

@app.get("/documentos", dependencies=[Depends(get_tenant_context)])
async def list_documentos(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        await _ensure_documento_respuestas_tables(conn)
        storage_client = get_supabase_admin_client()
        signed_ttl = int(os.getenv("SUPABASE_SIGNED_URL_EXPIRES", "900"))
        tenant_id = current_user.get("tenant_id")
        user_id_raw = current_user.get("sub")
        if not user_id_raw:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        user_id = uuid.UUID(str(user_id_raw))
        user_gerencia_id = await conn.fetchval(
            "SELECT gerencia_id FROM profiles WHERE id = $1::uuid",
            user_id,
        )
        is_privileged = await _is_privileged_user(conn, current_user)
        role_norm = _normalize_text(current_user.get("role"))
        is_manager = role_norm in {"gerente", "manager"}

        # 1. Ejecutar máquina de estados automática
        await conn.execute("""
            UPDATE documentos
            SET estado = 'pendiente'
            WHERE estado = 'en-proceso'
            AND now() - fecha_ultima_actividad > INTERVAL '3 days'
        """)

        await conn.execute("""
            UPDATE documentos
            SET estado = 'omitido'
            WHERE estado = 'pendiente'
            AND now() - fecha_ultima_actividad > INTERVAL '6 days'
        """)

        # 2. Query mejorada para sistema de correo con multi-adjuntos
        query = """
            SELECT
                d.id,
                COALESCE(d.titulo, d.title, 'Sin Asunto') as name,
                d.correlativo as correlativo,
                d.correlativo as "idDoc",
                d.tipo_documento as category,
                d.estado as signatureStatus,
                d.prioridad,
                d.remitente_id,
                COALESCE(p_rem.nombre || ' ' || p_rem.apellido, 'Desconocido') as uploadedBy,
                COALESCE(p_rem.nombre || ' ' || p_rem.apellido, 'Desconocido') as remitente_nombre,
                p_rem.gerencia_id as remitente_gerencia_id,
                g_rem.nombre as remitente_gerencia_nombre,
                d.receptor_id,
                d.receptor_gerencia_id,
                COALESCE(p_rec.nombre || ' ' || p_rec.apellido, g.nombre, 'Sin Asignar') as receptor_nombre,
                p_rec.gerencia_id as receptor_gerencia_id_usuario,
                g_rec.nombre as receptor_gerencia_nombre_usuario,
                COALESCE(g.nombre, 'Mensaje Personal') as targetDepartment,
                d.url_archivo as fileUrl,
                (SELECT array_agg(da.url_archivo) FROM documento_adjuntos da WHERE da.documento_id = d.id) as archivos,
                d.fecha_creacion,
                TO_CHAR(d.fecha_creacion, 'DD/MM/YYYY') as uploadDate,
                TO_CHAR(d.fecha_creacion, 'HH24:MI') as uploadTime,
                d.fecha_caducidad,
                d.tenant_id,
                d.contenido,
                d.leido,
                r_last.contenido as respuesta_contenido,
                r_last.user_id as respuesta_usuario_id,
                r_last.created_at as respuesta_fecha,
                (SELECT array_agg(ra.url_archivo) FROM documento_respuesta_adjuntos ra WHERE ra.respuesta_id = r_last.id) as respuesta_archivos,
                COALESCE(p_resp.nombre || ' ' || p_resp.apellido, p_resp.username) as respuesta_usuario_nombre
            FROM documentos d
            LEFT JOIN LATERAL (
                SELECT r.id, r.user_id, r.contenido, r.created_at
                FROM documento_respuestas r
                WHERE r.documento_id = d.id
                ORDER BY r.created_at DESC
                LIMIT 1
            ) r_last ON TRUE
            LEFT JOIN profiles p_rem ON d.remitente_id = p_rem.id
            LEFT JOIN profiles p_rec ON d.receptor_id = p_rec.id
            LEFT JOIN profiles p_resp ON r_last.user_id = p_resp.id
            LEFT JOIN gerencias g ON d.receptor_gerencia_id = g.id
            LEFT JOIN gerencias g_rem ON p_rem.gerencia_id = g_rem.id
            LEFT JOIN gerencias g_rec ON p_rec.gerencia_id = g_rec.id
            WHERE
                (
                    $4::boolean = TRUE
                    OR d.remitente_id = $2::uuid
                    OR d.receptor_id = $2::uuid
                    OR ($3::int IS NOT NULL AND d.receptor_gerencia_id = $3::int)
                    OR (
                        $5::boolean = TRUE
                        AND $3::int IS NOT NULL
                        AND (
                            p_rem.gerencia_id = $3::int
                            OR p_rec.gerencia_id = $3::int
                            OR d.receptor_gerencia_id = $3::int
                        )
                    )
                )
                AND (
                    $1::uuid IS NULL
                    OR d.tenant_id = $1::uuid
                    OR d.tenant_id IS NULL
                )
            ORDER BY d.fecha_creacion DESC
        """
        rows = await conn.fetch(query, tenant_id, user_id, user_gerencia_id, is_privileged, is_manager)
        # Convertir record a dict y manejar el campo archivos
        result = []
        for r in rows:
            d = dict(r)
            # Asegurar que archivos no sea None
            if d.get("archivos") is None:
                d["archivos"] = [d["fileUrl"]] if d.get("fileUrl") else []
            if d.get("respuesta_archivos") is None:
                d["respuesta_archivos"] = []

            def sign_value(value: Optional[str]) -> Optional[str]:
                path = _extract_storage_path(value, DEFAULT_STORAGE_BUCKET)
                if not path:
                    return value
                signed = _create_signed_url(storage_client, DEFAULT_STORAGE_BUCKET, path, signed_ttl)
                return signed or value

            if d.get("fileUrl"):
                d["fileUrl"] = sign_value(d.get("fileUrl"))
            if d.get("archivos"):
                d["archivos"] = [sign_value(v) for v in d["archivos"] if v]
            if d.get("respuesta_archivos"):
                d["respuesta_archivos"] = [sign_value(v) for v in d["respuesta_archivos"] if v]
            result.append(d)
        return result
    except Exception as e:
        logger.error(f"Error listando correos/documentos: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documentos/archivo", dependencies=[Depends(get_tenant_context)])
async def get_documento_archivo(
    path: str,
    format: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    raw = str(path or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Archivo requerido")
    if raw.startswith("http"):
        raise HTTPException(status_code=400, detail="Path invalido")
    if raw.startswith("/"):
        raw = raw[1:]
    if ".." in raw:
        raise HTTPException(status_code=400, detail="Path invalido")
    if not raw.startswith("documentos/"):
        raise HTTPException(status_code=403, detail="Ruta no permitida")

    user_id_raw = current_user.get("sub")
    if not user_id_raw:
        raise HTTPException(status_code=401, detail="Usuario no identificado")
    user_id = uuid.UUID(str(user_id_raw))
    tenant_id = current_user.get("tenant_id")
    user_gerencia_id = await conn.fetchval(
        "SELECT gerencia_id FROM profiles WHERE id = $1::uuid",
        user_id,
    )
    is_privileged = await _is_privileged_user(conn, current_user)
    role_norm = _normalize_text(current_user.get("role"))
    is_manager = role_norm in {"gerente", "manager"}

    access_row = await conn.fetchrow(
        """
        SELECT d.id
        FROM documentos d
        LEFT JOIN documento_adjuntos da ON da.documento_id = d.id
        LEFT JOIN documento_respuestas dr ON dr.documento_id = d.id
        LEFT JOIN documento_respuesta_adjuntos ra ON ra.respuesta_id = dr.id
        LEFT JOIN profiles p_rem ON d.remitente_id = p_rem.id
        LEFT JOIN profiles p_rec ON d.receptor_id = p_rec.id
        WHERE (
            d.url_archivo = $1
            OR da.url_archivo = $1
            OR ra.url_archivo = $1
        )
        AND (
            $5::boolean = TRUE
            OR d.remitente_id = $2::uuid
            OR d.receptor_id = $2::uuid
            OR ($3::int IS NOT NULL AND d.receptor_gerencia_id = $3::int)
            OR (
                $4::boolean = TRUE
                AND $3::int IS NOT NULL
                AND (
                    p_rem.gerencia_id = $3::int
                    OR p_rec.gerencia_id = $3::int
                    OR d.receptor_gerencia_id = $3::int
                )
            )
        )
        AND (
            $6::uuid IS NULL
            OR d.tenant_id = $6::uuid
            OR d.tenant_id IS NULL
        )
        LIMIT 1
        """,
        raw,
        user_id,
        user_gerencia_id,
        is_manager,
        is_privileged,
        tenant_id,
    )
    if not access_row:
        raise HTTPException(status_code=403, detail="Sin acceso al archivo")

    storage_client = get_supabase_admin_client()
    signed_ttl = int(os.getenv("SUPABASE_SIGNED_URL_EXPIRES", "900"))
    storage_path = _extract_storage_path(raw, DEFAULT_STORAGE_BUCKET)
    if not storage_path:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    signed = _create_signed_url(storage_client, DEFAULT_STORAGE_BUCKET, storage_path, signed_ttl)
    if not signed:
        raise HTTPException(status_code=503, detail="No se pudo firmar la URL del archivo")
    if str(format or "").lower() == "json":
        return {"url": signed}
    return RedirectResponse(url=signed, status_code=302)

@app.post("/documentos", dependencies=[Depends(get_tenant_context)])
async def create_documento(
    request: Request,
    titulo: str = Form(...),
    correlativo_user: Optional[str] = Form(None, alias="correlativo"),
    tipo_documento: str = Form(...),
    prioridad: str = Form("media"),
    tiempo_maximo_dias: Optional[int] = Form(None),
    receptor_gerencia_id: Optional[int] = Form(None),
    receptor_gerencia_nombre: Optional[str] = Form(None),
    receptor_id: Optional[uuid.UUID] = Form(None),
    contenido: Optional[str] = Form(None),
    archivos: List[UploadFile] = FastAPIFile(None),
    conn = Depends(get_db_connection)
):
    try:
        # ========== 1. EXTRAER Y VALIDAR TOKEN ==========
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token no proporcionado")

        token = auth_header.split(" ")[1]
        secret_key = os.getenv("JWT_SECRET", "tu_clave_secreta_muy_segura_cambiala_en_produccion")

        try:
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token inválido: {str(e)}")

        user_id_raw = payload.get("sub")
        tenant_id_raw = payload.get("tenant_id")

        if not user_id_raw or user_id_raw == "None":
            raise HTTPException(status_code=401, detail="Usuario no identificado")

        user_id = uuid.UUID(str(user_id_raw))

        # ========== 2. OBTENER TENANT_ID ==========
        tenant_id = None
        if tenant_id_raw and tenant_id_raw != "None":
            try:
                tenant_id = uuid.UUID(str(tenant_id_raw))
            except:
                pass

        # Resolver gerencia por nombre cuando el cliente aun no tiene ID sincronizado.
        if not receptor_gerencia_id and receptor_gerencia_nombre:
            dept_name = receptor_gerencia_nombre.strip()
            if dept_name:
                receptor_gerencia_id = await conn.fetchval(
                    "SELECT id FROM gerencias WHERE LOWER(nombre) = LOWER($1) AND (tenant_id = $2::uuid OR tenant_id IS NULL) LIMIT 1",
                    dept_name,
                    tenant_id,
                )
                if not receptor_gerencia_id:
                    receptor_gerencia_id = await conn.fetchval(
                        "INSERT INTO gerencias (nombre, tenant_id) VALUES ($1, $2::uuid) RETURNING id",
                        dept_name,
                        tenant_id,
                    )

        if not tenant_id:
            tenant_id_raw = await conn.fetchval("SELECT tenant_id FROM profiles WHERE id = $1", user_id)
            tenant_id = uuid.UUID(str(tenant_id_raw)) if tenant_id_raw else None
        if not tenant_id and receptor_id:
            receiver_tenant = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                receptor_id,
            )
            tenant_id = uuid.UUID(str(receiver_tenant)) if receiver_tenant else None
        if not tenant_id and receptor_gerencia_id:
            dept_tenant = await conn.fetchval(
                """
                SELECT tenant_id
                FROM profiles
                WHERE gerencia_id = $1
                  AND tenant_id IS NOT NULL
                ORDER BY created_at ASC
                LIMIT 1
                """,
                receptor_gerencia_id,
            )
            tenant_id = uuid.UUID(str(dept_tenant)) if dept_tenant else None
        if not tenant_id:
            fallback_org = await conn.fetchval(
                "SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1"
            )
            tenant_id = uuid.UUID(str(fallback_org)) if fallback_org else None
        if not tenant_id:
            raise HTTPException(status_code=403, detail="No se pudo resolver tenant para el documento")

        # ========== 3. GENERAR CORRELATIVO ==========
        try:
            user_info = await conn.fetchrow("""
                SELECT g.siglas, p.gerencia_id FROM profiles p
                LEFT JOIN gerencias g ON p.gerencia_id = g.id
                WHERE p.id = $1
            """, user_id)
            siglas = user_info['siglas'] if user_info and user_info['siglas'] else 'COR'
            remitente_gerencia_id = user_info['gerencia_id'] if user_info else None
        except:
            siglas = 'COR'
            remitente_gerencia_id = None

        year = datetime.now().year
        count = await conn.fetchval("""
            SELECT COUNT(*) FROM documentos
            WHERE correlativo LIKE $1 || '-%-' || $2 AND tenant_id = $3
        """, siglas, str(year), tenant_id)

        manual_part = (correlativo_user or "").strip()
        # Si el usuario define correlativo manual, se respeta EXACTAMENTE tal cual lo escribio.
        if manual_part:
            auto_correlativo = manual_part
        else:
            auto_correlativo = f"{siglas}-{str((count or 0) + 1).zfill(3)}-{year}"

        # ========== 4. PROCESAR MÚLTIPLES ARCHIVOS ==========
        file_urls = []
        if archivos:
            if len(archivos) > MAX_UPLOAD_FILES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cantidad maxima de archivos excedida. Limite: {MAX_UPLOAD_FILES}",
                )
            for archivo in archivos:
                if archivo and archivo.filename:
                    ext = Path(archivo.filename).suffix.lower()
                    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
                        raise HTTPException(status_code=400, detail=f"Extension no permitida: {ext}")
                    if archivo.size and archivo.size > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Archivo excede limite permitido ({MAX_UPLOAD_BYTES // (1024 * 1024)}MB)",
                        )
                    client_ip = request.client.host if request and request.client else None
                    user_dict = {
                        "sub": str(user_id) if user_id else None,
                        "tenant_id": str(tenant_id) if tenant_id else None,
                        "username": None,
                        "gerencia_id": None
                    }
                    uploaded_url = await _upload_to_supabase_storage(
                        archivo,
                        "documentos",
                        conn=conn,
                        current_user=user_dict,
                        ip_address=client_ip
                    )
                    await archivo.close()
                    file_urls.append(uploaded_url)

        # Guardamos la primera URL en la tabla principal para compatibilidad legacy
        primary_file_url = file_urls[0] if file_urls else None

        # ========== 5. INSERTAR EN BD ==========
        fecha_creacion = datetime.now()
        if tiempo_maximo_dias and int(tiempo_maximo_dias) > 0:
            fecha_caducidad = fecha_creacion + timedelta(days=int(tiempo_maximo_dias))
        else:
            fecha_caducidad = fecha_creacion + timedelta(days=6)

        doc_id = await conn.fetchval("""
            INSERT INTO documentos (
                titulo, title, correlativo, tipo_documento, estado, prioridad,
                remitente_id, receptor_id, receptor_gerencia_id, url_archivo,
                contenido, leido, fecha_creacion, fecha_caducidad,
                fecha_ultima_actividad, tenant_id, user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id
        """,
            titulo, titulo, auto_correlativo, tipo_documento, 'pendiente', prioridad,
            user_id, receptor_id, receptor_gerencia_id, primary_file_url,
            contenido, False, fecha_creacion, fecha_caducidad, fecha_creacion, tenant_id, user_id
        )

        # ========== 6. INSERTAR ADJUNTOS EN TABLA RELACIONADA ==========
        for url in file_urls:
            await conn.execute("""
                INSERT INTO documento_adjuntos (documento_id, url_archivo)
                VALUES ($1, $2)
            """, doc_id, url)

        # ========== 7. LOG DE ENVIO ==========
        try:
            await _ensure_security_events_table(conn)
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            destino = (
                f"usuario_id={receptor_id}" if receptor_id
                else f"gerencia_id={receptor_gerencia_id}" if receptor_gerencia_id
                else "destino_no_definido"
            )
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'DOCUMENTO_ENVIADO', $4, 'success', '/dashboard?tab=documentos')
                """,
                tenant_id,
                user_id,
                username or "anon",
                f"Documento enviado: {auto_correlativo} | titulo='{titulo}' | estado_inicial='pendiente' | {destino}",
            )
        except Exception:
            pass

        # NUEVA LÓGICA DE TELEMETRÍA PARA DOCUMENTOS (documento.creado)
        try:
            evento_doc = KodaEventInternal(
                event_type="documento.creado",
                aggregate_type=AggregateType.documento,
                aggregate_id=str(doc_id),
                gerencia_id=remitente_gerencia_id or receptor_gerencia_id or 1,
                actor_id=user_id,
                tenant_id=tenant_id,
                payload={
                    "tipo_documento": tipo_documento,
                    "estado_nuevo": "pendiente",
                    "monto_implicado": 0
                },
                severity=EventSeverity.info
            )
            await event_buffer.enqueue(evento_doc)
        except Exception as e:
            logger.error(f"Fallo en telemetría de documento {doc_id}: {e}")

        return {"id": doc_id, "correlativo": auto_correlativo, "status": "success"}

    except Exception as e:
        logger.error(f"Error enviando mensaje: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/documentos/{id}/leido")
async def mark_as_read(
    id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        user_uuid = uuid.UUID(str(user_id))
        user_gerencia_id = await conn.fetchval(
            "SELECT gerencia_id FROM profiles WHERE id = $1::uuid",
            user_uuid,
        )
        is_privileged = await _is_privileged_user(conn, current_user)
        if not tenant_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_uuid,
            )
        updated = await conn.fetchrow(
            """
            UPDATE documentos
            SET
                leido = TRUE,
                estado = CASE
                    WHEN estado IN ('en-proceso', 'pendiente') THEN 'recibido'
                    ELSE estado
                END,
                fecha_ultima_actividad = NOW()
            WHERE id = $1
              AND ($2::uuid IS NULL OR tenant_id = $2::uuid OR tenant_id IS NULL)
              AND (
                    $3::boolean = TRUE
                    OR receptor_id = $4::uuid
                    OR ($5::int IS NOT NULL AND receptor_gerencia_id = $5::int)
                  )
            RETURNING id, COALESCE(titulo, title, 'Sin Asunto') as titulo, correlativo, estado
            """,
            id,
            tenant_id,
            is_privileged,
            user_uuid,
            user_gerencia_id,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Documento no encontrado o sin permiso para marcarlo como leido")

        try:
            await _ensure_security_events_table(conn)
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'DOCUMENTO_LEIDO', $4, 'info', '/dashboard?tab=documentos')
                """,
                tenant_id,
                user_uuid,
                username or "anon",
                f"Documento abierto: {updated.get('correlativo') or updated.get('id')} | titulo='{updated.get('titulo')}' | nuevo_estado='{updated.get('estado')}'",
            )
        except Exception:
            pass
        try:
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            await _log_document_event(
                conn,
                id,
                tenant_id,
                user_uuid,
                username or "anon",
                "READ",
                details=f"Documento marcado como leido",
            )
        except Exception:
            pass

        return {"status": "success", "estado": updated.get("estado")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/documentos/{id}/estado")
async def update_doc_status(
    id: uuid.UUID,
    status_data: dict,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        if not tenant_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_id,
            )
        nuevo_estado = status_data.get("estado")
        comentario = (status_data.get("comentario") or "").strip()
        await _ensure_documento_respuestas_tables(conn)
        doc = await conn.fetchrow(
            """
            SELECT id, remitente_id
            FROM documentos
            WHERE id = $1
              AND ($2::uuid IS NULL OR tenant_id = $2::uuid OR tenant_id IS NULL)
            """,
            id,
            tenant_id,
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        is_sender = doc.get("remitente_id") and str(doc.get("remitente_id")) == str(user_id)
        if nuevo_estado in {"finalizado", "en-aclaracion"} and not is_sender:
            raise HTTPException(status_code=403, detail="No autorizado para este cambio de estado")
        if nuevo_estado == "finalizado":
            has_response = await conn.fetchval(
                "SELECT 1 FROM documento_respuestas WHERE documento_id = $1 LIMIT 1",
                id,
            )
            if not has_response:
                raise HTTPException(status_code=400, detail="No se puede finalizar sin respuesta")
        updated = await conn.fetchrow("""
            UPDATE documentos
            SET estado = $1, fecha_ultima_actividad = NOW()
            WHERE id = $2 AND ($3::uuid IS NULL OR tenant_id = $3::uuid OR tenant_id IS NULL)
            RETURNING id, COALESCE(titulo, title, 'Sin Asunto') as titulo, correlativo, estado, tipo_documento, receptor_gerencia_id, remitente_id
        """, nuevo_estado, id, tenant_id)
        if not updated:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        try:
            await _ensure_security_events_table(conn)
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'DOCUMENTO_ESTADO_ACTUALIZADO', $4, 'info', '/dashboard?tab=documentos')
                """,
                tenant_id,
                user_id,
                username or "anon",
                f"Cambio de estado: {updated.get('correlativo') or updated.get('id')} | titulo='{updated.get('titulo')}' | nuevo_estado='{updated.get('estado')}'",
            )
        except Exception:
            pass
        try:
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            await _log_document_event(
                conn,
                id,
                tenant_id,
                user_id,
                username or "anon",
                "STATUS_CHANGED",
                details=f"estado='{nuevo_estado}'" + (f" | comentario='{comentario}'" if comentario else ""),
            )
        except Exception:
            pass

        # NUEVA LÓGICA DE TELEMETRÍA PARA DOCUMENTOS (documento.estado_cambiado, documento.aprobado, etc.)
        try:
            actor_gerencia_id = await conn.fetchval(
                "SELECT gerencia_id FROM profiles WHERE id = $1::uuid",
                user_id
            )
            
            event_type = "documento.estado_cambiado"
            severity = EventSeverity.info
            
            norm_status = str(nuevo_estado).lower()
            if norm_status in {"aprobado", "sellado", "tramitado", "finalizado"}:
                event_type = "documento.aprobado" if norm_status == "aprobado" else "documento.tramitado"
            elif norm_status in {"rechazado", "anulado"}:
                event_type = "documento.rechazado"
                severity = EventSeverity.warning

            evento_doc = KodaEventInternal(
                event_type=event_type,
                aggregate_type=AggregateType.documento,
                aggregate_id=str(id),
                gerencia_id=actor_gerencia_id or (updated.get("receptor_gerencia_id") if updated else None) or 1,
                actor_id=user_id,
                tenant_id=tenant_id,
                payload={
                    "tipo_documento": updated.get("tipo_documento") if updated else "desconocido",
                    "estado_nuevo": nuevo_estado,
                    "monto_implicado": 0
                },
                severity=severity
            )
            await event_buffer.enqueue(evento_doc)
        except Exception as e:
            logger.error(f"Fallo en telemetría de actualización de documento {id}: {e}")

        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documentos/{id}/respuesta")
async def responder_documento(
    request: Request,
    id: uuid.UUID,
    contenido: str = Form(...),
    archivos: List[UploadFile] = FastAPIFile(None),
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        await _ensure_documento_respuestas_tables(conn)
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        if not tenant_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_id,
            )
        user_uuid = uuid.UUID(str(user_id))
        user_gerencia_id = await conn.fetchval(
            "SELECT gerencia_id FROM profiles WHERE id = $1::uuid",
            user_uuid,
        )
        is_privileged = await _is_privileged_user(conn, current_user)
        content = (contenido or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="contenido requerido")

        doc = await conn.fetchrow(
            """
            SELECT id, receptor_id, receptor_gerencia_id
            FROM documentos
            WHERE id = $1
              AND ($2::uuid IS NULL OR tenant_id = $2::uuid OR tenant_id IS NULL)
            """,
            id,
            tenant_id,
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        can_reply = is_privileged
        if doc.get("receptor_id") and str(doc.get("receptor_id")) == str(user_uuid):
            can_reply = True
        if doc.get("receptor_gerencia_id") and user_gerencia_id:
            if int(doc.get("receptor_gerencia_id")) == int(user_gerencia_id):
                can_reply = True
        if not can_reply:
            raise HTTPException(status_code=403, detail="No autorizado para responder este documento")

        response_file_urls = []
        if archivos:
            for archivo in archivos:
                if archivo and archivo.filename:
                    ext = Path(archivo.filename).suffix.lower()
                    if ext != ".pdf":
                        raise HTTPException(status_code=400, detail="Solo se permiten adjuntos PDF en respuestas")
                    if archivo.size and archivo.size > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Archivo excede limite permitido ({MAX_UPLOAD_BYTES // (1024 * 1024)}MB)",
                        )
                    client_ip = request.client.host if request and request.client else None
                    uploaded_url = await _upload_to_supabase_storage(
                        archivo,
                        "documentos/respuestas",
                        conn=conn,
                        current_user=current_user,
                        ip_address=client_ip
                    )
                    await archivo.close()
                    response_file_urls.append(uploaded_url)

        response_id = await conn.fetchval(
            """
            INSERT INTO documento_respuestas (
                documento_id, tenant_id, user_id, contenido
            ) VALUES ($1, $2::uuid, $3::uuid, $4)
            RETURNING id
            """,
            id,
            tenant_id,
            user_uuid,
            content,
        )
        if not response_id:
            raise HTTPException(status_code=500, detail="No se pudo registrar la respuesta")

        for url in response_file_urls:
            await conn.execute(
                """
                INSERT INTO documento_respuesta_adjuntos (respuesta_id, url_archivo)
                VALUES ($1, $2)
                """,
                response_id,
                url,
            )

        updated = await conn.fetchrow(
            """
            UPDATE documentos
            SET
                estado = CASE
                    WHEN estado IN ('en-proceso', 'pendiente', 'recibido', 'en-aclaracion') THEN 'respondido'
                    ELSE estado
                END,
                fecha_ultima_actividad = NOW()
            WHERE id = $1
              AND ($2::uuid IS NULL OR tenant_id = $2::uuid OR tenant_id IS NULL)
            RETURNING id
            """,
            id,
            tenant_id,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        try:
            await _ensure_security_events_table(conn)
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_uuid,
            )
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'DOCUMENTO_RESPONDIDO', $4, 'info', '/dashboard?tab=prioridades')
                """,
                tenant_id,
                user_uuid,
                username or "anon",
                f"Respuesta registrada en documento {id}",
            )
        except Exception:
            pass
        try:
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_uuid,
            )
            await _log_document_event(
                conn,
                id,
                tenant_id,
                user_uuid,
                username or "anon",
                "RESPONDED",
                details="Respuesta registrada",
            )
        except Exception:
            pass

        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documentos/{id}/respuestas")
async def listar_respuestas_documento(
    id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        await _ensure_documento_respuestas_tables(conn)
        storage_client = get_supabase_admin_client()
        signed_ttl = int(os.getenv("SUPABASE_SIGNED_URL_EXPIRES", "900"))
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        if not tenant_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_id,
            )
        rows = await conn.fetch(
            """
            SELECT
                r.id,
                r.documento_id,
                r.user_id,
                r.contenido,
                r.created_at,
                COALESCE(p.nombre || ' ' || p.apellido, p.username) as usuario_nombre,
                (SELECT array_agg(a.url_archivo) FROM documento_respuesta_adjuntos a WHERE a.respuesta_id = r.id) as archivos
            FROM documento_respuestas r
            LEFT JOIN profiles p ON r.user_id = p.id
            WHERE r.documento_id = $1
              AND ($2::uuid IS NULL OR r.tenant_id = $2::uuid)
            ORDER BY r.created_at ASC
            """,
            id,
            tenant_id,
        )
        signed_rows = []
        for r in rows:
            d = dict(r)
            archivos = d.get("archivos") or []
            if archivos:
                signed_archivos = []
                for value in archivos:
                    path = _extract_storage_path(value, DEFAULT_STORAGE_BUCKET)
                    if not path:
                        signed_archivos.append(value)
                        continue
                    signed = _create_signed_url(storage_client, DEFAULT_STORAGE_BUCKET, path, signed_ttl)
                    signed_archivos.append(signed or value)
                d["archivos"] = signed_archivos
            signed_rows.append(d)
        return signed_rows
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/documentos/{id}")
async def delete_documento(
    id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        if not await _is_privileged_user(conn, current_user):
            raise HTTPException(status_code=403, detail="No autorizado para eliminar documentos")

        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not tenant_id and user_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_id,
            )

        doc = await conn.fetchrow(
            """
            SELECT id, COALESCE(titulo, title, 'Sin Asunto') as titulo, correlativo, url_archivo
            FROM documentos
            WHERE id = $1
              AND ($2::uuid IS NULL OR tenant_id = $2::uuid OR tenant_id IS NULL)
            """,
            id,
            tenant_id,
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")

        adjuntos = await conn.fetch(
            "SELECT url_archivo FROM documento_adjuntos WHERE documento_id = $1",
            id,
        )
        file_urls = [doc.get("url_archivo")] + [r.get("url_archivo") for r in adjuntos]

        await conn.execute("DELETE FROM documento_adjuntos WHERE documento_id = $1", id)
        await conn.execute("DELETE FROM documentos WHERE id = $1", id)

        for url in file_urls:
            try:
                if not url:
                    continue
                if not str(url).startswith("/uploads/"):
                    continue
                filename = Path(str(url)).name
                if not filename:
                    continue
                path = Path("uploads") / filename
                if path.exists():
                    path.unlink()
            except Exception:
                pass

        try:
            await _ensure_security_events_table(conn)
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'DOCUMENTO_ELIMINADO', $4, 'warning', '/dashboard?tab=seguridad')
                """,
                tenant_id,
                user_id,
                username or "admin",
                f"Documento eliminado: {doc.get('correlativo') or doc.get('id')} | titulo='{doc.get('titulo')}'",
            )
        except Exception:
            pass

        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documentos/prioridad/control")
async def purge_control_documents(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        role_norm = _normalize_text(current_user.get("role"))
        if role_norm not in {"desarrollador", "dev", "developer"}:
            raise HTTPException(status_code=403, detail="Solo Desarrollador puede limpiar seguimiento")

        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuario no identificado")
        if not tenant_id:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                user_id,
            )

        doc_rows = await conn.fetch(
            """
            SELECT id, url_archivo
            FROM documentos
            WHERE prioridad = 'control'
              AND ($1::uuid IS NULL OR tenant_id = $1::uuid OR tenant_id IS NULL)
            """,
            tenant_id,
        )
        doc_ids = [r.get("id") for r in doc_rows if r.get("id")]
        if not doc_ids:
            return {"status": "success", "deleted": 0}

        # Collect attachment URLs for cleanup
        file_urls = [r.get("url_archivo") for r in doc_rows if r.get("url_archivo")]
        adjuntos = await conn.fetch(
            "SELECT url_archivo FROM documento_adjuntos WHERE documento_id = ANY($1::uuid[])",
            doc_ids,
        )
        file_urls.extend([r.get("url_archivo") for r in adjuntos if r.get("url_archivo")])
        respuesta_adjuntos = await conn.fetch(
            """
            SELECT a.url_archivo
            FROM documento_respuesta_adjuntos a
            JOIN documento_respuestas r ON a.respuesta_id = r.id
            WHERE r.documento_id = ANY($1::uuid[])
            """,
            doc_ids,
        )
        file_urls.extend([r.get("url_archivo") for r in respuesta_adjuntos if r.get("url_archivo")])

        await conn.execute(
            "DELETE FROM document_events WHERE documento_id = ANY($1::uuid[])",
            doc_ids,
        )
        await conn.execute(
            """
            DELETE FROM documento_respuesta_adjuntos
            WHERE respuesta_id IN (
                SELECT id FROM documento_respuestas WHERE documento_id = ANY($1::uuid[])
            )
            """,
            doc_ids,
        )
        await conn.execute(
            "DELETE FROM documento_respuestas WHERE documento_id = ANY($1::uuid[])",
            doc_ids,
        )
        await conn.execute(
            "DELETE FROM documento_adjuntos WHERE documento_id = ANY($1::uuid[])",
            doc_ids,
        )
        await conn.execute(
            "DELETE FROM documentos WHERE id = ANY($1::uuid[])",
            doc_ids,
        )

        # Best-effort cleanup in Supabase Storage
        try:
            storage_client = get_supabase_admin_client()
            bucket = DEFAULT_STORAGE_BUCKET
            storage_paths = []
            for url in file_urls:
                path = _extract_storage_path(url, bucket)
                if path:
                    storage_paths.append(path)
            if storage_paths:
                # Remove duplicates to avoid errors
                unique_paths = list(dict.fromkeys(storage_paths))
                storage_client.storage.from_(bucket).remove(unique_paths)
        except Exception:
            pass

        try:
            await _ensure_security_events_table(conn)
            username = await conn.fetchval(
                "SELECT username FROM profiles WHERE id = $1::uuid",
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'CONTROL_SEGUIMIENTO_PURGADO', $4, 'warning', '/dashboard?tab=seguimiento')
                """,
                tenant_id,
                user_id,
                username or "dev",
                f"Se eliminaron {len(doc_ids)} documentos de control de seguimiento",
            )
        except Exception:
            pass

        return {"status": "success", "deleted": len(doc_ids)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/gerencias")
async def list_gerencias(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    tenant_id = current_user.get("tenant_id")
    role = current_user.get("role") or current_user.get("rol")
    role_norm = str(role).strip().lower() if role else ""

    org_id = None
    if tenant_id:
        org_id = uuid.UUID(str(tenant_id))
        await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id))
        await conn.execute("SELECT set_config('app.current_user_role', $1, true)", role_norm)

    org_names = await _get_org_gerencia_names(conn, org_id)

    if not org_names:
        if role_norm in {"desarrollador", "developer", "dev"}:
            rows = await conn.fetch("SELECT id, nombre, siglas FROM gerencias ORDER BY nombre")
        else:
            if org_id:
                rows = await conn.fetch("SELECT id, nombre, siglas FROM gerencias WHERE tenant_id = $1::uuid OR tenant_id IS NULL ORDER BY nombre", org_id)
            else:
                rows = await conn.fetch("SELECT id, nombre, siglas FROM gerencias WHERE tenant_id IS NULL ORDER BY nombre")
        return [dict(r) for r in rows]

    lowered = [n.lower() for n in org_names]
    async with conn.transaction():
        for name in org_names:
            exists = await conn.fetchval(
                "SELECT 1 FROM gerencias WHERE LOWER(nombre) = LOWER($1) AND (tenant_id = $2::uuid OR tenant_id IS NULL) LIMIT 1",
                name,
                org_id,
            )
            if not exists:
                await conn.execute("INSERT INTO gerencias (nombre, tenant_id) VALUES ($1, $2::uuid)", name, org_id)

    rows = await conn.fetch(
        "SELECT id, nombre, siglas FROM gerencias WHERE LOWER(nombre) = ANY($1::text[]) AND (tenant_id = $2::uuid OR tenant_id IS NULL)",
        lowered,
        org_id,
    )
    by_name = {str(r["nombre"]).strip().lower(): dict(r) for r in rows}
    ordered = [by_name[n.lower()] for n in org_names if n.lower() in by_name]
    return ordered

@app.get("/gerencias/public")
async def list_gerencias_public(conn = Depends(get_db_connection)):
    org_id = await _resolve_org_id(conn, None)
    org_names = await _get_org_gerencia_names(conn, org_id)
    if org_names:
        return [{"nombre": n} for n in org_names]

    rows = await conn.fetch("SELECT nombre FROM gerencias ORDER BY nombre")
    return [{"nombre": r["nombre"]} for r in rows]

@app.get("/usuarios")
async def list_usuarios(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("sub")
    if not tenant_id and user_id:
        tenant_id = await conn.fetchval("SELECT tenant_id FROM profiles WHERE id = $1::uuid", user_id)

    is_privileged = await _is_privileged_user(conn, current_user)

    if not tenant_id:
        return []

    if is_privileged:
        role_filter = "" if _normalize_text(current_user.get("role")) in {"desarrollador", "developer", "dev"} else "AND (p.rol_id IS NULL OR p.rol_id != 4)"
        rows = await conn.fetch(f"""
            SELECT p.id, p.username as usuario_corp, p.nombre, p.apellido, p.email,
                   p.gerencia_id, COALESCE(g.nombre, 'Sin Asignar') as gerencia_depto,
                   p.rol_id, COALESCE(r.nombre_rol, 'Usuario') as role,
                   p.estado, p.ultima_conexion, p.tenant_id, p.permisos,
                   COALESCE(ll.failed_count, 0) AS failed_count,
                   ll.locked_until,
                   CASE WHEN ll.locked_until IS NOT NULL AND ll.locked_until > NOW() THEN TRUE ELSE FALSE END AS is_locked
            FROM profiles p
            LEFT JOIN roles r ON p.rol_id = r.id
            LEFT JOIN gerencias g ON p.gerencia_id = g.id
            LEFT JOIN login_lockouts ll ON LOWER(ll.username) = LOWER(p.username)
            WHERE p.id IS NOT NULL AND p.tenant_id = $1::uuid {role_filter}
            ORDER BY p.nombre, p.apellido
        """, uuid.UUID(str(tenant_id)))
    else:
        role_filter = "" if _normalize_text(current_user.get("role")) in {"desarrollador", "developer", "dev"} else "AND (p.rol_id IS NULL OR p.rol_id != 4)"
        rows = await conn.fetch(f"""
            SELECT p.id, p.username as usuario_corp, p.nombre, p.apellido, p.email,
                   p.gerencia_id, COALESCE(g.nombre, 'Sin Asignar') as gerencia_depto,
                   p.rol_id, COALESCE(r.nombre_rol, 'Usuario') as role,
                   p.estado, p.ultima_conexion, p.tenant_id, p.permisos,
                   COALESCE(ll.failed_count, 0) AS failed_count,
                   ll.locked_until,
                   CASE WHEN ll.locked_until IS NOT NULL AND ll.locked_until > NOW() THEN TRUE ELSE FALSE END AS is_locked
            FROM profiles p
            LEFT JOIN roles r ON p.rol_id = r.id
            LEFT JOIN gerencias g ON p.gerencia_id = g.id
            LEFT JOIN login_lockouts ll ON LOWER(ll.username) = LOWER(p.username)
            WHERE p.estado = TRUE AND p.tenant_id = $1::uuid {role_filter}
            ORDER BY p.nombre, p.apellido
        """, uuid.UUID(str(tenant_id)))
    res = []
    for r in rows:
        d = dict(r)
        d["permisos"] = _parse_permissions(d.get("permisos"))
        d["permissions"] = d["permisos"]
        res.append(d)
    return res


@app.patch("/users/{user_id}/permissions")
async def update_user_permissions(
    user_id: uuid.UUID,
    payload: dict,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")

    permisos = payload.get("permisos") or []
    if not isinstance(permisos, list):
        raise HTTPException(status_code=400, detail="permisos debe ser una lista")

    target_row = await conn.fetchrow(
        """
        SELECT p.username, COALESCE(r.nombre_rol, 'Usuario') AS role
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        WHERE p.id = $1
        """,
        user_id,
    )
    if not target_row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    actor_role = _normalize_text(current_user.get("role"))
    target_role = _normalize_text(target_row["role"])
    is_actor_dev = actor_role in {"desarrollador", "developer", "dev"}
    is_target_admin = target_role in {"administrativo", "admin", "administrador"}

    # Regla de proteccion: solo Desarrollador puede modificar permisos de cuentas Administrativas.
    if is_target_admin and not is_actor_dev:
        raise HTTPException(
            status_code=403,
            detail="Solo un usuario con rol Desarrollador puede modificar permisos de cuentas Administrativas",
        )

    await conn.execute(
        "UPDATE profiles SET permisos = $2::jsonb WHERE id = $1",
        user_id,
        json.dumps(permisos),
    )
    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'PERMISOS_ACTUALIZADOS', $4, 'info', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Permisos actualizados para usuario {target_row['username'] or user_id}. Total permisos={len(permisos)}",
        )
    except Exception:
        pass
    return {"status": "success", "user_id": str(user_id), "permisos": permisos}

@app.put("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    payload: dict,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")

    role_id = payload.get("rol_id")
    if role_id not in {1, 2, 3, 5}:
        raise HTTPException(
            status_code=403 if role_id == 4 else 400,
            detail="El rol de Desarrollador solo puede ser asignado desde el Panel de Desarrollo." if role_id == 4 else "rol_id invalido"
        )

    exists = await conn.fetchval("SELECT 1 FROM profiles WHERE id = $1", user_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    default_permissions = await conn.fetchval(
        "SELECT default_permissions FROM roles WHERE id = $1",
        role_id
    ) or "[]"

    await conn.execute(
        "UPDATE profiles SET rol_id = $2, permisos = $3::jsonb WHERE id = $1",
        user_id, role_id, default_permissions
    )
    updated = await conn.fetchrow("""
        SELECT p.id, p.username as usuario_corp, p.nombre, p.apellido, p.email,
               p.gerencia_id, COALESCE(g.nombre, 'Sin Asignar') as gerencia_depto,
               p.rol_id, COALESCE(r.nombre_rol, 'Usuario') as role,
               p.estado, p.ultima_conexion, p.tenant_id, p.permisos
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        WHERE p.id = $1
    """, user_id)

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'ROL_ACTUALIZADO', $4, 'info', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Rol de usuario {updated['usuario_corp']} actualizado a {updated['role']}",
        )
    except Exception:
        pass

    res = dict(updated)
    res["permisos"] = _parse_permissions(res.get("permisos"))
    res["permissions"] = res["permisos"]
    return res

@app.put("/users/{user_id}/profile")
async def update_user_profile(
    user_id: uuid.UUID,
    payload: dict,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    caller_id = current_user.get("sub")
    is_self = caller_id and str(user_id) == str(caller_id)
    if not is_self:
        if not await _is_admin_master_user(conn, current_user):
            raise HTTPException(status_code=403, detail="No autorizado")

    username = str(
        payload.get("usuario_corp")
        or payload.get("username")
        or ""
    ).strip()
    nombre = str(payload.get("nombre") or "").strip()
    apellido = str(payload.get("apellido") or "").strip()
    email = str(payload.get("email") or "").strip().lower()

    if not username or not nombre or not apellido or not email:
        raise HTTPException(status_code=400, detail="nombre, apellido, email y usuario_corp son obligatorios")
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Email invalido")

    exists = await conn.fetchval("SELECT 1 FROM profiles WHERE id = $1", user_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    duplicate = await conn.fetchval(
        """
        SELECT 1
        FROM profiles
        WHERE id <> $1
          AND (LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($3))
        LIMIT 1
        """,
        user_id,
        username,
        email,
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="El usuario corporativo o email ya esta en uso")

    await conn.execute(
        """
        UPDATE profiles
        SET username = $2, nombre = $3, apellido = $4, email = $5
        WHERE id = $1
        """,
        user_id,
        username,
        nombre,
        apellido,
        email,
    )

    updated = await conn.fetchrow(
        """
        SELECT p.id, p.username as usuario_corp, p.nombre, p.apellido, p.email,
               p.gerencia_id, COALESCE(g.nombre, 'Sin Asignar') as gerencia_depto,
               p.rol_id, COALESCE(r.nombre_rol, 'Usuario') as role,
               p.estado, p.ultima_conexion, p.tenant_id, p.permisos,
               COALESCE(ll.failed_count, 0) AS failed_count,
               ll.locked_until,
               CASE WHEN ll.locked_until IS NOT NULL AND ll.locked_until > NOW() THEN TRUE ELSE FALSE END AS is_locked
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        LEFT JOIN login_lockouts ll ON LOWER(ll.username) = LOWER(p.username)
        WHERE p.id = $1
        """,
        user_id,
    )

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'USUARIO_EDITADO', $4, 'info', '/dashboard/security/user')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Perfil actualizado para usuario {updated['usuario_corp']}",
        )
    except Exception:
        pass

    res = dict(updated)
    res["permisos"] = _parse_permissions(res.get("permisos"))
    res["permissions"] = res["permisos"]
    return res

@app.put("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: uuid.UUID,
    payload: dict,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")

    new_password = str(payload.get("new_password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva clave debe tener al menos 8 caracteres")

    username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1", user_id)
    if not username:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    new_hash = get_password_hash(new_password)
    await conn.execute(
        "UPDATE profiles SET password_hash = $2, estado = TRUE WHERE id = $1",
        user_id,
        new_hash,
    )
    await conn.execute("DELETE FROM login_lockouts WHERE username = LOWER($1)", username)

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'PASSWORD_RESETEADO', $4, 'warning', '/dashboard/security/user')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Clave reseteada para usuario {username}",
        )
    except Exception:
        pass

    return {"status": "success", "user_id": str(user_id), "username": username}

@app.delete("/users/{user_id}")
async def delete_user_account(
    user_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")

    current_user_id = current_user.get("sub")
    if current_user_id and str(current_user_id) == str(user_id):
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    row = await conn.fetchrow(
        """
        SELECT p.username, COALESCE(r.nombre_rol, 'Usuario') AS role
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        WHERE p.id = $1
        """,
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    username = row["username"]
    target_role = _normalize_text(row["role"])
    actor_role = _normalize_text(current_user.get("role"))

    # Regla de proteccion: solo un Desarrollador puede eliminar cuentas Desarrollador.
    if target_role in {"desarrollador", "developer", "dev"} and actor_role not in {"desarrollador", "developer", "dev"}:
        raise HTTPException(
            status_code=403,
            detail="Solo un usuario con rol Desarrollador puede eliminar cuentas de Desarrollador",
        )

    async with conn.transaction():
        await conn.execute("DELETE FROM login_lockouts WHERE username = LOWER($1)", username)
        await conn.execute("DELETE FROM profiles WHERE id = $1", user_id)

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'USUARIO_ELIMINADO', $4, 'danger', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Usuario eliminado: {username}",
        )
    except Exception:
        pass

    return {"status": "success", "user_id": str(user_id), "username": username}


@app.patch("/users/{user_id}/unlock")
async def unlock_user(
    user_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")

    username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1", user_id)
    if not username:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    await conn.execute("UPDATE profiles SET estado = TRUE WHERE id = $1", user_id)
    await conn.execute("DELETE FROM login_lockouts WHERE username = LOWER($1)", username)

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'USUARIO_DESBLOQUEADO', $4, 'success', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Se desbloqueo usuario {username}",
        )
    except Exception:
        pass

    return {"status": "success", "user_id": str(user_id), "username": username}


@app.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: uuid.UUID,
    payload: dict,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")

    status = str(payload.get("status") or "").strip().upper()
    if status not in {"ACTIVO", "INACTIVO", "BLOQUEADO"}:
        raise HTTPException(status_code=400, detail="status invalido")

    row = await conn.fetchrow("SELECT id, username FROM profiles WHERE id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    current_user_id = current_user.get("sub")
    if current_user_id and str(current_user_id) == str(user_id) and status in {"INACTIVO", "BLOQUEADO"}:
        raise HTTPException(status_code=400, detail="No puedes desactivarte o bloquearte a ti mismo")

    username = str(row["username"] or "").strip().lower()

    if status == "ACTIVO":
        await conn.execute("UPDATE profiles SET estado = TRUE WHERE id = $1", user_id)
        await conn.execute("DELETE FROM login_lockouts WHERE username = $1", username)
        event = "USUARIO_ACTIVADO"
        detail = f"Usuario {username} marcado como ACTIVO"
        level = "success"
    elif status == "INACTIVO":
        await conn.execute("UPDATE profiles SET estado = FALSE WHERE id = $1", user_id)
        await conn.execute("DELETE FROM login_lockouts WHERE username = $1", username)
        event = "USUARIO_INACTIVADO"
        detail = f"Usuario {username} marcado como INACTIVO"
        level = "warning"
    else:
        await conn.execute("UPDATE profiles SET estado = FALSE WHERE id = $1", user_id)
        await conn.execute(
            """
            INSERT INTO login_lockouts (username, failed_count, locked_until)
            VALUES ($1, 3, NOW() + INTERVAL '3650 days')
            ON CONFLICT (username)
            DO UPDATE SET failed_count = EXCLUDED.failed_count, locked_until = EXCLUDED.locked_until
            """,
            username,
        )
        event = "USUARIO_BLOQUEADO_MANUAL"
        detail = f"Usuario {username} bloqueado manualmente por administrador"
        level = "danger"

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, '/dashboard/security/user')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            event,
            detail,
            level,
        )
    except Exception:
        pass

    return {"status": "success", "user_id": str(user_id), "username": username, "new_status": status}


@app.get("/announcement")
async def get_announcement(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    await _ensure_announcement_table(conn)
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("sub")
    if not tenant_id and user_id:
        tenant_id = await conn.fetchval("SELECT tenant_id FROM profiles WHERE id = $1::uuid", user_id)
        
    org_id = await _resolve_org_id(conn, tenant_id)
    if not org_id:
        return {
            "badge": "Comunicado del Dia",
            "title": "Actualizacion de Protocolos 2026",
            "description": "Mensaje institucional vigente para todas las gerencias.",
            "status": "Activo",
            "urgency": "Alta",
            "color": "#dc2626",
        }
        
    org_uuid = uuid.UUID(org_id)
    row = await conn.fetchrow("""
        SELECT badge, title, description, status, urgency, COALESCE(color, '#dc2626') AS color
        FROM dashboard_announcement
        WHERE tenant_id = $1::uuid
    """, org_uuid)
    if row:
        return dict(row)

    default_announcement = {
        "badge": "Comunicado del Dia",
        "title": "Actualizacion de Protocolos 2026",
        "description": "Mensaje institucional vigente para todas las gerencias.",
        "status": "Activo",
        "urgency": "Alta",
        "color": "#dc2626",
    }
    await conn.execute(
        """
        INSERT INTO dashboard_announcement (tenant_id, badge, title, description, status, urgency, color, updated_at)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (tenant_id) DO NOTHING
        """,
        org_uuid,
        default_announcement["badge"],
        default_announcement["title"],
        default_announcement["description"],
        default_announcement["status"],
        default_announcement["urgency"],
        default_announcement["color"],
    )
    return default_announcement


@app.put("/announcement")
async def save_announcement(
    payload: AnnouncementPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado para editar anuncios")

    await _ensure_announcement_table(conn)
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("sub")
    if not tenant_id and user_id:
        tenant_id = await conn.fetchval("SELECT tenant_id FROM profiles WHERE id = $1::uuid", user_id)
        
    org_id = await _resolve_org_id(conn, tenant_id)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organización no válida")
        
    org_uuid = uuid.UUID(org_id)
    data = payload.model_dump()
    await conn.execute(
        """
        INSERT INTO dashboard_announcement (tenant_id, badge, title, description, status, urgency, color, updated_at)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (tenant_id)
        DO UPDATE SET
            badge = EXCLUDED.badge,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            urgency = EXCLUDED.urgency,
            color = EXCLUDED.color,
            updated_at = NOW()
        """,
        org_uuid,
        data["badge"],
        data["title"],
        data["description"],
        data["status"],
        data["urgency"],
        data.get("color") or "#dc2626",
    )
    saved = await conn.fetchrow("""
        SELECT badge, title, description, status, urgency, COALESCE(color, '#dc2626') AS color
        FROM dashboard_announcement
        WHERE tenant_id = $1::uuid
    """, org_uuid)
    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'ANUNCIO_ACTUALIZADO', $4, 'info', '/dashboard?tab=seguridad')
            """,
            org_uuid,
            current_user.get("sub") if current_user.get("sub") else None,
            current_user.get("username") or "admin",
            f"Anuncio actualizado: titulo='{data['title']}' | status='{data['status']}' | urgencia='{data['urgency']}'",
        )
    except Exception:
        pass
    return {"status": "success", "announcement": dict(saved) if saved else data}


def _normalize_dashboard_string_list(value: Any) -> List[str]:
    raw_items: Any = value
    if isinstance(raw_items, str):
        text = raw_items.strip()
        if not text:
            raw_items = []
        else:
            try:
                parsed = json.loads(text)
                raw_items = parsed if isinstance(parsed, list) else text
            except Exception:
                raw_items = text

    if isinstance(raw_items, str):
        raw_items = [part.strip() for part in re.split(r"[\r\n,]+", raw_items) if part.strip()]

    if not isinstance(raw_items, list):
        return []

    normalized: List[str] = []
    for item in raw_items:
        text = str(item or "").strip()
        if text:
            normalized.append(text)
    return normalized


def _normalize_dashboard_org_structure(value: Any) -> List[Dict[str, Any]]:
    raw_structure: Any = value
    if isinstance(raw_structure, str):
        try:
            parsed = json.loads(raw_structure)
            raw_structure = parsed
        except Exception:
            raw_structure = []

    if not isinstance(raw_structure, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for group in raw_structure:
        if not isinstance(group, dict):
            continue
        category = str(group.get("category") or "").strip()
        if not category:
            continue
        icon = str(group.get("icon") or "Briefcase").strip() or "Briefcase"
        normalized.append({
            "category": category,
            "icon": icon,
            "items": _normalize_dashboard_string_list(group.get("items")),
        })
    return normalized


def _normalize_management_details_map(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    normalized: Dict[str, Any] = {}
    for key, entry in value.items():
        name = str(key or "").strip()
        if not name:
            continue
        if isinstance(entry, dict):
            normalized[name] = {
                "lider": str(entry.get("lider") or "").strip(),
                "contacto": str(entry.get("contacto") or "").strip(),
                "objetivos": _normalize_dashboard_string_list(entry.get("objetivos") or []),
                "funciones": _normalize_dashboard_string_list(entry.get("funciones") or []),
            }
        else:
            normalized[name] = {
                "lider": "",
                "contacto": "",
                "objetivos": [],
                "funciones": _normalize_dashboard_string_list(entry),
            }
    return normalized


@app.get("/org-structure")
async def get_org_structure(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    org_id = await _resolve_org_id(conn, current_user.get("tenant_id"))
    if not org_id:
        raise HTTPException(status_code=500, detail="No existe organizacion base")

    cfg = await conn.fetchval("SELECT config FROM organizations WHERE id = $1::uuid", org_id)
    org_structure = _normalize_dashboard_org_structure(
        (cfg or {}).get("org_structure") if isinstance(cfg, dict) else None
    )
    source = "config"
    if not org_structure:
        rows = await conn.fetch("SELECT nombre FROM gerencias WHERE tenant_id = $1::uuid OR tenant_id IS NULL ORDER BY nombre", org_id)
        org_structure = [{
            "category": "Gerencias",
            "icon": "Briefcase",
            "items": [r["nombre"] for r in rows],
        }]
        source = "catalog"
    management_details = _normalize_management_details_map(
        (cfg or {}).get("management_details") if isinstance(cfg, dict) else None
    )

    return {"org_structure": org_structure, "management_details": management_details, "source": source}


@app.put("/org-structure")
async def save_org_structure(
    payload: OrgStructurePayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado para editar estructura")

    org_id = await _resolve_org_id(conn, current_user.get("tenant_id"))
    if not org_id:
        raise HTTPException(status_code=500, detail="No existe organizacion base")

    normalized_structure: List[Dict[str, Any]] = []
    ordered_unique_names: List[str] = []
    seen_names = set()

    # Normaliza payload y construye lista unica de gerencias para sincronizar catalogos.
    for group in payload.org_structure or []:
        category = str((group or {}).get("category") or "").strip()
        icon = str((group or {}).get("icon") or "Briefcase").strip() or "Briefcase"
        raw_items = (group or {}).get("items") or []
        clean_items: List[str] = []
        for item in raw_items:
            name = str(item or "").strip()
            if not name:
                continue
            clean_items.append(name)
            key = name.lower()
            if key not in seen_names:
                seen_names.add(key)
                ordered_unique_names.append(name)

        if category:
            normalized_structure.append({
                "category": category,
                "icon": icon,
                "items": clean_items,
            })

    current_cfg = await conn.fetchval("SELECT config FROM organizations WHERE id = $1::uuid", org_id)
    previous_structure = (current_cfg or {}).get("org_structure") if isinstance(current_cfg, dict) else None

    def _flatten_names(structure: Any) -> List[str]:
        names: List[str] = []
        if not isinstance(structure, list):
            return names
        for group in structure:
            items = (group or {}).get("items") if isinstance(group, dict) else None
            if not isinstance(items, list):
                continue
            for item in items:
                name = str(item or "").strip()
                if name:
                    names.append(name)
        return names

    previous_names = _flatten_names(previous_structure)

    async with conn.transaction():
        await conn.execute(
            """
            UPDATE organizations
            SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{org_structure}', $2::jsonb, true),
                updated_at = NOW()
            WHERE id = $1::uuid
            """,
            org_id,
            json.dumps(normalized_structure),
        )

        # Si fue una edicion (misma cantidad), intenta renombrar manteniendo IDs para no romper referencias.
        if previous_names and len(previous_names) == len(ordered_unique_names):
            for old_name, new_name in zip(previous_names, ordered_unique_names):
                if old_name.lower() == new_name.lower():
                    continue
                exists_new = await conn.fetchval(
                    "SELECT 1 FROM gerencias WHERE LOWER(nombre) = LOWER($1) AND (tenant_id = $2::uuid OR tenant_id IS NULL) LIMIT 1",
                    new_name,
                    org_id,
                )
                if not exists_new:
                    await conn.execute(
                        "UPDATE gerencias SET nombre = $1 WHERE LOWER(nombre) = LOWER($2) AND (tenant_id = $3::uuid OR tenant_id IS NULL)",
                        new_name,
                        old_name,
                        org_id,
                    )

        # Inserta las nuevas gerencias para que Tickets/Mensajeria/Registro consuman el mismo catalogo.
        for name in ordered_unique_names:
            exists = await conn.fetchval(
                "SELECT 1 FROM gerencias WHERE LOWER(nombre) = LOWER($1) AND (tenant_id = $2::uuid OR tenant_id IS NULL) LIMIT 1",
                name,
                org_id,
            )
            if not exists:
                await conn.execute("INSERT INTO gerencias (nombre, tenant_id) VALUES ($1, $2::uuid)", name, org_id)

        # Elimina gerencias fuera de la estructura solo si no estan en uso.
        if ordered_unique_names:
            await conn.execute(
                """
                DELETE FROM gerencias g
                WHERE LOWER(g.nombre) <> ALL($1::text[])
                  AND (g.tenant_id = $2::uuid OR g.tenant_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.gerencia_id = g.id)
                  AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.receptor_gerencia_id = g.id)
                """,
                [n.lower() for n in ordered_unique_names],
                org_id,
            )

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'ESTRUCTURA_ORG_ACTUALIZADA', $4, 'info', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Estructura organizativa actualizada: modulos={len(normalized_structure)} | gerencias={len(ordered_unique_names)}",
        )
    except Exception:
        pass

    return {"status": "success", "org_structure": normalized_structure}


@app.get("/org-management-details")
async def get_org_management_details(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    org_id = await _resolve_org_id(conn, current_user.get("tenant_id"))
    if not org_id:
        raise HTTPException(status_code=500, detail="No existe organizacion base")

    cfg = await conn.fetchval("SELECT config FROM organizations WHERE id = $1::uuid", org_id)
    details = _normalize_management_details_map(
        (cfg or {}).get("management_details") if isinstance(cfg, dict) else None
    )
    return {"management_details": details}


@app.put("/org-management-details")
async def save_org_management_details(
    payload: OrgManagementDetailsPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado para editar detalles de gerencia")

    org_id = await _resolve_org_id(conn, current_user.get("tenant_id"))
    if not org_id:
        raise HTTPException(status_code=500, detail="No existe organizacion base")

    normalized: Dict[str, Any] = {}
    for key, value in (payload.management_details or {}).items():
        name = str(key or "").strip()
        if not name:
            continue
        if isinstance(value, dict):
            normalized[name] = {
                "lider": str(value.get("lider") or "").strip(),
                "contacto": str(value.get("contacto") or "").strip(),
                "objetivos": [str(x).strip() for x in (value.get("objetivos") or []) if str(x).strip()],
                "funciones": [str(x).strip() for x in (value.get("funciones") or []) if str(x).strip()],
            }
        else:
            lines: List[str] = []
            if isinstance(value, list):
                for item in value:
                    text = str(item or "").strip()
                    if text:
                        lines.append(text)
            normalized[name] = {
                "lider": "",
                "contacto": "",
                "objetivos": [],
                "funciones": lines,
            }

    await conn.execute(
        """
        UPDATE organizations
        SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{management_details}', $2::jsonb, true),
            updated_at = NOW()
        WHERE id = $1::uuid
        """,
        org_id,
        json.dumps(normalized),
    )

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'DETALLES_GERENCIA_ACTUALIZADOS', $4, 'info', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Detalles de gerencia actualizados: entradas={len(normalized)}",
        )
    except Exception:
        pass

    return {"status": "success", "management_details": normalized}


@app.get("/roles")
async def get_roles(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    rows = await conn.fetch("SELECT id, nombre_rol, default_permissions FROM roles ORDER BY id ASC")
    roles = []
    for row in rows:
        roles.append({
            "id": row["id"],
            "nombre_rol": row["nombre_rol"],
            "default_permissions": json.loads(row["default_permissions"]) if isinstance(row["default_permissions"], str) else (row["default_permissions"] or [])
        })
    return {"roles": roles}


class RolePermissionsPayload(BaseModel):
    permissions: List[str]


@app.put("/roles/{role_id}/permissions")
async def update_role_permissions(
    role_id: int,
    payload: RolePermissionsPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="Solo Administrador o Desarrollador puede editar permisos de roles")

    await conn.execute(
        "UPDATE roles SET default_permissions = $2::jsonb WHERE id = $1",
        role_id,
        json.dumps(payload.permissions)
    )

    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'ROLE_PERMISSIONS_UPDATED', $4, 'info', '/dashboard?tab=seguridad')
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            current_user.get("username") or "admin",
            f"Permisos por defecto del rol {role_id} actualizados. Total={len(payload.permissions)}",
        )
    except Exception:
        pass

    return {"status": "success", "role_id": role_id, "default_permissions": payload.permissions}



@app.post("/security/logs")
async def create_security_log(
    payload: SecurityLogPayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    await _ensure_security_events_table(conn)
    user_id = current_user.get("sub")
    tenant_id = current_user.get("tenant_id")
    username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1::uuid", user_id) if user_id else "anon"
    ip = _extract_client_ip(request)

    row = await conn.fetchrow(
        """
        INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen, gerencia_id)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, tenant_id, user_id, username, evento, detalles, estado, page, ip_origen, gerencia_id, created_at
        """,
        tenant_id, user_id, username, payload.evento, payload.detalles, payload.estado, payload.page, ip,
        current_user.get("gerencia_id"),
    )
    return dict(row)


@app.get("/security/logs")
async def list_security_logs(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    await _ensure_security_events_table(conn)
    tenant_id = current_user.get("tenant_id")
    role = str(current_user.get("role") or "").strip().lower()
    allow_null_tenant = role in {"desarrollador", "dev", "developer", "administrativo", "admin", "administrador", "ceo"}
    rows = await conn.fetch(
        """
        SELECT id, username, evento, detalles, estado, ip_origen as ip_address, created_at as fecha_hora, user_id, gerencia_id
        FROM security_events
        WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid OR ($2::bool IS TRUE AND tenant_id IS NULL))
        ORDER BY created_at DESC
        LIMIT 2000
        """,
        tenant_id,
        allow_null_tenant,
    )
    return [dict(r) for r in rows]


@app.get("/security/logs/user/{user_id}")
async def list_security_logs_by_user(
    user_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    await _ensure_security_events_table(conn)
    tenant_id = current_user.get("tenant_id")
    role = str(current_user.get("role") or "").strip().lower()
    allow_null_tenant = role in {"desarrollador", "dev", "developer", "administrativo", "admin", "administrador", "ceo"}
    rows = await conn.fetch(
        """
        SELECT id, username, evento, detalles, estado, ip_origen as ip_address, created_at as fecha_hora, user_id, gerencia_id
        FROM security_events
        WHERE user_id = $1::uuid AND ($2::uuid IS NULL OR tenant_id = $2::uuid OR ($3::bool IS TRUE AND tenant_id IS NULL))
        ORDER BY created_at DESC
        LIMIT 2000
        """,
        user_id,
        tenant_id,
        allow_null_tenant,
    )
    return [dict(r) for r in rows]


@app.delete("/security/logs")
async def purge_security_logs(
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    if not await _is_admin_master_user(conn, current_user):
        raise HTTPException(status_code=403, detail="Solo Desarrollador puede limpiar los logs.")

    await _ensure_security_events_table(conn)
    tenant_id = current_user.get("tenant_id")

    if tenant_id:
        await conn.execute(
            "DELETE FROM security_events WHERE tenant_id = $1::uuid",
            tenant_id,
        )
    else:
        await conn.execute("DELETE FROM security_events")

    try:
        await _log_security_event(
            conn,
            tenant_id=str(tenant_id) if tenant_id else None,
            user_id=str(current_user.get("sub")) if current_user.get("sub") else None,
            username=current_user.get("username") or current_user.get("email") or "dev",
            evento="LOGS_PURGED",
            detalles="Limpieza total de logs ejecutada por Desarrollador",
            estado="warning",
            page="/dashboard/security",
            ip_origen=_extract_client_ip(request),
            gerencia_id=current_user.get("gerencia_id"),
        )
    except Exception:
        pass

    return {"status": "ok", "message": "Logs limpiados"}


@app.get("/tickets", dependencies=[Depends(get_tenant_context)])
async def list_tickets(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    await _ensure_tickets_schema(conn)
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("sub")
    role = current_user.get("role")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalido")

    role_norm = _normalize_text(role)
    is_dev = role_norm in {"desarrollador", "dev", "developer"}
    is_admin = role_norm in {"administrativo", "admin", "administrador"}
    is_ceo = role_norm == "ceo"
    is_privileged = is_dev or is_admin or is_ceo
    is_tech = await _is_tech_user(conn, user_id)

    query = """
        SELECT
            t.id,
            t.titulo,
            t.descripcion,
            t.area,
            t.prioridad,
            t.estado,
            t.solicitante_id,
            t.tecnico_id,
            t.observaciones,
            t.fecha_creacion,
            COALESCE(t.solicitante_nombre_cache, ps.nombre || ' ' || ps.apellido, ps.username, 'Desconocido') AS solicitante_nombre,
            COALESCE(t.solicitante_gerencia_cache, gs.nombre, 'Sin Asignar') AS solicitante_gerencia,
            COALESCE(pt.nombre || ' ' || pt.apellido, pt.username) AS tecnico_nombre
        FROM tickets t
        LEFT JOIN profiles ps ON t.solicitante_id = ps.id
        LEFT JOIN gerencias gs ON ps.gerencia_id = gs.id
        LEFT JOIN profiles pt ON t.tecnico_id = pt.id
        WHERE (
            $1::uuid IS NULL
            OR ps.tenant_id = $1::uuid
            OR pt.tenant_id = $1::uuid
            OR (
                ps.id IS NULL AND pt.id IS NULL
                AND EXISTS (
                    SELECT 1
                    FROM profiles pz
                    WHERE pz.id = t.solicitante_id
                      AND pz.tenant_id = $1::uuid
                )
            )
        )
    """
    params: List[Any] = [tenant_id]
    if not is_privileged and not is_tech:
        query += " AND t.solicitante_id = $2::uuid"
        params.append(user_id)

    query += " ORDER BY t.fecha_creacion DESC"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@app.get("/tickets/history", dependencies=[Depends(get_tenant_context)])
async def search_ticket_history(
    q: str = "",
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    tenant_id = current_user.get("tenant_id")
    await _ensure_ticket_events_table(conn)
    rows = await conn.fetch(
        """
        SELECT
            e.id, e.ticket_id, e.actor_username, e.action, e.old_status, e.new_status,
            e.observaciones, e.details, e.created_at,
            t.titulo, t.estado
        FROM ticket_events e
        LEFT JOIN tickets t ON t.id = e.ticket_id
        WHERE ($1::uuid IS NULL OR e.tenant_id = $1::uuid)
          AND (
                $2::text = ''
                OR COALESCE(t.titulo, '') ILIKE '%' || $2 || '%'
                OR CAST(e.ticket_id AS TEXT) ILIKE '%' || $2 || '%'
                OR COALESCE(e.details, '') ILIKE '%' || $2 || '%'
              )
        ORDER BY e.created_at DESC
        LIMIT 500
        """,
        tenant_id,
        q.strip(),
    )
    return [dict(r) for r in rows]


@app.get("/tickets/{ticket_id}/history", dependencies=[Depends(get_tenant_context)])
async def list_ticket_history(
    ticket_id: int,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    tenant_id = current_user.get("tenant_id")
    await _ensure_ticket_events_table(conn)
    rows = await conn.fetch(
        """
        SELECT id, ticket_id, actor_username, action, old_status, new_status,
               observaciones, details, created_at
        FROM ticket_events
        WHERE ticket_id = $1
          AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
        ORDER BY created_at ASC
        """,
        ticket_id,
        tenant_id,
    )
    return [dict(r) for r in rows]


@app.post("/tickets", dependencies=[Depends(get_tenant_context)])
async def create_ticket(
    payload: TicketCreate,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    await _ensure_tickets_schema(conn)
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalido")
    tenant_id = current_user.get("tenant_id")
    if not tenant_id and user_id:
        try:
            tenant_id = await conn.fetchval(
                "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                str(user_id)
            )
        except Exception as e:
            logger.warning(f"Could not resolve tenant_id for tickets insertion: {e}")

    is_tech = await _is_tech_user(conn, user_id)
    observations = payload.observaciones if is_tech else None

    creator_name = await conn.fetchval(
        "SELECT COALESCE(nombre || ' ' || apellido, username, 'Desconocido') FROM profiles WHERE id = $1::uuid",
        user_id,
    )
    creator_dept = await conn.fetchval(
        """
        SELECT COALESCE(g.nombre, 'Sin Asignar')
        FROM profiles p
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        WHERE p.id = $1::uuid
        """,
        user_id,
    )

    priority_map = {"baja": "low", "media": "medium", "alta": "high"}
    mapped_priority = priority_map.get((payload.prioridad or "media").lower(), "medium")

    row = await conn.fetchrow("""
        INSERT INTO tickets (
            titulo, descripcion, area, prioridad, estado, solicitante_id, observaciones,
            solicitante_nombre_cache, solicitante_gerencia_cache,
            title, description, status, priority, organization_id, created_by, tenant_id
        )
        VALUES ($1, $2, $3, $4, 'abierto', $5::uuid, $6, $7, $8, $1, COALESCE($2, ''), 'open', $9, $10::uuid, $5::uuid, $10::uuid)
        RETURNING id, titulo, descripcion, area, prioridad, estado, solicitante_id, tecnico_id, observaciones, fecha_creacion
    """,
        payload.titulo.strip(),
        payload.descripcion,
        "Gerencia Nacional de Tecnologias de la informacion y la comunicacion",
        (payload.prioridad or "media").lower(),
        user_id,
        observations,
        creator_name,
        creator_dept,
        mapped_priority,
        tenant_id,
    )

    try:
        await _ensure_security_events_table(conn)
        username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1::uuid", user_id)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'TICKET_CREADO', $4, 'success', '/dashboard?tab=tickets')
            """,
            tenant_id,
            user_id,
            username or "anon",
            f"Ticket #{row['id']} creado | titulo='{row['titulo']}' | area='{row['area']}' | prioridad='{row['prioridad']}'",
        )
    except Exception:
        pass
    try:
        username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1::uuid", user_id)
        await _log_ticket_event(
            conn,
            int(row["id"]),
            tenant_id,
            user_id,
            username or "anon",
            "CREATED",
            old_status=None,
            new_status="abierto",
            observaciones=observations,
            details=f"Ticket creado: {row['titulo']}",
        )
    except Exception:
        pass

    # NUEVA LÓGICA DE TELEMETRÍA (Fase 1: Instrumentación de Tickets)
    try:
        # Resolver gerencia_id de forma segura
        gerencia_id = current_user.get("gerencia_id")
        if gerencia_id is None:
            gerencia_id = await conn.fetchval(
                "SELECT gerencia_id FROM profiles WHERE id = $1::uuid", 
                user_id
            )
        if gerencia_id is None:
            tenant_id_val = current_user.get("tenant_id")
            gerencia_id = await conn.fetchval(
                "SELECT id FROM gerencias WHERE tenant_id = $1::uuid LIMIT 1",
                uuid.UUID(tenant_id_val) if tenant_id_val else None
            )
        if gerencia_id is None:
            gerencia_id = 1

        telemetry_event = KodaEventInternal(
            event_type="ticket.creado",
            aggregate_type=AggregateType.ticket,
            aggregate_id=str(row["id"]),
            gerencia_id=gerencia_id,
            actor_id=uuid.UUID(user_id) if user_id else None,
            tenant_id=uuid.UUID(tenant_id) if tenant_id else None,
            payload={
                "titulo": row["titulo"],
                "prioridad": row["prioridad"],
                "estado": row["estado"],
                "area": row["area"]
            },
            severity=EventSeverity.info
        )
        await event_buffer.enqueue(telemetry_event)
    except Exception as tel_err:
        logger.error(f"Fallo al registrar evento de telemetría para ticket {row.get('id') if row else 'unknown'}: {tel_err}")

    return dict(row)


@app.put("/tickets/{ticket_id}", dependencies=[Depends(get_tenant_context)])
async def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        await _ensure_tickets_schema(conn)
        user_id = current_user.get("sub")
        role = current_user.get("role")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalido")
        role_norm = _normalize_text(role)
        is_dev = role_norm in {"desarrollador", "dev", "developer"}
        is_admin = role_norm in {"administrativo", "admin", "administrador"}
        is_ceo = role_norm == "ceo"

        current_row = await conn.fetchrow("SELECT solicitante_id, titulo, prioridad FROM tickets WHERE id = $1", ticket_id)
        owner_id = current_row["solicitante_id"] if current_row else None
        if not owner_id:
            raise HTTPException(status_code=404, detail="Ticket no encontrado")
        if is_ceo:
            raise HTTPException(status_code=403, detail="CEO solo tiene acceso de lectura")
        if str(owner_id) != str(user_id) and not (is_admin or is_dev):
            raise HTTPException(status_code=403, detail="No autorizado para editar este ticket")

        is_tech = await _is_tech_user(conn, user_id)
        can_manage_ticket = is_dev or is_admin or is_tech
        tenant_id = current_user.get("tenant_id")
        next_priority = payload.prioridad if can_manage_ticket else None
        username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1::uuid", user_id)
        obs_value = _clean_observation(payload.observaciones) if can_manage_ticket else None

        updated = await conn.fetchrow("""
            UPDATE tickets
            SET
                titulo = COALESCE($2, titulo),
                descripcion = COALESCE($3, descripcion),
                prioridad = COALESCE($4, prioridad),
                observaciones = CASE
                WHEN $6::boolean = TRUE AND $5::text IS NOT NULL AND BTRIM($5::text) <> '' THEN
                    COALESCE(observaciones, '') ||
                    CASE WHEN COALESCE(observaciones, '') = '' THEN '' ELSE E'\n' END ||
                    '[' || to_char(NOW(), 'DD/MM/YYYY HH24:MI') || '] ' ||
                    COALESCE($7::text, 'tecnico') || ': ' || $5::text
                    ELSE observaciones
                END
            WHERE id = $1
            RETURNING id, titulo, descripcion, area, prioridad, estado, solicitante_id, tecnico_id, observaciones, fecha_creacion
        """, ticket_id, payload.titulo, payload.descripcion, next_priority, obs_value, can_manage_ticket, username)

        try:
            await _ensure_security_events_table(conn)
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'TICKET_EDITADO', $4, 'info', '/dashboard?tab=tickets')
                """,
                tenant_id,
                user_id,
                username or "anon",
                f"Ticket #{updated['id']} editado | titulo='{updated['titulo']}' | prioridad='{updated['prioridad']}'",
            )
        except Exception:
            pass
        try:
            await _log_ticket_event(
                conn,
                int(updated["id"]),
                tenant_id,
                user_id,
                username or "anon",
                "UPDATED",
                old_status=None,
                new_status=updated["estado"],
                observaciones=obs_value,
                details=f"Ticket editado: '{current_row['titulo']}' -> '{updated['titulo']}' | prioridad '{current_row['prioridad']}' -> '{updated['prioridad']}'",
            )
        except Exception:
            pass

        return dict(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en update_ticket")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/tickets/{ticket_id}/estado", dependencies=[Depends(get_tenant_context)])
async def update_ticket_status(
    ticket_id: int,
    payload: TicketStatusUpdate,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    try:
        await _ensure_tickets_schema(conn)
        user_id = current_user.get("sub")
        role = current_user.get("role")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalido")

        role_norm = _normalize_text(role)
        is_dev = role_norm in {"desarrollador", "dev", "developer"}
        is_admin = role_norm in {"administrativo", "admin", "administrador"}
        is_ceo = role_norm == "ceo"

        current = await conn.fetchrow("SELECT id, estado, solicitante_id FROM tickets WHERE id = $1", ticket_id)
        if not current:
            raise HTTPException(status_code=404, detail="Ticket no encontrado")

        next_status = _normalize_text(payload.estado).replace(" ", "-")
        if next_status not in {"abierto", "en-proceso", "resuelto"}:
            raise HTTPException(status_code=400, detail="Estado invalido")

        is_tech = await _is_tech_user(conn, user_id)
        can_manage_ticket = is_dev or is_admin or is_tech
        if is_ceo:
            raise HTTPException(status_code=403, detail="CEO solo tiene acceso de lectura")
        if not can_manage_ticket:
            raise HTTPException(status_code=403, detail="No autorizado para cambiar este ticket")
        if payload.observaciones and not can_manage_ticket:
            raise HTTPException(status_code=403, detail="No autorizado para registrar observaciones")

        tecnico_id = user_id if next_status in {"en-proceso", "resuelto"} else None
        tenant_id = current_user.get("tenant_id")
        username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1::uuid", user_id)
        obs_value = _clean_observation(payload.observaciones) if can_manage_ticket else None
        updated = await conn.fetchrow("""
            UPDATE tickets
            SET
                estado = $2,
                tecnico_id = CASE WHEN $3::uuid IS NULL THEN tecnico_id ELSE $3::uuid END,
                observaciones = CASE
                WHEN $4::text IS NOT NULL AND BTRIM($4::text) <> '' THEN
                    COALESCE(observaciones, '') ||
                    CASE WHEN COALESCE(observaciones, '') = '' THEN '' ELSE E'\n' END ||
                    '[' || to_char(NOW(), 'DD/MM/YYYY HH24:MI') || '] ' ||
                    COALESCE($5::text, 'tecnico') || ': ' || $4::text
                    ELSE observaciones
                END
            WHERE id = $1
            RETURNING id, titulo, descripcion, area, prioridad, estado, solicitante_id, tecnico_id, observaciones, fecha_creacion
        """, ticket_id, next_status, tecnico_id, obs_value, username)

        try:
            await _ensure_security_events_table(conn)
            await conn.execute(
                """
                INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
                VALUES ($1::uuid, $2::uuid, $3, 'TICKET_ESTADO_ACTUALIZADO', $4, 'info', '/dashboard?tab=tickets')
                """,
                tenant_id,
                user_id,
                username or "anon",
                f"Ticket #{updated['id']} cambio a estado='{updated['estado']}' | tecnico='{updated['tecnico_id']}'",
            )
        except Exception:
            pass
        try:
            await _log_ticket_event(
                conn,
                int(updated["id"]),
                tenant_id,
                user_id,
                username or "anon",
                "STATUS_CHANGED",
                old_status=current["estado"],
                new_status=updated["estado"],
                observaciones=obs_value,
                details=f"Cambio de estado de '{current['estado']}' a '{updated['estado']}'",
            )
        except Exception:
            pass

        # NUEVA LÓGICA DE TELEMETRÍA (Fase 1: Instrumentación de Tickets)
        try:
            # Resolver gerencia_id de forma segura
            gerencia_id = current_user.get("gerencia_id")
            if gerencia_id is None:
                gerencia_id = await conn.fetchval(
                    "SELECT gerencia_id FROM profiles WHERE id = $1::uuid", 
                    user_id
                )
            if gerencia_id is None:
                tenant_id_val = current_user.get("tenant_id")
                gerencia_id = await conn.fetchval(
                    "SELECT id FROM gerencias WHERE tenant_id = $1::uuid LIMIT 1",
                    uuid.UUID(tenant_id_val) if tenant_id_val else None
                )
            if gerencia_id is None:
                gerencia_id = 1

            # Determinar tipo de evento
            if updated["estado"] == "en-proceso":
                evt_type = "ticket.asignado"
            elif updated["estado"] == "resuelto":
                evt_type = "ticket.cerrado"
            else:
                evt_type = "ticket.estado_cambiado"

            telemetry_event = KodaEventInternal(
                event_type=evt_type,
                aggregate_type=AggregateType.ticket,
                aggregate_id=str(updated["id"]),
                gerencia_id=gerencia_id,
                actor_id=uuid.UUID(user_id) if user_id else None,
                tenant_id=uuid.UUID(tenant_id) if tenant_id else None,
                payload={
                    "campo": "estado",
                    "valor_anterior": current["estado"],
                    "valor_nuevo": updated["estado"],
                    "tecnico_id": str(updated["tecnico_id"]) if updated["tecnico_id"] else None,
                    "prioridad": updated["prioridad"],
                    "observaciones": obs_value
                },
                severity=EventSeverity.info
            )
            await event_buffer.enqueue(telemetry_event)
        except Exception as tel_err:
            logger.error(f"Fallo al registrar evento de telemetría para ticket {updated.get('id') if updated else 'unknown'}: {tel_err}")

        return dict(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en update_ticket_status")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/tickets/{ticket_id}", dependencies=[Depends(get_tenant_context)])
async def delete_ticket(
    ticket_id: int,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    await _ensure_tickets_schema(conn)
    user_id = current_user.get("sub")
    role = current_user.get("role")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalido")
    role_norm = _normalize_text(role)
    is_dev = role_norm in {"desarrollador", "dev", "developer"}
    is_admin = role_norm in {"administrativo", "admin", "administrador"}
    is_ceo = role_norm == "ceo"
    is_tech = await _is_tech_user(conn, user_id)

    owner_id = await conn.fetchval("SELECT solicitante_id FROM tickets WHERE id = $1", ticket_id)
    if not owner_id:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if str(owner_id) != str(user_id) and not (is_admin or is_dev or is_ceo or is_tech):
        raise HTTPException(status_code=403, detail="No autorizado para eliminar este ticket")

    tenant_id = current_user.get("tenant_id")
    username = await conn.fetchval("SELECT username FROM profiles WHERE id = $1::uuid", user_id)
    deleted = await conn.fetchrow(
        """
        UPDATE tickets
        SET
            estado = 'eliminado',
            observaciones = COALESCE(observaciones, '') || CASE
                WHEN COALESCE(observaciones, '') = '' THEN ''
                ELSE E'\n'
            END || 'Eliminado por ' || COALESCE($2, 'usuario') || ' el ' || to_char(NOW(), 'DD/MM/YYYY HH24:MI')
        WHERE id = $1
        RETURNING id, titulo, estado
        """,
        ticket_id,
        username or "usuario",
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    try:
        await _ensure_security_events_table(conn)
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page)
            VALUES ($1::uuid, $2::uuid, $3, 'TICKET_ELIMINADO', $4, 'warning', '/dashboard?tab=tickets')
            """,
            tenant_id,
            user_id,
            username or "anon",
            f"Ticket #{ticket_id} eliminado",
        )
    except Exception:
        pass
    try:
        await _log_ticket_event(
            conn,
            int(ticket_id),
            tenant_id,
            user_id,
            username or "anon",
            "DELETED",
            old_status=None,
            new_status="eliminado",
            observaciones=None,
            details=f"Ticket eliminado: {deleted['titulo']}",
        )
    except Exception:
        pass
    return {"status": "success"}



# ===================================================================
# HOJAS DE RUTA
# ===================================================================

class HojaDeRutaPayload(BaseModel):
    asunto: str
    fecha_limite: str          # ISO datetime string
    acciones: List[str] = []
    coordinaciones: List[str] = []
    destinatario_id: Optional[str] = None
    destinatario_nombre: Optional[str] = None


class UpdateHojaEstadoPayload(BaseModel):
    estado: str
    observaciones_resolucion: Optional[str] = None


@app.post("/hojas-de-ruta")
async def create_hoja_de_ruta(
    payload: HojaDeRutaPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    tenant_id = current_user.get("tenant_id")
    nombre = current_user.get("nombre", "")
    apellido = current_user.get("apellido", "")
    remitente_nombre = f"{nombre} {apellido}".strip() or current_user.get("username", "")

    # Parsear fecha_limite como timestamptz
    try:
        from dateutil import parser as dateparser
        fecha_limite_dt = dateparser.parse(payload.fecha_limite)
    except Exception:
        raise HTTPException(status_code=422, detail="Formato de fecha inválido")

    row = await conn.fetchrow(
        """
        INSERT INTO hojas_de_ruta
            (asunto, fecha_limite, acciones, coordinaciones, remitente_id, remitente_nombre,
             destinatario_id, destinatario_nombre, tenant_id)
        VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::uuid, $8, $9::uuid)
        RETURNING id, asunto, fecha_limite, acciones, coordinaciones, remitente_id, remitente_nombre,
                  destinatario_id, destinatario_nombre, tenant_id, created_at,
                  estado, completado_at, observaciones_resolucion
        """,
        payload.asunto,
        fecha_limite_dt,
        payload.acciones,
        payload.coordinaciones,
        user_id,
        remitente_nombre,
        payload.destinatario_id,
        payload.destinatario_nombre,
        tenant_id,
    )
    result = dict(row)
    for k, v in result.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif not isinstance(v, (str, int, float, bool, list, type(None))):
            result[k] = str(v)
    return result


@app.get("/hojas-de-ruta")
async def get_hojas_de_ruta(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    tenant_id = current_user.get("tenant_id")

    # Todos los usuarios del tenant ven todas las hojas de ruta
    # (las coordinaciones son unidades organizativas, no usuarios específicos)
    rows = await conn.fetch(
        """
        SELECT id, asunto, fecha_limite, acciones, coordinaciones, remitente_id, remitente_nombre,
               destinatario_id, destinatario_nombre, tenant_id, created_at,
               estado, completado_at, observaciones_resolucion
        FROM hojas_de_ruta
        WHERE (tenant_id = $1::uuid OR $1::uuid IS NULL)
        ORDER BY created_at DESC
        """,
        tenant_id,
    )

    result = []
    for r in rows:
        item = dict(r)
        # Serializar UUID y datetime a string
        for k, v in item.items():
            if hasattr(v, "isoformat"):
                item[k] = v.isoformat()
            elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, list, type(None))):
                item[k] = str(v)
        result.append(item)
    return result


@app.put("/hojas-de-ruta/{hoja_id}/estado")
async def update_hoja_de_ruta_estado(
    hoja_id: str,
    payload: UpdateHojaEstadoPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    tenant_id = current_user.get("tenant_id")

    # Obtener la hoja de ruta
    row = await conn.fetchrow(
        "SELECT tenant_id, remitente_id, destinatario_id, estado FROM hojas_de_ruta WHERE id = $1::uuid",
        hoja_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Hoja de ruta no encontrada")

    hoja = dict(row)
    # Verificar multi-tenant isolation
    if str(hoja["tenant_id"]) != str(tenant_id):
        raise HTTPException(status_code=403, detail="Acceso denegado")

    new_estado = payload.estado.lower()
    if new_estado not in {"pendiente", "completada", "revisada"}:
        raise HTTPException(status_code=400, detail="Estado inválido")

    # Validar permisos para cambiar de estado
    if new_estado == "revisada":
        # Solo el remitente (creador) o un usuario con rol de gerencia/admin/ceo puede marcar como revisada
        role = _normalize_text(current_user.get("role", ""))
        is_privileged = role in {"ceo", "administrativo", "admin", "gerente", "desarrollador", "dev"}
        is_creator = str(hoja["remitente_id"]) == str(user_id)
        if not (is_creator or is_privileged):
            raise HTTPException(status_code=403, detail="No tiene permisos para marcar esta tarea como revisada")

    # Actualizar estado en DB
    if new_estado == "completada":
        updated_row = await conn.fetchrow(
            """
            UPDATE hojas_de_ruta
            SET estado = $1,
                completado_at = NOW(),
                observaciones_resolucion = $2
            WHERE id = $3::uuid
            RETURNING id, estado, completado_at, observaciones_resolucion
            """,
            new_estado,
            payload.observaciones_resolucion,
            hoja_id
        )
    else:
        completado_at_val = None
        if new_estado == "revisada":
            updated_row = await conn.fetchrow(
                """
                UPDATE hojas_de_ruta
                SET estado = $1
                WHERE id = $2::uuid
                RETURNING id, estado, completado_at, observaciones_resolucion
                """,
                new_estado,
                hoja_id
            )
        else:
            updated_row = await conn.fetchrow(
                """
                UPDATE hojas_de_ruta
                SET estado = $1,
                    completado_at = NULL,
                    observaciones_resolucion = NULL
                WHERE id = $2::uuid
                RETURNING id, estado, completado_at, observaciones_resolucion
                """,
                new_estado,
                hoja_id
            )

    result = dict(updated_row)
    for k, v in result.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif not isinstance(v, (str, int, float, bool, list, type(None))):
            result[k] = str(v)
    return result


@app.delete("/hojas-de-ruta/{hoja_id}")
async def delete_hoja_de_ruta(
    hoja_id: str,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    role = _normalize_text(current_user.get("role", ""))
    is_privileged = role in {"ceo", "administrativo", "admin", "gerente", "desarrollador", "dev"}

    if is_privileged:
        deleted = await conn.fetchval(
            "DELETE FROM hojas_de_ruta WHERE id = $1::uuid RETURNING id", hoja_id
        )
    else:
        deleted = await conn.fetchval(
            "DELETE FROM hojas_de_ruta WHERE id = $1::uuid AND remitente_id = $2::uuid RETURNING id",
            hoja_id,
            user_id,
        )

    if not deleted:
        raise HTTPException(status_code=404, detail="Hoja de ruta no encontrada o sin permiso")
    return {"status": "deleted", "id": hoja_id}


# ── NUEVOS ENDPOINTS: AUTENTICACIÓN MFA Y REFRESH TOKEN (FASE 3) ─────────────

class MFAVerifyPayload(BaseModel):
    mfa_token: str
    code: str

@app.post("/api/auth/mfa/verify")
@app.post("/auth/mfa/verify")
async def verify_mfa_login(
    payload: MFAVerifyPayload,
    request: Request,
    conn = Depends(get_db_connection)
):
    try:
        token_payload = jwt.decode(payload.mfa_token, os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET), algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="Token MFA inválido o expirado")

    if not token_payload.get("mfa_required") or not token_payload.get("sub"):
        raise HTTPException(status_code=401, detail="Token MFA inválido o expirado")

    user_id = token_payload.get("sub")

    user = await conn.fetchrow(
        """
        SELECT p.id, p.username, p.nombre, p.apellido, p.email, p.rol_id, r.nombre_rol, p.tenant_id,
               p.permisos, p.gerencia_id, g.nombre as gerencia_nombre, p.totp_secret, p.mfa_enabled
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        LEFT JOIN gerencias g ON p.gerencia_id = g.id
        WHERE p.id = $1::uuid AND p.estado = TRUE
        """,
        uuid.UUID(user_id)
    )

    if not user or not user["mfa_enabled"] or not user["totp_secret"]:
        raise HTTPException(status_code=400, detail="MFA no habilitado para este usuario")

    if not verify_totp(user["totp_secret"], payload.code):
        client_ip = _extract_client_ip(request)
        await _log_security_event(
            conn,
            tenant_id=user["tenant_id"],
            user_id=user["id"],
            username=user["username"],
            evento="LOGIN_MFA_FALLIDO",
            detalles="Código MFA incorrecto",
            estado="warning",
            page="/auth/mfa/verify",
            ip_origen=client_ip,
            gerencia_id=user["gerencia_id"]
        )
        raise HTTPException(status_code=401, detail="Código MFA inválido")

    access_token = create_access_token(
        data={
            "sub": str(user['id']),
            "role": user['nombre_rol'],
            "tenant_id": str(user['tenant_id']) if user['tenant_id'] else None,
            "gerencia_id": user['gerencia_id'],
            "username": user["username"],
            "email": user["email"],
        }
    )

    refresh_token = await create_refresh_token(
        user_id=str(user["id"]),
        metadata={
            "role": user["nombre_rol"],
            "tenant_id": str(user["tenant_id"]) if user["tenant_id"] else None,
            "gerencia_id": user["gerencia_id"],
            "username": user["username"],
            "email": user["email"],
        }
    )

    await conn.execute("UPDATE profiles SET ultima_conexion = NOW() WHERE id = $1", user['id'])

    username_norm = user["username"].lower()
    await conn.execute("DELETE FROM login_lockouts WHERE username = $1", username_norm)

    client_ip = _extract_client_ip(request)
    await _log_security_event(
        conn,
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        username=user["username"],
        evento="LOGIN_MFA_OK",
        detalles="Inicio de sesión verificado con MFA",
        estado="success",
        page="/auth/mfa/verify",
        ip_origen=client_ip,
        gerencia_id=user["gerencia_id"]
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user['id']),
            "username": user['username'],
            "nombre": user['nombre'],
            "apellido": user['apellido'],
            "email": user['email'],
            "role": user['nombre_rol'],
            "tenant_id": user['tenant_id'],
            "gerencia_id": user['gerencia_id'],
            "gerencia_depto": user['gerencia_nombre'],
            "permissions": _parse_permissions(user['permisos']),
        }
    }

@app.get("/api/auth/mfa/setup")
async def setup_mfa(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id = current_user.get("sub")
    user = await conn.fetchrow("SELECT username, email FROM profiles WHERE id = $1::uuid", uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    secret = generate_totp_secret()
    app_name = "KodaERP"
    label = f"{app_name}:{user['email'] or user['username']}"
    otpauth_url = f"otpauth://totp/{label}?secret={secret}&issuer={app_name}"

    await conn.execute("UPDATE public.profiles SET totp_secret = $1 WHERE id = $2::uuid", secret, uuid.UUID(user_id))

    return {
        "secret": secret,
        "otpauth_url": otpauth_url
    }

class MFAConfirmPayload(BaseModel):
    code: str

@app.post("/api/auth/mfa/enable")
async def enable_mfa(
    payload: MFAConfirmPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id = current_user.get("sub")
    user = await conn.fetchrow("SELECT totp_secret FROM profiles WHERE id = $1::uuid", uuid.UUID(user_id))
    if not user or not user["totp_secret"]:
        raise HTTPException(status_code=400, detail="MFA no iniciado. Llame a /setup primero.")

    if not verify_totp(user["totp_secret"], payload.code):
        raise HTTPException(status_code=400, detail="Código de verificación incorrecto")

    await conn.execute(
        "UPDATE public.profiles SET mfa_enabled = TRUE WHERE id = $1::uuid",
        uuid.UUID(user_id)
    )

    return {"status": "ok", "message": "MFA habilitado exitosamente"}

@app.post("/api/auth/mfa/disable")
async def disable_mfa(
    payload: MFAConfirmPayload,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id = current_user.get("sub")
    user = await conn.fetchrow("SELECT totp_secret, mfa_enabled FROM public.profiles WHERE id = $1::uuid", uuid.UUID(user_id))
    if not user or not user["mfa_enabled"]:
        raise HTTPException(status_code=400, detail="MFA no está habilitado")

    if not verify_totp(user["totp_secret"], payload.code):
        raise HTTPException(status_code=400, detail="Código de verificación incorrecto")

    await conn.execute(
        "UPDATE public.profiles SET mfa_enabled = FALSE, totp_secret = NULL WHERE id = $1::uuid",
        uuid.UUID(user_id)
    )

    return {"status": "ok", "message": "MFA deshabilitado exitosamente"}

class RefreshTokenPayload(BaseModel):
    refresh_token: str

@app.post("/api/auth/refresh")
@app.post("/auth/refresh")
async def refresh_tokens(
    payload: RefreshTokenPayload,
    conn = Depends(get_db_connection)
):
    session_data = await verify_refresh_token(payload.refresh_token)
    if not session_data:
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")

    user_id = session_data.get("user_id")
    metadata = session_data.get("metadata")

    user = await conn.fetchrow(
        """
        SELECT p.id, p.username, p.nombre, p.apellido, p.email, p.rol_id, r.nombre_rol, p.tenant_id, p.estado
        FROM profiles p
        LEFT JOIN roles r ON p.rol_id = r.id
        WHERE p.id = $1::uuid AND p.estado = TRUE
        """,
        uuid.UUID(user_id)
    )

    if not user:
        raise HTTPException(status_code=401, detail="Usuario inactivo o no encontrado")

    role_norm = user["nombre_rol"].lower().strip() if user["nombre_rol"] else ""
    is_dev = role_norm in {"desarrollador", "dev", "developer"}
    expires = timedelta(hours=12) if is_dev else None
    new_access_token = create_access_token(
        data={
            "sub": str(user['id']),
            "role": user['nombre_rol'],
            "tenant_id": str(user['tenant_id']) if user['tenant_id'] else None,
            "gerencia_id": metadata.get("gerencia_id"),
            "username": user["username"],
            "email": user["email"],
        },
        expires_delta=expires
    )

    await revoke_refresh_token(payload.refresh_token)

    new_refresh_token = await create_refresh_token(
        user_id=str(user["id"]),
        metadata=metadata
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

