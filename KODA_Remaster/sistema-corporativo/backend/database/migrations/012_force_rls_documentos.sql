-- documentos, tickets, hojas_de_ruta y documento_adjuntos quedaron con
-- ENABLE ROW LEVEL SECURITY (001_multi_tenant_rls.sql, 004_rls_hardening.sql)
-- pero sin FORCE, a diferencia de las demas tablas saneadas en
-- 009_rbac_saneamiento.sql. Sin FORCE, el rol propietario de la tabla
-- (con el que se conecta la app) se salta RLS por completo.

ALTER TABLE public.documentos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hojas_de_ruta FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documento_adjuntos FORCE ROW LEVEL SECURITY;
