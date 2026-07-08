-- =============================================================================
-- Koda ERP · Migración Fiscal 005
-- Propósito: Implementación del "Immutable Audit Trail" para cumplimiento de regulaciones.
-- =============================================================================

-- 1. Crear tabla de logs (Sólo permite INSERTS, inmutable por diseño en la aplicación)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    user_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Crear un índice para búsquedas forenses rápidas
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);

-- 2. Función PL/pgSQL maestra que será llamada por los Triggers
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    v_record_id VARCHAR;
BEGIN
    -- Intentar extraer el user_id del contexto de la transacción (seteado por FastAPI)
    BEGIN
        current_user_id := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        current_user_id := NULL; -- Fallback si se modifica directo de consola
    END;

    -- Obtener la clave primaria del registro afectado. 
    -- Asumimos que todas las tablas auditadas tienen una columna 'id'.
    IF (TG_OP = 'DELETE') THEN
        v_record_id := OLD.id::VARCHAR;
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, row_to_json(OLD)::JSONB, NULL, current_user_id);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_record_id := NEW.id::VARCHAR;
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, current_user_id);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        v_record_id := NEW.id::VARCHAR;
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, NULL, row_to_json(NEW)::JSONB, current_user_id);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Asignar el Trigger a las tablas críticas
-- Nota: Usamos IF NOT EXISTS en Postgres 11+ no está soportado directamente para triggers,
-- así que lo eliminamos primero si existe.

-- Tabla: ventas
DROP TRIGGER IF EXISTS audit_ventas_trigger ON public.ventas;
CREATE TRIGGER audit_ventas_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Tabla: venta_detalles
DROP TRIGGER IF EXISTS audit_venta_detalles_trigger ON public.venta_detalles;
CREATE TRIGGER audit_venta_detalles_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.venta_detalles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Tabla: cuentas_por_cobrar
DROP TRIGGER IF EXISTS audit_cxc_trigger ON public.cuentas_por_cobrar;
CREATE TRIGGER audit_cxc_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_por_cobrar
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Tabla: productos (Inventario crítico)
DROP TRIGGER IF EXISTS audit_productos_trigger ON public.productos;
CREATE TRIGGER audit_productos_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.productos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Tabla: kardex_movimientos (Libro mayor)
DROP TRIGGER IF EXISTS audit_kardex_trigger ON public.kardex_movimientos;
CREATE TRIGGER audit_kardex_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.kardex_movimientos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Para inicializar los correlativos fiscales si la tabla ya existe
-- CREATE TABLE IF NOT EXISTS public.correlativos_fiscales (...)
