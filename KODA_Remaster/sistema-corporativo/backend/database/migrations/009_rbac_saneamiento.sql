-- =============================================================================
-- MIGRACIÓN: 009_RBAC_SANEAMIENTO
-- Objetivo: Restringir acceso directo en base de datos para separar roles.
--           El Administrativo Master (Desarrollador) tiene control total.
--           El Administrador tiene acceso restringido a operaciones.
-- =============================================================================

BEGIN;

-- 1. Definir función para obtener el user_id de la sesión
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Definir función para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION get_current_user_role() RETURNS INTEGER AS $$
DECLARE
    v_uid UUID;
    v_rol INTEGER;
BEGIN
    v_uid := get_current_user_id();
    IF v_uid IS NULL THEN
        v_uid := auth.uid();
    END IF;
    IF v_uid IS NOT NULL THEN
        SELECT rol_id INTO v_rol FROM public.profiles WHERE id = v_uid;
        RETURN v_rol;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Definir función para verificar si es Desarrollador
CREATE OR REPLACE FUNCTION is_desarrollador() RETURNS BOOLEAN AS $$
DECLARE
    v_role_setting TEXT;
BEGIN
    -- Si no hay usuario en la sesión y el usuario actual de DB es postgres (sistema/startup/worker), se permite.
    IF get_current_user_id() IS NULL AND CURRENT_USER = 'postgres' THEN
        RETURN TRUE;
    END IF;

    -- Verificar por variable de contexto de sesión
    BEGIN
        v_role_setting := LOWER(TRIM(current_setting('app.current_user_role', true)));
        IF v_role_setting IN ('desarrollador', 'dev', 'developer') THEN
            RETURN TRUE;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;
    
    -- Verificar por rol en tabla profiles
    IF get_current_user_role() = 4 THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Definir función para verificar si es rol con permisos operativos (CEO, Administrador, Desarrollador)
CREATE OR REPLACE FUNCTION is_authorized_for_operations() RETURNS BOOLEAN AS $$
DECLARE
    v_role INTEGER;
BEGIN
    -- Si no hay usuario en la sesión y el usuario actual de DB es postgres, se permite.
    IF get_current_user_id() IS NULL AND CURRENT_USER = 'postgres' THEN
        RETURN TRUE;
    END IF;

    v_role := get_current_user_role();
    -- Permitir CEO (1), Administrador (2), Desarrollador (4)
    IF v_role IN (1, 2, 4) THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Habilitar y forzar RLS en todas las tablas clave para evitar bypasses del owner
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_announcement FORCE ROW LEVEL SECURITY;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.gerencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gerencias FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.factura_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleados FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recibos_nomina ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recibos_nomina FORCE ROW LEVEL SECURITY;


-- 6. Configurar Políticas de RLS

-- ==========================================
-- TABLA: profiles
-- ==========================================
DROP POLICY IF EXISTS "profiles_tenant_isolation_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_isolation_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_isolation_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- SELECT: Permitido para todos los usuarios autenticados dentro de su tenant
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id());

-- INSERT: Permitido para Desarrollador o auto-registro del usuario
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        (id = auth.uid() OR id = get_current_user_id() OR is_desarrollador())
        AND tenant_id = get_current_tenant_id()
    );

-- UPDATE: Permitido para auto-actualización o Desarrollador
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        (id = auth.uid() OR id = get_current_user_id() OR is_desarrollador())
        AND tenant_id = get_current_tenant_id()
    )
    WITH CHECK (
        (id = auth.uid() OR id = get_current_user_id() OR is_desarrollador())
        AND tenant_id = get_current_tenant_id()
    );

-- DELETE: Solo Desarrollador
CREATE POLICY "profiles_delete_policy" ON public.profiles
    FOR DELETE TO authenticated
    USING (is_desarrollador() AND tenant_id = get_current_tenant_id());


-- ==========================================
-- TABLA: dashboard_announcement
-- ==========================================
DROP POLICY IF EXISTS "dashboard_announcement_select" ON public.dashboard_announcement;
DROP POLICY IF EXISTS "dashboard_announcement_write" ON public.dashboard_announcement;

CREATE POLICY "dashboard_announcement_select" ON public.dashboard_announcement
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "dashboard_announcement_write" ON public.dashboard_announcement
    FOR ALL TO authenticated
    USING (is_desarrollador())
    WITH CHECK (is_desarrollador());


-- ==========================================
-- TABLA: security_events
-- ==========================================
DROP POLICY IF EXISTS "security_events_insert" ON public.security_events;
DROP POLICY IF EXISTS "security_events_select_delete" ON public.security_events;

CREATE POLICY "security_events_insert" ON public.security_events
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "security_events_select_delete" ON public.security_events
    FOR ALL TO authenticated
    USING (is_desarrollador());


-- ==========================================
-- TABLA: organizations
-- ==========================================
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_delete" ON public.organizations;

CREATE POLICY "organizations_select" ON public.organizations
    FOR SELECT TO authenticated
    USING (id = get_current_tenant_id());

CREATE POLICY "organizations_update" ON public.organizations
    FOR UPDATE TO authenticated
    USING (id = get_current_tenant_id() AND is_desarrollador())
    WITH CHECK (id = get_current_tenant_id() AND is_desarrollador());

CREATE POLICY "organizations_insert_delete" ON public.organizations
    FOR ALL TO authenticated
    USING (is_desarrollador())
    WITH CHECK (is_desarrollador());


-- ==========================================
-- TABLA: gerencias
-- ==========================================
DROP POLICY IF EXISTS "gerencias_select" ON public.gerencias;
DROP POLICY IF EXISTS "gerencias_write" ON public.gerencias;

CREATE POLICY "gerencias_select" ON public.gerencias
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "gerencias_write" ON public.gerencias
    FOR ALL TO authenticated
    USING (is_desarrollador() AND (tenant_id = get_current_tenant_id() OR tenant_id IS NULL))
    WITH CHECK (is_desarrollador() AND (tenant_id = get_current_tenant_id() OR tenant_id IS NULL));


-- ==========================================
-- TABLA: user_organizations
-- ==========================================
DROP POLICY IF EXISTS "user_organizations_select" ON public.user_organizations;
DROP POLICY IF EXISTS "user_organizations_write" ON public.user_organizations;

CREATE POLICY "user_organizations_select" ON public.user_organizations
    FOR SELECT TO authenticated
    USING (organization_id = get_current_tenant_id());

CREATE POLICY "user_organizations_write" ON public.user_organizations
    FOR ALL TO authenticated
    USING (is_desarrollador() AND organization_id = get_current_tenant_id())
    WITH CHECK (is_desarrollador() AND organization_id = get_current_tenant_id());


-- ==========================================
-- OPERACIONES: facturas, factura_items, empleados, recibos_nomina
-- ==========================================
DROP POLICY IF EXISTS tenant_policy ON public.facturas;
DROP POLICY IF EXISTS "facturas_tenant_policy" ON public.facturas;
CREATE POLICY "facturas_tenant_policy" ON public.facturas
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND is_authorized_for_operations())
    WITH CHECK (tenant_id = get_current_tenant_id() AND is_authorized_for_operations());

DROP POLICY IF EXISTS tenant_policy ON public.factura_items;
DROP POLICY IF EXISTS "factura_items_tenant_policy" ON public.factura_items;
CREATE POLICY "factura_items_tenant_policy" ON public.factura_items
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND is_authorized_for_operations())
    WITH CHECK (tenant_id = get_current_tenant_id() AND is_authorized_for_operations());

DROP POLICY IF EXISTS tenant_policy ON public.empleados;
DROP POLICY IF EXISTS "empleados_tenant_policy" ON public.empleados;
CREATE POLICY "empleados_tenant_policy" ON public.empleados
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND is_authorized_for_operations())
    WITH CHECK (tenant_id = get_current_tenant_id() AND is_authorized_for_operations());

DROP POLICY IF EXISTS tenant_policy ON public.recibos_nomina;
DROP POLICY IF EXISTS "recibos_nomina_tenant_policy" ON public.recibos_nomina;
CREATE POLICY "recibos_nomina_tenant_policy" ON public.recibos_nomina
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND is_authorized_for_operations())
    WITH CHECK (tenant_id = get_current_tenant_id() AND is_authorized_for_operations());

COMMIT;
