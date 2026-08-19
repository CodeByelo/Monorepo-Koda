-- =============================================================================
-- SCRIPT DE CREACIÓN COMPLETO: ARQUITECTURA ENTERPRISE MULTI-TENANT
-- =============================================================================

BEGIN;

-- 1. Extensiones Necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Función para obtener tenant_id de la sesión
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', true)::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. TABLA: Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: Profiles (Extensión de Auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE,
    nombre VARCHAR(100),
    apellido VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    password_hash TEXT, -- Solo si usas auth personalizada, sino usa Supabase Auth
    rol_id INT, -- Referencia a roles
    estado BOOLEAN DEFAULT TRUE,
    tenant_id UUID REFERENCES organizations(id), -- Tenant actual/por defecto
    ultima_conexion TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA: Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (nombre_rol) VALUES ('admin'), ('editor'), ('viewer');

-- 6. TABLA: User_Organizations (Membresía)
CREATE TABLE user_organizations (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer',
    is_primary BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, organization_id)
);

-- 7. TABLA: Documentos (TABLA PARTICIPADA POR INDICE COMPUESTO)
CREATE TABLE documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice compuesto para performance Multi-tenant
CREATE INDEX idx_documentos_tenant_created ON documentos (tenant_id, created_at DESC);

-- 8. TABLA: Audit Logs (Inmutable)
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Trigger para Auto-Tenant ID
CREATE OR REPLACE FUNCTION set_tenant_id_from_session() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := get_current_tenant_id();
    END IF;
    
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Security Error: tenant_id es requerido pero no se encontró en el contexto de sesión.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_tenant_id_documentos
    BEFORE INSERT ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_id_from_session();

-- 10. POLÍTICAS RLS (Seguridad Estricta)

-- Organizations: Solo miembros pueden ver su propia org
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_organizations_view" ON organizations 
    FOR SELECT TO authenticated 
    USING (id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()));

-- Profiles: Usuarios pueden ver su propio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_self_view" ON profiles 
    FOR SELECT TO authenticated USING (id = auth.uid());

-- User_Organizations: Miembros pueden ver la membresía de su org
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membership_view" ON user_organizations 
    FOR SELECT TO authenticated 
    USING (organization_id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()));

-- Documentos: AISLAMIENTO TOTAL
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documentos_isolation" ON documentos 
    FOR ALL TO authenticated 
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Audit Logs: Ver solo logs del tenant
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_isolation" ON audit_logs 
    FOR SELECT TO authenticated 
    USING (tenant_id = get_current_tenant_id());

COMMIT;
