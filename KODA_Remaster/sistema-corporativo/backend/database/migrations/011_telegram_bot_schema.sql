-- =============================================================================
-- KODA ERP — MIGRATION: 011_TELEGRAM_BOT_SCHEMA
-- Objetivo: Estructura de base de datos para el bot de Telegram multi-tenant.
--           Implementa aislamiento estricto por tenant_id mediante RLS y RBAC.
-- =============================================================================

BEGIN;

-- Habilitar extensión pgcrypto si no está habilitada
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Insertar roles requeridos si no existen en la tabla roles
INSERT INTO public.roles (nombre_rol) 
VALUES ('Administrator'), ('Administrative Master') 
ON CONFLICT (nombre_rol) DO NOTHING;

-- =============================================================================
-- TABLA: telegram_sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.telegram_sessions (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    telegram_chat_id    BIGINT          NOT NULL,
    user_id             UUID            NOT NULL,
    tenant_id           UUID            NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_telegram_sessions PRIMARY KEY (id),
    CONSTRAINT uq_telegram_sessions_chat_id UNIQUE (telegram_chat_id),
    CONSTRAINT fk_telegram_sessions_user 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_telegram_sessions_tenant 
        FOREIGN KEY (tenant_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Índices compuestos para optimizar búsquedas por tenant y chat
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_tenant_chat 
    ON public.telegram_sessions(tenant_id, telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_user 
    ON public.telegram_sessions(user_id);

-- =============================================================================
-- TABLA: bot_commands
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bot_commands (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL,
    trigger_command     VARCHAR(255)    NOT NULL,
    response_text       TEXT            NOT NULL,
    internal_action     VARCHAR(255),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_bot_commands PRIMARY KEY (id),
    CONSTRAINT fk_bot_commands_tenant 
        FOREIGN KEY (tenant_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Evitar comandos duplicados idénticos dentro del mismo tenant
    CONSTRAINT uq_bot_commands_tenant_trigger UNIQUE (tenant_id, trigger_command)
);

-- Índices compuestos para optimizar búsquedas de comandos por tenant
CREATE INDEX IF NOT EXISTS idx_bot_commands_tenant_trigger 
    ON public.bot_commands(tenant_id, trigger_command) WHERE is_active = TRUE;

-- Función para actualizar el campo updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para mantener actualizado updated_at automáticamente
DROP TRIGGER IF EXISTS trg_bot_commands_updated_at ON public.bot_commands;
CREATE TRIGGER trg_bot_commands_updated_at
    BEFORE UPDATE ON public.bot_commands
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- FUNCIONES AUXILIARES PARA SEGURIDAD (RLS / RBAC)
-- =============================================================================

-- Obtener el tenant actual de la sesión (soporta app.current_tenant y app.current_tenant_id)
CREATE OR REPLACE FUNCTION public.get_telegram_session_tenant_id() RETURNS UUID AS $$
DECLARE
    t_id TEXT;
BEGIN
    t_id := NULLIF(current_setting('app.current_tenant', true), '');
    IF t_id IS NULL THEN
        t_id := NULLIF(current_setting('app.current_tenant_id', true), '');
    END IF;
    RETURN t_id::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Obtener el user_id actual de la sesión (soporta request.jwt.claim.sub y app.current_user_id)
CREATE OR REPLACE FUNCTION public.get_telegram_user_id() RETURNS UUID AS $$
DECLARE
    u_id TEXT;
BEGIN
    u_id := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF u_id IS NULL THEN
        u_id := NULLIF(current_setting('app.current_user_id', true), '');
    END IF;
    RETURN u_id::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si el usuario tiene el rol 'Administrator'
CREATE OR REPLACE FUNCTION public.is_bot_administrator(p_user_id UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.roles r ON p.rol_id = r.id
        WHERE p.id = p_user_id AND r.nombre_rol = 'Administrator'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si el usuario tiene el rol 'Administrative Master'
CREATE OR REPLACE FUNCTION public.is_bot_admin_master(p_user_id UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.roles r ON p.rol_id = r.id
        WHERE p.id = p_user_id AND r.nombre_rol = 'Administrative Master'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para establecer y validar el tenant_id de forma segura al insertar
CREATE OR REPLACE FUNCTION public.set_telegram_tenant_id_from_session() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := public.get_telegram_session_tenant_id();
    END IF;
    
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Security Error: tenant_id is required but was not found in session context (app.current_tenant).';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_tenant_id_telegram_sessions ON public.telegram_sessions;
CREATE TRIGGER trg_set_tenant_id_telegram_sessions
    BEFORE INSERT ON public.telegram_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_telegram_tenant_id_from_session();

DROP TRIGGER IF EXISTS trg_set_tenant_id_bot_commands ON public.bot_commands;
CREATE TRIGGER trg_set_tenant_id_bot_commands
    BEFORE INSERT ON public.bot_commands
    FOR EACH ROW
    EXECUTE FUNCTION public.set_telegram_tenant_id_from_session();

-- =============================================================================
-- CONFIGURACIÓN DE POLÍTICAS DE ROW-LEVEL SECURITY (RLS)
-- =============================================================================

-- 1. Habilitar y forzar RLS en ambas tablas
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.bot_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_commands FORCE ROW LEVEL SECURITY;

-- 2. Políticas para 'telegram_sessions'
DROP POLICY IF EXISTS "telegram_sessions_tenant_isolation" ON public.telegram_sessions;
CREATE POLICY "telegram_sessions_tenant_isolation" ON public.telegram_sessions
    FOR ALL
    USING (tenant_id = public.get_telegram_session_tenant_id())
    WITH CHECK (tenant_id = public.get_telegram_session_tenant_id());

-- 3. Políticas para 'bot_commands' (REGLAS ESTRICTAS DE ROLES)

-- SELECT (Lectura)
-- - Administrator: lectura de comandos de su tenant_id
-- - Administrative Master: permisos globales de lectura sin restricciones de tenant
DROP POLICY IF EXISTS "bot_commands_select_policy" ON public.bot_commands;
CREATE POLICY "bot_commands_select_policy" ON public.bot_commands
    FOR SELECT
    USING (
        (public.is_bot_administrator(public.get_telegram_user_id()) AND tenant_id = public.get_telegram_session_tenant_id())
        OR
        public.is_bot_admin_master(public.get_telegram_user_id())
    );

-- INSERT (Creación)
-- - Administrator: creación solo para su tenant_id
-- - Administrative Master: denegado (no se define política para este rol)
DROP POLICY IF EXISTS "bot_commands_insert_policy" ON public.bot_commands;
CREATE POLICY "bot_commands_insert_policy" ON public.bot_commands
    FOR INSERT
    WITH CHECK (
        public.is_bot_administrator(public.get_telegram_user_id()) 
        AND tenant_id = public.get_telegram_session_tenant_id()
    );

-- UPDATE (Modificación)
-- - Administrator: edición solo para su tenant_id
-- - Administrative Master: denegado
DROP POLICY IF EXISTS "bot_commands_update_policy" ON public.bot_commands;
CREATE POLICY "bot_commands_update_policy" ON public.bot_commands
    FOR UPDATE
    USING (
        public.is_bot_administrator(public.get_telegram_user_id()) 
        AND tenant_id = public.get_telegram_session_tenant_id()
    )
    WITH CHECK (
        public.is_bot_administrator(public.get_telegram_user_id()) 
        AND tenant_id = public.get_telegram_session_tenant_id()
    );

-- DELETE (Eliminación)
-- - Administrator: borrado solo de su tenant_id
-- - Administrative Master: denegado
DROP POLICY IF EXISTS "bot_commands_delete_policy" ON public.bot_commands;
CREATE POLICY "bot_commands_delete_policy" ON public.bot_commands
    FOR DELETE
    USING (
        public.is_bot_administrator(public.get_telegram_user_id()) 
        AND tenant_id = public.get_telegram_session_tenant_id()
    );

-- =============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN (pg_catalog)
-- =============================================================================
COMMENT ON TABLE public.telegram_sessions IS 'Sesiones activas de usuarios del bot de Telegram mapeadas por tenant.';
COMMENT ON TABLE public.bot_commands IS 'Comandos del bot de Telegram configurables por tenant con control RLS.';
COMMENT ON COLUMN public.bot_commands.internal_action IS 'Mapeo opcional a funciones backend disparadas por el bot.';

COMMIT;
