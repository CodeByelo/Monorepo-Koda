-- ============================================================
-- KODA ERP — TABLA DE TASAS DE CAMBIO HISTÓRICAS DEL BCV
-- ============================================================

CREATE TABLE IF NOT EXISTS tasas_bcv (
    id SERIAL PRIMARY KEY,
    moneda VARCHAR(10) NOT NULL,
    tasa NUMERIC(18, 6) NOT NULL,
    fecha_valor DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único para evitar duplicidades por moneda en el mismo día
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasas_bcv_moneda_fecha ON tasas_bcv (moneda, fecha_valor);

-- Permisos de lectura para roles del sistema
DO $$
BEGIN
    BEGIN
        GRANT SELECT ON tasas_bcv TO authenticated;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo configurar permisos para el rol authenticated: %', SQLERRM;
    END;

    BEGIN
        GRANT SELECT ON tasas_bcv TO anon;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo configurar permisos para el rol anon: %', SQLERRM;
    END;
END$$;
