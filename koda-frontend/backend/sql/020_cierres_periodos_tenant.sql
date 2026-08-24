-- =============================================================================
-- Koda ERP · Migración 020: CierrePeriodo tenant_id y constraint único
-- cierres_periodos.periodo (global) -> (tenant_id, periodo)
-- =============================================================================

-- 0) PRE-CHECK: revisar colisiones existentes antes de migrar
SELECT 'cierres_periodos' t, tenant_id, periodo, count(*) 
FROM public.cierres_periodos 
GROUP BY tenant_id, periodo 
HAVING count(*) > 1;

-- 1) Agregar columna tenant_id si no existe
ALTER TABLE public.cierres_periodos ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 2) Backfill al tenant RG TECHNOLOGY (00000000-0000-0000-0000-000000000001) para filas existentes
UPDATE public.cierres_periodos 
SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

-- 3) Establecer NOT NULL
ALTER TABLE public.cierres_periodos ALTER COLUMN tenant_id SET NOT NULL;

-- 4) Dropear constraint o índice único previo sobre periodo
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='cierres_periodos' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='periodo')
  LOOP EXECUTE format('ALTER TABLE public.cierres_periodos DROP CONSTRAINT IF EXISTS %I', r.conname); END LOOP;
END $$;

ALTER TABLE public.cierres_periodos DROP CONSTRAINT IF EXISTS _tenant_periodo_cierre_uc;

-- 5) Agregar constraint único compuesto (tenant_id, periodo)
ALTER TABLE public.cierres_periodos ADD CONSTRAINT _tenant_periodo_cierre_uc UNIQUE (tenant_id, periodo);

-- 6) Índice para optimizar consultas por tenant_id
CREATE INDEX IF NOT EXISTS ix_cierres_periodos_tenant_id ON public.cierres_periodos (tenant_id);
