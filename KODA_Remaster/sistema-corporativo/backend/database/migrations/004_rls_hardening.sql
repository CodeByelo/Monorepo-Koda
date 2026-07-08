-- =============================================================================
-- MIGRACIÓN: 004_RLS_HARDENING
-- Objetivo: Endurecer RLS en perfiles, tickets, hojas de ruta y adjuntos de documentos.
-- =============================================================================

BEGIN;

-- 1. Asegurar función de tenant actual
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1b. Asegurar función para setear tenant_id
CREATE OR REPLACE FUNCTION set_tenant_id_from_session() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := get_current_tenant_id();
    END IF;
    
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Security Error: tenant_id is required but was not found in session context.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Endurecer RLS en 'profiles'
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_tenant_isolation_select" ON public.profiles;
CREATE POLICY "profiles_tenant_isolation_select" ON public.profiles
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "profiles_tenant_isolation_update" ON public.profiles;
CREATE POLICY "profiles_tenant_isolation_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() AND tenant_id = get_current_tenant_id())
    WITH CHECK (id = auth.uid() AND tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "profiles_tenant_isolation_insert" ON public.profiles;
CREATE POLICY "profiles_tenant_isolation_insert" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid() AND tenant_id = get_current_tenant_id());

-- 3. Endurecer RLS en 'tickets'
-- Agregar columna tenant_id si no existe
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_tenant_isolation_all" ON public.tickets;
CREATE POLICY "tickets_tenant_isolation_all" ON public.tickets
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Trigger para setear automáticamente el tenant_id en tickets
DROP TRIGGER IF EXISTS trg_set_tenant_id_tickets ON public.tickets;
CREATE TRIGGER trg_set_tenant_id_tickets
    BEFORE INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_id_from_session();

-- 4. Endurecer RLS en 'hojas_de_ruta'
ALTER TABLE public.hojas_de_ruta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hojas_de_ruta_tenant_isolation_all" ON public.hojas_de_ruta;
CREATE POLICY "hojas_de_ruta_tenant_isolation_all" ON public.hojas_de_ruta
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Trigger para setear automáticamente el tenant_id en hojas_de_ruta
DROP TRIGGER IF EXISTS trg_set_tenant_id_hojas_de_ruta ON public.hojas_de_ruta;
CREATE TRIGGER trg_set_tenant_id_hojas_de_ruta
    BEFORE INSERT ON public.hojas_de_ruta
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_id_from_session();

-- 5. Endurecer RLS en 'documento_adjuntos' (Aislamiento heredado de documentos)
ALTER TABLE public.documento_adjuntos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documento_adjuntos_tenant_isolation_all" ON public.documento_adjuntos;
CREATE POLICY "documento_adjuntos_tenant_isolation_all" ON public.documento_adjuntos
    FOR ALL TO authenticated
    USING (documento_id IN (SELECT id FROM public.documentos))
    WITH CHECK (documento_id IN (SELECT id FROM public.documentos));

COMMIT;
