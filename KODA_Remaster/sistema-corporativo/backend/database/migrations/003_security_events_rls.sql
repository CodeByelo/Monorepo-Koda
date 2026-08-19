-- MIGRACIÓN: 003_SECURITY_EVENTS_RLS
-- Objetivo: aislar eventos/bitácoras por tenant_id con RLS.

BEGIN;

-- Asegurar función de tenant actual.
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security events (accesos)
ALTER TABLE IF EXISTS security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_events_tenant_select ON security_events;
DROP POLICY IF EXISTS security_events_tenant_modify ON security_events;
CREATE POLICY security_events_tenant_select ON security_events
    FOR SELECT
    USING (tenant_id = get_current_tenant_id());
CREATE POLICY security_events_tenant_modify ON security_events
    FOR INSERT WITH CHECK (
        tenant_id = get_current_tenant_id()
        OR (tenant_id IS NULL AND get_current_tenant_id() IS NULL)
    );

-- Ticket events (historial)
ALTER TABLE IF EXISTS ticket_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_events_tenant_all ON ticket_events;
CREATE POLICY ticket_events_tenant_all ON ticket_events
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Document events (auditoria documentos)
ALTER TABLE IF EXISTS document_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_events_tenant_all ON document_events;
CREATE POLICY document_events_tenant_all ON document_events
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Respuestas de documentos
ALTER TABLE IF EXISTS documento_respuestas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documento_respuestas_tenant_all ON documento_respuestas;
CREATE POLICY documento_respuestas_tenant_all ON documento_respuestas
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

COMMIT;
