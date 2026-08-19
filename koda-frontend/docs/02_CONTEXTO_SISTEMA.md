# CONTEXTO DEL PROYECTO — KODA ERP
## Para Inteligencias Artificiales y Agentes

> **Propósito:** Este documento pone al día a cualquier IA o agente sobre el estado actual, arquitectura y reglas del sistema. Leer antes de tocar cualquier archivo.

---

## ¿Qué es KODA ERP?

KODA es un **ERP bimonetario venezolano** (Bolívares + USD) diseñado para operar en un contexto de alta inflación, controles de cambio y cumplimiento fiscal SENIAT. Está construido como una SPA (Single Page Application) con un backend FastAPI en Python y una base de datos SQLite.

**El objetivo de negocio:** servir a **miles de empresas simultáneamente**, por lo que cualquier dato hardcodeado o lógica asumida por empresa es un error crítico de arquitectura.

---

## Principios de Arquitectura Inquebrantables

1. **Bimonetario:** Todo monto debe existir en USD (moneda pivot) y VES (Bolívares). La conversión usa la tasa BCV que viene del endpoint `/api/tasa/actual`.
2. **Multi-empresa:** El backend usa un sistema de tenancy. El frontend NO debe asumir que hay una sola empresa.
3. **SENIAT-compliant:** Los módulos fiscales (Libro de Ventas, Libro de Compras, Retenciones, DP-31) deben generar documentos según la normativa vigente del SENIAT venezolano.
4. **Partida doble:** Todo asiento contable debe tener Debe = Haber. Nunca guardar un asiento descuadrado.
5. **Inmutabilidad de libros:** Los libros contables y fiscales son registros legales. No se eliminan registros, se anulan.

---

## Stack Tecnológico

### Frontend (Este repositorio: `koda-frontend`)
- **Framework:** React 18.2 + TypeScript 5.2
- **Build:** Vite 5.2
- **Estilos:** TailwindCSS 3.4 + CSS custom en `index.css`
- **Rutas:** React Router DOM 6.22
- **HTTP:** Fetch nativo envuelto en `src/api/client.ts` — usa proxy de Vite → `BASE_URL = '/api'`
- **Íconos:** Lucide React 0.363

### Backend (FastAPI, NO tocar desde este repo)
- Lenguaje: Python / FastAPI
- DB: SQLite (`erp_bimonetario.db` en la raíz del proyecto)
- Puerto local: 8000 (proxeado por Vite como `/api`)

### Vite Proxy
El archivo `vite.config.ts` proxea `/api` → `http://localhost:8000`. Esto significa que:
- Las llamadas a `/api/clientes` van a `http://localhost:8000/clientes`
- **NUNCA** usar `http://localhost:8000` directamente en el frontend

---

## Estructura de Directorios

```
koda-frontend/
├── src/
│   ├── App.tsx              # Router principal + DashboardHome + AlertsCenter
│   ├── main.tsx             # Punto de entrada de la aplicación
│   ├── api/
│   │   └── client.ts        # HTTP client (get/post/put/delete)
│   ├── assets/              # Recursos estáticos
│   ├── components/
│   │   ├── common/
│   │   │   ├── GlobalAdvisor.tsx   # Asistente AI flotante
│   │   │   └── QuickSearch.tsx     # Búsqueda global (Ctrl+K)
│   │   └── layout/
│   │       └── Sidebar.tsx         # Menú lateral
│   ├── config/              # VACÍO — reservado para configuraciones
│   ├── features/            # Lógica de negocio (accounting, admin, auth, dashboard, finance)
│   ├── hooks/               # Custom hooks (ej: useEmpresaPerfil)
│   ├── layouts/
│   │   └── MainLayout.tsx   # Layout: Header + Sidebar + contenido + AI bubble
│   ├── pages/
│   │   ├── Accounting/      # Páginas contables
│   │   ├── Admin/           # Páginas de administración
│   │   ├── Auditor/         # Páginas de auditoría
│   │   ├── Billing/         # Páginas de facturación
│   │   ├── Collections/     # Páginas de cobranzas
│   │   ├── Fiscal/          # Páginas fiscales (SENIAT)
│   │   ├── Inventory/       # Páginas de inventario
│   │   ├── Payments/        # Páginas de pagos
│   │   ├── Payroll/         # Páginas de nómina
│   │   ├── Purchasing/      # Páginas de compras
│   │   ├── Reports/         # Páginas de reportes
│   │   ├── Sales/           # Páginas de ventas
│   │   └── Treasury/        # Páginas de tesorería
│   ├── providers/           # Providers de React (ej: SystemProvider)
│   ├── routes/              # VACÍO — reservado para configuración de rutas
│   └── stores/              # VACÍO — reservado para estado global (Zustand/Context)
├── docs/                    # Documentación del proyecto
├── agents/                  # Agentes IA especializados
└── migracion/               # Scripts de migración de BD
```

---

## Endpoints Backend Conocidos (verificados con llamadas reales)

| Endpoint | Método | Usado en |
|----------|--------|----------|
| `/ventas` | GET | Dashboard, SalesDashboard |
| `/ventas` | POST | InvoiceForm (crear factura) |
| `/ventas/reporte` | GET | Dashboard, SalesDashboard |
| `/clientes` | GET | InvoiceForm, Customers, SalesDashboard |
| `/clientes` | POST | Customers |
| `/clientes/segmentos` | GET | PriceLists |
| `/proveedores` | GET | Suppliers, PurchasingDashboard |
| `/proveedores` | POST | Suppliers |
| `/productos` | GET | InvoiceForm, Products, PriceLists |
| `/productos` | POST | Products |
| `/tasa/actual` | GET | InvoiceForm (tasa BCV) |
| `/compras` | GET | PurchaseOrders |
| `/inventario/ajustes` | GET | InventoryAdjustments |
| `/inventario/ajustes/proponer` | POST | InventoryAdjustments |
| `/inventario/ajustes/:id/aprobar` | POST | InventoryAdjustments |
| `/inventario/ajustes/:id/rechazar` | POST | InventoryAdjustments |
| `/contabilidad/asientos` | GET | GeneralLedger (¡URL hardcodeada a localhost! Bug pendiente) |
| `/empresa/perfil` | GET | useEmpresaPerfil (hook global) |

### Endpoints Fiscales (Pendientes de implementar en el frontend)
Los siguientes endpoints deben existir en el backend pero el frontend AÚN NO los consume:
- `GET /fiscal/libro-ventas?periodo=YYYY-MM` — Libro de Ventas
- `GET /fiscal/libro-compras?periodo=YYYY-MM` — Libro de Compras
- `GET /fiscal/retenciones-iva?periodo=YYYY-MM` — Retenciones IVA
- `GET /fiscal/declaracion-iva?periodo=YYYY-MM` — DP-31

---

## Estado Actual por Módulo

| Módulo | Conectado BD | Datos Reales | Prioridad |
|--------|-------------|-------------|-----------|
| Facturación | ✅ | ✅ | — Funciona |
| Inventario/Productos | ✅ | ✅ | — Funciona |
| Clientes | ✅ | ✅ | — Funciona |
| Proveedores | ✅ | ✅ | — Funciona |
| Ventas Dashboard | ✅ | ⚠️ | Cálculos falsos |
| Compras | ⚠️ | ⚠️ | Solo lista |
| Contabilidad | ⚠️ | ❌ | Mayoría mock |
| Fiscal | ❌ | ❌ | 🔴 URGENTE |
| Cobranzas | ❌ | ❌ | 🔴 URGENTE |
| Pagos | ❌ | ❌ | 🔴 URGENTE |
| Tesorería | ❌ | ❌ | Alta prioridad |
| Reportes | ❌ | ❌ | Alta prioridad |
| Administración | ❌ | ❌ | Alta prioridad |

---

## Reglas para Escribir Código en Este Proyecto

### ✅ SIEMPRE
- Usar `api.get<T>('/endpoint')` del cliente centralizado, nunca `fetch` directo
- Manejar estados: `isLoading`, `error`, y `data`
- Usar `useNavigate()` para navegación programática, nunca `window.history.back()`
- Los textos de empresa (nombre, RIF) deben venir de una llamada a `/api/empresa/perfil` o equivalente
- Los períodos fiscales deben ser seleccionables, nunca hardcodeados
- Los arrays de datos de tabla deben venir de la API, nunca definidos en el componente

### ❌ NUNCA
- `http://localhost:8000` en ningún archivo del frontend
- Arrays hardcodeados con nombres de empresas reales o ficticias
- Datos bimonetarios calculados con fórmulas inventadas (ej: `porCobrar = ventas * 0.15`)
- `alert()` para operaciones de negocio (usar toast, modal o estado de UI)
- `any` en llamadas a la API — siempre definir interfaces TypeScript
- Modificar archivos del backend o esquemas de BD

---

## Convenciones de Código

### Nombres de Archivos
- Páginas: PascalCase (`InvoiceForm.tsx`)
- Componentes: PascalCase (`MetricCard.tsx`)
- Hooks: camelCase con prefijo `use` (`useExchangeRate.ts`)
- Servicios: camelCase (`fiscalService.ts`)

### Estructura de un Componente de Página
```typescript
// 1. Imports
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

// 2. Interfaces TypeScript
interface MiEntidad {
  id: number;
  campo: string;
}

// 3. Componente
const MiPagina = () => {
  // 4. Estado
  const [data, setData] = useState<MiEntidad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 5. Efectos / Carga de datos
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await api.get<MiEntidad[]>('/mi-endpoint');
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Error al cargar datos');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // 6. Render
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return <div>...</div>;
};
```

---

## Contexto Fiscal Venezolano

### Impuestos Vigentes
| Impuesto | Alícuota | Aplica a |
|----------|---------|---------|
| IVA General | 16% | Bienes y servicios gravados |
| IVA Reducida | 8% | Algunos bienes de primera necesidad |
| IVA Exento | 0% | Bienes exentos (medicamentos, alimentos básicos) |
| IVA Exportación | 0% (+ IGTF) | Operaciones de exportación |
| IGTF | 3% | Pagos en moneda extranjera o criptoactivos |
| ISLR | Variable | Retención en fuente según concepto |

### Retenciones IVA
- **Contribuyentes Especiales:** retienen **75%** del IVA de sus proveedores
- **Retenciones Practicadas:** cuando la empresa retiene a su proveedor
- **Retenciones Recibidas:** cuando un cliente especial le retiene a la empresa
- El comprobante tiene **14 dígitos** (AAAAMMXXXXXXXXXXX)

### Libros Fiscales (Formato SENIAT)
Columnas obligatorias del Libro de Ventas:
1. N° de Operación
2. Fecha
3. RIF del Cliente
4. Nombre o Razón Social
5. N° de Factura / Documento
6. N° de Control
7. Total de Ventas con IVA
8. Ventas Exentas/Exoneradas
9. Base Imponible
10. Alícuota (%)
11. IVA Débito Fiscal
12. IGTF
13. IVA Retenido

---

## Paleta de Colores del Sistema

```css
Color principal:     #0b5156  (Verde-Teal oscuro)
Color hover:         #083a3d
Color fondo:         #f8fafc  (slate-50)
Color borde:         #e2e8f0  (slate-200)
Color texto oscuro:  #1e293b  (slate-800)
Color texto suave:   #94a3b8  (slate-400)
```
