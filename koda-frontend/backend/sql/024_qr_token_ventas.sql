-- =============================================================================
-- Migración 024: Columna qr_token en public.ventas para consulta pública de facturas
-- =============================================================================
-- Permite la lectura aislada y blindada de los datos públicos de una factura
-- mediante un código QR sin exponer el id secuencial ni colisionar por número de factura.
-- Es un UUID único e inmutable generado automáticamente en la emisión.
-- =============================================================================

ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS qr_token UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_ventas_qr_token ON public.ventas (qr_token);
