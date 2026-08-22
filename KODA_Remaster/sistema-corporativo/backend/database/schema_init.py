"""
database/schema_init.py — Inicialización centralizada de tablas base e índices.

Separa la definición y actualización del esquema SQL fuera de main.py,
permitiendo que el arranque del servidor FastAPI sea limpio, rápido y trazable.
"""
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("sistema_corporativo.schema_init")

async def initialize_core_schema(conn: Any) -> None:
    """Ejecuta las definiciones esenciales DDL en PostgreSQL/Supabase."""
    logger.info("Verificando/Inicializando esquema de base de datos...")

    # Extensiones
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except Exception as e:
        logger.debug(f"Extension vector ya disponible o no permitida: {e}")

    # Tablas Base Esenciales
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS bot_knowledge (
            id BIGSERIAL PRIMARY KEY,
            question TEXT NOT NULL UNIQUE,
            answer TEXT NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

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
        );

        CREATE TABLE IF NOT EXISTS login_lockouts (
            username TEXT NOT NULL,
            ip_address TEXT NOT NULL DEFAULT 'unknown',
            failed_count INT NOT NULL DEFAULT 0,
            locked_until TIMESTAMPTZ,
            PRIMARY KEY (username, ip_address)
        );

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
        );

        CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            nombre_rol TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS organizations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nombre TEXT,
            config JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS gerencias (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            siglas TEXT,
            categoria TEXT,
            tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            CONSTRAINT gerencias_nombre_tenant_unique UNIQUE (nombre, tenant_id)
        );

        CREATE TABLE IF NOT EXISTS provisioning_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            token_hash VARCHAR(255) NOT NULL,
            max_users INT NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            is_used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

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
        );

        CREATE TABLE IF NOT EXISTS user_organizations (
            user_id UUID NOT NULL,
            organization_id UUID NOT NULL,
            role TEXT DEFAULT 'member',
            PRIMARY KEY (user_id, organization_id)
        );

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
        );

        CREATE TABLE IF NOT EXISTS documento_adjuntos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
            url_archivo TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

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
        );

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
        );

        CREATE TABLE IF NOT EXISTS bcv_rates (
            id SERIAL PRIMARY KEY,
            currency TEXT NOT NULL UNIQUE,
            rate NUMERIC(18, 6) NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            source TEXT DEFAULT 'pyBCV'
        );
    """)

    # Inserción de Roles Canónicos
    await conn.execute("""
        INSERT INTO roles (id, nombre_rol) VALUES
            (1, 'CEO'), (2, 'Administrador'), (3, 'Usuario'),
            (4, 'Desarrollador'), (5, 'Gerente')
        ON CONFLICT (id) DO UPDATE SET nombre_rol = EXCLUDED.nombre_rol;
    """)

    # Organización Principal por defecto si la base está vacía
    org_count = await conn.fetchval("SELECT COUNT(*) FROM organizations")
    if org_count == 0:
        await conn.execute("INSERT INTO organizations (nombre) VALUES ('Organización Principal')")

    # Columnas opcionales / migraciones idempotentes rápidas
    safe_alters = [
        "ALTER TABLE bot_knowledge ADD COLUMN IF NOT EXISTS embedding vector(768)",
        "ALTER TABLE login_lockouts ADD COLUMN IF NOT EXISTS ip_address TEXT NOT NULL DEFAULT 'unknown'",
        "CREATE INDEX IF NOT EXISTS idx_login_lockouts_lookup ON login_lockouts (username, ip_address)",
        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS alias_display TEXT",
        "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS coordinaciones TEXT[] DEFAULT '{}'",
        "ALTER TABLE hojas_de_ruta ALTER COLUMN destinatario_id DROP NOT NULL",
        "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente'",
        "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS completado_at TIMESTAMPTZ",
        "ALTER TABLE hojas_de_ruta ADD COLUMN IF NOT EXISTS observaciones_resolucion TEXT",
        "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret TEXT",
        "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE",
    ]

    for stmt in safe_alters:
        try:
            await conn.execute(stmt)
        except Exception:
            pass

    # Aplicar migraciones SQL pendientes si existen
    for mig_filename in ["004_rls_hardening.sql", "011_telegram_bot_schema.sql", "013_fix_bot_administrator_roles.sql"]:
        try:
            migration_path = Path(__file__).parent / "migrations" / mig_filename
            if migration_path.exists():
                sql = migration_path.read_text(encoding="utf-8")
                await conn.execute(sql)
        except Exception as mig_err:
            logger.warning(f"Aviso en migración {mig_filename}: {mig_err}")

    logger.info("✅ Esquema de base de datos inicializado correctamente.")
