-- =============================================================================
-- MIGRACIÓN: 001_MULTI_TENANT_RLS (SECURITY REINFORCED)
-- Objetivo: Implementar aislamiento estricto por tenant_id mediante RLS.
-- =============================================================================

BEGIN;

-- 1. Función para obtener el tenant_id actual desde el contexto de sesión
-- SECURITY DEFINER asegura que se ejecute con los privilegios del creador
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
    SELECT (NULLIF(current_setting('app.current_tenant_id', TRUE), ''))::UUID;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 2. Crear tabla de Organizaciones
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crear tabla de relación Usuario-Organización (Relación N:M)
CREATE TABLE IF NOT EXISTS user_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- 4. Añadir tenant_id a tablas de negocio y crear documentos
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

CREATE TABLE IF NOT EXISTS documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Crear índices de rendimiento compuestos CRÍTICOS
CREATE INDEX IF NOT EXISTS idx_documentos_tenant_created ON documentos(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_tenant_id ON documentos(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_user_org_user ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_org ON user_organizations(organization_id);

-- 6. Habilitar RLS en todas las tablas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

-- 7. Políticas de Aislamiento para 'organizations'
DROP POLICY IF EXISTS "tenant_isolation_organizations_select" ON organizations;
CREATE POLICY "tenant_isolation_organizations_select" ON organizations 
    FOR SELECT TO authenticated 
    USING (id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()));

-- 8. Políticas de Aislamiento para 'user_organizations'
DROP POLICY IF EXISTS "tenant_isolation_user_org_select" ON user_organizations;
CREATE POLICY "tenant_isolation_user_org_select" ON user_organizations 
    FOR SELECT TO authenticated 
    USING (user_id = auth.uid());

-- 9. Políticas de Aislamiento para 'documentos' (ESTRICTO)
DROP POLICY IF EXISTS "tenant_isolation_documentos_all" ON documentos;
CREATE POLICY "tenant_isolation_documentos_all" ON documentos 
    FOR ALL TO authenticated 
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- 10. Trigger para setear tenant_id automáticamente
CREATE OR REPLACE FUNCTION set_tenant_id_from_session() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := get_current_tenant_id();
    END IF;
    
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Security Error: tenant_id is required but was not found in session context.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_tenant_id_documentos ON documentos;
CREATE TRIGGER trg_set_tenant_id_documentos
    BEFORE INSERT ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_id_from_session();

-- 11. Tabla de auditoría (Inmutable)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant_isolation" ON audit_logs 
    FOR SELECT TO authenticated 
    USING (tenant_id = get_current_tenant_id());

COMMIT;
