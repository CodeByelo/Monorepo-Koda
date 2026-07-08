-- =============================================================================
-- Koda ERP · Migración Nómina 007: Nómina Dinámica Multi-Tenant
-- =============================================================================

-- 1. Tabla de Empleados (Maestro del Trabajador)
-- rh_employees.id es el mismo UUID que public.profiles.id.
CREATE TABLE IF NOT EXISTS public.rh_employees (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    cedula VARCHAR(20) NOT NULL,
    nombres VARCHAR(150) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    fecha_ingreso DATE NOT NULL,
    sueldo_base_mensual NUMERIC(15, 2) NOT NULL CHECK (sueldo_base_mensual >= 0),
    tipo_cuenta_bancaria VARCHAR(50) NOT NULL,
    numero_cuenta VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'activo' NOT NULL CHECK (status IN ('activo', 'inactivo')),
    CONSTRAINT unique_cedula_tenant UNIQUE (tenant_id, cedula)
);

-- Migración desde el diseño anterior: id SERIAL + profile_id UUID.
DO $$
DECLARE
    id_type TEXT;
    constraint_name TEXT;
BEGIN
    SELECT data_type INTO id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rh_employees'
      AND column_name = 'id';

    IF id_type IS DISTINCT FROM 'uuid' THEN
        ALTER TABLE public.rh_payroll_details ADD COLUMN IF NOT EXISTS employee_uuid UUID;

        UPDATE public.rh_payroll_details detail
        SET employee_uuid = employee.profile_id
        FROM public.rh_employees employee
        JOIN public.profiles profile
          ON profile.id = employee.profile_id
         AND profile.tenant_id = employee.tenant_id
        WHERE detail.employee_id::TEXT = employee.id::TEXT;

        DELETE FROM public.rh_payroll_details
        WHERE employee_uuid IS NULL;

        FOR constraint_name IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'public.rh_payroll_details'::regclass
              AND contype IN ('f', 'u')
              AND conname IN ('rh_payroll_details_employee_id_fkey', 'unique_employee_period_concept')
        LOOP
            EXECUTE format('ALTER TABLE public.rh_payroll_details DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;

        FOR constraint_name IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'public.rh_employees'::regclass
              AND contype IN ('p', 'f', 'u')
        LOOP
            EXECUTE format('ALTER TABLE public.rh_employees DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;

        DELETE FROM public.rh_employees employee
        WHERE employee.profile_id IS NULL
           OR NOT EXISTS (
                SELECT 1
                FROM public.profiles profile
                WHERE profile.id = employee.profile_id
                  AND profile.tenant_id = employee.tenant_id
           );

        ALTER TABLE public.rh_employees DROP COLUMN id;
        ALTER TABLE public.rh_employees RENAME COLUMN profile_id TO id;
        ALTER TABLE public.rh_employees ALTER COLUMN id SET NOT NULL;
        ALTER TABLE public.rh_payroll_details DROP COLUMN employee_id;
        ALTER TABLE public.rh_payroll_details RENAME COLUMN employee_uuid TO employee_id;
    END IF;
END $$;

ALTER TABLE public.rh_employees DROP COLUMN IF EXISTS profile_id;

DELETE FROM public.rh_employees employee
WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = employee.id
      AND profile.tenant_id = employee.tenant_id
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.rh_employees'::regclass AND conname = 'rh_employees_pkey'
    ) THEN
        ALTER TABLE public.rh_employees ADD CONSTRAINT rh_employees_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.rh_employees'::regclass AND conname = 'rh_employees_id_fkey'
    ) THEN
        ALTER TABLE public.rh_employees ADD CONSTRAINT rh_employees_id_fkey FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.rh_employees'::regclass AND conname = 'unique_cedula_tenant'
    ) THEN
        ALTER TABLE public.rh_employees ADD CONSTRAINT unique_cedula_tenant UNIQUE (tenant_id, cedula);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_rh_employees_tenant_id ON public.rh_employees (tenant_id);

-- 2. Catálogo de Conceptos de Nómina (Asignaciones y Deducciones)
CREATE TABLE IF NOT EXISTS public.rh_concepts (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('asignacion', 'deduccion')),
    nombre VARCHAR(100) NOT NULL,
    afecta_salario_base BOOLEAN DEFAULT FALSE NOT NULL,
    CONSTRAINT unique_concept_name_tenant UNIQUE (tenant_id, nombre)
);

-- 3. Control de Períodos de Nómina (Quincenas/Meses)
CREATE TABLE IF NOT EXISTS public.rh_payroll_periods (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nombre_periodo VARCHAR(100) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'abierto' NOT NULL CHECK (status IN ('abierto', 'procesado')),
    CONSTRAINT check_dates CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT unique_period_name_tenant UNIQUE (tenant_id, nombre_periodo)
);

-- 4. Transaccional de Detalles de Nómina (Variables del período)
CREATE TABLE IF NOT EXISTS public.rh_payroll_details (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES public.rh_employees(id) ON DELETE CASCADE,
    period_id INTEGER NOT NULL REFERENCES public.rh_payroll_periods(id) ON DELETE CASCADE,
    concept_id INTEGER NOT NULL REFERENCES public.rh_concepts(id) ON DELETE CASCADE,
    monto NUMERIC(15, 2) NOT NULL CHECK (monto >= 0),
    cantidad_horas_dias NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (cantidad_horas_dias >= 0),
    CONSTRAINT unique_employee_period_concept UNIQUE (tenant_id, employee_id, period_id, concept_id)
);

ALTER TABLE public.rh_payroll_details
    DROP CONSTRAINT IF EXISTS rh_payroll_details_employee_id_fkey;

DO $$
DECLARE
    employee_id_type TEXT;
BEGIN
    SELECT data_type INTO employee_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rh_payroll_details'
      AND column_name = 'employee_id';

    IF employee_id_type IS DISTINCT FROM 'uuid' THEN
        ALTER TABLE public.rh_payroll_details ADD COLUMN IF NOT EXISTS employee_uuid UUID;

        UPDATE public.rh_payroll_details detail
        SET employee_uuid = employee.id
        FROM public.rh_employees employee
        WHERE detail.employee_id::TEXT = employee.id::TEXT;

        DELETE FROM public.rh_payroll_details WHERE employee_uuid IS NULL;
        ALTER TABLE public.rh_payroll_details DROP COLUMN employee_id;
        ALTER TABLE public.rh_payroll_details RENAME COLUMN employee_uuid TO employee_id;
    END IF;
END $$;

ALTER TABLE public.rh_payroll_details
    ALTER COLUMN employee_id SET NOT NULL;

DELETE FROM public.rh_payroll_details detail
WHERE NOT EXISTS (
    SELECT 1
    FROM public.rh_employees employee
    JOIN public.profiles profile ON profile.id = employee.id AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = detail.employee_id
      AND employee.tenant_id = detail.tenant_id
);

ALTER TABLE public.rh_payroll_details
    ADD CONSTRAINT rh_payroll_details_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.rh_employees(id) ON DELETE CASCADE;

ALTER TABLE public.rh_payroll_details
    DROP CONSTRAINT IF EXISTS unique_employee_period_concept;

ALTER TABLE public.rh_payroll_details
    ADD CONSTRAINT unique_employee_period_concept UNIQUE (tenant_id, employee_id, period_id, concept_id);

-- =============================================================================
-- 5. Habilitar Row Level Security (RLS) en todas las tablas
-- =============================================================================
ALTER TABLE public.rh_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_payroll_details ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 6. Crear políticas RLS basadas en app.current_tenant_id
-- =============================================================================
DROP POLICY IF EXISTS rh_employees_tenant_isolation ON public.rh_employees;
CREATE POLICY rh_employees_tenant_isolation ON public.rh_employees
    FOR ALL
    USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID)
    WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID);

DROP POLICY IF EXISTS rh_concepts_tenant_isolation ON public.rh_concepts;
CREATE POLICY rh_concepts_tenant_isolation ON public.rh_concepts
    FOR ALL
    USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID)
    WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID);

DROP POLICY IF EXISTS rh_payroll_periods_tenant_isolation ON public.rh_payroll_periods;
CREATE POLICY rh_payroll_periods_tenant_isolation ON public.rh_payroll_periods
    FOR ALL
    USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID)
    WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID);

DROP POLICY IF EXISTS rh_payroll_details_tenant_isolation ON public.rh_payroll_details;
CREATE POLICY rh_payroll_details_tenant_isolation ON public.rh_payroll_details
    FOR ALL
    USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID)
    WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::UUID);

-- =============================================================================
-- 7. Semilla de catálogos. Los empleados se sincronizan desde public.profiles.
-- =============================================================================
INSERT INTO public.rh_concepts (tenant_id, tipo, nombre, afecta_salario_base) VALUES
('89fd839a-bd5e-419b-abb1-393987fc2d7e', 'asignacion', 'Horas Extras', true),
('89fd839a-bd5e-419b-abb1-393987fc2d7e', 'asignacion', 'Bono Desempeño', false),
('89fd839a-bd5e-419b-abb1-393987fc2d7e', 'deduccion', 'Faltas', true),
('89fd839a-bd5e-419b-abb1-393987fc2d7e', 'deduccion', 'Adelanto Quincena', false)
ON CONFLICT (tenant_id, nombre) DO NOTHING;

INSERT INTO public.rh_payroll_periods (tenant_id, nombre_periodo, fecha_inicio, fecha_fin, status) VALUES
('89fd839a-bd5e-419b-abb1-393987fc2d7e', 'Quincena 1 - Junio 2026', '2026-06-01', '2026-06-15', 'abierto')
ON CONFLICT (tenant_id, nombre_periodo) DO NOTHING;
