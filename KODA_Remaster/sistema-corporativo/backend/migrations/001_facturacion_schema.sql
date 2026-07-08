-- =============================================================================
-- KODA ERP - MÓDULO DE FACTURACIÓN INTELIGENTE
-- Migration: 001_facturacion_schema.sql
-- Engine: PostgreSQL 15+  |  Autor: KODA Dev Team
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONES
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- índices para rangos de fechas

-- =============================================================================
-- 1. MONEDAS Y TASAS DE CAMBIO
-- =============================================================================
CREATE TABLE monedas (
    id            SMALLINT PRIMARY KEY,
    codigo        CHAR(3)      NOT NULL UNIQUE,  -- VES, USD, EUR
    nombre        VARCHAR(60)  NOT NULL,
    simbolo       VARCHAR(5)   NOT NULL,
    es_base       BOOLEAN      NOT NULL DEFAULT FALSE,  -- VES = TRUE
    activo        BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO monedas VALUES
  (1, 'VES', 'Bolívar Venezolano', 'Bs.',  TRUE),
  (2, 'USD', 'Dólar Estadounidense', '$',  FALSE);

CREATE TABLE tasas_cambio (
    id              BIGSERIAL PRIMARY KEY,
    moneda_origen   SMALLINT     NOT NULL REFERENCES monedas(id),
    moneda_destino  SMALLINT     NOT NULL REFERENCES monedas(id),
    tasa            NUMERIC(20,6) NOT NULL CHECK (tasa > 0),
    fuente          VARCHAR(20)  NOT NULL CHECK (fuente IN ('BCV','PARALELO','MANUAL')),
    vigente_desde   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    vigente_hasta   TIMESTAMPTZ,
    creado_por      UUID         NOT NULL,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índice: tasa vigente más reciente
CREATE INDEX idx_tasas_vigentes ON tasas_cambio (moneda_origen, moneda_destino, vigente_desde DESC)
    WHERE vigente_hasta IS NULL;

-- =============================================================================
-- 2. CLIENTES / PROVEEDORES (Terceros)
-- =============================================================================
CREATE TABLE terceros (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            CHAR(1)      NOT NULL CHECK (tipo IN ('C','P','A')), -- Cliente/Prov/Ambos
    rif             VARCHAR(12)  NOT NULL UNIQUE,
    razon_social    VARCHAR(200) NOT NULL,
    direccion       TEXT,
    email           VARCHAR(150),
    telefono        VARCHAR(20),
    contribuyente_especial BOOLEAN NOT NULL DEFAULT FALSE,
    retencion_iva   BOOLEAN      NOT NULL DEFAULT FALSE,  -- agente de retención IVA
    retencion_islr  BOOLEAN      NOT NULL DEFAULT FALSE,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. PRODUCTOS / SERVICIOS (Inventario mínimo)
-- =============================================================================
CREATE TABLE productos (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          VARCHAR(50)  NOT NULL UNIQUE,
    descripcion     VARCHAR(300) NOT NULL,
    tipo            CHAR(1)      NOT NULL CHECK (tipo IN ('P','S')), -- Producto/Servicio
    unidad_medida   VARCHAR(20)  NOT NULL DEFAULT 'UND',
    stock_actual    NUMERIC(14,4) NOT NULL DEFAULT 0,
    stock_minimo    NUMERIC(14,4) NOT NULL DEFAULT 0,
    costo_reposicion NUMERIC(20,6),     -- último costo de compra (USD)
    precio_base_usd  NUMERIC(20,6),     -- precio venta base (USD)
    alicuota_iva    NUMERIC(5,2) NOT NULL DEFAULT 16.00, -- 0/8/16/31
    exento_iva      BOOLEAN      NOT NULL DEFAULT FALSE,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. IMPUESTOS Y ALÍCUOTAS
-- =============================================================================
CREATE TABLE alicuotas_iva (
    id          SMALLINT PRIMARY KEY,
    nombre      VARCHAR(40) NOT NULL,
    porcentaje  NUMERIC(5,2) NOT NULL,
    vigente     BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO alicuotas_iva VALUES
  (0,  'Exento',            0.00),
  (1,  'General',          16.00),
  (2,  'Reducido',          8.00),
  (3,  'Adicional',        31.00);

-- =============================================================================
-- 5. CORRELATIVOS (Numeración Inmutable SENIAT)
-- =============================================================================
CREATE TABLE correlativos (
    id              BIGSERIAL PRIMARY KEY,
    tipo_documento  VARCHAR(20) NOT NULL,  -- FACTURA, NOTA_DEBITO, NOTA_CREDITO
    prefijo         VARCHAR(10),
    ultimo_numero   BIGINT      NOT NULL DEFAULT 0,
    anio_fiscal     SMALLINT    NOT NULL,
    mes_fiscal      SMALLINT,
    bloqueado       BOOLEAN     NOT NULL DEFAULT FALSE,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo_documento, anio_fiscal, mes_fiscal)
);

-- Función para obtener próximo correlativo (atómica)
CREATE OR REPLACE FUNCTION siguiente_correlativo(p_tipo VARCHAR, p_anio SMALLINT, p_mes SMALLINT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_num BIGINT;
BEGIN
    UPDATE correlativos
       SET ultimo_numero = ultimo_numero + 1, actualizado_en = now()
     WHERE tipo_documento = p_tipo AND anio_fiscal = p_anio AND mes_fiscal = p_mes
           AND bloqueado = FALSE
    RETURNING ultimo_numero INTO v_num;
    IF v_num IS NULL THEN
        RAISE EXCEPTION 'Correlativo % no disponible o bloqueado para %/%', p_tipo, p_anio, p_mes;
    END IF;
    RETURN v_num;
END;
$$;

-- =============================================================================
-- 6. FACTURAS (Cabecera)
-- =============================================================================
CREATE TABLE facturas (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    numero          BIGINT       NOT NULL,          -- correlativo SENIAT
    numero_control  VARCHAR(20)  NOT NULL UNIQUE,   -- XX-XXXXXXXX
    tipo_documento  VARCHAR(20)  NOT NULL CHECK (tipo_documento IN ('FACTURA','NOTA_DEBITO','NOTA_CREDITO','PROFORMA')),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'EMITIDA'
                    CHECK (estado IN ('BORRADOR','EMITIDA','PAGADA','ANULADA','VENCIDA')),

    -- Tercero
    tercero_id      UUID         NOT NULL REFERENCES terceros(id),

    -- Fechas
    fecha_emision   DATE         NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,

    -- Moneda y tasa
    moneda_id       SMALLINT     NOT NULL REFERENCES monedas(id) DEFAULT 2,  -- USD por defecto
    tasa_cambio_id  BIGINT       REFERENCES tasas_cambio(id),
    tasa_bcv_usd    NUMERIC(20,6),    -- tasa BCV al momento de emisión (snapshot)
    tasa_paralelo   NUMERIC(20,6),

    -- Método de pago (aplica IGTF)
    metodo_pago     VARCHAR(20)  CHECK (metodo_pago IN ('EFECTIVO_USD','EFECTIVO_EUR','TRANSFERENCIA_VES','PAGO_MOVIL','ZELLE','DIVISA_EXTRANJERA')),
    aplica_igtf     BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Totales (en moneda de la factura)
    subtotal        NUMERIC(20,6) NOT NULL DEFAULT 0,
    total_exento    NUMERIC(20,6) NOT NULL DEFAULT 0,
    base_16         NUMERIC(20,6) NOT NULL DEFAULT 0,
    iva_16          NUMERIC(20,6) NOT NULL DEFAULT 0,
    base_8          NUMERIC(20,6) NOT NULL DEFAULT 0,
    iva_8           NUMERIC(20,6) NOT NULL DEFAULT 0,
    base_31         NUMERIC(20,6) NOT NULL DEFAULT 0,
    iva_31          NUMERIC(20,6) NOT NULL DEFAULT 0,
    total_iva       NUMERIC(20,6) NOT NULL DEFAULT 0,
    retencion_iva   NUMERIC(20,6) NOT NULL DEFAULT 0,
    retencion_islr  NUMERIC(20,6) NOT NULL DEFAULT 0,
    igtf            NUMERIC(20,6) NOT NULL DEFAULT 0,   -- 3% en moneda extranjera
    total           NUMERIC(20,6) NOT NULL DEFAULT 0,

    -- Equivalente en VES (snapshot)
    total_ves       NUMERIC(20,6),

    -- Referencias
    factura_ref_id  UUID         REFERENCES facturas(id),  -- para NC/ND
    observaciones   TEXT,

    -- Hash de integridad (SHA-256 del contenido inmutable)
    hash_integridad VARCHAR(64)  UNIQUE,

    -- Cierre fiscal
    periodo_fiscal  CHAR(7),    -- YYYY-MM
    cerrado         BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Auditoría
    creado_por      UUID        NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_facturas_tercero    ON facturas (tercero_id);
CREATE INDEX idx_facturas_periodo    ON facturas (periodo_fiscal);
CREATE INDEX idx_facturas_estado     ON facturas (estado);
CREATE INDEX idx_facturas_fecha      ON facturas (fecha_emision DESC);

-- =============================================================================
-- 7. DETALLE DE FACTURAS
-- =============================================================================
CREATE TABLE factura_items (
    id              BIGSERIAL    PRIMARY KEY,
    factura_id      UUID         NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    linea           SMALLINT     NOT NULL,
    producto_id     UUID         REFERENCES productos(id),
    descripcion     VARCHAR(300) NOT NULL,
    unidad_medida   VARCHAR(20)  NOT NULL DEFAULT 'UND',
    cantidad        NUMERIC(14,4) NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(20,6) NOT NULL CHECK (precio_unitario >= 0),
    descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
    precio_neto     NUMERIC(20,6) NOT NULL,  -- precio_unitario * (1 - descuento/100)
    alicuota_iva_id SMALLINT     NOT NULL REFERENCES alicuotas_iva(id) DEFAULT 1,
    base_imponible  NUMERIC(20,6) NOT NULL,
    monto_iva       NUMERIC(20,6) NOT NULL DEFAULT 0,
    total_linea     NUMERIC(20,6) NOT NULL,

    -- Snapshot de costo al momento de emisión (para alerta margen)
    costo_reposicion_usd NUMERIC(20,6),
    alerta_margen   BOOLEAN      NOT NULL DEFAULT FALSE,

    UNIQUE (factura_id, linea)
);

-- =============================================================================
-- 8. TRIGGER: DESCUENTO DE STOCK EN TIEMPO REAL
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_descontar_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.producto_id IS NOT NULL THEN
        UPDATE productos
           SET stock_actual    = stock_actual - NEW.cantidad,
               actualizado_en  = now()
         WHERE id = NEW.producto_id
           AND tipo = 'P';
        -- Verificar stock negativo
        IF (SELECT stock_actual FROM productos WHERE id = NEW.producto_id) < 0 THEN
            RAISE WARNING 'Stock negativo para producto %', NEW.producto_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER stock_al_facturar
    AFTER INSERT ON factura_items
    FOR EACH ROW
    WHEN (NEW.producto_id IS NOT NULL)
    EXECUTE FUNCTION trg_descontar_stock();

-- Reversar stock al anular
CREATE OR REPLACE FUNCTION trg_revertir_stock_anulacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.estado != 'ANULADA' AND NEW.estado = 'ANULADA' THEN
        UPDATE productos p
           SET stock_actual   = p.stock_actual + fi.cantidad,
               actualizado_en = now()
          FROM factura_items fi
         WHERE fi.factura_id = NEW.id AND fi.producto_id = p.id AND p.tipo = 'P';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER stock_al_anular
    AFTER UPDATE OF estado ON facturas
    FOR EACH ROW
    EXECUTE FUNCTION trg_revertir_stock_anulacion();

-- =============================================================================
-- 9. AUDITORÍA FORENSE (INMUTABLE)
-- =============================================================================
CREATE TABLE factura_auditoria (
    id              BIGSERIAL    PRIMARY KEY,
    factura_id      UUID         NOT NULL REFERENCES facturas(id),
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20)  NOT NULL,
    campo_cambiado  VARCHAR(60),
    valor_anterior  TEXT,
    valor_nuevo     TEXT,
    motivo          TEXT,
    usuario_id      UUID         NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    timestamp_utc   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Inmutable: nadie puede UPDATE/DELETE
ALTER TABLE factura_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON factura_auditoria FOR INSERT WITH CHECK (TRUE);
CREATE POLICY audit_no_update   ON factura_auditoria FOR UPDATE USING (FALSE);
CREATE POLICY audit_no_delete   ON factura_auditoria FOR DELETE USING (FALSE);

-- Trigger automático de auditoría
CREATE OR REPLACE FUNCTION trg_auditoria_factura()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO factura_auditoria (factura_id, estado_anterior, estado_nuevo, usuario_id)
        VALUES (NEW.id, OLD.estado, NEW.estado, NEW.creado_por);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_estado_factura
    AFTER UPDATE OF estado ON facturas
    FOR EACH ROW EXECUTE FUNCTION trg_auditoria_factura();

-- =============================================================================
-- 10. PAGOS Y CONCILIACIÓN
-- =============================================================================
CREATE TABLE pagos (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id          UUID         NOT NULL REFERENCES facturas(id),
    monto               NUMERIC(20,6) NOT NULL CHECK (monto > 0),
    moneda_id           SMALLINT     NOT NULL REFERENCES monedas(id),
    metodo              VARCHAR(30)  NOT NULL CHECK (metodo IN ('TRANSFERENCIA','PAGO_MOVIL','EFECTIVO_USD','EFECTIVO_EUR','ZELLE','CHEQUE')),
    referencia          VARCHAR(100),
    banco_origen        VARCHAR(80),
    fecha_pago          DATE         NOT NULL,
    estado_verificacion VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado_verificacion IN ('PENDIENTE','VERIFICADO','RECHAZADO')),
    comprobante_url     TEXT,
    verificado_por      UUID,
    verificado_en       TIMESTAMPTZ,
    creado_por          UUID         NOT NULL,
    creado_en           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagos_factura ON pagos (factura_id);

-- =============================================================================
-- 11. RETENCIONES
-- =============================================================================
CREATE TABLE retenciones (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id      UUID         NOT NULL REFERENCES facturas(id),
    tipo            CHAR(4)      NOT NULL CHECK (tipo IN ('IVA','ISLR')),
    porcentaje      NUMERIC(5,2) NOT NULL,
    monto_retenido  NUMERIC(20,6) NOT NULL,
    numero_comprobante VARCHAR(20),
    fecha_retencion DATE         NOT NULL,
    periodo         CHAR(7)      NOT NULL,  -- YYYY-MM
    exportado       BOOLEAN      NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =============================================================================
-- 12. CIERRE FISCAL MENSUAL
-- =============================================================================
CREATE TABLE cierres_fiscales (
    id              BIGSERIAL    PRIMARY KEY,
    periodo         CHAR(7)      NOT NULL UNIQUE,  -- YYYY-MM
    cerrado_por     UUID         NOT NULL,
    cerrado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    total_ventas    NUMERIC(20,6),
    total_iva_debito NUMERIC(20,6),
    total_retenciones NUMERIC(20,6),
    observaciones   TEXT
);

-- Bloqueo automático de facturas al cerrar período
CREATE OR REPLACE FUNCTION trg_bloquear_periodo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE facturas SET cerrado = TRUE
     WHERE periodo_fiscal = NEW.periodo AND estado != 'BORRADOR';
    UPDATE correlativos SET bloqueado = TRUE
     WHERE anio_fiscal = CAST(LEFT(NEW.periodo, 4) AS SMALLINT)
       AND mes_fiscal  = CAST(RIGHT(NEW.periodo, 2) AS SMALLINT);
    RETURN NEW;
END;
$$;

CREATE TRIGGER al_cerrar_fiscal
    AFTER INSERT ON cierres_fiscales
    FOR EACH ROW EXECUTE FUNCTION trg_bloquear_periodo();

-- =============================================================================
-- 13. HASH DE INTEGRIDAD (generado en app, almacenado aquí)
-- =============================================================================
-- La función de hash se implementa en Python/FastAPI con:
-- hashlib.sha256(f"{numero}{tercero_id}{fecha_emision}{total}{creado_por}".encode()).hexdigest()
-- Se persiste en facturas.hash_integridad al momento de emitir.

-- =============================================================================
-- 14. VISTAS SENIAT
-- =============================================================================
CREATE OR REPLACE VIEW libro_ventas AS
SELECT
    f.periodo_fiscal,
    f.fecha_emision,
    f.numero_control,
    f.numero,
    f.tipo_documento,
    t.rif,
    t.razon_social,
    f.total_exento,
    f.base_16,  f.iva_16,
    f.base_8,   f.iva_8,
    f.base_31,  f.iva_31,
    f.total_iva,
    f.retencion_iva,
    f.igtf,
    f.total
FROM facturas f
JOIN terceros t ON t.id = f.tercero_id
WHERE f.tipo_documento IN ('FACTURA','NOTA_DEBITO','NOTA_CREDITO')
  AND f.estado != 'ANULADA';

-- Vista de Antigüedad de Deuda (CxC)
CREATE OR REPLACE VIEW antigüedad_deuda AS
SELECT
    t.rif,
    t.razon_social,
    f.numero_control,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.total,
    COALESCE(SUM(p.monto), 0)                               AS total_pagado,
    f.total - COALESCE(SUM(p.monto), 0)                     AS saldo_pendiente,
    CURRENT_DATE - f.fecha_vencimiento                      AS dias_vencida,
    CASE
        WHEN CURRENT_DATE <= f.fecha_vencimiento            THEN 'AL_DIA'
        WHEN CURRENT_DATE - f.fecha_vencimiento <= 30       THEN '1_30_DIAS'
        WHEN CURRENT_DATE - f.fecha_vencimiento <= 60       THEN '31_60_DIAS'
        WHEN CURRENT_DATE - f.fecha_vencimiento <= 90       THEN '61_90_DIAS'
        ELSE 'MAS_90_DIAS'
    END AS tramo_vencimiento
FROM facturas f
JOIN terceros t ON t.id = f.tercero_id
LEFT JOIN pagos p ON p.factura_id = f.id AND p.estado_verificacion = 'VERIFICADO'
WHERE f.estado NOT IN ('ANULADA','BORRADOR') AND f.tipo_documento = 'FACTURA'
GROUP BY t.rif, t.razon_social, f.id, f.numero_control, f.fecha_emision, f.fecha_vencimiento, f.total;
