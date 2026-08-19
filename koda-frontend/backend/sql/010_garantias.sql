-- =============================================================================
-- Koda ERP · Migración 010: Garantías de producto/venta
-- Propósito: seguimiento de cobertura post-venta por producto (antes no
-- existía ningún registro: ni modelo, ni endpoint, ni pantalla).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.garantias (
    id SERIAL PRIMARY KEY,
    tenant_id UUID,
    producto_id INT NOT NULL REFERENCES public.productos(id),
    venta_id INT REFERENCES public.ventas(id),
    cliente_id INT NOT NULL REFERENCES public.clientes(id),
    fecha_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    duracion_meses INT NOT NULL,
    fecha_vencimiento TIMESTAMP WITH TIME ZONE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'VIGENTE'
        CHECK (estado IN ('VIGENTE', 'VENCIDA', 'RECLAMADA', 'ANULADA')),
    notas TEXT
);

CREATE INDEX IF NOT EXISTS idx_garantias_tenant ON public.garantias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_garantias_producto ON public.garantias(producto_id);
CREATE INDEX IF NOT EXISTS idx_garantias_cliente ON public.garantias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_garantias_estado ON public.garantias(tenant_id, estado);

-- Nota: se omite deliberadamente RLS/trigger de auditoría aquí (a diferencia
-- de 009_notas_entrega.sql), porque la app se conecta a Postgres como el
-- rol superusuario (postgres.xxxxx), que ignora RLS siempre -- ver hallazgo
-- de la auditoría pre-lanzamiento. Agregarlo daría una falsa sensación de
-- protección. El aislamiento real de tenant lo hace el filtro `tenant_id`
-- explícito en cada endpoint de garantias.py.
