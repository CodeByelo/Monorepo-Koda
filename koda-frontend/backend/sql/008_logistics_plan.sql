-- =============================================================================
-- Koda ERP · Migración 008: Módulo de Logística y Planificación de Personal
-- Propósito: Estructura de tripulaciones y planificación con políticas RLS de Supabase.
-- =============================================================================

-- 1. Crear tablas del módulo en el esquema público

CREATE TABLE IF NOT EXISTS public.crews (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    vehiculo_id INT NOT NULL REFERENCES public.vehiculos(id),
    chofer_id UUID NOT NULL REFERENCES public.profiles(id),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_crew_name_tenant UNIQUE (tenant_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.crew_members (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    crew_id INT NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id),
    rol VARCHAR(30) NOT NULL DEFAULT 'AYUDANTE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_crew_member_tenant UNIQUE (tenant_id, crew_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.logistics_plans (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    fecha_planificacion DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    creado_por UUID REFERENCES public.profiles(id),
    aprobado_por UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.dispatch_records (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    plan_id INT NOT NULL REFERENCES public.logistics_plans(id) ON DELETE CASCADE,
    crew_id INT NOT NULL REFERENCES public.crews(id),
    ruta VARCHAR(255) NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    detalles VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.notification_jobs (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    dispatch_id INT REFERENCES public.dispatch_records(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id),
    telegram_chat_id VARCHAR(50),
    mensaje TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    intentos INT NOT NULL DEFAULT 0,
    error_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Habilitar RLS (Row-Level Security) en Supabase para todas las tablas
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Seguridad RLS por Tenant y por Rol
-- Nota: Admin y Supervisor tienen control total. Choferes y Ayudantes solo ven sus propios datos.

-- A. Crews
DROP POLICY IF EXISTS "crews_tenant_policy" ON public.crews;
CREATE POLICY "crews_tenant_policy" ON public.crews
    FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND (
            current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
            OR id IN (
                SELECT crew_id FROM public.crew_members 
                WHERE profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
            )
        )
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
    );

-- B. Crew Members
DROP POLICY IF EXISTS "crew_members_tenant_policy" ON public.crew_members;
CREATE POLICY "crew_members_tenant_policy" ON public.crew_members
    FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND (
            current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
            OR profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
            OR crew_id IN (
                SELECT crew_id FROM public.crew_members
                WHERE profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
            )
        )
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
    );

-- C. Logistics Plans
DROP POLICY IF EXISTS "logistics_plans_tenant_policy" ON public.logistics_plans;
CREATE POLICY "logistics_plans_tenant_policy" ON public.logistics_plans
    FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND (
            current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
            OR (
                estado = 'APROBADO' 
                AND id IN (
                    SELECT plan_id FROM public.dispatch_records 
                    WHERE crew_id IN (
                        SELECT crew_id FROM public.crew_members 
                        WHERE profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
                    )
                )
            )
        )
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
    );

-- D. Dispatch Records
DROP POLICY IF EXISTS "dispatch_records_tenant_policy" ON public.dispatch_records;
CREATE POLICY "dispatch_records_tenant_policy" ON public.dispatch_records
    FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND (
            current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
            OR crew_id IN (
                SELECT crew_id FROM public.crew_members 
                WHERE profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
            )
        )
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND (
            current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
            OR (
                crew_id IN (
                    SELECT crew_id FROM public.crew_members 
                    WHERE profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
                )
            )
        )
    );

-- E. Notification Jobs
DROP POLICY IF EXISTS "notification_jobs_tenant_policy" ON public.notification_jobs;
CREATE POLICY "notification_jobs_tenant_policy" ON public.notification_jobs
    FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        AND (
            current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Supervisor')
            OR profile_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
        )
    );

-- 4. Registro en el Ledger inmutable a través del Trigger global
DROP TRIGGER IF EXISTS audit_logistics_plans_trigger ON public.logistics_plans;
CREATE TRIGGER audit_logistics_plans_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.logistics_plans
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_dispatch_records_trigger ON public.dispatch_records;
CREATE TRIGGER audit_dispatch_records_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_records
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
