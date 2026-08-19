-- ==========================================
-- POLÍTICAS DE ROW-LEVEL SECURITY (RLS)
-- ==========================================

-- Habilitar RLS en las tablas críticas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos_contables ENABLE ROW LEVEL SECURITY;
ALTER TABLE asiento_detalles ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para Usuarios
-- Un usuario solo puede verse a sí mismo o el Admin puede ver a todos.
CREATE POLICY "Usuarios pueden ver su propio perfil" ON usuarios
  FOR SELECT USING (
    email = current_setting('request.jwt.claims', true)::json->>'sub' 
    OR current_setting('request.jwt.claims', true)::json->>'rol' = 'Admin'
  );

-- 2. Políticas para Asientos Contables y Detalles (Reportes/Métricas)
-- Solo Admin y Contabilidad pueden leer los asientos.
CREATE POLICY "Acceso a asientos contables por rol" ON asientos_contables
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Contabilidad')
  );

CREATE POLICY "Acceso a detalles contables por rol" ON asiento_detalles
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Contabilidad')
  );

-- 3. Políticas para Ventas y Clientes
-- Ventas, Contabilidad y Admin pueden leer.
CREATE POLICY "Acceso a clientes" ON clientes
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Contabilidad', 'Ventas')
  );

CREATE POLICY "Acceso a ventas" ON ventas
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'rol' IN ('Admin', 'Contabilidad', 'Ventas')
  );

-- Nota de Rendimiento (Supabase Best Practices):
-- Las funciones current_setting son evaluadas eficientemente por Postgres.
-- Para reglas más complejas, se deben envolver en (SELECT ...) para que se evalúen una vez por consulta.
