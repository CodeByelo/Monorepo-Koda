-- ============================================================
-- KODA ERP — LEDGER INMUTABLE DE EVENTOS CORPORATIVOS
-- Fase 2: Event Sourcing ultra-optimizado (Compatibilidad Corregida)
-- ============================================================

-- 1. Crear ENUM de tipos de agregado si no existen
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'koda_aggregate_type') THEN
        CREATE TYPE koda_aggregate_type AS ENUM (
            'ticket',
            'documento',
            'usuario',
            'gerencia',
            'egreso',
            'contrato',
            'sesion'
        );
    END IF;
END$$;

-- 2. Crear ENUM de severidad de evento si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'koda_event_severity') THEN
        CREATE TYPE koda_event_severity AS ENUM (
            'info',
            'warning',
            'critical',
            'audit'
        );
    END IF;
END$$;

-- ============================================================
-- TABLA PRINCIPAL: Particionada por rango de fecha (CRÍTICO)
-- ============================================================
CREATE TABLE IF NOT EXISTS koda_event_ledger (
    -- Identidad del evento
    event_id        UUID            NOT NULL DEFAULT gen_random_uuid(),
    event_type      TEXT            NOT NULL,           -- 'ticket.creado', 'ticket.asignado', etc.
    event_version   SMALLINT        NOT NULL DEFAULT 1, -- Para evolución del schema del payload

    -- El agregado que fue afectado
    aggregate_type  koda_aggregate_type NOT NULL,
    aggregate_id    TEXT            NOT NULL,           -- Guardado como TEXT para permitir UUIDs y BIGSERIALs (tickets)

    -- Contexto organizacional
    gerencia_id     INTEGER         NOT NULL,           -- Guardado como INTEGER para enlazar con gerencias.id (SERIAL)
    actor_id        UUID,                               -- UUID del usuario que disparó el evento (NULL si fue el sistema)
    tenant_id       UUID            NOT NULL,           -- Para aislamiento multitenant

    -- El hecho (inmutable, nunca se edita)
    payload         JSONB           NOT NULL DEFAULT '{}', -- Datos del evento
    metadata        JSONB           NOT NULL DEFAULT '{}', -- Contexto técnico (ip, user_agent, etc.)

    -- Severidad para filtrado rápido en telemetría
    severity        koda_event_severity NOT NULL DEFAULT 'info',

    -- Temporalidad
    occurred_at     TIMESTAMPTZ     NOT NULL,
    recorded_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Idempotencia: en tablas particionadas la clave única debe incluir la columna de particionamiento
    idempotency_key TEXT,

    CONSTRAINT pk_event_ledger PRIMARY KEY (event_id, occurred_at),
    CONSTRAINT uq_event_ledger_idempotency UNIQUE (idempotency_key, occurred_at)

) PARTITION BY RANGE (occurred_at);


-- ============================================================
-- PARTICIONES INICIALES (Año 2025 y Q1 2026)
-- ============================================================
CREATE TABLE IF NOT EXISTS koda_event_ledger_2025_q1
    PARTITION OF koda_event_ledger
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');

CREATE TABLE IF NOT EXISTS koda_event_ledger_2025_q2
    PARTITION OF koda_event_ledger
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');

CREATE TABLE IF NOT EXISTS koda_event_ledger_2025_q3
    PARTITION OF koda_event_ledger
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');

CREATE TABLE IF NOT EXISTS koda_event_ledger_2025_q4
    PARTITION OF koda_event_ledger
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS koda_event_ledger_2026_q1
    PARTITION OF koda_event_ledger
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');


-- ============================================================
-- ÍNDICES ESTRATÉGICOS (Sin CONCURRENTLY para migración segura)
-- ============================================================

-- [1] BRIN — Para queries de rango temporal
CREATE INDEX IF NOT EXISTS idx_ledger_occurred_brin
    ON koda_event_ledger USING BRIN (occurred_at)
    WITH (pages_per_range = 128);

-- [2] BTREE COMPUESTO — Para el timeline de una entidad específica
CREATE INDEX IF NOT EXISTS idx_ledger_aggregate_timeline
    ON koda_event_ledger (aggregate_id, occurred_at DESC);

-- [3] BTREE COMPUESTO — Para telemetría por gerencia
CREATE INDEX IF NOT EXISTS idx_ledger_gerencia_timeline
    ON koda_event_ledger (gerencia_id, occurred_at DESC, severity);

-- [4] PARCIAL — Para filtrar solo eventos críticos
CREATE INDEX IF NOT EXISTS idx_ledger_critical_events
    ON koda_event_ledger (occurred_at DESC)
    WHERE severity IN ('critical', 'warning');

-- [5] GIN — Para búsquedas dentro del JSONB del payload
CREATE INDEX IF NOT EXISTS idx_ledger_payload_gin
    ON koda_event_ledger USING GIN (payload jsonb_path_ops);

-- [6] Para deduplicación rápida por idempotency_key
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency
    ON koda_event_ledger (idempotency_key, occurred_at)
    WHERE idempotency_key IS NOT NULL;


-- ============================================================
-- INMUTABILIDAD FORZADA A NIVEL DE BASE DE DATOS
-- ============================================================
CREATE OR REPLACE FUNCTION fn_enforce_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'VIOLACIÓN DE INMUTABILIDAD: El Ledger de Koda ERP es de solo escritura. '
        'Operación [%] sobre event_id [%] bloqueada por política de auditoría.',
        TG_OP, OLD.event_id
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Trigger guard
DROP TRIGGER IF EXISTS trg_ledger_immutability_guard ON koda_event_ledger;
CREATE TRIGGER trg_ledger_immutability_guard
    BEFORE UPDATE OR DELETE ON koda_event_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_ledger_immutability();


-- ============================================================
-- CONFIGURACIÓN DE PERMISOS
-- ============================================================
-- Revocar accesos de modificación al usuario/roles públicos y autenticados
-- y permitir únicamente SELECT e INSERT.
DO $$
BEGIN
    -- Manejador por si los roles no existen en la base de datos local
    BEGIN
        REVOKE UPDATE, DELETE, TRUNCATE ON koda_event_ledger FROM authenticated;
        GRANT INSERT, SELECT ON koda_event_ledger TO authenticated;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo configurar permisos para el rol authenticated: %', SQLERRM;
    END;

    BEGIN
        REVOKE UPDATE, DELETE, TRUNCATE ON koda_event_ledger FROM anon;
        GRANT INSERT, SELECT ON koda_event_ledger TO anon;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo configurar permisos para el rol anon: %', SQLERRM;
    END;
END$$;
