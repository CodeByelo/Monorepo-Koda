-- =============================================================================
-- KODA ERP - MÓDULO DE FACTURACIÓN Y FISCALIDAD (NUEVAS TABLAS UUID)
-- Migration: 007_facturas_schema.sql
-- =============================================================================

-- 1. Agregar 'factura' al ENUM de tipos de agregado
DO $$
BEGIN
    ALTER TYPE koda_aggregate_type ADD VALUE 'factura';
EXCEPTION
    WHEN duplicate_object THEN null;
END$$;

-- 2. Crear tabla de cabecera de facturas
CREATE TABLE IF NOT EXISTS facturas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    cliente_id              UUID NOT NULL,
    moneda_documento        VARCHAR(10) NOT NULL,
    aplica_igtf             BOOLEAN NOT NULL DEFAULT FALSE,
    tasa_cambio_historica   NUMERIC(20,6) NOT NULL,
    base_imponible          NUMERIC(20,6) NOT NULL,
    monto_iva               NUMERIC(20,6) NOT NULL,
    monto_igtf              NUMERIC(20,6) NOT NULL,
    monto_total             NUMERIC(20,6) NOT NULL,
    numero_factura          VARCHAR(20) NOT NULL UNIQUE,
    creado_por              UUID NOT NULL,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS en la tabla facturas
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

-- Política de RLS para aislamiento por tenant_id
DROP POLICY IF EXISTS tenant_policy ON facturas;
CREATE POLICY tenant_policy ON facturas 
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3. Crear tabla de detalles de facturas
CREATE TABLE IF NOT EXISTS factura_items (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL,
    factura_id              UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    producto_id             VARCHAR(50),
    descripcion             VARCHAR(200),
    cantidad                NUMERIC(20,6) NOT NULL,
    precio_unitario         NUMERIC(20,6) NOT NULL,
    total_linea             NUMERIC(20,6) NOT NULL
);

-- Habilitar RLS en la tabla factura_items
ALTER TABLE factura_items ENABLE ROW LEVEL SECURITY;

-- Política de RLS para aislamiento por tenant_id
DROP POLICY IF EXISTS tenant_policy ON factura_items;
CREATE POLICY tenant_policy ON factura_items 
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
