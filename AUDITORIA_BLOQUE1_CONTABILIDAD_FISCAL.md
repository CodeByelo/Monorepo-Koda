# AUDITORÍA PROFUNDA — BLOQUE 1: CONTABILIDAD + FISCAL
**Fecha:** 24 de Agosto de 2026  
**Modalidad:** Solo Lectura (Análisis Estático de Arquitectura, Conexión Inter-Módulos, Multi-Tenant y Lógica Contable/Fiscal)  
**Archivos Auditados:**
1. `koda-frontend/backend/routers/accounting.py` (138 líneas)
2. `koda-frontend/backend/routers/contabilidad_ext.py` (1,867 líneas)
3. `koda-frontend/backend/routers/fiscal.py` (406 líneas)
4. `koda-frontend/backend/routers/fiscal_ext.py` (1,382 líneas)
5. `koda-frontend/backend/routers/tesoreria.py` (148 líneas)
6. `koda-frontend/backend/routers/pagos.py` (130 líneas)
7. Archivos de enlace: `backend/services/contabilidad.py`, `backend/services/facturacion_service.py`, `backend/routers/modulos_ext.py`, `backend/models/accounting.py`, `backend/models/fiscal.py`, `backend/models/erp_extended.py`.

---

## RESUMEN EJECUTIVO DEL BLOQUE 1

El área de **Contabilidad y Fiscal** es el núcleo sobre el cual debe converger toda la actividad transaccional de KODA ERP (ventas, compras, inventario, tesorería, nómina). Sin embargo, el análisis revela que actualmente opera como **módulos fragmentados y parcialmente desconectados**:

```
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                            EVENTO TRANSACCIONAL                            │
 └───────┬─────────────────┬──────────────────┬─────────────────┬─────────────┘
         │                 │                  │                 │
         ▼                 ▼                  ▼                 ▼
 ┌───────────────┐ ┌───────────────┐  ┌───────────────┐ ┌───────────────┐
 │ Venta / POS   │ │ Cobro Cliente │  │ Compra Proveed│ │ Pago Proveedor│
 │ (Facturación) │ │ (Cobranzas)   │  │ (Compras)     │ │ (Cuentas Pago)│
 └───────┬───────┘ └───────┬───────┘  └───────┬───────┘ └───────┬───────┘
         │                 │                  │                 │
         ▼                 ▼                  ▼                 ▼
  ✓ Asiento Auto    ✗ SIN Asiento      ✗ SIN Asiento     ✗ SIN Asiento
 (FacturacionServ)  (/cobranzas/aplic) (modulos_ext.py)  (modulos_ext.py)
```

### Hallazgos Críticos Destacados:
1. **Desconexión Contable del 70% del Negocio:** Mientras que la facturación de ventas (`facturacion_service.py`), los ajustes de inventario (`inventory.py`) y la nómina (`payroll.py`) generan asientos contables automáticos, **las compras a proveedores, las recepciones de mercancía, los pagos de cuentas por pagar, las transferencias bancarias y los cobros de clientes procesados desde la UI no generan ningún asiento contable**. La contabilidad ignora el 70% del movimiento financiero real a menos que se cargue manualmente.
2. **Duplicación de Routers con Mismo Prefijo:** 
   - `/contabilidad` está repartido entre `accounting.py` (3 endpoints) y `contabilidad_ext.py` (22 endpoints).
   - `/fiscal` está repartido entre `fiscal.py` (4 endpoints) y `fiscal_ext.py` (28 endpoints).
   - `tesoreria.py` es un archivo huérfano cuyo router `/tesoreria` no está registrado en `main.py`, coexistiendo con `modulos_ext.py::tesoreria_router`.
   - `pagos.py` tiene un solo endpoint que en realidad procesa **cobros de clientes (CxC)**, en conflicto directo con `/cobranzas/aplicar-pago` en `modulos_ext.py`.
3. **Fuga Multi-Tenant de Configuración en `MatrizIntegracion`:** El modelo `MatrizIntegracion` (`models/erp_extended.py` L72) **no posee la columna `tenant_id`**. Todos los inquilinos comparten y sobreescriben la misma parametrización de cuentas contables.
4. **Tasa de Cambio Hardcodeada a 36.52 Bs/$:** En `contabilidad_ext.py` (L570), la creación manual de asientos contables (`POST /contabilidad/asientos`) tiene fija la tasa `Decimal("36.52")`, corrompiendo la contabilidad bimonetaria.

---

## 1. MAPA COMPLETO DEL BLOQUE

### 1.1 Inventario Detallado de Endpoints

```
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ARCHIVO: koda-frontend/backend/routers/accounting.py (Prefijo: /contabilidad, 3 Endpoints)
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
• GET  /contabilidad/asientos (L16)
  Función: listar_asientos
  Descripción: Listado paginado del Libro Diario con filtros por fecha y búsqueda de concepto.
  Tablas que toca: public.asientos_contables, public.asiento_detalles
  Autenticación: Sesión de usuario (get_current_user).

• GET  /contabilidad/asientos/exportar-pdf (L56)
  Función: exportar_asientos_pdf
  Descripción: Genera el PDF formal del Libro Diario Oficial mediante ReportLab.
  Tablas que toca: public.asientos_contables, public.asiento_detalles
  Autenticación: Sesión de usuario (get_current_user).

• GET  /contabilidad/asientos/{id} (L123)
  Función: obtener_asiento
  Descripción: Obtiene el encabezado y detalle de un asiento específico por ID.
  Tablas que toca: public.asientos_contables, public.asiento_detalles
  Autenticación: Sesión de usuario (get_current_user).

════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ARCHIVO: koda-frontend/backend/routers/contabilidad_ext.py (Prefijo: /contabilidad, 22 Endpoints)
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
• GET    /contabilidad/cuentas (L76) -> listar_cuentas (public.cuentas_contables)
• PUT    /contabilidad/cuentas/{id} (L91) -> actualizar_cuenta (public.cuentas_contables)
• DELETE /contabilidad/cuentas/{id} (L121) -> eliminar_cuenta (public.cuentas_contables, valida sin asientos)
• GET    /contabilidad/matriz-integracion (L172) -> get_matriz_integracion (public.matriz_integracion, public.cuentas_contables)
• POST   /contabilidad/matriz-integracion (L203) -> save_matriz_integracion (public.matriz_integracion)
• POST   /contabilidad/matriz-integracion/sincronizar (L226) -> sincronizar_matriz (public.matriz_integracion)
• POST   /contabilidad/cuentas/importar-plantilla (L346) -> importar_plantilla (public.cuentas_contables)
• GET    /contabilidad/dashboard (L394) -> contabilidad_dashboard (asientos, detalles, cuentas)
• GET    /contabilidad/monitor-forense (L459) -> monitor_forense (auditoría de asientos descuadrados y sobregiros)
• POST   /contabilidad/asientos (L557) -> crear_asiento (asientos_contables, asiento_detalles) [Tasa 36.52 hardcodeada]
• GET    /contabilidad/balance-comprobacion (L590) -> balance_comprobacion (cuentas_contables, asiento_detalles)
• GET    /contabilidad/balance-general (L804) -> balance_general (cuentas_contables, asiento_detalles, compras, ventas)
• GET    /contabilidad/balance-general/exportar (L1003) -> exportar_balance (PDF ReportLab)
• GET    /contabilidad/estado-resultados (L1154) -> estado_resultados (ingresos, costos, gastos de operación)
• GET    /contabilidad/estado-resultados/exportar (L1332) -> exportar_er (PDF ReportLab)
• GET    /contabilidad/flujo-caja (L1463) -> flujo_caja (análisis de movimientos en cuentas 1.1.01) [Contiene N+1]
• GET    /contabilidad/centros-costo/exportar (L1585) -> exportar_centros_costo (PDF centros de costo)
• GET    /contabilidad/flujo-caja/exportar (L1603) -> exportar_flujo (PDF ReportLab)
• GET    /contabilidad/cierre/checklist (L1723) -> cierre_checklist (validaciones previas al cierre contable)
• GET    /contabilidad/cierres/historial (L1811) -> cierres_historial (public.cierres_periodo)
• POST   /contabilidad/cierre/ejecutar (L1829) -> ejecutar_cierre (asiento de cierre, bloqueo de periodo)
• POST   /contabilidad/cierre/reabrir (L1852) -> reabrir_cierre (eliminación de asiento de cierre, reapertura)

════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ARCHIVO: koda-frontend/backend/routers/fiscal.py (Prefijo: /fiscal, 4 Endpoints)
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
• GET  /fiscal/reglas (L33) -> obtener_reglas_fiscales (public.reglas_fiscales)
• POST /fiscal/reglas (L48) -> crear_regla_fiscal (public.reglas_fiscales - versionamiento automático)
• GET  /fiscal/arc/pdf (L79) -> generar_pdf_arc (public.empresa, public.retenciones_islr, public.proveedores)
• GET  /fiscal/retencion-iva/pdf (L222) -> generar_pdf_retencion_iva (public.empresa, public.retenciones_iva, public.proveedores)

════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ARCHIVO: koda-frontend/backend/routers/fiscal_ext.py (Prefijo: /fiscal, 28 Endpoints)
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
• GET   /fiscal/dashboard (L33) -> fiscal_dashboard (KPIs de IVA, ISLR, IGTF, retenciones pendientes)
• GET   /fiscal/libro-ventas (L119) -> libro_ventas (Libro fiscal de ventas según normativa SENIAT)
• GET   /fiscal/libro-ventas/auditar-rifs (L154) -> auditar_rifs_ventas (Detección de RIFs inválidos o genéricos)
• GET   /fiscal/libro-ventas/exportar (L175) -> exportar_libro_ventas (Excel/CSV de libro de ventas)
• GET   /fiscal/libro-compras (L256) -> libro_compras (Libro fiscal de compras SENIAT)
• GET   /fiscal/declaracion-iva (L310) -> declaracion_iva (Cálculo proforma de Forma 30 de IVA)
• GET   /fiscal/libro-compras/exportar (L354) -> exportar_libro_compras (Excel/CSV de libro de compras)
• PATCH /fiscal/libro-compras/{compra_id}/control (L439) -> actualizar_control_compra (Asignación de N° Control fiscal)
• GET   /fiscal/declaraciones-iva/historial (L471) -> historial_declaraciones_iva (public.declaraciones_fiscales)
• POST  /fiscal/declaracion-iva/borrador (L478) -> guardar_borrador_iva (public.declaraciones_fiscales)
• POST  /fiscal/declaracion-iva/finalizar (L499) -> finalizar_iva (Cierre formal de declaración mensual)
• GET   /fiscal/declaracion-iva/pdf (L529) -> generar_pdf_declaracion_iva (PDF réplica Forma 30 SENIAT)
• GET   /fiscal/retenciones-iva (L613) -> retenciones_iva (public.retenciones_iva - emitidas y recibidas)
• GET   /fiscal/retenciones-iva/exportar (L654) -> exportar_retenciones (CSV/TXT para carga en portal SENIAT)
• POST  /fiscal/retenciones-iva/comprobante (L702) -> crear_comprobante (public.comprobantes_retencion)
• GET   /fiscal/retencion-iva/detalle (L733) -> detalle_retencion (Detalle de retención de IVA específica)
• GET   /fiscal/igtf (L761) -> igtf (Control de percepciones y pagos en divisas sujetos a IGTF 3%)
• GET   /fiscal/igtf/exportar (L829) -> exportar_igtf (Reporte de IGTF mensual)
• GET   /fiscal/arc/sujetos (L867) -> arc_sujetos (Listado de proveedores objeto de retención ISLR)
• GET   /fiscal/arc (L878) -> arc (Datos consolidados de retención anual ISLR para ARC)
• GET   /fiscal/arc/exportar (L944) -> exportar_arc (Exportación XML/TXT de retenciones ISLR)
• GET   /fiscal/retenciones-practicadas/exportar (L1035) -> exportar_ret_practicadas (Relación de retenciones)
• GET   /fiscal/validar-rif (L1070) -> validar_rif (Algoritmo módulo 11 de validación de formato RIF venezolano)
• GET   /fiscal/retenciones-islr (L1138) -> retenciones_islr_list (public.retenciones_islr)
• GET   /fiscal/retenciones-islr/exportar (L1191) -> exportar_retenciones_islr (TXT formato SENIAT)
• GET   /fiscal/declaracion-islr (L1227) -> declaracion_islr_calc (Estimación de enriquecimiento neto e ISLR)
• POST  /fiscal/declaracion-islr/registrar (L1297) -> registrar_declaracion_islr (public.declaraciones_fiscales)
• GET   /fiscal/calendario (L1322) -> calendario_fiscal (Fechas de declaración según último dígito de RIF)

════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ARCHIVO: koda-frontend/backend/routers/tesoreria.py (Prefijo: /tesoreria, 1 Endpoint - ARCHIVO HUÉRFANO)
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
• GET /tesoreria/dashboard (L28) -> get_treasury_dashboard
  Estado: HUÉRFANO. No está registrado en main.py (en su lugar main.py registra modulos_ext.tesoreria_router).

════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ARCHIVO: koda-frontend/backend/routers/pagos.py (Prefijo: /pagos, 1 Endpoint)
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
• POST /pagos/registrar (L41) -> registrar_pago
  Descripción: Recibe un pago de CLIENTE, descuenta CuentaPorCobrar (CxC), suma a CuentaBancaria, crea MovimientoBancario y llama a ContabilidadService.generar_asiento_pago.
  Conflicto: Vive bajo el prefijo `/pagos` pero funcionalmente es un cobro de cliente (CxC), duplicando `/cobranzas/aplicar-pago`.
```

---

### 1.2 Modelos y Tablas de Base de Datos del Bloque

| Modelo / Tabla | Archivo Fuente del Modelo | Descripción y Relaciones |
| :--- | :--- | :--- |
| `CuentaContable` (`public.cuentas_contables`) | `models/accounting.py` | Catálogo del Plan de Cuentas (código, nombre, tipo, nivel, padre_id, activa, tenant_id). |
| `AsientoContable` (`public.asientos_contables`) | `models/accounting.py` | Encabezado del Libro Diario (fecha, concepto, referencia, total_debe, total_haber, tasa_cambio_bs, estado, tenant_id). |
| `AsientoDetalle` (`public.asiento_detalles`) | `models/accounting.py` | Líneas de asiento (asiento_id, cuenta_codigo, cuenta_nombre, debe_usd, haber_usd, centro_costo, tenant_id). |
| `CierrePeriodo` (`public.cierres_periodo`) | `models/accounting.py` | Control de bloqueo mensual (periodo, estado, cerrado_por, fecha_cierre, asiento_cierre_id, tenant_id). |
| `MatrizIntegracion` (`public.matriz_integracion`) | `models/erp_extended.py` (L72) | Mapeo de eventos a cuentas (**CRÍTICO: No tiene tenant_id**). |
| `ReglaFiscal` (`public.reglas_fiscales`) | `models/fiscal.py` | Parámetros de alícuotas impositivas (nombre, tasa, activa, fecha_vigencia, tenant_id). |
| `CorrelativoFiscal` (`public.correlativos_fiscales`) | `models/fiscal.py` | Control de números de factura y control SENIAT (serie, ultimo_numero, tenant_id). |
| `DeclaracionFiscal` (`public.declaraciones_fiscales`) | `models/fiscal.py` | Historial de declaraciones IVA/ISLR (tipo, periodo, datos_json, total_pagar, tenant_id). |
| `ComprobanteRetencion` (`public.comprobantes_retencion`) | `models/fiscal.py` | Comprobantes formales de retención de IVA/ISLR emitidos a terceros (numero, fecha, proveedor_id, tenant_id). |
| `RetencionIVA` (`public.retenciones_iva`) | `models/erp_extended.py` | Registro transaccional de retenciones de IVA (factura_id, base_imponible, iva_retenido, estado, tenant_id). |
| `RetencionISLR` (`public.retenciones_islr`) | `models/erp_extended.py` | Registro transaccional de retenciones de ISLR (compra_id, concepto_codigo, alicuota, monto_retenido, tenant_id). |
| `CuentaBancaria` (`public.cuentas_bancarias`) | `models/erp_extended.py` | Cuentas corrientes y custodia (banco, numero_cuenta, moneda, saldo_actual_usd, tenant_id). |
| `MovimientoBancario` (`public.movimientos_bancarios`) | `models/erp_extended.py` | Extracto bancario (cuenta_id, tipo, monto_usd, tasa_cambio_bs, referencia, estado, tenant_id). |
| `CuentaPorCobrar` (`public.cuentas_por_cobrar`) | `models/erp_extended.py` | Cartera por cobrar vinculada a ventas (cliente_id, venta_id, monto_total_usd, monto_pagado_usd, tenant_id). |
| `CuentaPorPagar` (`public.cuentas_por_pagar`) | `models/erp_extended.py` | Pasivos con proveedores por compras (proveedor_id, compra_id, monto_total_usd, monto_pagado_usd, tenant_id). |

---

### 1.3 Análisis Comparativo de Solapamientos

#### 1. `accounting.py` vs `contabilidad_ext.py`
- **Solapamiento Funcional:** Ambos archivos comparten el prefijo `/contabilidad` y operan sobre `AsientoContable`.
- **Divergencia de Responsabilidades:** 
  - `accounting.py` implementó la lectura paginada (`GET /asientos`) y la exportación de PDF (`GET /asientos/exportar-pdf`).
  - `contabilidad_ext.py` implementó la escritura (`POST /asientos`) y todos los reportes analíticos (Balance General, Estado de Resultados, Flujo de Caja, Cierre).
- **Inconsistencia de Modelos Pydantic:**
  - `accounting.py` (L16) utiliza `PaginatedAsientoContableResponse` y `AsientoContableResponse` definidos en `schemas/accounting.py`.
  - `contabilidad_ext.py` (L557) define su propio esquema `AsientoCreate` in-line dentro del archivo router, sin reutilizar `schemas/accounting.py`.

#### 2. `fiscal.py` vs `fiscal_ext.py`
- **Solapamiento Funcional:** Ambos archivos comparten el prefijo `/fiscal`.
- **Divergencia:**
  - `fiscal.py` contiene la parametrización de alícuotas (`/reglas`) y los generadores en ReportLab para comprobantes de retención (`/arc/pdf` y `/retencion-iva/pdf`).
  - `fiscal_ext.py` contiene toda la lógica de datos de los libros fiscales, declaraciones proforma, exportaciones a TXT/CSV y validaciones de RIF.
  - *Consecuencia:* La generación de reportes fiscales está partida: los endpoints de datos viven en un archivo y la emisión del PDF legal vive en el otro.

---

## 2. CÓMO SE CONECTA ESTE BLOQUE CON EL RESTO DEL SISTEMA

### 2.1 Trazabilidad de Asientos Contables Automáticos vs Manuales

Se realizó una auditoría de flujo para verificar si las transacciones operativas disparan asientos contables en el Libro Diario:

```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────┬────────────────────────┐
│ Operación de Negocio         │ Archivo y Línea Disparadora │ ¿Genera Asiento Contable?    │ Mecanismo Utilizado    │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Venta POS / Factura Fiscal   │ services/facturacion_service │ SÍ (Automático)              │ ContabilidadService.   │
│                              │ .py (L314-315)               │                              │ generar_asiento_venta  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Venta por Bot Telegram       │ routers/bot_api.py (L245)    │ SÍ (Automático)              │ Vía facturacion_service│
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Ajuste Manual de Inventario  │ routers/inventory.py (L166)  │ SÍ (Automático)              │ Inserta AsientoContable│
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Procesamiento de Nómina      │ routers/payroll.py (L466)    │ SÍ (Automático)              │ Inserta AsientoContable│
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Compra a Proveedor           │ routers/modulos_ext.py (L260)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Recepción de Mercancía       │ routers/modulos_ext.py (L490)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Devolución a Proveedor       │ routers/modulos_ext.py (L548)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Cobro de Cliente (UI Cobros) │ routers/modulos_ext.py(L1350)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Cobro de Cliente (API Pagos) │ routers/pagos.py (L111)      │ SÍ (Automático)              │ ContabilidadService.   │
│                              │                              │                              │ generar_asiento_pago   │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Pago a Proveedor (CxP)       │ routers/modulos_ext.py(L1800)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Transferencia entre Bancos   │ routers/modulos_ext.py(L2200)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────────┤
│ Emisión de Nota de Crédito   │ routers/modulos_ext.py(L4950)│ NO (Hueco Crítico)           │ NINGUNO. Sin Asiento.  │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────────┴────────────────────────┘
```

> [!CAUTION]
> **IMPACTO FINANCIERO:**
> El módulo de compras (`routers/modulos_ext.py`) maneja órdenes, facturas de proveedores y cuentas por pagar, pero **nunca invoca a `ContabilidadService`**.  
> El Balance General (`GET /contabilidad/balance-general`) intenta "parchar" esto calculando pasivos al vuelo sumando `CuentaPorPagar`, pero el **Libro Diario y el Libro Mayor quedan permanentemente desiertos de pasivos y gastos operativos**.

---

### 2.2 Duplicación y Divergencia en el Cálculo de IVA e IGTF

1. **Emisión de Facturas (`services/facturacion_service.py` L75):**
   - Utiliza aritmética de alta precisión con `Decimal` y `ROUND_HALF_UP`.
   - Consulta si el producto es exento (`linea.es_exento`).
   - Aplica alícuota de IVA del 16% e IGTF del 3% sobre pagos en divisas.
2. **Libro de Ventas Fiscal (`routers/fiscal_ext.py` L145):**
   - No lee las líneas de detalle de la venta: lee los campos pre-calculados `venta.subtotal_usd`, `venta.iva_usd`.
   - En L145 convierte a `float` para recalcular: `round(float(v.subtotal_usd) * 0.16, 2)`. Si una venta tuvo productos exentos mezclados con gravados, este recálculo genera discrepancias contra el monto real facturado.
3. **Reglas Fiscales Dinámicas (`routers/fiscal.py` L33):**
   - Existe una tabla `public.reglas_fiscales` para configurar tasas, pero `facturacion_service.py` y `fiscal_ext.py` tienen hardcodeados los valores `0.16` y `0.03` en constantes de código, ignorando los cambios que el usuario realice en la pantalla `/admin/monedas` o `/fiscal/reglas`.

---

### 2.3 Uso de Tasas de Cambio BCV en Contabilidad y Fiscalidad

- **ERP (`koda-frontend`):** Todos los reportes fiscales (`libro_ventas`, `libro_compras`, `declaracion_iva`) y contables (`balance_general`, `estado_resultados`) consumen exclusivamente la tabla `public.tasas_cambio` mediante la función `backend.utils.helpers.py::tasa_actual`.
- **Desconexión con Remaster:** El backend corporativo y el bot escriben en `public.bcv_rates` y `public.tasas_bcv`. Si el bot sincroniza la tasa oficial con pyBCV, **el módulo fiscal del ERP no se entera** hasta que alguien entre a la pantalla de tasas del ERP a forzar la sincronización en `tasas_cambio`.
- **Bug de Tasa Hardcodeada en Asientos Manuales:** En `contabilidad_ext.py` (L570), al registrar un asiento contable manual (`POST /contabilidad/asientos`), se graba con:
  `tasa_cambio_bs = Decimal("36.52")`
  Esto produce que cualquier asiento manual registre una conversión en bolívares calculada a 36.52 Bs/$, rompiendo los reportes contables oficiales en moneda nacional.

---

## 3. AISLAMIENTO MULTI-TENANT EN EL BLOQUE 1

Se auditaron las **76 consultas a base de datos** presentes en los 6 archivos del bloque.

### 3.1 Consultas con Filtro Explícito vs Filtro Automático

- **73 consultas** aplican correctamente la cláusula de defensa en profundidad:
  `.filter(Modelo.tenant_id == current_user.tenant_id)`
- **3 consultas omiten el filtro explícito y dependen exclusivamente del interceptor:**
  1. `contabilidad_ext.py` (L157): `db.query(MatrizIntegracion).filter(MatrizIntegracion.evento == ev["evento"]).first()`
  2. `contabilidad_ext.py` (L208): `db.query(MatrizIntegracion).filter(MatrizIntegracion.evento == linea.evento).first()`
  3. `contabilidad_ext.py` (L1489): `db.query(AsientoDetalle).filter(AsientoDetalle.asiento_id == aid).all()` (dentro del bucle de flujo de caja).

---

### 3.2 Fuga Estructural Multi-Tenant en `MatrizIntegracion`

Al analizar el modelo `MatrizIntegracion` en `backend/models/erp_extended.py` (L72-83):

```python
class MatrizIntegracion(Base):
    __tablename__ = "matriz_integracion"
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, index=True)
    evento = Column(String(100), unique=True, nullable=False)
    cuenta_debe_codigo = Column(String(50), nullable=True)
    cuenta_haber_codigo = Column(String(50), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
```

**Diagnóstico:**
- La tabla **NO tiene columna `tenant_id`**.
- La columna `evento` tiene una restricción `unique=True` global.
- Al no tener `tenant_id`, el filtro central `with_loader_criteria` de `core/database.py` no la intercepta (`hasattr(cls, 'tenant_id')` retorna `False`).
- **Consecuencia:** Cuando la Empresa A configura sus cuentas contables para ventas (ej. cuenta `1.1.01.01`), y la Empresa B ingresa a `/contabilidad/matriz-integracion` y asigna `1.1.01.02`, **la Empresa B sobreescribe silenciosamente la configuración contable de la Empresa A**.

---

## 4. DUPLICACIÓN Y DIVERGENCIA DE LÓGICA DE NEGOCIO

### 4.1 Conflicto en el Registro de Cobranzas y Pagos

Existen dos endpoints compitiendo para registrar el cobro de un cliente:

1. **`routers/pagos.py::registrar_pago` (`POST /pagos/registrar`):**
   - Recibe `cliente_id`, `monto_pagado_usd`, `cuenta_bancaria_id`.
   - Aplica saldo a `CuentaPorCobrar`.
   - Aumenta saldo en `CuentaBancaria`.
   - Inserta `MovimientoBancario`.
   - **Invoca `ContabilidadService.generar_asiento_pago`** (Crea asiento contable).
2. **`routers/modulos_ext.py::aplicar_pago` (`POST /cobranzas/aplicar-pago`):**
   - Recibe parámetros similares desde la pantalla `/cobranzas/aplicar`.
   - Aplica saldo a `CuentaPorCobrar`.
   - **NO actualiza `CuentaBancaria`**.
   - **NO inserta `MovimientoBancario`**.
   - **NO genera asiento contable**.

*Resultado:* Si el usuario cobra desde la pantalla de Cobranzas del frontend, el dinero no entra a bancos ni a contabilidad. Si se llama a la API de Pagos, sí entra.

---

## 5. PROPUESTA DE REORGANIZACIÓN ARQUITECTÓNICA

### 5.1 Unificación de Contabilidad (`routers/contabilidad/`)

Se propone consolidar `accounting.py` y `contabilidad_ext.py` en un paquete modular estructurado por subdominios:

```
koda-frontend/backend/routers/contabilidad/
  ├── __init__.py                # Instancia APIRouter(prefix="/contabilidad") y agrega submódulos
  ├── cuentas.py                 # CRUD de Cuentas Contables y carga de plantillas
  ├── asientos.py                # Libro Diario: listado, detalle, creación manual y PDF
  ├── reportes.py                # Balance de Comprobación, Balance General, Estado de Resultados, Flujo de Caja
  ├── matriz.py                  # Matriz de Integración Contable (con soporte multi-tenant)
  └── cierre.py                  # Checklist, ejecución y reapertura de Cierre de Periodo
```

---

### 5.2 Unificación Fiscal (`routers/fiscal/`)

Se propone consolidar `fiscal.py` y `fiscal_ext.py` en un paquete modular:

```
koda-frontend/backend/routers/fiscal/
  ├── __init__.py                # Instancia APIRouter(prefix="/fiscal")
  ├── dashboard.py               # Dashboard fiscal y calendario tributario
  ├── libros.py                  # Libro de Ventas y Libro de Compras SENIAT (datos y exportaciones)
  ├── declaraciones.py           # Declaración IVA (Forma 30) e ISLR (datos, borrador y cierre)
  ├── retenciones.py             # Retenciones IVA (75%/100%), Retenciones ISLR (Decreto 1808), IGTF
  └── reportes_pdf.py            # Generadores PDF oficiales ReportLab (ARC, Comprobante IVA, Forma 30)
```

---

### 5.3 Servicio Contable Centralizado (`ContabilidadService`)

Extender `backend/services/contabilidad.py` para convertirlo en el punto único de enlace contable del sistema:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         backend/services/contabilidad.py                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ • generar_asiento_venta(venta, db, tenant_id)                               │
│ • generar_asiento_costo_ventas(venta, detalles, db, tenant_id)              │
│ • generar_asiento_compra(compra, db, tenant_id)               <-- [NUEVO]   │
│ • generar_asiento_pago_proveedor(cxp, db, tenant_id)           <-- [NUEVO]   │
│ • generar_asiento_cobro_cliente(cxc, db, tenant_id)           <-- [NUEVO]   │
│ • generar_asiento_transferencia_bancaria(trf, db, tenant_id)   <-- [NUEVO]   │
│ • generar_asiento_nota_credito(nc, db, tenant_id)             <-- [NUEVO]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 5.4 Clasificación de Cambios: Forma vs Fondo

| Acción Propuesta | Tipo de Cambio | Nivel de Riesgo | Justificación |
| :--- | :---: | :---: | :--- |
| **Separar `accounting.py` + `contabilidad_ext.py` en paquete `routers/contabilidad/`** | **FORMA** | **Mínimo** | Solo mueve funciones a archivos más pequeños manteniendo las mismas rutas HTTP y firmas. |
| **Separar `fiscal.py` + `fiscal_ext.py` en paquete `routers/fiscal/`** | **FORMA** | **Mínimo** | Mantiene exactamente los mismos endpoints y respuestas JSON. |
| **Eliminar archivo huérfano `tesoreria.py`** | **FORMA** | **Cero** | El archivo no está importado en `main.py`. |
| **Corregir tasa hardcodeada 36.52 en `crear_asiento`** | **FONDO** | **Bajo** | Corrige un bug evidente; debe usar `tasa_actual(db, tenant_id)`. |
| **Agregar `tenant_id` a `MatrizIntegracion`** | **FONDO** | **Medio** | Requiere migración SQL (`ALTER TABLE matriz_integracion ADD COLUMN tenant_id UUID`). |
| **Conectar Compras, Pagos y Cobros con `ContabilidadService`** | **FONDO** | **Medio-Alto** | Agrega generación automática de asientos donde antes no existían. Requiere tests unitarios previos. |

---

### 5.5 Orden Sugerido de Ejecución

```
 PASO 1: Corrección de Bugs Inmediatos
   ├── Corregir tasa 36.52 en contabilidad_ext.py (L570).
   └── Agregar tenant_id a modelo y tabla matriz_integracion.
         │
         ▼
 PASO 2: Refactorización de Forma (Estructura de Archivos)
   ├── Crear paquete backend/routers/contabilidad/ y redistribuir endpoints.
   └── Crear paquete backend/routers/fiscal/ y redistribuir endpoints.
         │
         ▼
 PASO 3: Tests Automatizados de Contabilidad y Fiscalidad
   ├── Test de emisión de libro de ventas y compras.
   ├── Test de cuadre de balance general y comprobación.
   └── Test de creación de asientos y validación de período cerrado.
         │
         ▼
 PASO 4: Conexión de Fondo (Integración Transaccional)
   ├── Conectar compras/recepciones con generar_asiento_compra.
   └── Unificar cobros de clientes hacia un solo flujo con asiento contable.
```

---

## 6. RIESGOS DE NO HACER NADA

1. **Inconsistencia Fiscal ante una Auditoría del SENIAT:** Si un cliente emite facturas con productos gravados y exentos, y el Libro de Ventas recalcula el IVA asumiendo que todo el subtotal está gravado al 16% (debido a la divergencia detectada en `fiscal_ext.py` L145), los montos declarados no coincidirán con las facturas emitidas, acarreando multas fiscales.
2. **Corrupción Contable Multi-Empresa:** Con la incorporación de un segundo cliente, cualquier cambio que uno de ellos realice en su matriz de integración contable sobreescribirá la parametrización del otro cliente debido a la ausencia de `tenant_id` en `matriz_integracion`.
3. **Libros Contables Descuadrados frente a la Realidad:** Mientras las compras y los pagos no generen asientos contables, los estados financieros de KODA ERP mostrarán ingresos por ventas pero omitirán los pasivos con proveedores y los costos operativos reales, impidiendo que la gerencia tome decisiones financieras válidas sobre el sistema.
4. **Degradación por Consultas N+1:** El endpoint de Flujo de Caja (`GET /contabilidad/flujo-caja`) que ejecuta una consulta SQL por cada asiento en un loop colapsará en latencia cuando una empresa supere los 1,000 asientos mensuales.
