-- ============================================================
-- KODA ERP — MIGRATION: OPTIMIZACIONES DE PAGINACIÓN E ÍNDICES
-- 2026-06-11
-- ============================================================

-- [1] Asientos Contables
-- Índice compuesto en (tenant_id, fecha) para acelerar las consultas paginadas del Libro Diario / Asientos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asientos_contables_tenant_fecha
    ON public.asientos_contables (tenant_id, fecha DESC);

-- [2] Empleados
-- Índice compuesto en (tenant_id, gerencia_id) para optimizar el filtrado de nómina y listado de empleados
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empleados_tenant_gerencia
    ON public.empleados (tenant_id, gerencia_id);

-- [3] Eventos del Ledger (koda_event_ledger)
-- Nota: En PostgreSQL, no se puede ejecutar CREATE INDEX CONCURRENTLY sobre una tabla particionada padre directamente.
-- La forma correcta de lograrlo de forma concurrente (sin bloquear escrituras) es crear el índice en cada partición individual
-- usando CONCURRENTLY y luego crear el índice en el padre sin CONCURRENTLY, lo cual asociará los de las particiones automáticamente.

-- A) Crear índices concurrentes en cada partición existente de koda_event_ledger
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_2025_q1_tenant_occurred ON public.koda_event_ledger_2025_q1 (tenant_id, occurred_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_2025_q2_tenant_occurred ON public.koda_event_ledger_2025_q2 (tenant_id, occurred_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_2025_q3_tenant_occurred ON public.koda_event_ledger_2025_q3 (tenant_id, occurred_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_2025_q4_tenant_occurred ON public.koda_event_ledger_2025_q4 (tenant_id, occurred_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_2026_q1_tenant_occurred ON public.koda_event_ledger_2026_q1 (tenant_id, occurred_at DESC);

-- B) Crear el índice en la tabla padre (PostgreSQL asociará automáticamente los índices hijos ya construidos concurrentemente)
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_occurred 
    ON public.koda_event_ledger (tenant_id, occurred_at DESC);
