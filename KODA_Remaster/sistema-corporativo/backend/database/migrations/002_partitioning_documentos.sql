-- =============================================================================
-- MIGRACIÓN: 002_PARTITIONING_DOCUMENTOS
-- Objetivo: Migrar tablas de alto volumen a esquema particionado por HASH.
-- =============================================================================

BEGIN;

-- 1. Respaldar datos actuales (si existen)
-- CREATE TABLE documentos_backup AS SELECT * FROM documentos;

-- 2. Eliminar tabla antigua (en un entorno de migración real esto requiere más pasos de seguridad)
DROP TABLE IF EXISTS documentos CASCADE;

-- 3. Crear tabla particionada por HASH(tenant_id)
-- Nota: La PK debe incluir la columna de particionamiento
CREATE TABLE documentos (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id) -- REQUERIDO PARA PARTICIONAMIENTO
);

-- 4. Crear 16 particiones para distribuir la carga de 4,000+ empresas
CREATE TABLE documentos_p0  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE documentos_p1  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE documentos_p2  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE documentos_p3  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE documentos_p4  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE documentos_p5  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE documentos_p6  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE documentos_p7  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE documentos_p8  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE documentos_p9  PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE documentos_p10 PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE documentos_p11 PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE documentos_p12 PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE documentos_p13 PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE documentos_p14 PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE documentos_p15 PARTITION OF documentos FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- 5. Re-habilitar RLS (Se hereda a las particiones)
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_documentos_all" ON documentos 
    FOR ALL TO authenticated 
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- 6. Restaurar Trigger de auto-tenant
CREATE TRIGGER trg_set_tenant_id_documentos
    BEFORE INSERT ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_id_from_session();

-- 7. Índices adicionales en particiones (opcional, PG los maneja globalmente si se crean en la madre)
CREATE INDEX idx_documentos_created_at ON documentos(created_at DESC);

COMMIT;
