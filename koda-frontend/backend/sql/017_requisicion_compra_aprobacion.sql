-- =============================================================================
-- Koda ERP · Migración 017: Maker-Checker para RequisicionCompra
-- Propósito: la tabla solo tenía `estado` (PENDIENTE por defecto) pero ningún
-- endpoint transicionaba una requisición fuera de PENDIENTE, y no existía
-- rastro de auditoría de quién aprobó/rechazó ni cuándo (mismo patrón de
-- rastro que aprobado_por en public.crews / public.logistics_plans).
--
-- Nullable por compatibilidad con filas existentes, que quedan sin estos
-- datos hasta que se decidan explícitamente vía los nuevos endpoints
-- /compras/requisiciones/{id}/aprobar y /rechazar.
-- =============================================================================

ALTER TABLE public.requisiciones_compra
    ADD COLUMN IF NOT EXISTS decidido_por UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS fecha_decision TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS motivo_rechazo VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_requisiciones_compra_estado ON public.requisiciones_compra(tenant_id, estado);
