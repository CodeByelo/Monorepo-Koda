-- Initial Schema for Supabase
-- Tables: roles, gerencias, profiles, documentos, logs_seguridad, tickets, sistema_config

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

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Basic Policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Documents viewable by sender or receiver" ON documentos FOR SELECT USING (auth.uid() = remitente_id OR auth.uid() = receptor_id);
CREATE POLICY "Documents insertable by authenticated users" ON documentos FOR INSERT WITH CHECK (auth.uid() = remitente_id);

CREATE POLICY "Tickets viewable by creator or tech" ON tickets FOR SELECT USING (auth.uid() = solicitante_id OR auth.uid() = tecnico_id);
