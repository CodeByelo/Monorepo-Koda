-- =============================================================================
-- Koda ERP · Migración 012: constraints únicos globales → por tenant (parte 2)
-- Proveedor.rif, Sucursal.codigo, CuentaBancaria.numero_cuenta, OrdenVenta.numero,
-- RequisicionCompra.numero, RecepcionStock.hoja_id, NotaCredito.numero,
-- DevolucionProveedor.numero_devolucion, Vehiculo.placa, Chofer.cedula,
-- TurnoDespacho.numero_turno, NotaEntrega.numero_nota, Compra.numero_factura
-- =============================================================================

-- 0) PRE-CHECK: correr primero. Cualquier fila devuelta = colisión cross-tenant
--    que bloquearía el ADD CONSTRAINT correspondiente más abajo.
SELECT 'proveedores' t, tenant_id, rif v, count(*) FROM public.proveedores GROUP BY tenant_id, rif HAVING count(*) > 1
UNION ALL
SELECT 'sucursales', tenant_id, codigo, count(*) FROM public.sucursales GROUP BY tenant_id, codigo HAVING count(*) > 1
UNION ALL
SELECT 'cuentas_bancarias', tenant_id, numero_cuenta, count(*) FROM public.cuentas_bancarias GROUP BY tenant_id, numero_cuenta HAVING count(*) > 1
UNION ALL
SELECT 'ordenes_venta', tenant_id, numero, count(*) FROM public.ordenes_venta GROUP BY tenant_id, numero HAVING count(*) > 1
UNION ALL
SELECT 'requisiciones_compra', tenant_id, numero, count(*) FROM public.requisiciones_compra GROUP BY tenant_id, numero HAVING count(*) > 1
UNION ALL
SELECT 'recepciones_stock', tenant_id, hoja_id, count(*) FROM public.recepciones_stock GROUP BY tenant_id, hoja_id HAVING count(*) > 1
UNION ALL
SELECT 'notas_credito', tenant_id, numero, count(*) FROM public.notas_credito GROUP BY tenant_id, numero HAVING count(*) > 1
UNION ALL
SELECT 'devoluciones_proveedor', tenant_id, numero_devolucion, count(*) FROM public.devoluciones_proveedor GROUP BY tenant_id, numero_devolucion HAVING count(*) > 1
UNION ALL
SELECT 'vehiculos', tenant_id, placa, count(*) FROM public.vehiculos GROUP BY tenant_id, placa HAVING count(*) > 1
UNION ALL
SELECT 'choferes', tenant_id, cedula, count(*) FROM public.choferes GROUP BY tenant_id, cedula HAVING count(*) > 1
UNION ALL
SELECT 'turnos_despacho', tenant_id, numero_turno, count(*) FROM public.turnos_despacho GROUP BY tenant_id, numero_turno HAVING count(*) > 1
UNION ALL
SELECT 'notas_entrega', tenant_id, numero_nota, count(*) FROM public.notas_entrega GROUP BY tenant_id, numero_nota HAVING count(*) > 1
UNION ALL
SELECT 'compras', tenant_id, numero_factura, count(*) FROM public.compras GROUP BY tenant_id, numero_factura HAVING count(*) > 1;

-- Filas con tenant_id NULL: Postgres trata NULL <> NULL, así que varias filas
-- NULL con el mismo valor NO quedarían bloqueadas por el nuevo constraint (un
-- hueco silencioso, no bloqueante). Vale la pena revisar si aparece algo.
-- (Nota: Chofer.cedula ya es nullable=True hoy, así que múltiples choferes sin
-- cédula son esperados y no son un hueco nuevo introducido por esta migración.)
SELECT 'proveedores' t, count(*) FROM public.proveedores WHERE tenant_id IS NULL
UNION ALL SELECT 'sucursales', count(*) FROM public.sucursales WHERE tenant_id IS NULL
UNION ALL SELECT 'cuentas_bancarias', count(*) FROM public.cuentas_bancarias WHERE tenant_id IS NULL
UNION ALL SELECT 'ordenes_venta', count(*) FROM public.ordenes_venta WHERE tenant_id IS NULL
UNION ALL SELECT 'requisiciones_compra', count(*) FROM public.requisiciones_compra WHERE tenant_id IS NULL
UNION ALL SELECT 'recepciones_stock', count(*) FROM public.recepciones_stock WHERE tenant_id IS NULL
UNION ALL SELECT 'notas_credito', count(*) FROM public.notas_credito WHERE tenant_id IS NULL
UNION ALL SELECT 'devoluciones_proveedor', count(*) FROM public.devoluciones_proveedor WHERE tenant_id IS NULL
UNION ALL SELECT 'vehiculos', count(*) FROM public.vehiculos WHERE tenant_id IS NULL
UNION ALL SELECT 'choferes', count(*) FROM public.choferes WHERE tenant_id IS NULL
UNION ALL SELECT 'turnos_despacho', count(*) FROM public.turnos_despacho WHERE tenant_id IS NULL
UNION ALL SELECT 'notas_entrega', count(*) FROM public.notas_entrega WHERE tenant_id IS NULL
UNION ALL SELECT 'compras', count(*) FROM public.compras WHERE tenant_id IS NULL;

-- 1) proveedores.rif (era un índice único vía unique=True+index=True, no un constraint con nombre)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='proveedores' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='rif')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_proveedores_rif ON public.proveedores (rif);
ALTER TABLE public.proveedores ADD CONSTRAINT _tenant_proveedores_rif_uc UNIQUE (tenant_id, rif);

-- 2) sucursales.codigo
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='sucursales' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='codigo')
  LOOP EXECUTE format('ALTER TABLE public.sucursales DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.sucursales ADD CONSTRAINT _tenant_sucursales_codigo_uc UNIQUE (tenant_id, codigo);

-- 3) cuentas_bancarias.numero_cuenta
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='cuentas_bancarias' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero_cuenta')
  LOOP EXECUTE format('ALTER TABLE public.cuentas_bancarias DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.cuentas_bancarias ADD CONSTRAINT _tenant_cuentas_bancarias_numero_cuenta_uc UNIQUE (tenant_id, numero_cuenta);

-- 4) ordenes_venta.numero
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='ordenes_venta' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero')
  LOOP EXECUTE format('ALTER TABLE public.ordenes_venta DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.ordenes_venta ADD CONSTRAINT _tenant_ordenes_venta_numero_uc UNIQUE (tenant_id, numero);

-- 5) requisiciones_compra.numero
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='requisiciones_compra' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero')
  LOOP EXECUTE format('ALTER TABLE public.requisiciones_compra DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.requisiciones_compra ADD CONSTRAINT _tenant_requisiciones_compra_numero_uc UNIQUE (tenant_id, numero);

-- 6) recepciones_stock.hoja_id
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='recepciones_stock' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='hoja_id')
  LOOP EXECUTE format('ALTER TABLE public.recepciones_stock DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.recepciones_stock ADD CONSTRAINT _tenant_recepciones_stock_hoja_id_uc UNIQUE (tenant_id, hoja_id);

-- 7) notas_credito.numero
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='notas_credito' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero')
  LOOP EXECUTE format('ALTER TABLE public.notas_credito DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.notas_credito ADD CONSTRAINT _tenant_notas_credito_numero_uc UNIQUE (tenant_id, numero);

-- 8) devoluciones_proveedor.numero_devolucion (era un índice único vía unique=True+index=True)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='devoluciones_proveedor' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='numero_devolucion')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_devoluciones_proveedor_numero_devolucion ON public.devoluciones_proveedor (numero_devolucion);
ALTER TABLE public.devoluciones_proveedor ADD CONSTRAINT _tenant_devoluciones_proveedor_numero_devolucion_uc UNIQUE (tenant_id, numero_devolucion);

-- 9) vehiculos.placa (era un índice único vía unique=True+index=True)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='vehiculos' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='placa')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_vehiculos_placa ON public.vehiculos (placa);
ALTER TABLE public.vehiculos ADD CONSTRAINT _tenant_vehiculos_placa_uc UNIQUE (tenant_id, placa);

-- 10) choferes.cedula (nullable=True: varios choferes sin cédula ya conviven hoy;
--     el constraint por tenant no cambia esa semántica, NULL sigue sin colisionar)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='choferes' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='cedula')
  LOOP EXECUTE format('ALTER TABLE public.choferes DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.choferes ADD CONSTRAINT _tenant_choferes_cedula_uc UNIQUE (tenant_id, cedula);

-- 11) turnos_despacho.numero_turno (era un índice único vía unique=True+index=True)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='turnos_despacho' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='numero_turno')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_turnos_despacho_numero_turno ON public.turnos_despacho (numero_turno);
ALTER TABLE public.turnos_despacho ADD CONSTRAINT _tenant_turnos_despacho_numero_turno_uc UNIQUE (tenant_id, numero_turno);

-- 12) notas_entrega.numero_nota
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname='notas_entrega' AND con.contype='u'
      AND con.conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=rel.oid AND attname='numero_nota')
  LOOP EXECUTE format('ALTER TABLE public.notas_entrega DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.notas_entrega ADD CONSTRAINT _tenant_notas_entrega_numero_nota_uc UNIQUE (tenant_id, numero_nota);

-- 13) compras.numero_factura (era un índice único vía unique=True+index=True)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT ic.relname AS idx FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace nsp ON nsp.oid=tc.relnamespace
    WHERE nsp.nspname='public' AND tc.relname='compras' AND i.indisunique
      AND i.indkey::text = (SELECT attnum::text FROM pg_attribute WHERE attrelid=tc.oid AND attname='numero_factura')
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx); END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_compras_numero_factura ON public.compras (numero_factura);
ALTER TABLE public.compras ADD CONSTRAINT _tenant_compras_numero_factura_uc UNIQUE (tenant_id, numero_factura);
