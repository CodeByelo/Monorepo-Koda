-- ============================================
-- TEST DE SEGURIDAD: Validar aislamiento RLS
-- EJECUTAR EN SQL EDITOR DE SUPABASE
-- ============================================

-- Paso 1: Crear dos organizaciones de prueba
INSERT INTO organizations (id, name, slug) VALUES 
('00000000-0000-0000-0000-000000000001', 'Empresa A', 'empresa-a'),
('00000000-0000-0000-0000-000000000002', 'Empresa B', 'empresa-b');

-- Paso 2: Crear documentos para cada empresa
-- Nota: tenant_id es requerido por las políticas RLS
INSERT INTO documentos (id, tenant_id, title, user_id) VALUES 
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Doc Secreto Empresa A', '00000000-0000-0000-0000-000000000000'), -- Asumiendo un ID de usuario genérico o existente
('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000002', 'Doc Secreto Empresa B', '00000000-0000-0000-0000-000000000000');

-- Paso 3: Simular sesión de Empresa A
SET app.current_tenant_id = '00000000-0000-0000-0000-000000000001';

-- Paso 4: Intentar consultar (debería SOLO ver documentos de Empresa A)
SELECT title FROM documentos;

-- RESULTADO ESPERADO: Solo debe mostrar "Doc Secreto Empresa A"
-- Si muestra ambos documentos, el RLS NO está funcionando.

-- Paso 5: Limpiar sesión
RESET app.current_tenant_id;

-- Paso 6: Limpieza (eliminar datos de prueba)
DELETE FROM documentos WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
);
DELETE FROM organizations WHERE id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
);
