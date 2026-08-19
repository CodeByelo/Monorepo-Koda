-- Harmonization Migration for Audit Preparation
-- This script ensures the 'documentos' table has all required columns and cleans dummy data

-- 1. Add missing systemic columns if they don't exist
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS titulo TEXT;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS correlativo TEXT;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS tipo_documento TEXT;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'en-proceso';
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'media';
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS remitente_id UUID;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS receptor_id UUID;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS receptor_gerencia_id INTEGER REFERENCES gerencias(id);
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS url_archivo TEXT;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- 2. Add audit-specific columns
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS fecha_caducidad TIMESTAMPTZ;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS fecha_ultima_actividad TIMESTAMPTZ DEFAULT NOW();

-- 3. Data Harmonization (if columns were just added)
-- If 'title' exists but 'titulo' is null, sync them
UPDATE documentos SET titulo = title WHERE titulo IS NULL AND title IS NOT NULL;
-- If 'user_id' exists but 'remitente_id' is null, sync them
UPDATE documentos SET remitente_id = user_id WHERE remitente_id IS NULL AND user_id IS NOT NULL;
-- If 'created_at' exists but 'fecha_creacion' is null, sync them
UPDATE documentos SET fecha_creacion = created_at WHERE fecha_creacion IS NULL AND created_at IS NOT NULL;

-- 4. Initial Cleanup (Remove all dummy/test data)
DELETE FROM documentos;

-- 5. Configure Gerencia initials for correlative generation
UPDATE gerencias SET siglas = 'GG' WHERE nombre = 'Gerencia General';
UPDATE gerencias SET siglas = 'AI' WHERE nombre = 'Auditoria Interna';
UPDATE gerencias SET siglas = 'CJ' WHERE nombre = 'Consultoria Juridica';
UPDATE gerencias SET siglas = 'GNP' WHERE nombre = 'Gerencia Nacional de Planificacion y presupuesto';
UPDATE gerencias SET siglas = 'GNA' WHERE nombre = 'Gerencia Nacional de Administracion';
UPDATE gerencias SET siglas = 'GNH' WHERE nombre = 'Gerencia Nacional de Gestion Humana';
UPDATE gerencias SET siglas = 'TIC' WHERE nombre = 'Gerencia Nacional de Tecnologias de la informacion y la comunicacion';
UPDATE gerencias SET siglas = 'GNP' WHERE nombre = 'Gerencia nacional de tecnologias de proyectos';
UPDATE gerencias SET siglas = 'AM' WHERE nombre = 'Gerencia Nacional de Adecuaciones y Mejoras';
UPDATE gerencias SET siglas = 'ASHO' WHERE nombre = 'Gerencia Nacional de Asho';
UPDATE gerencias SET siglas = 'AC' WHERE nombre = 'Gerencia Nacional de Atencion al Ciudadano';
UPDATE gerencias SET siglas = 'COM' WHERE nombre = 'Gerencia de Comercializacion';
UPDATE gerencias SET siglas = 'EE' WHERE nombre = 'Gerencia Nacional de energia alternativa y eficiencia energetica';
UPDATE gerencias SET siglas = 'GC' WHERE nombre = 'Gerencia Nacional de gestion comunical';
UPDATE gerencias SET siglas = 'UN' WHERE nombre = 'Unerven';
UPDATE gerencias SET siglas = 'VT' WHERE nombre = 'Vietven';
