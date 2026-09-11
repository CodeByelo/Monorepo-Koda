-- =============================================================================
-- Koda ERP · Migración 022: Notificaciones Globales del Sistema
-- =============================================================================
-- Permite que el rol Desarrollador / Dev publique mensajes globales (sin tenant_id)
-- visibles para todas las empresas y usuarios, con trazabilidad individual
-- de lecturas para que el popup no vuelva a mostrarse a un usuario que ya lo vio.

-- 1. Tabla de Notificaciones Globales del Sistema (sin tenant_id)
CREATE TABLE IF NOT EXISTS public.notificaciones_sistema (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,
    activa BOOLEAN DEFAULT TRUE NOT NULL,
    creado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_notificaciones_sistema_activa ON public.notificaciones_sistema(activa);
CREATE INDEX IF NOT EXISTS idx_notificaciones_sistema_creado_en ON public.notificaciones_sistema(creado_en DESC);

-- 2. Tabla de Lecturas de Notificaciones por Usuario Individual
CREATE TABLE IF NOT EXISTS public.notificaciones_sistema_lecturas (
    id SERIAL PRIMARY KEY,
    notificacion_id INTEGER NOT NULL REFERENCES public.notificaciones_sistema(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leido_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT _notif_sistema_usuario_uc UNIQUE (notificacion_id, usuario_id)
);

-- Índices para join y comprobación rápida de lecturas
CREATE INDEX IF NOT EXISTS idx_notif_sistema_lecturas_notif ON public.notificaciones_sistema_lecturas(notificacion_id);
CREATE INDEX IF NOT EXISTS idx_notif_sistema_lecturas_user ON public.notificaciones_sistema_lecturas(usuario_id);
