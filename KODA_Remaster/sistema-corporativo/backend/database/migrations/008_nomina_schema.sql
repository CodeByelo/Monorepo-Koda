-- =============================================================================
-- KODA ERP - MÓDULO DE RECURSOS HUMANOS Y NÓMINA (TABLAS UUID)
-- Migration: 008_nomina_schema.sql
-- =============================================================================

-- 1. Agregar 'empleado' y 'nomina' al ENUM de tipos de agregado
DO $$
BEGIN
    ALTER TYPE koda_aggregate_type ADD VALUE 'empleado';
EXCEPTION
    WHEN duplicate_object THEN null;
END$$;

DO $$
BEGIN
    ALTER TYPE koda_aggregate_type ADD VALUE 'nomina';
EXCEPTION
    WHEN duplicate_object THEN null;
END$$;

-- 2. Crear tabla de empleados
CREATE TABLE IF NOT EXISTS empleados (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    nombre      VARCHAR(100) NOT NULL,
    apellido    VARCHAR(100) NOT NULL,
    gerencia_id INTEGER NOT NULL REFERENCES gerencias(id) ON DELETE CASCADE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS en la tabla empleados
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;

-- Política de RLS para aislamiento por tenant_id
DROP POLICY IF EXISTS tenant_policy ON empleados;
CREATE POLICY tenant_policy ON empleados 
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3. Crear tabla de recibos de nomina
CREATE TABLE IF NOT EXISTS recibos_nomina (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    empleado_id     INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
    monto_neto      NUMERIC(20,6) NOT NULL,
    concepto        VARCHAR(250) NOT NULL,
    moneda          VARCHAR(10) NOT NULL,
    creado_por      UUID NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS en la tabla recibos_nomina
ALTER TABLE recibos_nomina ENABLE ROW LEVEL SECURITY;

-- Política de RLS para aislamiento por tenant_id
DROP POLICY IF EXISTS tenant_policy ON recibos_nomina;
CREATE POLICY tenant_policy ON recibos_nomina 
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
