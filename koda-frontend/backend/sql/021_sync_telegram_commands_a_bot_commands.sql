-- =============================================================================
-- Koda ERP · Migración 021: sincronización automática telegram_commands -> bot_commands
-- (BUG-17 del audit de Telegram)
-- =============================================================================
--
-- Contexto: el ERP administra los comandos del bot en `public.telegram_commands`
-- (tabla de koda-frontend/backend, modelo TelegramCommand). El bot de Telegram
-- (KODA_Remaster/sistema-corporativo/backend) lee sus comandos de una tabla
-- DISTINTA, `public.bot_commands`. Hasta ahora la única sincronización entre
-- ambas era una llamada HTTP "best-effort" desde telegram_api.py
-- (_sync_command_to_remaster) que puede fallar en silencio (backend caído,
-- timeout, URL/API key mal configurada) dejando el bot desactualizado sin que
-- nadie se entere.
--
-- Esta migración NO reemplaza esa sincronización HTTP (se deja intacta) sino
-- que agrega una segunda vía, a nivel de base de datos, que no depende de la
-- red ni de que ambos backends estén levantados a la vez: cualquier
-- INSERT/UPDATE/DELETE en telegram_commands se refleja automáticamente en
-- bot_commands vía trigger. Es puramente aditiva: no modifica ninguna fila
-- existente ni cambia el comportamiento de ningún endpoint. Verificado antes
-- de aplicar que ambas tablas ya están en sync (17/17 comandos, mismo
-- internal_action) — este trigger es una red de seguridad hacia adelante,
-- no una corrección de datos actuales.
--
-- Es seguro correr este archivo más de una vez (CREATE OR REPLACE / DROP
-- TRIGGER IF EXISTS / CREATE TRIGGER son idempotentes).

CREATE OR REPLACE FUNCTION public.fn_sync_telegram_command_to_bot_commands()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        -- Nunca debe fallar el INSERT/UPDATE en telegram_commands (la fuente
        -- de verdad para el admin del ERP) por un problema al espejar el
        -- cambio hacia bot_commands (por ejemplo, un tenant_id sin fila
        -- correspondiente en organizations). Se atrapa cualquier error y
        -- solo se deja un WARNING en los logs de Postgres.
        BEGIN
            INSERT INTO public.bot_commands (tenant_id, trigger_command, response_text, internal_action, is_active)
            VALUES (NEW.tenant_id, NEW.trigger_command, NEW.response_text, NEW.internal_action, NEW.is_active)
            ON CONFLICT (tenant_id, trigger_command)
            DO UPDATE SET
                response_text = EXCLUDED.response_text,
                internal_action = EXCLUDED.internal_action,
                is_active = EXCLUDED.is_active,
                updated_at = NOW();
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'fn_sync_telegram_command_to_bot_commands: no se pudo sincronizar % (tenant %): %', NEW.trigger_command, NEW.tenant_id, SQLERRM;
        END;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        BEGIN
            DELETE FROM public.bot_commands
            WHERE tenant_id = OLD.tenant_id AND trigger_command = OLD.trigger_command;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'fn_sync_telegram_command_to_bot_commands: no se pudo eliminar % (tenant %): %', OLD.trigger_command, OLD.tenant_id, SQLERRM;
        END;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_telegram_command_to_bot_commands ON public.telegram_commands;
CREATE TRIGGER trg_sync_telegram_command_to_bot_commands
AFTER INSERT OR UPDATE OR DELETE ON public.telegram_commands
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_telegram_command_to_bot_commands();
