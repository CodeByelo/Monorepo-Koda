-- =============================================================================
-- Koda ERP – Migración 023: Devoluciones de Cliente en Mostrador / POS
-- =============================================================================
-- Permite registrar devoluciones de un cliente para un producto de una venta,
-- independientemente de los despachos vehiculares.
-- Si condicion = 'BUENO', reingresa a stock vía Kardex ('Devolucion_Cliente').
-- Si condicion = 'DAÑADO', no suma stock pero queda registrado para trazabilidad.

CREATE TABLE IF NOT EXISTS public.devoluciones_cliente (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    numero_devolucion VARCHAR(50) NOT NULL,
    venta_id INTEGER NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    cantidad NUMERIC(15, 2) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    condicion VARCHAR(20) NOT NULL, -- 'BUENO' / 'DAÑADO'
    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT _tenant_devoluciones_cliente_numero_uc UNIQUE (tenant_id, numero_devolucion)
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_cliente_tenant ON public.devoluciones_cliente(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_cliente_venta ON public.devoluciones_cliente(venta_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_cliente_producto ON public.devoluciones_cliente(producto_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_cliente_fecha ON public.devoluciones_cliente(fecha DESC);
