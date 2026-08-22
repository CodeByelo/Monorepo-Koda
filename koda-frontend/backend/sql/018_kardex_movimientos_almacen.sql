-- 018_kardex_movimientos_almacen.sql
--
-- Contexto: KardexMovimiento (models/operations.py) es el libro mayor de
-- inventario, pero hasta ahora sólo se escribía desde venta, anulación de
-- venta y ajuste aprobado -- ninguno de esos flujos necesitaba saber en qué
-- almacén ocurrió el movimiento a nivel de columna porque no se estaba
-- cerrando el circuito con recepción de compra ni con transferencias entre
-- almacenes. Al agregar esos dos flujos al Kardex, cada movimiento nuevo sí
-- necesita quedar asociado a un almacén concreto (origen y destino en
-- transferencias, almacén receptor en recepciones); como KardexMovimiento
-- no tenía esa columna todavía, se agrega aquí.
--
-- Nullable a propósito: igual que en 014_ajustes_inventario_almacen.sql,
-- los flujos que todavía no son conscientes de almacén (venta, anulación de
-- venta, ajuste ya migrado) pueden seguir escribiendo sin almacen_id sin
-- romper la base de datos. Aun así, se hace backfill de las filas
-- existentes con el almacén de menor id (el "principal" por convención) de
-- cada tenant, para que el historial ya registrado quede asociado a un
-- almacén concreto en vez de quedar en NULL indefinidamente.
ALTER TABLE public.kardex_movimientos
    ADD COLUMN IF NOT EXISTS almacen_id INTEGER REFERENCES public.almacenes(id);

UPDATE public.kardex_movimientos km
SET almacen_id = principal.id
FROM (
    SELECT DISTINCT ON (tenant_id) tenant_id, id
    FROM public.almacenes
    WHERE activo = TRUE
    ORDER BY tenant_id, id ASC
) AS principal
WHERE km.almacen_id IS NULL
  AND km.tenant_id = principal.tenant_id;
