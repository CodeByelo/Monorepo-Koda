-- 014_ajustes_inventario_almacen.sql
--
-- Contexto: aprobar_ajuste() (routers/inventory.py) sólo actualizaba
-- Producto.stock al aprobar un ajuste de inventario (merma/sobrante), sin
-- tocar StockPorAlmacen. Eso dejaba el detalle por-almacén (usado por
-- /inventario/criticos y resumen_almacenes) desincronizado del total global
-- que usan POS/dashboard (Producto.stock). La corrección en aplicación
-- necesita saber a qué almacén pertenece cada ajuste; como AjusteInventario
-- no tenía esa columna todavía, se agrega aquí.
--
-- Nullable a propósito: aprobar_ajuste() resuelve un almacén "principal" de
-- fallback en el momento de aprobar (ver
-- backend.utils.helpers.get_almacen_principal_id) para las solicitudes que
-- no informen almacen_id explícito, así que no hace falta NOT NULL a nivel
-- de base de datos. Aun así, se hace backfill de las filas existentes con el
-- almacén de menor id (el "principal" por convención) de cada tenant, para
-- que los ajustes ya registrados queden asociados a un almacén concreto en
-- vez de quedar en NULL indefinidamente.
ALTER TABLE public.ajustes_inventario
    ADD COLUMN IF NOT EXISTS almacen_id INTEGER REFERENCES public.almacenes(id);

UPDATE public.ajustes_inventario ai
SET almacen_id = principal.id
FROM (
    SELECT DISTINCT ON (tenant_id) tenant_id, id
    FROM public.almacenes
    WHERE activo = TRUE
    ORDER BY tenant_id, id ASC
) AS principal
WHERE ai.almacen_id IS NULL
  AND ai.tenant_id = principal.tenant_id;
