-- 013_nomina_period_overlap_guard.sql
--
-- Contexto: este backend tiene DOS motores de nómina independientes y paralelos
-- (routers/hr.py POST /rrhh/nomina/procesar y routers/payroll.py POST
-- /payroll/process/confirm) que escriben cada uno, por su cuenta, filas en la
-- tabla compartida `public.nominas`. Sin una defensa a nivel de base de datos,
-- ambos motores podrían procesar y contabilizar el mismo tenant/período dos
-- veces (una por cada motor, o incluso dos veces por el mismo motor bajo una
-- condición de carrera), generando doble contabilización silenciosa.
--
-- El chequeo de aplicación (en ambos routers, ver comentarios "GUARD" ahí) es
-- solo una mejora de UX de fallo-rápido: no es atómico y puede perder una
-- condición de carrera (dos requests concurrentes pasando la verificación
-- SELECT antes de que cualquiera haga COMMIT). La defensa real es este
-- EXCLUDE constraint, que PostgreSQL aplica de forma atómica a nivel de
-- índice GiST en cada INSERT/UPDATE.
--
-- Requiere la extensión btree_gist para poder usar el operador de igualdad
-- (=) sobre tenant_id (un tipo btree) dentro de un índice GiST junto al
-- operador de solapamiento (&&) sobre el daterange.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Solo se exige la restricción cuando ambas fechas están pobladas: las filas
-- históricas (procesadas antes de que existieran estas columnas) tienen
-- fecha_inicio/fecha_fin NULL y deben quedar exentas. La predicado parcial
-- WHERE es sintaxis estándar de PostgreSQL para EXCLUDE constraints (igual
-- que en un índice parcial).
ALTER TABLE public.nominas
    ADD CONSTRAINT nominas_no_overlap_por_tenant
    EXCLUDE USING gist (
        tenant_id WITH =,
        daterange(fecha_inicio, fecha_fin, '[]') WITH &&
    )
    WHERE (fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL);
