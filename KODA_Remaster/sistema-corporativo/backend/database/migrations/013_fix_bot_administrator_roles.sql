-- =============================================================================
-- KODA ERP — MIGRATION: 013_fix_bot_administrator_roles.sql
-- Objetivo: Actualizar las funciones de validación de roles en RLS para el bot
--           de Telegram, permitiendo todas las variantes de roles administrativos
--           utilizadas en el sistema (Administrador, Administrator, CEO, 
--           Desarrollador, Administrative Master).
-- =============================================================================

BEGIN;

-- 1. Actualizar is_bot_administrator para aceptar todas las variantes administrativas
CREATE OR REPLACE FUNCTION public.is_bot_administrator(p_user_id UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.roles r ON p.rol_id = r.id
        WHERE p.id = p_user_id 
          AND r.nombre_rol IN (
              'Administrador', 
              'Administrator', 
              'CEO', 
              'Desarrollador', 
              'Administrative Master'
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Actualizar is_bot_admin_master para mayor robustez
CREATE OR REPLACE FUNCTION public.is_bot_admin_master(p_user_id UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.roles r ON p.rol_id = r.id
        WHERE p.id = p_user_id 
          AND r.nombre_rol IN ('Administrative Master', 'Desarrollador', 'CEO')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
