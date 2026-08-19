-- =============================================================================
-- Koda ERP · Migración 016: Impacto de stock en devoluciones a proveedor
-- Propósito: DevolucionProveedor solo registraba un monto en USD (para el
-- reclamo/nota de crédito) pero no qué producto ni cuánta cantidad salía
-- físicamente del inventario. Como resultado, procesar una devolución desde
-- Returns.tsx no movía el stock del producto en absoluto.
--
-- Se agregan producto_id/cantidad como NULLABLE para no romper las filas
-- existentes (creadas antes de que estas columnas existieran, que seguirán
-- sin cantidad/producto asociado y por tanto sin impacto de stock retroactivo).
-- =============================================================================

ALTER TABLE public.devoluciones_proveedor
    ADD COLUMN IF NOT EXISTS producto_id INT REFERENCES public.productos(id),
    ADD COLUMN IF NOT EXISTS cantidad NUMERIC(15, 2);

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_producto ON public.devoluciones_proveedor(producto_id);
