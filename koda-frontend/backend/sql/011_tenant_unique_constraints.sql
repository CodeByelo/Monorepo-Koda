-- =============================================================================
-- Koda ERP · Migración 011: constraints únicos globales → por tenant
-- Empresa.rif, CuentaContable.codigo, Venta.numero_factura, Cheque.numero_cheque,
-- Cotizacion.numero_cotizacion, CentroCosto.codigo, Almacen.codigo, Vendedor.codigo
-- =============================================================================

-- 0) PRE-CHECK: correr primero. Cualquier fila devuelta = colisión cross-tenant
--    que bloquearía el ADD CONSTRAINT correspondiente más abajo.
SELECT 'empresa' t, tenant_id, rif v, count(*) FROM public.empresa GROUP BY tenant_id, rif HAVING count(*) > 1
UNION ALL
SELECT 'cuentas_contables', tenant_id, codigo, count(*) FROM public.cuentas_contables GROUP BY tenant_id, codigo HAVING count(*) > 1
UNION ALL
SELECT 'ventas', tenant_id, numero_factura, count(*) FROM public.ventas GROUP BY tenant_id, numero_factura HAVING count(*) > 1
UNION ALL
SELECT 'cheques', tenant_id, numero_cheque, count(*) FROM public.cheques GROUP BY tenant_id, numero_cheque HAVING count(*) > 1
UNION ALL
SELECT 'cotizaciones', tenant_id, numero_cotizacion, count(*) FROM public.cotizaciones GROUP BY tenant_id, numero_cotizacion HAVING count(*) > 1
UNION ALL
SELECT 'centros_costo', tenant_id, codigo, count(*) FROM public.centros_costo GROUP BY tenant_id, codigo HAVING count(*) > 1
UNION ALL
SELECT 'almacenes', tenant_id, codigo, count(*) FROM public.almacenes GROUP BY tenant_id, codigo HAVING count(*) > 1
UNION ALL
SELECT 'vendedores', tenant_id, codigo, count(*) FROM public.vendedores GROUP BY tenant_id, codigo HAVING count(*) > 1;

-- Filas con tenant_id NULL: Postgres trata NULL <> NULL, así que varias filas
-- NULL con el mismo valor NO quedarían bloqueadas por el nuevo constraint (un
-- hueco silencioso, no bloqueante). Vale la pena revisar si aparece algo.
SELECT 'empresa' t, count(*) FROM public.empresa WHERE tenant_id IS NULL
UNION ALL SELECT 'cuentas_contables', count(*) FROM public.cuentas_contables WHERE tenant_id IS NULL
UNION ALL SELECT 'ventas', count(*) FROM public.ventas WHERE tenant_id IS NULL
UNION ALL SELECT 'cheques', count(*) FROM public.cheques WHERE tenant_id IS NULL
UNION ALL SELECT 'cotizaciones', count(*) FROM public.cotizaciones WHERE tenant_id IS NULL
UNION ALL SELECT 'centros_costo', count(*) FROM public.centros_costo WHERE tenant_id IS NULL
UNION ALL SELECT 'almacenes', count(*) FROM public.almacenes WHERE tenant_id IS NULL
UNION ALL SELECT 'vendedores', count(*) FROM public.vendedores WHERE tenant_id IS NULL;

-- 1) empresa.rif
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='empresa' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='rif')
  LOOP EXECUTE format('ALTER TABLE public.empresa DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.empresa ADD CONSTRAINT _tenant_empresa_rif_uc UNIQUE (tenant_id, rif);

-- 2) cuentas_contables.codigo (era un índice único vía unique=True+index=True, no un constraint con nombre)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='cuentas_contables' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='codigo')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_cuentas_contables_codigo ON public.cuentas_contables (codigo);
ALTER TABLE public.cuentas_contables ADD CONSTRAINT _tenant_cuentas_contables_codigo_uc UNIQUE (tenant_id, codigo);

-- 3) ventas.numero_factura (misma situación de índice único que #2)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='ventas' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='numero_factura')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_ventas_numero_factura ON public.ventas (numero_factura);
ALTER TABLE public.ventas ADD CONSTRAINT _tenant_ventas_numero_factura_uc UNIQUE (tenant_id, numero_factura);

-- 4) cheques.numero_cheque
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='cheques' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero_cheque')
  LOOP EXECUTE format('ALTER TABLE public.cheques DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.cheques ADD CONSTRAINT _tenant_cheques_numero_cheque_uc UNIQUE (tenant_id, numero_cheque);

-- 5) cotizaciones.numero_cotizacion
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='cotizaciones' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero_cotizacion')
  LOOP EXECUTE format('ALTER TABLE public.cotizaciones DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.cotizaciones ADD CONSTRAINT _tenant_cotizaciones_numero_cotizacion_uc UNIQUE (tenant_id, numero_cotizacion);

-- 6) centros_costo.codigo
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='centros_costo' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='codigo')
  LOOP EXECUTE format('ALTER TABLE public.centros_costo DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.centros_costo ADD CONSTRAINT _tenant_centros_costo_codigo_uc UNIQUE (tenant_id, codigo);

-- 7) almacenes.codigo
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='almacenes' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='codigo')
  LOOP EXECUTE format('ALTER TABLE public.almacenes DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.almacenes ADD CONSTRAINT _tenant_almacenes_codigo_uc UNIQUE (tenant_id, codigo);

-- 8) vendedores.codigo
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='vendedores' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='codigo')
  LOOP EXECUTE format('ALTER TABLE public.vendedores DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.vendedores ADD CONSTRAINT _tenant_vendedores_codigo_uc UNIQUE (tenant_id, codigo);
