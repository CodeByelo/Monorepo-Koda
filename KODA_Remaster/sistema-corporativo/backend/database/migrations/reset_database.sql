-- =============================================================================
-- SCRIPT DE LIMPIEZA TOTAL (WIPE & CLEAN)
-- ADVERTENCIA: ESTO ES IRREVERSIBLE Y BORRA TODOS LOS DATOS Y ESTRUCTURAS
-- =============================================================================

BEGIN;

-- 1. Deshabilitar RLS temporalmente para evitar errores en el drop
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY';
    END LOOP;
END $$;

-- 2. Eliminar Políticas RLS
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 3. Eliminar Triggers
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public') LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.' || quote_ident(r.event_object_table);
    END LOOP;
END $$;

-- 4. Eliminar Tablas (CASCADE)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.documentos CASCADE;
DROP TABLE IF EXISTS public.user_organizations CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

-- 5. Eliminar Funciones Personalizadas
DROP FUNCTION IF EXISTS public.get_current_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS public.set_tenant_id_from_session() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 6. Limpiar extensiones si es necesario (opcional)
-- DROP EXTENSION IF EXISTS "uuid-ossp";

COMMIT;

-- =============================================================================
-- LOG: Limpieza completada con éxito.
-- =============================================================================
