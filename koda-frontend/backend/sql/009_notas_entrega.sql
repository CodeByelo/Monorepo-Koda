-- =============================================================================
-- Koda ERP · Migración 009: Notas de Entrega (Remisiones)
-- Propósito: Entidad real de despacho físico, separada de Venta/OrdenVenta.
-- Antes, GET /ventas/notas-entrega solo re-consultaba `ventas` y las
-- re-etiquetaba como notas de entrega; y el formulario del frontend nunca
-- persistía nada (solo hacía console.log). Esta migración crea las tablas
-- reales que respaldan los nuevos endpoints POST/GET de notas de entrega.
-- =============================================================================

-- 1. Tabla principal de Notas de Entrega
CREATE TABLE IF NOT EXISTS public.notas_entrega (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    numero_nota VARCHAR(50) NOT NULL UNIQUE,
    cliente_id INT REFERENCES public.clientes(id),
    cliente_nombre VARCHAR(150) NOT NULL,
    orden_venta_id INT REFERENCES public.ordenes_venta(id),
    venta_id INT REFERENCES public.ventas(id),
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    transportista VARCHAR(150),
    vehiculo_placa VARCHAR(20),
    destino VARCHAR(250),
    notas TEXT,
    campos_personalizados JSONB,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'ENTREGADO', 'ANULADA')),
    creado_por UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notas_entrega_tenant ON public.notas_entrega(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notas_entrega_cliente ON public.notas_entrega(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notas_entrega_orden_venta ON public.notas_entrega(orden_venta_id);
CREATE INDEX IF NOT EXISTS idx_notas_entrega_estado ON public.notas_entrega(tenant_id, estado);

-- 2. Renglones (productos/cantidades) de cada nota
CREATE TABLE IF NOT EXISTS public.nota_entrega_items (
    id SERIAL PRIMARY KEY,
    nota_entrega_id INT NOT NULL REFERENCES public.notas_entrega(id) ON DELETE CASCADE,
    producto_id INT REFERENCES public.productos(id),
    descripcion TEXT NOT NULL,
    cantidad NUMERIC(15, 2) NOT NULL DEFAULT 1.00
);

CREATE INDEX IF NOT EXISTS idx_nota_entrega_items_nota ON public.nota_entrega_items(nota_entrega_id);

-- 3. Row-Level Security: aislamiento estricto por tenant
ALTER TABLE public.notas_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notas_entrega_tenant_policy" ON public.notas_entrega;
CREATE POLICY "notas_entrega_tenant_policy" ON public.notas_entrega
    FOR ALL
    USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid)
    WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);

-- `nota_entrega_items` no tiene tenant_id propio (sigue el mismo patrón que
-- `cotizacion_items`/`nota_entrega` padre); se protege uniendo por la nota.
ALTER TABLE public.nota_entrega_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nota_entrega_items_tenant_policy" ON public.nota_entrega_items;
CREATE POLICY "nota_entrega_items_tenant_policy" ON public.nota_entrega_items
    FOR ALL
    USING (
        nota_entrega_id IN (
            SELECT id FROM public.notas_entrega
            WHERE tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        )
    )
    WITH CHECK (
        nota_entrega_id IN (
            SELECT id FROM public.notas_entrega
            WHERE tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
        )
    );

-- 4. Registro en el Ledger de auditoría inmutable (mismo trigger global usado
-- en la migración 008 para logistics_plans/dispatch_records).
DROP TRIGGER IF EXISTS audit_notas_entrega_trigger ON public.notas_entrega;
CREATE TRIGGER audit_notas_entrega_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.notas_entrega
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
