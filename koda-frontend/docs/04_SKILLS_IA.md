# SKILLS PARA AGENTES IA — KODA ERP

> Este archivo describe el conocimiento base que debe tener cualquier IA antes de trabajar en este proyecto.

---

## SKILL 01 — Tributación Venezolana para Desarrolladores

### IVA (Impuesto al Valor Agregado)
- **Alícuota general:** 16%
- **Alícuota reducida:** 8% (bienes de primera necesidad según Ley IVA)
- **Exentos:** 0% (medicamentos, alimentos de la cesta básica, libros)
- **Exportaciones:** Alícuota 0% pero con IGTF si aplica

### IGTF (Impuesto a las Grandes Transacciones Financieras)
- **Alícuota:** 3%
- **Aplica cuando:** el pago se realiza en moneda extranjera (USD) o criptoactivos
- **No aplica** a pagos en Bolívares (VES)

### Retenciones IVA
- Solo los **Contribuyentes Especiales** designados por el SENIAT retienen
- **Porcentaje estándar:** 75% del IVA facturado
- **Casos 100%:** cuando el contribuyente especial compra a un agente de retención
- **Comprobante:** número de 14 dígitos (AAAAMMXXXXXXXXXX)

### ISLR (Impuesto Sobre la Renta)
- Retenciones en fuente según conceptos del SENIAT
- Los conceptos más comunes: honorarios profesionales, alquileres, servicios
- El ARC (Comprobante de Retenciones) se emite al final del ejercicio fiscal

### Libros Fiscales
- El Libro de Ventas y el Libro de Compras son documentos legales
- Se presentan mensualmente al SENIAT
- Deben incluir número correlativo de operación, sin saltos ni duplicados
- El formato de exportación es TXT (para el portal del SENIAT) o Excel

---

## SKILL 02 — Contabilidad Bimonetaria Venezolana

### Principio Base
En Venezuela, las empresas llevan libros en **Bolívares (VES)** por obligación legal, pero en contexto de hiperinflación, el análisis de gestión se hace en **USD**.

### Ajuste por Inflación
- Las NICs venezolanas (VEN-NIF) requieren ajustar estados financieros por inflación
- El índice usado es el **IPC** (Índice de Precios al Consumidor) del BCV
- El módulo `InflationAdjustment.tsx` maneja esto

### Ajuste Cambiario
- Las cuentas en USD deben reexpresarse a la tasa vigente al cierre del período
- Genera asientos automáticos de diferencial cambiario
- El módulo `ExchangeAdjustment.tsx` maneja esto

### Partida Doble
- Todo asiento debe cumplir: **Σ Debe = Σ Haber**
- Las cuentas de naturaleza deudora aumentan con Debe
- Las cuentas de naturaleza acreedora aumentan con Haber

---

## SKILL 03 — Arquitectura del API Client

### Cómo funciona
```typescript
// src/api/client.ts
const BASE_URL = '/api';  // Proxeado por Vite a http://localhost:8000

// Patrón de uso CORRECTO:
const data = await api.get<TipoRespuesta>('/endpoint');

// INCORRECTO (nunca hacer esto):
const res = await fetch('http://localhost:8000/endpoint');
```

### Manejo de Errores
El cliente lanza `Error` con el mensaje del backend si el status no es 2xx.
Siempre envolver en try/catch:
```typescript
try {
  const data = await api.get<...>('/endpoint');
  setData(data);
} catch (err: any) {
  setError(err.message || 'Error desconocido');
}
```

### Tipos de Respuesta
- El cliente devuelve `T` directo (ya parsea el JSON)
- No hay `.data` — la respuesta ES el dato
- Excepción: status 204 devuelve `{}`

---

## SKILL 04 — React Patterns del Proyecto

### Loading States
```typescript
if (isLoading) return (
  <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
    Cargando...
  </div>
);
```

### Empty States
```typescript
if (data.length === 0) return (
  <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest bg-white rounded-3xl border border-slate-200 shadow-sm">
    No hay registros disponibles.
  </div>
);
```

### Clases CSS Comunes
```
Tarjeta base:       bg-white p-6 rounded-2xl border border-slate-200 shadow-sm
Botón primario:     bg-[#0b5156] text-white px-4 py-2 rounded-xl text-xs font-black uppercase
Botón secundario:   bg-white text-[#0b5156] px-4 py-2 rounded-xl border border-[#0b5156]/20
Badge verde:        bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase
Badge rojo:         bg-red-100 text-red-700 text-[9px] font-black px-2 py-0.5 rounded uppercase
Badge ámbar:        bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded uppercase
Input:              bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold
```

---

## SKILL 05 — Rutas del Sistema

### Mapa de Rutas Completo
```
/                           → Dashboard Operativo
/alertas                    → Centro de Alertas

/ventas                     → Dashboard de Ventas
/ventas/cotizaciones        → Cotizaciones
/ventas/ordenes             → Órdenes de Venta
/ventas/entregas            → Notas de Entrega
/ventas/precios             → Listas de Precios

/facturacion                → Dashboard Facturación
/facturacion/nueva          → Nueva Factura (InvoiceForm)
/facturacion/clientes       → Gestión de Clientes
/facturacion/notas          → Notas de Crédito
/facturacion/pos            → Punto de Venta

/compras                    → Dashboard Compras
/compras/proveedores        → Gestión de Proveedores
/compras/ordenes            → Órdenes de Compra
/compras/anteproyecto       → Anteproyecto de Costos
/compras/requisiciones      → Requisiciones
/compras/aprobaciones       → Aprobaciones
/compras/recepcion          → Recepción de Mercancía
/compras/facturas           → Facturas de Proveedores
/compras/devoluciones       → Devoluciones
/compras/historial          → Historial de Compras

/inventario                 → Dashboard Inventario
/inventario/productos       → Productos
/inventario/kardex          → Kardex
/inventario/ajustes         → Ajustes de Inventario
/inventario/existencias     → Existencias
/inventario/almacenes       → Almacenes
/inventario/transferencias  → Transferencias
/inventario/fisico          → Inventario Físico
/inventario/critico         → Stock Crítico
/inventario/lotes           → Lotes y Vencimientos

/cobranzas                  → Dashboard Cobranzas
/cobranzas/cartera          → Cuentas por Cobrar
/cobranzas/aplicar          → Aplicar Pagos
/cobranzas/antiguedad       → Análisis de Antigüedad
/cobranzas/estado-cuenta    → Estado de Cuenta
/cobranzas/flujo            → Flujo Proyectado
/cobranzas/anticipos        → Anticipos de Clientes

/pagos                      → Dashboard Pagos
/pagos/cuentas-por-pagar    → Cuentas por Pagar
/pagos/ordenes              → Órdenes de Pago
/pagos/lotes                → Lotes de Pago
/pagos/programacion         → Programación de Pagos
/pagos/voucher              → Voucher de Pago

/tesoreria                  → Dashboard Tesorería
/tesoreria/bancos           → Cuentas Bancarias
/tesoreria/movimientos-bancarios → Movimientos Bancarios
/tesoreria/conciliacion     → Conciliación Bancaria
/tesoreria/tasas            → Tasas de Cambio
/tesoreria/transferencias   → Transferencias Internas
/tesoreria/caja-chica       → Caja Chica
/tesoreria/arqueo           → Arqueo de Caja
/tesoreria/movimientos-caja → Movimientos de Caja
/tesoreria/flujo            → Flujo de Caja
/tesoreria/prestamos        → Préstamos UVC
/tesoreria/presupuesto      → Variación Presupuestaria
/tesoreria/inversiones      → Rendimiento de Inversiones
/tesoreria/turnos           → Integridad de Turnos
/tesoreria/importar         → Importar Estado de Cuenta

/fiscal                     → Dashboard Fiscal
/fiscal/libro-ventas        → Libro de Ventas IVA
/fiscal/libro-compras       → Libro de Compras IVA
/fiscal/declaracion-iva     → Declaración IVA (DP-31)
/fiscal/retenciones-iva     → Retenciones IVA
/fiscal/retenciones-islr    → Retenciones ISLR
/fiscal/igtf                → IGTF
/fiscal/calendario          → Calendario Fiscal
/fiscal/obligaciones        → Obligaciones Fiscales
/fiscal/declaracion-islr    → Declaración ISLR
/fiscal/conceptos-islr      → Conceptos ISLR
/fiscal/arc                 → Generador ARC
/fiscal/comprobantes        → Comprobantes de Retención

/contabilidad               → Dashboard Contabilidad
/contabilidad/diario        → Libro Diario (GeneralLedger)
/contabilidad/mayor         → Mayor General (GeneralLedger)
/contabilidad/balance-comprobacion → Balance de Comprobación
/contabilidad/balance-general → Balance General
/contabilidad/estado-resultados → Estado de Resultados
/contabilidad/flujo-caja    → Flujo de Caja
/contabilidad/catalogo      → Plan de Cuentas
/contabilidad/asiento-manual → Nuevo Asiento Manual
/contabilidad/asiento/:id   → Detalle de Asiento
/contabilidad/cierre        → Cierre de Período
/contabilidad/centros-costo → Centros de Costo
/contabilidad/ajuste-cambiario → Ajuste Cambiario
/contabilidad/ajuste-inflacion → Ajuste por Inflación
/contabilidad/mapeo-flujo   → Mapeo de Flujo de Caja
/contabilidad/auditoria-diario → Auditoría del Diario
/contabilidad/consolidacion → Consolidación Financiera
/contabilidad/admin         → Interfaz de Administración Contable

/reportes                   → Dashboard de Reportes
/reportes/antiguedad-cartera → Antigüedad de Cartera
/reportes/diferencial-cambiario → Diferencial Cambiario
/reportes/ventas            → Reporte de Ventas
/reportes/compras           → Reporte de Compras
/reportes/eficiencia        → Eficiencia Operacional
/reportes/matriz-abc        → Matriz ABC
/reportes/rentabilidad      → Rentabilidad de Productos
/reportes/vendedores        → Gestión de Fuerza de Ventas
/reportes/excepciones       → Control de Excepciones
/reportes/libro-fiscal      → Libro Fiscal
/reportes/query-builder     → Constructor de Consultas

/admin                      → Centro de Control del Sistema
/admin/empresa              → Identidad Corporativa
/admin/numeracion           → Control de Numeración
/admin/monedas              → Política Monetaria
/admin/sucursales           → Sucursales y Sedes
/admin/notificaciones       → Notificaciones Automatizadas
/admin/usuarios             → Usuarios y Permisos
/admin/auditoria            → Auditoría del Sistema
/admin/importacion          → Panel de Importación
/admin/respaldos            → Respaldos en la Nube
/admin/salud                → Salud del Sistema
/admin/importacion/historial → Historial de Importaciones
/admin/importacion/rapida   → Importación Rápida
```

---

## SKILL 06 — Normas VEN-NIF Relevantes

### NIC 21 / VEN-NIF para Bimonetarismo
- Las transacciones en moneda extranjera se registran a la tasa BCV del día
- Al cierre del período, los activos/pasivos monetarios en USD se reexpresan
- La diferencia va a "Diferencial Cambiario" (resultado del período, no patrimonio)

### NIC 29 / VEN-NIF para Hiperinflación
- Venezuela está bajo economía hiperinflacionaria
- Los estados financieros deben ajustarse usando el Índice de Precios al Consumidor
- Los activos no monetarios se reexpresan; los monetarios no

### Presentación de Estados Financieros
- Balance General → activos = pasivos + patrimonio
- Estado de Resultados → ingresos - costos - gastos = utilidad neta
- Flujo de Caja → operacional + inversión + financiamiento
