# AUDITORÍA DE ARQUITECTURA TÉCNICA — KODA ERP & SISTEMA CORPORATIVO
**Fecha:** 24 de Agosto de 2026  
**Modalidad:** Solo Lectura (Auditoría Estática de Arquitectura, Seguridad, Multi-Tenant y Frontend UX)  
**Alcance:** Monorepo (`koda-frontend/backend`, `KODA_Remaster/sistema-corporativo/backend`, `koda-frontend/src`)  
**Objetivo:** Mapa integral de riesgos, dependencias ocultas, duplicación de lógica, aislamiento multi-tenant y plan de estabilización previo al escalamiento multi-cliente.

---

## RESUMEN EJECUTIVO

KODA opera como un monorepo con **dos backends FastAPI independientes** que interactúan sobre la **misma base de datos física PostgreSQL en Supabase**, acompañados de un frontend React (Vite/TypeScript) y un frontend institucional (Next.js).

```
 ┌────────────────────────────────────────────────────────┐
 │                     POSTGRESQL (Supabase)              │
 └──────────────┬──────────────────────────┬──────────────┘
                │                          │
                ▼                          ▼
 ┌──────────────────────────────┐ ┌──────────────────────────────┐
 │    koda-frontend/backend     │ │ KODA_Remaster/backend        │
 │  (ERP / Facturación / POS /  │ │ (Institucional / Telegram /  │
 │   Inventario / Contabilidad) │ │  Gestión Documental / SSO)   │
 │   • 291 endpoints            │ │  • 107 endpoints             │
 │   • SQLAlchemy ORM           │ │  • Asyncpg Raw Queries       │
 └──────────────┬───────────────┘ └──────────────┬───────────────┘
                │                                │
                ▼                                ▼
 ┌──────────────────────────────┐ ┌──────────────────────────────┐
 │    koda-frontend/src         │ │ frontend-enterprise          │
 │ (133 rutas / 132 pantallas)  │ │ (Dashboard Corporativo)      │
 └──────────────────────────────┘ └──────────────────────────────┘
```

### Estadísticas Globales del Sistema
- **Total Endpoints Backend:** **398 endpoints** (291 en `koda-frontend/backend` + 107 en `KODA_Remaster/sistema-corporativo/backend`).
- **Total Rutas Frontend (ERP):** **133 rutas** registradas en `src/App.tsx` distribuidas en **132 archivos de páginas**.
- **God Files Críticos Identificados:** 
  1. `koda-frontend/backend/routers/modulos_ext.py` (**6,619 líneas**, 101 endpoints, 9 módulos mezclados).
  2. `KODA_Remaster/sistema-corporativo/backend/main.py` (**5,286 líneas**, 63 endpoints, monolito procedural).
  3. `koda-frontend/backend/routers/extras_ext.py` (**3,045 líneas**, 79 endpoints).
  4. `koda-frontend/backend/routers/logistica.py` (**1,975 líneas**, 29 endpoints).
  5. `koda-frontend/backend/routers/contabilidad_ext.py` (**1,867 líneas**, 22 endpoints).
  6. `koda-frontend/backend/routers/fiscal_ext.py` (**1,382 líneas**, 28 endpoints).
- **Vulnerabilidad Multi-Tenant Primaria:** `KODA_Remaster` no cuenta con `with_loader_criteria` y contiene más de 20 consultas SQL con `WHERE (tenant_id = $1 OR tenant_id IS NULL)`, exponiendo registros nulos a todos los inquilinos.

---

## 1. INVENTARIO COMPLETO DEL SISTEMA

### 1.1 Backend ERP (`koda-frontend/backend`) — Total: 291 Endpoints

| Área de Negocio / Módulo | Archivo Fuente Principal | Cantidad Endpoints | Descripción Funcional |
| :--- | :--- | :---: | :--- |
| **Facturación & Ventas** | `routers/sales.py`<br>`routers/facturacion.py`<br>`routers/modulos_ext.py` (L4698) | 20 | Emisión de facturas fiscales, anulación, registro POS, notas de entrega, cotizaciones y órdenes de venta. |
| **Compras & Proveedores** | `routers/proveedores.py`<br>`routers/modulos_ext.py` (L98) | 26 | Gestión de proveedores, órdenes de compra, recepciones de stock, facturas de compras y devoluciones. |
| **Cobranzas (CxC)** | `routers/clientes.py`<br>`routers/modulos_ext.py` (L902) | 23 | Gestión de clientes, cartera por cobrar, análisis de antigüedad de saldos, erosión inflacionaria y anticipos. |
| **Pagos (CxP)** | `routers/pagos.py`<br>`routers/modulos_ext.py` (L1502) | 9 | Cuentas por pagar, programación de pagos a proveedores, lotes de pago y retenciones asociadas. |
| **Tesorería & Bancos** | `routers/tesoreria.py`<br>`routers/modulos_ext.py` (L2078)<br>`routers/extras_ext.py` (L1330) | 27 | Cuentas bancarias, movimientos, conciliación, transferencias internas, caja chica, arqueo y flujos. |
| **Inventario & Kardex** | `routers/inventory.py`<br>`routers/productos.py`<br>`routers/modulos_ext.py` (L6183) | 23 | Catálogo de productos, existencias por almacén, transferencias, ajustes, conteos físicos y Kardex. |
| **Garantías & Calidad** | `routers/garantias.py` | 6 | Registro y seguimiento de reclamos de garantía, estados y resoluciones de reemplazo/reparación. |
| **Fiscal & Tributario** | `routers/fiscal.py`<br>`routers/fiscal_ext.py` | 32 | Libros de ventas/compras SENIAT, declaraciones de IVA e ISLR, comprobantes de retención, IGTF y correlativos. |
| **Contabilidad** | `routers/accounting.py`<br>`routers/contabilidad_ext.py` | 25 | Plan de cuentas, libro diario, libro mayor, balance de comprobación, balance general, estado de resultados y cierres. |
| **Logística & Despacho** | `routers/logistica.py` | 29 | Gestión de flotas, choferes, planificación Gantt, turnos de despacho, incidencias y webhook de choferes. |
| **Nómina & RRHH** | `routers/payroll.py`<br>`routers/hr.py` | 11 | Ficha de empleados, cálculo de nómina quincenal/mensual, conceptos salariales y liquidaciones. |
| **Tasas de Cambio** | `routers/rates.py`<br>`routers/modulos_ext.py` (L6586) | 10 | Sincronización oficial BCV, histórico de tasas VES/USD/EUR y endpoints de consulta pública y privada. |
| **Bot de Telegram (Servicio)** | `routers/bot_api.py`<br>`routers/telegram_api.py` | 8 | Endpoints server-to-server para venta remota, consulta de stock, catálogo y comandos dinámicos. |
| **Administración & Auditoría** | `routers/admin_ext.py`<br>`routers/audit.py`<br>`routers/entidades.py`<br>`routers/auth.py`<br>`routers/sso_bridge.py` | 37 | Perfil de empresa, numeraciones, usuarios y roles, bitácora forense de auditoría y emisión de tokens SSO. |
| **Reportes & Analítica** | `routers/reportes.py`<br>`routers/modulos_ext.py` (L2998)<br>`routers/dashboard_ext.py` | 20 | Dashboards ejecutivos, rentabilidad ABC, diferenciales cambiarios y reporteador dinámico. |
| **Telemetría & Developer** | `routers/telemetry.py`<br>`routers/forense.py`<br>`routers/developer.py`<br>`routers/developer_router.py`<br>`main.py` | 15 | Monitoreo de salud, auditoría forense profunda, websockets de métricas y health checks. |

### 1.2 Backend Institucional (`KODA_Remaster/sistema-corporativo/backend`) — Total: 107 Endpoints

| Archivo Fuente | Endpoints | Descripción de Responsabilidades |
| :--- | :---: | :--- |
| `main.py` | **63** | Autenticación general, gestión documental, tickets de soporte, hojas de ruta, gerencias, auditoría de seguridad y proxy de IA. |
| `routers/developer_router.py` | **17** | Consola de desarrollador, inspección de tablas, métricas de rendimiento y verificación de permisos. |
| `routers/telegram_router.py` | **6** | Webhook oficial de Telegram, vinculación de usuarios (`/start`), token generation y despacho de comandos del bot. |
| `routers/vendedores_router.py` | **6** | CRUD de vendedores institucionales, asignación a perfiles y métricas de comisiones. |
| `routers/auth_router.py` | **6** | Login institucional, refresh tokens, recuperación de credenciales y validación TOTP/2FA. |
| `routers/users_router.py` | **5** | Gestión de usuarios corporativos, reseteo de claves, activación/desactivación y roles. |
| `routers/billing_router.py` | **2** | Puente y estado del módulo embebido de facturación. |
| `routers/gerencias_router.py` | **1** | Listado de gerencias y unidades operativas. |
| `routers/internal_router.py` | **1** | Endpoint de sincronización de nombre de organización (`PUT /internal/organizations/{tenant_id}/name`). |

---

### 1.3 Inventario de Rutas y Pantallas Frontend (`koda-frontend/src`)

El frontend cuenta con **133 rutas** registradas en `src/App.tsx`. A continuación se detallan agrupadas por flujo de negocio:

#### Módulo: Facturación, Ventas y POS (11 rutas)
- `/` (`DashboardHome.tsx`): Panel de control general del ERP con KPIs diarios.
- `/pos` (`Billing/POS.tsx`): Terminal de punto de venta rápido para facturación de mostrador.
- `/nueva` (`Billing/InvoiceForm.tsx`): Formulario estándar de emisión de factura comercial.
- `/nueva-fiscal` (`Facturacion/NuevaFactura.tsx`): Formulario especializado de factura fiscal SENIAT.
- `/historial` (`Billing/BillingDashboard.tsx`): Historial y listado general de facturas emitidas.
- `/ventas` (`Sales/SalesDashboard.tsx`): Dashboard analítico de rendimiento comercial y ventas.
- `/ventas/cotizaciones` (`Sales/Quotations.tsx`): Creación y seguimiento de cotizaciones a clientes.
- `/ventas/ordenes` (`Sales/SalesOrders.tsx`): Registro y aprobación de órdenes de venta.
- `/ventas/entregas` (`Sales/DeliveryNotes.tsx`): Control y emisión de notas de entrega.
- `/ventas/precios` (`Sales/PriceLists.tsx`): Listas de precios por tipo de cliente/volumen.
- `/notas` (`Billing/CreditNotes.tsx`): Emisión y control de notas de crédito y débito.

#### Módulo: Compras y Abastecimiento (12 rutas)
- `/compras` (`Purchasing/PurchasingDashboard.tsx`): Dashboard general de compras y gastos.
- `/compras/proveedores` (`Purchasing/Suppliers.tsx`): Directorio y ficha técnica de proveedores.
- `/compras/ordenes` (`Purchasing/PurchaseOrders.tsx`): Listado de órdenes de compra a proveedores.
- `/compras/ordenes/nueva` (`Purchasing/NewPurchaseOrder.tsx`): Formulario de creación de orden de compra.
- `/compras/anteproyecto` (`Purchasing/CostProject.tsx`): Estimación de costos y anteproyectos de compra.
- `/compras/requisiciones` (`Purchasing/Requisitions.tsx`): Listado de solicitudes internas de materiales.
- `/compras/requisiciones/nueva` (`Purchasing/NewRequisition.tsx`): Formulario de requisición interna.
- `/compras/aprobaciones` (`Purchasing/Approvals.tsx`): Bandeja de aprobación de gastos y compras.
- `/compras/recepcion` (`Purchasing/StockReception.tsx`): Recepción física de mercancía en almacén.
- `/compras/facturas` (`Purchasing/SupplierInvoices.tsx`): Registro de facturas fiscales de proveedores.
- `/compras/devoluciones` (`Purchasing/Returns.tsx`): Devoluciones de mercancía a proveedores.
- `/compras/historial` (`Purchasing/PurchasingHistory.tsx`): Historial consolidado de compras.

#### Módulo: Inventario y Almacenes (11 rutas)
- `/inventario` (`Inventory/InventoryDashboard.tsx`): KPIs de existencias, rotación y valor de stock.
- `/inventario/productos` (`Inventory/Products.tsx`): Catálogo maestro de productos y servicios.
- `/inventario/kardex` (`Inventory/Kardex.tsx`): Libro mayor de movimientos físico-valorados (Kardex).
- `/inventario/ajustes` (`Inventory/InventoryAdjustments.tsx`): Ajustes manuales por sobrantes o mermas.
- `/inventario/existencias` (`Inventory/InventoryExists.tsx`): Consulta rápida de stock por sucursal.
- `/inventario/almacenes` (`Inventory/InventoryWarehouses.tsx`): Configuración de almacenes físicos.
- `/inventario/transferencias` (`Inventory/InventoryTransfer.tsx`): Traslado de mercancía entre almacenes.
- `/inventario/fisico` (`Inventory/StockInventory.tsx`): Módulo de toma de inventario físico (conteo).
- `/inventario/critico` (`Inventory/InventoryCritical.tsx`): Alertas de productos bajo punto de reorden.
- `/inventario/lotes` (`Inventory/LotExpiry.tsx`): Control de lotes y fechas de vencimiento.
- `/inventario/garantias` (`Inventory/Warranties.tsx`): Gestión de reclamos y garantías técnicas.

#### Módulo: Cobranzas y Clientes (8 rutas)
- `/clientes` (`Billing/Customers.tsx`): Directorio y estados de cuenta de clientes.
- `/cobranzas` (`Collections/CollectionsDashboard.tsx`): Dashboard de gestión de cuentas por cobrar.
- `/cobranzas/cartera` (`Collections/AccountsReceivable.tsx`): Cartera general de cuentas por cobrar (CxC).
- `/cobranzas/aplicar` (`Collections/PaymentApplication.tsx`): Aplicación de pagos e imputación de facturas.
- `/cobranzas/antiguedad` (`Collections/AgingAnalysis.tsx`): Análisis de antigüedad de deuda (Aging).
- `/cobranzas/estado-cuenta` (`Collections/CustomerStatement.tsx`): Reporte individual por cliente.
- `/cobranzas/flujo` (`Collections/ProjectedCashFlow.tsx`): Proyección de ingresos esperados por cobro.
- `/cobranzas/anticipos` (`Collections/CustomerAdvances.tsx`): Gestión y cruce de anticipos recibidos.

#### Módulo: Cuentas por Pagar (6 rutas)
- `/pagos` (`Payments/PaymentsDashboard.tsx`): Dashboard de pasivos y cuentas por pagar.
- `/pagos/cuentas-por-pagar` (`Payments/AccountsPayable.tsx`): Listado de facturas por pagar (CxP).
- `/pagos/ordenes` (`Payments/PaymentOrders.tsx`): Emisión de órdenes de pago a proveedores.
- `/pagos/lotes` (`Payments/PaymentBatches.tsx`): Procesamiento masivo de pagos bancarios.
- `/pagos/programacion` (`Payments/PaymentScheduling.tsx`): Calendario y programación semanal de pagos.
- `/pagos/voucher` (`Payments/PaymentVoucher.tsx`): Comprobantes de egreso y transferencias.

#### Módulo: Tesorería y Bancos (15 rutas)
- `/tesoreria` (`Treasury/TreasuryDashboard.tsx`): Dashboard de liquidez bimonetaria.
- `/tesoreria/bancos` (`Treasury/BankAccounts.tsx`): Cuentas bancarias en VES y USD.
- `/tesoreria/movimientos-bancarios` (`Treasury/BankMovements.tsx`): Libro de banco y extractos.
- `/tesoreria/conciliacion` (`Treasury/BankReconciliation.tsx`): Conciliación bancaria manual/automática.
- `/tesoreria/tasas` (`Treasury/ExchangeRates.tsx`): Monitor y ajuste de tasas BCV/Paralelo.
- `/tesoreria/transferencias` (`Treasury/InternalTransfers.tsx`): Transferencias entre cuentas propias.
- `/tesoreria/caja-chica` (`Treasury/PettyCash.tsx`): Fondos fijos de caja chica.
- `/tesoreria/arqueo` (`Treasury/CashAudit.tsx`): Arqueo físico de billetes y cajas.
- `/tesoreria/movimientos-caja` (`Treasury/CashMovements.tsx`): Egresos e ingresos menores de efectivo.
- `/tesoreria/flujo` (`Treasury/CashFlowTreasury.tsx`): Flujo de caja neto real vs presupuestado.
- `/tesoreria/prestamos` (`Treasury/LoansUVC.tsx`): Control de créditos indexados (UVC/Dólar).
- `/tesoreria/presupuesto` (`Treasury/BudgetVariance.tsx`): Desviación presupuestaria por partida.
- `/tesoreria/inversiones` (`Treasury/InvestmentYield.tsx`): Colocaciones a plazo y rendimientos.
- `/tesoreria/turnos` (`Treasury/ShiftIntegrity.tsx`): Cierre y cuadre de turnos de cajeros.
- `/tesoreria/importar` (`Treasury/ImportStatement.tsx`): Importador de extractos bancarios (CSV/Excel).

#### Módulo: Fiscal y Tributario SENIAT (13 rutas)
- `/fiscal` (`Fiscal/FiscalDashboard.tsx`): Calendario de vencimientos y resumen impositivo.
- `/fiscal/libro-ventas` (`Fiscal/SalesBook.tsx`): Libro legal de ventas SENIAT.
- `/fiscal/libro-compras` (`Fiscal/PurchasesBook.tsx`): Libro legal de compras SENIAT.
- `/fiscal/declaracion-iva` (`Fiscal/IVADeclaration.tsx`): Borrador de forma 30 de IVA.
- `/fiscal/retenciones-iva` (`Fiscal/IVARetentions.tsx`): Retenciones de IVA emitidas y recibidas (75%/100%).
- `/fiscal/retenciones-islr` (`Fiscal/ISLRRetentions.tsx`): Retenciones de ISLR según Decreto 1808.
- `/fiscal/igtf` (`Fiscal/IGTF.tsx`): Control de percepciones de IGTF (3% divisas).
- `/fiscal/calendario` (`Fiscal/FiscalCalendar.tsx`): Cronograma de sujetos pasivos especiales.
- `/fiscal/obligaciones` (`Fiscal/FiscalObligations.tsx`): Matriz de cumplimiento tributario.
- `/fiscal/declaracion-islr` (`Fiscal/ISLRDeclaration.tsx`): Estimación y cierre de ISLR anual/anticipos.
- `/fiscal/conceptos-islr` (`Fiscal/ISLRConcepts.tsx`): Tabla de códigos y alícuotas de retención.
- `/fiscal/arc` (`Fiscal/ARCGenerator.tsx`): Comprobantes acumulados anuales ARC de ISLR.
- `/fiscal/comprobantes` (`Fiscal/RetentionVoucher.tsx`): Impresión de comprobantes de retención.

#### Módulo: Contabilidad Financiera (17 rutas)
- `/contabilidad` (`Accounting/AccountingDashboard.tsx`): Resumen de balance y estado patrimonial.
- `/contabilidad/diario` (`Accounting/JournalBook.tsx`): Libro diario de asientos contables.
- `/contabilidad/mayor` (`Accounting/GeneralLedger.tsx`): Libro mayor analítico por cuenta.
- `/contabilidad/balance-comprobacion` (`Accounting/TrialBalance.tsx`): Balance de comprobación de sumas y saldos.
- `/contabilidad/balance-general` (`Accounting/BalanceSheet.tsx`): Balance general clasificado.
- `/contabilidad/estado-resultados` (`Accounting/IncomeStatement.tsx`): Estado de ganancias y pérdidas.
- `/contabilidad/flujo-caja` (`Accounting/CashFlow.tsx`): Estado de flujos de efectivo.
- `/contabilidad/catalogo` (`Accounting/ChartOfAccounts.tsx`): Plan de cuentas contables.
- `/contabilidad/asiento-manual` (`Accounting/ManualJournalEntry.tsx`): Registro de asientos manuales.
- `/contabilidad/asiento/:id` (`Accounting/JournalEntryDetail.tsx`): Consulta de detalle de un asiento.
- `/contabilidad/cierre` (`Accounting/PeriodClosing.tsx`): Bloqueo y cierre de periodos contables.
- `/contabilidad/centros-costo` (`Accounting/CostCenters.tsx`): Estructura de centros de costo.
- `/contabilidad/ajuste-cambiario` (`Accounting/ExchangeAdjustment.tsx`): Asientos por diferencial en cambio.
- `/contabilidad/ajuste-inflacion` (`Accounting/InflationAdjustment.tsx`): Ajuste por inflación fiscal (INPC).
- `/contabilidad/mapeo-flujo` (`Accounting/CashFlowMapping.tsx`): Configuración de partidas de flujo.
- `/contabilidad/auditoria-diario` (`Accounting/JournalAudit.tsx`): Chequeo de asientos descuadrados.
- `/contabilidad/consolidacion` (`Accounting/FinancialConsolidation.tsx`): Consolidación multi-empresa.
- `/contabilidad/admin` (`Accounting/AdminInterface.tsx`): Panel de mantenimiento contable.

#### Módulo: Logística y Flota (6 rutas)
- `/logistica` (`Logistics/Logistics.tsx`): Torre de control y estados de despacho.
- `/logistica/vehiculos` (`Logistics/FleetVehicles.tsx`): Maestro de unidades vehiculares y capacidades.
- `/logistica/choferes` (`Logistics/FleetDrivers.tsx`): Maestro de transportistas y vinculación Telegram.
- `/logistica/mantenimiento` (`Logistics/FleetMaintenance.tsx`): Mantenimiento preventivo y correctivo.
- `/logistica/planificacion` (`Logistics/GanttPlanning.tsx`): Planificador Gantt de rutas de entrega.
- `/logistica/personal` (`Logistics/PersonnelEngine.tsx`): Cuadrillas de carga y despacho.

#### Módulo: Reportes y Analítica (12 rutas)
- `/reportes` (`Reports/ReportsDashboard.tsx`): Centro consolidado de reportería.
- `/reportes/ventas` (`Reports/SalesReport.tsx`): Reporte detallado de ventas por período/vendedor.
- `/reportes/compras` (`Reports/PurchasingReport.tsx`): Reporte de compras por rubro y proveedor.
- `/reportes/antiguedad-cartera` (`Reports/AccountsReceivableAging.tsx`): Aging comercial.
- `/reportes/diferencial-cambiario` (`Reports/ExchangeDifferenceReport.tsx`): Ganancia/pérdida cambiaria.
- `/reportes/eficiencia` (`Reports/OperationalEfficiencyReport.tsx`): Tiempos de ciclo operativo.
- `/reportes/matriz-abc` (`Reports/ABCMatrixReport.tsx`): Clasificación ABC de productos (Pareto).
- `/reportes/rentabilidad` (`Reports/ProductProfitabilityReport.tsx`): Margen bruto por SKU.
- `/reportes/vendedores` (`Reports/SalesForceManagementReport.tsx`): Metas y comisiones de fuerza de ventas.
- `/reportes/excepciones` (`Reports/ControlExceptionsReport.tsx`): Auditoría de descuentos no autorizados.
- `/reportes/libro-fiscal` (`Reports/FiscalBookReport.tsx`): Exportación consolidada de libros fiscales.
- `/reportes/query-builder` (`Reports/QueryBuilderReport.tsx`): Generador de consultas personalizadas.

#### Módulo: Nómina y Administración del Sistema (17 rutas)
- `/nomina` (`Payroll/PayrollDashboard.tsx`): Nómina, recibos y liquidaciones.
- `/alertas` (`Alerts/AlertsCenter.tsx`): Centro de notificaciones operativas y de stock.
- `/admin` (`Admin/AdminDashboard.tsx`): Panel principal de administración de la empresa.
- `/admin/empresa` (`Admin/AdminDashboard.tsx`): Configuración de datos fiscales y logo.
- `/admin/numeracion` (`Admin/NumberingControl.tsx`): Control de series y correlativos de documentos.
- `/admin/monedas` (`Admin/AdminDashboard.tsx`): Monedas activas y factores de conversión.
- `/admin/sucursales` (`Admin/AdminDashboard.tsx`): Gestión de sucursales físicas.
- `/admin/notificaciones` (`Admin/AutomatedNotifications.tsx`): Reglas de alerta por Telegram/Email.
- `/admin/usuarios` (`Admin/UsersPermissions.tsx`): Usuarios, roles y matriz de permisos.
- `/admin/telegram` (`Admin/AdminDashboard.tsx`): Configuración del bot institucional.
- `/admin/auditoria` (`Admin/SystemAuditLogs.tsx`): Visor de logs del sistema.
- `/admin/importacion` (`Admin/DataImportPanel.tsx`): Asistente de carga masiva de catálogos.
- `/admin/importacion/rapida` (`Admin/QuickImport.tsx`): Carga rápida por copiar/pegar celdas.
- `/admin/importacion/historial` (`Admin/ImportHistory.tsx`): Registro de importaciones ejecutadas.
- `/admin/respaldos` (`Admin/CloudBackups.tsx`): Respaldos y exportación de base de datos.
- `/admin/salud` (`Admin/SystemHealth.tsx`): Diagnóstico de latencia, DB y Redis.
- `/admin/omniscience` (`Admin/OmniscienceDashboard.tsx`): Visor de telemetría de background.

---

### 1.4 Código Muerto y Pantallas Abandonadas

1. **`src/pages/Sales/PointOfSale.tsx` (20.6 KB)**: Archivo duplicado y no enlazado en `App.tsx`. La ruta `/pos` importa en su lugar `src/pages/Billing/POS.tsx`. `PointOfSale.tsx` contiene una implementación desactualizada.
2. **`src/pages/Sales/QuotationForm.tsx`**: Formulario standalone de cotización que no está enlazado; `App.tsx` dirige `/ventas/cotizaciones` a `src/pages/Sales/Quotations.tsx`.
3. **`src/pages/Sales/DeliveryNoteForm.tsx`**: Formulario huérfano; la ruta `/ventas/entregas` renderiza la vista de tabla `DeliveryNotes.tsx`.
4. **`src/pages/Inventory/InventoryApprovals.tsx`**: Pantalla de aprobación de transferencias y conteos huérfana (sin ruta en `App.tsx`).
5. **`src/pages/RRHH/AprobacionNomina.tsx`**: Vista de aprobación de nómina no enlazada (solo existe `/nomina` hacia `PayrollDashboard.tsx`).
6. **Backend `routers/telegram_api.py` (L168-191)**: Funciones `store_linking_token` y `get_linking_token` que almacenan códigos `KOD-XXXXXX` en memoria/Redis local, completamente obsoletas ya que el bot real de Telegram solo valida contra `KODA_Remaster`.

---

## 2. DUPLICACIÓN DE LÓGICA DE NEGOCIO Y DIVERGENCIA

### 2.1 Sincronización y Consulta de Tasa BCV (3 Tablas Diferentes en la Misma BD)

El sistema presenta una divergencia crítica en la gestión de tasas cambiarias:

| Backend / Módulo | Archivo y Línea | Tabla Utilizada | Columnas Clave |
| :--- | :--- | :--- | :--- |
| **ERP (`koda-frontend`)** | `routers/rates.py` (L70)<br>`utils/helpers.py::tasa_actual` (L55) | `public.tasas_cambio` | `valor_ves`, `fuente`, `fecha`, `tenant_id` |
| **Remaster (`KODA_Remaster`)** | `routers/rates_router.py` (L141, L223) | `public.bcv_rates` | `currency`, `rate`, `updated_at`, `source` |
| **Remaster BCV Service** | `services/bcv_service.py` (L83) | `public.tasas_bcv` | `moneda`, `tasa`, `fecha_valor`, `created_at` |

**Divergencia Crítica:** Si el bot o el backend corporativo ejecutan `sync_rates_from_bcv`, actualizan `bcv_rates` y `tasas_bcv`, pero **NO actualizan `tasas_cambio`**. El ERP de facturación continuará utilizando la tasa anterior registrada en `tasas_cambio`, provocando que las facturas emitidas por el frontend utilicen una tasa distinta a las cotizaciones consultadas por el bot de Telegram.

---

### 2.2 Creación de Movimientos de Kardex y Actualización de Stock

La lógica de Kardex y descuento de inventario se encuentra dispersa en 6 archivos y ya ha divergido:

```
┌───────────────────────────────────────────────┐
│     OPERACIÓN DE INVENTARIO / VENTA           │
└──────┬──────────────────┬─────────────────┬───┘
       │                  │                 │
       ▼                  ▼                 ▼
 ┌───────────────┐  ┌───────────────┐ ┌───────────────┐
 │ Facturación   │  │ Devolución    │ │ Anulación     │
 │ (Service)     │  │ Proveedor     │ │ Venta         │
 ├───────────────┤  ├───────────────┤ ├───────────────┤
 │ ✓ Kardex      │  │ ✗ Sin Kardex  │ │ ✓ Kardex      │
 │ ✓ Stock Total │  │ ✓ Stock Total │ │ ✓ Stock Total │
 │ ✓ StockAlmacen│  │ ✗ StockAlmacen│ │ ✗ StockAlmacen│
 └───────────────┘  └───────────────┘ └───────────────┘
```

1. **Emisión de Facturas:** `backend/services/facturacion_service.py` (L287) y `backend/utils/helpers.py::descontar_stock_almacen`:
   - Descuenta `Producto.stock`
   - Descuenta `StockPorAlmacen.cantidad` con bloqueo `with_for_update()`
   - Inserta `KardexMovimiento(tipo_movimiento='Venta', almacen_id=...)`
2. **Ajustes de Inventario:** `backend/routers/inventory.py` (L120-154):
   - Modifica `Producto.stock`
   - Modifica `StockPorAlmacen`
   - Inserta `KardexMovimiento(tipo_movimiento='Ajuste_Entrada'/'Ajuste_Salida')`
3. **Transferencias entre Almacenes:** `backend/routers/modulos_ext.py` (L6543-6568):
   - Modifica origen y destino en `StockPorAlmacen`
   - Inserta 2 registros en `KardexMovimiento(Transferencia_Salida, Transferencia_Entrada)`
4. **Recepciones de Compra:** `backend/routers/modulos_ext.py` (L496-510):
   - Modifica `Producto.stock`
   - Inserta `KardexMovimiento(tipo_movimiento='Compra', almacen_id=...)`
5. **Devoluciones a Proveedores (DIVERGENCIA GRAVE):** `backend/routers/modulos_ext.py` (L595-598):
   - Resta `Producto.stock -= dev_in.cantidad`
   - **NO crea registro en `KardexMovimiento`**
   - **NO descuenta `StockPorAlmacen`**
   - *Consecuencia:* El Kardex queda descuadrado frente al stock físico del almacén.
6. **Anulación de Ventas (DIVERGENCIA GRAVE):** `backend/routers/sales.py` (L273-286):
   - Suma `producto.stock += detalle.cantidad`
   - Inserta `KardexMovimiento` reverso
   - **NO repone `StockPorAlmacen`**
   - *Consecuencia:* El stock global del producto sube, pero el stock asignado a las sucursales/almacenes queda permanentemente disminuido.

---

### 2.3 Cálculo de Impuestos (IVA 16%, IGTF 3%, Retenciones)

- **Fórmulas de Redondeo:**
  - En `services/facturacion_service.py` (L75) se utiliza `Decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`.
  - En `routers/facturacion.py` (L110) y `routers/fiscal_ext.py` (L145) se calcula con conversiones intermedias a `float` (`round(float(subtotal) * 0.16, 2)`), generando discrepancias de centavos entre el libro fiscal de ventas y la factura emitida.
- **ISLR Decreto 1808:**
  - En `routers/modulos_ext.py` (L70) la tabla `ISLR_WITHHOLDING_TABLE` tiene deshabilitadas las categorías salvo `BIENES_INVENTARIO: None`.
  - En `routers/fiscal_ext.py` (L450) se calcula retención aplicando tasas fijas (ej. 3% o 2%) sin validar contra la tabla de retenciones aplicadas en compras.

---

### 2.4 Comandos de Telegram: `telegram_commands` vs `bot_commands`

- `koda-frontend/backend/models/erp_extended.py` (L450) define la tabla `telegram_commands`.
- `KODA_Remaster/sistema-corporativo/backend` consulta y escribe en la tabla `bot_commands`.
- En `routers/telegram_api.py` (L195) se implementó un hook `_sync_command_to_remaster` mediante HTTP, pero si la llamada de red falla, ambas tablas se desincronizan silenciosamente.

---

## 3. AISLAMIENTO MULTI-TENANT (ANÁLISIS CRÍTICO)

### 3.1 Auditoría del Mecanismo Central `core/database.py::with_loader_criteria`

En `koda-frontend/backend/core/database.py` (L64-81), el filtro automático opera mediante un listener de SQLAlchemy:

```python
@event.listens_for(Session, "do_orm_execute")
def _add_tenant_filter(execute_state):
    if execute_state.is_select or execute_state.is_update or execute_state.is_delete:
        tenant_id = current_tenant_id_var.get()
        if tenant_id:
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    Base,
                    lambda cls: cls.tenant_id == tenant_id if hasattr(cls, 'tenant_id') and cls.__name__ not in ('Profile', 'Organization') else True,
                    include_aliases=True,
                    track_closure_variables=False
                )
            )
```

#### Limitaciones y Riesgos del Mecanismo Central:
1. **No aplica a SQL Crudo (`text(...)` o `conn.execute`):** Cualquier consulta que utilice `db.execute(text("SELECT ..."))` o llamadas a través del driver omiten por completo `with_loader_criteria`.
2. **Modelos Excluidos:** `Profile` y `Organization` están excluidos explícitamente. Las consultas sobre `Profile` deben filtrar siempre `Profile.tenant_id == tenant_id` manualmente.
3. **Peticiones sin Contexto de Tenant:** Si una petición no pasa por `get_current_user` o no invoca `current_tenant_id_var.set(tenant_id)`, `tenant_id` es `None`, por lo que la condición evalúa a `True` y **no aplica ningún filtro**.

---

### 3.2 Backend Institucional (`KODA_Remaster`): Ausencia Total de Filtro Automático

`KODA_Remaster` **no utiliza SQLAlchemy ORM**, sino `asyncpg` con consultas SQL directas. **No tiene `with_loader_criteria`**.

#### Hallazgo Crítico: Filtrado Permisivo con `OR tenant_id IS NULL`
Se detectaron múltiples consultas en producción con el patrón:
`WHERE (tenant_id = $1::uuid OR tenant_id IS NULL)`

**Ubicaciones específicas:**
- `KODA_Remaster/sistema-corporativo/backend/routers/vendedores_router.py` (L162, L190, L278, L315):
  `WHERE (v.tenant_id = $1::uuid OR v.tenant_id IS NULL)`
- `KODA_Remaster/sistema-corporativo/backend/routers/gerencias_router.py` (L86):
  `WHERE tenant_id = $1::uuid OR tenant_id IS NULL`
- `KODA_Remaster/sistema-corporativo/backend/routers/telegram_router.py` (L351, L369, L388, L409, L859, L1173):
  `WHERE (tenant_id = $2::uuid OR tenant_id IS NULL)`
- `KODA_Remaster/sistema-corporativo/backend/main.py` (L733, L2113, L2188, L2406, L2489, L2509, L2617, L2733, L2881, L2964, L3079, L3096, L3811, L3908, L3930, L4135, L4161):
  `WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid OR tenant_id IS NULL)`

> [!CAUTION]
> **IMPACTO DE SEGURIDAD MULTI-TENANT:**
> Cuando existen registros legados o globales donde `tenant_id` es `NULL` (como gerencias, usuarios maestros o vendedores), **cualquier tenant que consulte el sistema ve y puede asociar los datos de los demás tenants**. En un escenario con 10 o 50 clientes reales, este patrón produce una fuga masiva de datos entre empresas.

---

### 3.3 Endpoints de Servicio sin Sesión de Usuario

1. **`routers/bot_api.py`:**
   - Protegido por `verify_bot_api_key`.
   - **Estado:** Seguro. Ejecuta `_set_tenant_scope(db, tenant_id)` (L94), seteando `current_tenant_id_var` y ejecutando `SELECT set_config('app.current_tenant_id', ...)` para RLS.
2. **`routers/sso_bridge.py`:**
   - Protegido por `verify_sso_bridge_key`.
   - **Estado:** Seguro. Consulta `Profile` por `id` único y valida que `estado` esté activo.
3. **`routers/telegram_api.py`:**
   - **Falta de Defensa en Profundidad:** En L226 (`list_commands`) y L237 (`create_command`), ejecuta `db.query(TelegramCommand).order_by(...)` sin `.filter(TelegramCommand.tenant_id == current_user.tenant_id)`, confiando exclusivamente en `with_loader_criteria`.

---

## 4. SEGURIDAD

### 4.1 Validación de Claves de Servicio (`hmac.compare_digest`)

Se revisaron todas las dependencias de validación de encabezados de servicio:

| Encabezado / Secreto | Archivo y Línea | Validación Utilizada | Estado |
| :--- | :--- | :--- | :--- |
| `X-Bot-Api-Key` (`BOT_INTERNAL_API_KEY`) | `core/security.py` (L190) | `hmac.compare_digest(x_bot_api_key, BOT_INTERNAL_API_KEY)` | **CORRECTO** |
| `X-Internal-Forward-Key` (`LOGISTICS_INTERNAL_FORWARD_KEY`) | `core/security.py` (L268) | `hmac.compare_digest(x_internal_forward_key, ...)` | **CORRECTO** |
| `X-SSO-Bridge-Key` (`SSO_BRIDGE_INTERNAL_KEY`) | `core/security.py` (L316) | `hmac.compare_digest(x_sso_bridge_key, ...)` | **CORRECTO** |
| `X-Internal-Api-Key` (`ORG_SYNC_API_KEY`) | Remaster `auth/security.py` (L59) | `hmac.compare_digest(x_internal_api_key, ...)` | **CORRECTO** |
| `X-Telegram-Link-Key` | Remaster `routers/telegram_router.py` (L929, L977, L1231, L1271, L1327) | `hmac.compare_digest(service_key, ...)` | **CORRECTO** |
| `X-Telegram-Bot-Api-Secret-Token` | Remaster `routers/telegram_router.py` (L1005) | `hmac.compare_digest(incoming_secret, ...)` | **CORRECTO** |

---

### 4.2 Rate Limiters en Ambos Backends

#### 1. Backend ERP (`koda-frontend/backend/services/rate_limiter.py`):
- **Bypass no autenticado en `/webhook/` (L71):**
  `if path.startswith("/webhook/"): return`
  *Vulnerabilidad:* Cualquier atacante puede enviar solicitudes ilimitadas a los endpoints que comiencen por `/webhook/` (por ejemplo `/webhook/telegram/commands`) sin que se evalúe ningún secreto ni se aplique rate limit.
- **Modo Fail-Open (L53):** Si Redis no está disponible o `REDIS_URL` no está definida, no aplica ninguna restricción por IP.

#### 2. Backend Institucional (`KODA_Remaster/sistema-corporativo/backend/services/rate_limiter.py`):
- **Falla en Detección de IP tras Proxy (L49):**
  `client_ip = request.client.host if request.client else "unknown"`
  *Vulnerabilidad:* No consulta `X-Forwarded-For` ni `CF-Connecting-IP` (a diferencia de `main.py::_extract_client_ip`). En Render o Vercel, `request.client.host` corresponde a la IP interna del balanceador. **Todos los usuarios del sistema comparten el mismo contador de peticiones**, lo que provoca bloqueos accidentales a usuarios legítimos o permite saltarse el límite.
- **Fail-Open absoluto si `REDIS_URL` no existe (L46):**
  `if redis_client is None: return`

---

### 4.3 Variables de Entorno y Fallbacks al Arrancar

- **ERP (`koda-frontend`):** Implementa validaciones estrictas al arrancar (`core/security.py` L27, L171, L213, L248, L297). Si `SECRET_KEY`, `BOT_INTERNAL_API_KEY`, `ORG_SYNC_API_KEY`, `LOGISTICS_INTERNAL_FORWARD_KEY` o `SSO_BRIDGE_INTERNAL_KEY` son menores a 32 caracteres o están vacías, la aplicación lanza `RuntimeError` y se niega a iniciar.
- **Remaster (`KODA_Remaster`):** Valida `JWT_SECRET` al arrancar (`main.py` L39). Sin embargo, `TELEGRAM_LINK_INTERNAL_API_KEY` y `ORG_SYNC_API_KEY` se evalúan perezosamente en cada endpoint; si faltan, devuelven error 500 en tiempo de ejecución en vez de advertirlo al iniciar el servicio.

---

## 5. ESCALABILIDAD Y RENDIMIENTO

### 5.1 Consultas N+1 Identificadas

1. **`routers/sales.py` (L273-286 - Anulación de Venta):**
   Itera sobre `venta.detalles` y ejecuta un loop de reversión individual.
2. **`routers/fiscal_ext.py` (L125-148 - Libro de Ventas SENIAT):**
   Recupera las ventas y luego ejecuta consultas individuales para obtener cliente, documento y tasa por cada fila devuelta.
3. **`KODA_Remaster/backend/main.py` (L2657, L2745, L2800, L3122, L4358, L4407):**
   Patrón repetitivo en endpoints de tickets y documentos: en vez de hacer `JOIN` con `profiles`, ejecuta múltiples `await conn.fetchval("SELECT username FROM profiles WHERE id = $1", user_id)` de forma secuencial por cada registro.

---

### 5.2 Endpoints sin Paginación en Tablas de Alto Crecimiento

Se identificaron **más de 30 endpoints** que ejecutan `.all()` sobre tablas transaccionales sin ningún parámetro `limit` ni `offset`:

- `routers/sales.py` (L186): `GET /sales/` (Carga **todas** las ventas históricas del tenant).
- `routers/productos.py` (L32): `GET /productos/` (Carga el catálogo completo a memoria).
- `routers/proveedores.py` (L14): `GET /proveedores/` (Carga todos los proveedores).
- `routers/modulos_ext.py` (L214): `GET /compras/` (Carga todas las compras históricas).
- `routers/modulos_ext.py` (L399): `GET /compras/recepciones` (Carga todas las recepciones).
- `routers/modulos_ext.py` (L521): `GET /compras/devoluciones` (Carga todas las devoluciones).
- `routers/modulos_ext.py` (L1289): `GET /cobranzas/cuentas` (Carga todas las cuentas por cobrar).
- `routers/modulos_ext.py` (L1668): `GET /pagos/cuentas` (Carga todas las cuentas por pagar).
- `routers/modulos_ext.py` (L3236): `GET /reportes/ventas` (Carga todas las ventas).
- `routers/modulos_ext.py` (L5216): `GET /cotizaciones` (Carga todas las cotizaciones).
- `routers/modulos_ext.py` (L6377): `GET /inventario/kardex/{producto_id}` (Carga todo el histórico de movimientos).
- `routers/modulos_ext.py` (L6448): `GET /inventario/transferencias` (Carga todas las transferencias).
- `routers/fiscal_ext.py` (L119): `GET /libro-ventas` (Carga todas las ventas del mes sin paginar).
- `routers/fiscal_ext.py` (L256): `GET /libro-compras` (Carga todas las compras del mes sin paginar).

> [!WARNING]
> **RIESGO DE CAÍDA EN PRODUCCIÓN:**
> Con un solo cliente pequeño (RG TECHNOLOGY) estos endpoints responden rápido. Con 5 clientes y más de 10,000 ventas, transferencias y movimientos de Kardex, estas consultas bloquearán los workers de FastAPI por consumo excesivo de memoria y serialización de JSON masivo.

---

### 5.3 Índices de Base de Datos y Comportamiento Multi-Tenant

Actualmente, varias tablas clave tienen índices simples por `id` o `fecha`, pero **carecen de índices compuestos que incluyan `tenant_id` en primer orden**.  
En PostgreSQL, las consultas multi-tenant ejecutan filtros del tipo:  
`WHERE tenant_id = '...' AND fecha >= '...' ORDER BY fecha DESC`  
Sin índices compuestos como `CREATE INDEX idx_ventas_tenant_fecha ON ventas(tenant_id, fecha DESC)`, la base de datos realiza *Bitmap Index Scans* ineficientes que degradan el rendimiento al aumentar los registros de otros tenants.

---

## 6. ORGANIZACIÓN DEL FRONTEND Y EXPERIENCIA DE USUARIO

### 6.1 Diagnóstico de Fragmentación de Pantallas

El cliente reporta que el flujo de venta y despacho es engorroso y requiere saltar continuamente entre múltiples rutas.  
Actualmente, el ciclo comercial básico está dividido en **11 pantallas desconectadas**:

```
 [Cotización]           [POS Rápido]        [Factura Fiscal]       [Nota Entrega]
 /ventas/cotizaciones   /pos                /nueva-fiscal          /ventas/entregas
         │                     │                    │                     │
         └─────────────┬───────┴────────────┬───────┴─────────────────────┘
                       │                    │
                       ▼                    ▼
             [Historial Ventas]     [Cuentas por Cobrar]
             /historial             /cobranzas/cartera
```

1. Para consultar precio/stock -> va a `/inventario/existencias` o `/ventas/precios`.
2. Para hacer un presupuesto -> va a `/ventas/cotizaciones`.
3. Para cobrar en caja rápida -> va a `/pos`.
4. Para emitir la factura con RIF y formato fiscal -> va a `/nueva-fiscal`.
5. Para consultar la factura recién emitida -> va a `/historial`.
6. Para despachar con chofer -> va a `/ventas/entregas` o `/logistica`.
7. Para verificar si quedó saldo pendiente -> va a `/cobranzas/cartera`.

---

### 6.2 Propuesta de Consolidación: Centro Unificado de Ventas y Facturación (POS Hub)

Se propone consolidar estas 11 pantallas en **2 grandes centros de trabajo** basados en pestañas/paneles:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CENTRO COMERCIAL Y VENTAS (/ventas)                       │
├───────────────────┬───────────────────┬───────────────────┬─────────────────┤
│ [Pestaña 1]       │ [Pestaña 2]       │ [Pestaña 3]       │ [Pestaña 4]     │
│ POS & Facturación │ Historial & Notas │ Cotizaciones &    │ Entregas &      │
│ Rápida (Mostrador)│ de Crédito/Débito │ Órdenes de Venta  │ Despacho Físico │
└───────────────────┴───────────────────┴───────────────────┴─────────────────┘
```

#### Panel 1: Terminal de Venta Integrada (POS + Facturación Fiscal)
- **Diseño:**
  - Panel izquierdo (60%): Catálogo interactivo con selector de almacén, búsqueda por código de barras/nombre, stock en tiempo real y selector de lista de precios.
  - Panel derecho (40%): Carrito de venta con toggle rápido: **[Ticket Rápido / Factura Fiscal / Nota de Entrega]**, selector de cliente con autocompletado de RIF, cálculo automático de IVA/IGTF y desglose bimonetario (USD / Bs al cambio BCV).
- **Acción en 1 Click:** Botón "Emitir y Despachar" que genera la venta, imprime el ticket/factura y abre la opción de generar la nota de entrega sin salir de la pantalla.

#### Panel 2: Historial y Gestión de Documentos
- Tabla única con pestañas de filtro: *Facturas | Notas de Entrega | Cotizaciones | Notas de Crédito*.
- Acciones en línea: Reimprimir, Reenviar por Telegram/Email, Anular, Generar Nota de Crédito.

---

### 6.3 Evaluación de Riesgo y Costo de la Consolidación

| Propuesta de Consolidación | Nivel de Riesgo | Esfuerzo Estimado | Justificación de Riesgo |
| :--- | :---: | :---: | :--- |
| **Unificar `/pos`, `/nueva` y `/nueva-fiscal` en un POS Hub** | **Medio** | 3-4 días | El riesgo reside en unificar los formularios de captura (asegurar que el cálculo de IVA/IGTF y la llamada a `procesar_emision_factura` no omitan datos fiscales requeridos por el SENIAT). |
| **Integrar `/ventas/cotizaciones` y `/ventas/ordenes` en pestañas de `/ventas`** | **Bajo** | 1-2 días | Cambio puramente cosmético/organizacional de frontend. Reutiliza los mismos endpoints de backend existentes. |
| **Integrar `/ventas/entregas` con vista rápida de stock** | **Bajo** | 1 día | Consumo de endpoints existentes en un panel lateral (drawer/modal). |
| **Eliminar pantallas huérfanas (`PointOfSale.tsx`, `QuotationForm.tsx`, etc.)** | **Mínimo** | 1 hora | Cero riesgo operativo; no están referenciadas en rutas activas. |

---

## 7. AISLAMIENTO DE CAMBIOS Y ARCHIVOS "GOD FILE"

### 7.1 Diagnóstico de God Files

La causa principal del fenómeno *"toco una cosa y se rompe otra inesperada"* es la existencia de archivos monolíticos con miles de líneas donde conviven dominios de negocio no relacionados:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 koda-frontend/backend/routers/modulos_ext.py                 │
│                                (6,619 Líneas)                               │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ • Compras & Proveedores  │ • Cobranzas & Cartera    │ • Pagos & CxP         │
│ • Tesorería & Bancos     │ • Reportes Analíticos    │ • Ventas Extendidas   │
│ • Inventario & Kardex    │ • Tasas de Cambio        │ • Clientes & Segmentos│
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

1. **`koda-frontend/backend/routers/modulos_ext.py` (6,619 líneas):**
   - Declara 9 instancias de `APIRouter` distintas en el mismo archivo (`compras_router`, `cobranzas_router`, `pagos_router`, `tesoreria_router`, `reportes_router`, `ventas_ext_router`, `inventario_ext_router`, `tasas_router`, `clientes_ext_router`).
   - Una modificación o error de sintaxis en `modulos_ext.py` para arreglar "Cobranzas" tumba simultáneamente "Compras", "Kardex", "Tesorería" y "Reportes".
2. **`KODA_Remaster/sistema-corporativo/backend/main.py` (5,286 líneas):**
   - Concentra autenticación, JWT, roles, subida de documentos, tickets de soporte, analítica IA, hojas de ruta y gerencias en un solo archivo plano.
3. **`koda-frontend/backend/routers/extras_ext.py` (3,045 líneas):**
   - Mezcla dashboards ejecutivos, nómina/RRHH, auditoría contable, conciliación y flujos de caja.

---

### 7.2 Plan de Refactorización Modular (Forma, no Fondo)

Se propone descomponer estos archivos en paquetes modulares estándar de FastAPI **sin alterar rutas, parámetros ni respuestas JSON**:

```
backend/routers/
  ├── compras/
  │    ├── __init__.py          # Exporta router unificado /compras
  │    ├── ordenes.py
  │    ├── recepciones.py
  │    └── devoluciones.py
  ├── cobranzas/
  │    ├── __init__.py          # Exporta router /cobranzas
  │    ├── cartera.py
  │    └── anticipos.py
  ├── tesoreria/
  │    ├── __init__.py          # Exporta router /tesoreria
  │    ├── bancos.py
  │    └── caja_chica.py
  └── inventario/
       ├── __init__.py          # Exporta router /inventario
       ├── transferencias.py
       └── kardex.py
```

*Ventajas:*
- Cada archivo pasa a tener entre 150 y 350 líneas de código especializado.
- La edición de una ruta de "devoluciones" no tiene impacto físico ni sintáctico sobre "tesorería".
- Permite aislar imports y dependencias de modelos.

---

### 7.3 Red de Seguridad: Batería Mínima de Tests Automatizados

Antes de ejecutar cualquier refactorización de código, es imperativo contar con una suite de pruebas automatizadas mínimas (`pytest` / `TestClient`) sobre los **4 flujos vitales del negocio**:

1. **Test 1 — Emisión de Factura Fiscal (`test_facturacion.py`):**
   - Crear cliente -> emitir factura con 2 productos -> verificar cálculo exacto de IVA/IGTF -> verificar descuento de stock global y por almacén -> verificar generación de movimiento de Kardex.
2. **Test 2 — Venta remota por Bot (`test_bot_sale.py`):**
   - Invocación con `X-Bot-Api-Key` -> verificar que el precio unitario sea inmutable (tomado de `Producto.precio_usd`) -> verificar creación de venta con `tenant_id` aislado.
3. **Test 3 — Transferencia de Inventario (`test_inventory_transfer.py`):**
   - Crear transferencia entre almacén A y B -> completar transferencia -> verificar que almacén A disminuye, almacén B aumenta y se crean 2 registros de Kardex.
4. **Test 4 — Anulación de Venta y Devolución (`test_void_and_returns.py`):**
   - Anular venta -> verificar reposición en `Producto.stock` Y en `StockPorAlmacen`.

---

## 8. PRIORIZACIÓN FINAL Y PLAN DE ACCIÓN

La siguiente matriz prioriza los hallazgos según su nivel de criticidad para la estabilidad y el escalamiento a nuevos clientes:

| # | Hallazgo / Tarea | Riesgo | Esfuerzo | ¿Se puede hacer sin que el cliente actual note nada? |
| :-: | :--- | :---: | :---: | :---: |
| **1** | **Eliminar patrón `OR tenant_id IS NULL` en `KODA_Remaster`:** Reemplazar las consultas en `vendedores_router.py`, `telegram_router.py`, `gerencias_router.py` y `main.py` para exigir siempre `tenant_id = $1::uuid`. | **ALTO** | **Bajo** (0.5 días) | **Sí** (Transparente para el cliente, elimina fuga de datos). |
| **2** | **Corregir reposición de `StockPorAlmacen` en anulación de ventas (`sales.py` L278):** Reponer tanto el stock global como el del almacén específico de la venta anulada. | **ALTO** | **Bajo** (2 horas) | **Sí** (Evita descuadres de inventario en ventas anuladas). |
| **3** | **Corregir Kardex y `StockPorAlmacen` en devoluciones de proveedor (`modulos_ext.py` L595):** Registrar el movimiento de salida en Kardex e impactar el almacén. | **ALTO** | **Bajo** (2 horas) | **Sí** (Corrige auditoría de compras). |
| **4** | **Cerrar bypass de rate limit en `/webhook/` y corregir IP proxy en Remaster:** Exigir clave en webhooks y usar `_extract_client_ip` en el middleware de rate limit. | **MEDIO** | **Bajo** (2 horas) | **Sí** (Protege la infraestructura contra ataques de fuerza bruta). |
| **5** | **Unificar sincronización de tasas BCV (`tasas_cambio` vs `bcv_rates` vs `tasas_bcv`):** Crear un helper único de persistencia para que cualquier sync actualice todas las tablas. | **ALTO** | **Bajo** (3 horas) | **Sí** (Garantiza paridad cambiaria entre Bot y ERP). |
| **6** | **Implementar batería de tests mínimos de seguridad (4 flujos vitales):** Tests para facturación, venta bot, transferencia de inventario y anulación. | **ALTO** | **Medio** (1.5 días) | **Sí** (Se ejecuta en local/CI sin impacto en producción). |
| **7** | **Modularizar `modulos_ext.py` (6,619 líneas) en submódulos de dominio:** Separar en carpetas `compras/`, `cobranzas/`, `pagos/`, `tesoreria/`, `inventario/`. | **MEDIO** | **Medio** (2 días) | **Con cuidado** (Requiere ejecutar los tests antes y después para asegurar compatibilidad 100%). |
| **8** | **Modularizar `KODA_Remaster/main.py` (5,286 líneas):** Extraer endpoints a routers existentes (`documents_router.py`, `tickets_router.py`). | **MEDIO** | **Medio** (2 días) | **Con cuidado** (Requiere verificación de endpoints institucionales). |
| **9** | **Añadir paginación (`limit`/`offset`) a endpoints masivos:** Paginación en `/sales/`, `/compras/`, `/inventario/kardex/`, `/cobranzas/cuentas/`, `/productos/`. | **ALTO** | **Medio** (2 días) | **Con cuidado** (Asegurar que el frontend consuma la respuesta paginada). |
| **10** | **Limpiar código muerto frontend (5 páginas huérfanas):** Eliminar `PointOfSale.tsx`, `QuotationForm.tsx`, `DeliveryNoteForm.tsx`, etc. | **BAJO** | **Bajo** (1 hora) | **Sí** (Limpia el bundle de producción sin efectos colaterales). |
| **11** | **Consolidar UI de Ventas en POS Hub unificado con pestañas:** Integrar POS, Facturación Fiscal, Historial y Notas de Entrega en `/ventas`. | **MEDIO** | **Medio** (3 días) | **Con cuidado** (Mejora radical de UX para el cajero/vendedor; requiere validación con Henry). |

---

## CONCLUSIÓN Y RECOMENDACIÓN FINAL

KODA ERP cuenta con una base funcional sólida y una cobertura de negocio muy completa para el mercado venezolano (facturación bimonetaria, fiscalidad SENIAT, control de choferes, bot de Telegram).  
Sin embargo, para poder **escalar a 10 o 50 clientes con total tranquilidad**, es indispensable resolver primero la deuda técnica identificada en los puntos **1, 2, 3 y 5** de la tabla de priorización (seguridad multi-tenant y consistencia de inventario/tasas), blindar los flujos con la batería mínima de tests (punto 6), y posteriormente modularizar los "God Files" antes de acometer la unificación visual del módulo de ventas.
