-- Complete Supabase Schema Setup
-- This script creates all necessary tables AND the automatic profile creation trigger

-- ============================================
-- PART 1: CREATE TABLES
-- ============================================

-- 1. Roles
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    nombre_rol TEXT UNIQUE NOT NULL
);

INSERT INTO roles (nombre_rol) VALUES ('CEO'), ('Administrativo'), ('Usuario'), ('Desarrollador'), ('Gerente') ON CONFLICT DO NOTHING;

-- 2. Gerencias
CREATE TABLE IF NOT EXISTS gerencias (
    id SERIAL PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    siglas TEXT,
    categoria TEXT
);

-- 3. Profiles (extending Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    nombre TEXT,
    apellido TEXT,
    email TEXT,
    gerencia_id INTEGER REFERENCES gerencias(id),
    rol_id INTEGER REFERENCES roles(id),
    estado BOOLEAN DEFAULT TRUE,
    ultima_conexion TIMESTAMPTZ,
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- 4. Documentos
CREATE TABLE IF NOT EXISTS documentos (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    correlativo TEXT,
    tipo_documento TEXT,
    estado TEXT DEFAULT 'pendiente',
    prioridad TEXT DEFAULT 'media',
    remitente_id UUID REFERENCES profiles(id),
    receptor_id UUID REFERENCES profiles(id),
    receptor_gerencia_id INTEGER REFERENCES gerencias(id),
    url_archivo TEXT,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Logs Seguridad
CREATE TABLE IF NOT EXISTS logs_seguridad (
    id SERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES profiles(id),
    evento TEXT NOT NULL,
    nivel TEXT DEFAULT 'info',
    ip_origen TEXT,
    fecha_evento TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tickets
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    prioridad TEXT DEFAULT 'baja',
    estado TEXT DEFAULT 'abierto',
    solicitante_id UUID REFERENCES profiles(id),
    tecnico_id UUID REFERENCES profiles(id),
    fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Configuración Sistema
CREATE TABLE IF NOT EXISTS sistema_config (
    id SERIAL PRIMARY KEY,
    institucion TEXT DEFAULT 'CORPOELEC',
    siglas_inst TEXT DEFAULT 'CN',
    version TEXT DEFAULT '1.0.0',
    banner_alerta TEXT,
    ultimo_mantenimiento TIMESTAMPTZ
);

INSERT INTO sistema_config (id, institucion, version) VALUES (1, 'CORPOELEC Industrial', 'Alpha V.0.2') ON CONFLICT DO NOTHING;

-- ============================================
-- PART 2: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 3: CREATE POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Documents viewable by sender or receiver" ON documentos;
DROP POLICY IF EXISTS "Documents insertable by authenticated users" ON documentos;
DROP POLICY IF EXISTS "Tickets viewable by creator or tech" ON tickets;

-- Create policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Documents viewable by sender or receiver" ON documentos FOR SELECT USING (auth.uid() = remitente_id OR auth.uid() = receptor_id);
CREATE POLICY "Documents insertable by authenticated users" ON documentos FOR INSERT WITH CHECK (auth.uid() = remitente_id);

CREATE POLICY "Tickets viewable by creator or tech" ON tickets FOR SELECT USING (auth.uid() = solicitante_id OR auth.uid() = tecnico_id);

-- ============================================
-- PART 4: AUTOMATIC PROFILE CREATION TRIGGER
-- ============================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, nombre, apellido, email, gerencia_id, rol_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'nombre',
    NEW.raw_user_meta_data->>'apellido',
    NEW.email,
    NULL,  -- Will be set by admin later
    3      -- Default to 'Usuario' role (id=3)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PART 5: GRANT PERMISSIONS
-- ============================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these to verify everything was created:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public';
