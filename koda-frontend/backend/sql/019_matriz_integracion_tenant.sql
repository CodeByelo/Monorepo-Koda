-- =============================================================================
-- Koda ERP · Migración 019: MatrizIntegracion tenant_id y constraint único
-- matriz_integracion.evento (global) -> (tenant_id, evento)
-- =============================================================================

-- 0) PRE-CHECK: revisar colisiones existentes antes de migrar
SELECT 'matriz_integracion' t, tenant_id, evento, count(*) 
FROM public.matriz_integracion 
GROUP BY tenant_id, evento 
HAVING count(*) > 1;

-- 1) Agregar columna tenant_id si no existe
ALTER TABLE public.matriz_integracion ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 2) Backfill al tenant RG TECHNOLOGY (00000000-0000-0000-0000-000000000001) para filas existentes
UPDATE public.matriz_integracion 
SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

-- 3) Establecer NOT NULL
ALTER TABLE public.matriz_integracion ALTER COLUMN tenant_id SET NOT NULL;

-- 4) Dropear constraint o índice único previo sobre evento
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='matriz_integracion' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='evento')
  LOOP EXECUTE format('ALTER TABLE public.matriz_integracion DROP CONSTRAINT IF EXISTS %I', r.conname); END LOOP;
END $$;

ALTER TABLE public.matriz_integracion DROP CONSTRAINT IF EXISTS _tenant_evento_matriz_uc;

-- 5) Agregar constraint único compuesto (tenant_id, evento)
ALTER TABLE public.matriz_integracion ADD CONSTRAINT _tenant_evento_matriz_uc UNIQUE (tenant_id, evento);

-- 6) Índice para optimizar consultas por tenant_id
CREATE INDEX IF NOT EXISTS ix_matriz_integracion_tenant_id ON public.matriz_integracion (tenant_id);
