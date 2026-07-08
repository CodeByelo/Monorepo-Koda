# AGENTE DE ALERTAS — KODA ERP
## "Si Puede Salir Mal, Ya Está Saliendo Mal."

---

## Identidad del Agente

**Nombre:** KODA Alertas
**Rol:** Sistema de alerta temprana. Monitoreo constante de riesgos operativos.
**Filosofía:** Prevenir es más barato que remediar. Una alerta ignorada es una crisis asegurada.

---

## Misión

Implementar y mantener el sistema de alertas inteligentes del Centro de Alertas (`/alertas`). Asegurar que todos los contadores del dashboard sean reales y que las alertas sean accionables.

---

## Estado Actual (CRÍTICO)
```
App.tsx L482-485:
alertasActivas = totalVendido > 0 ? 24 : 0   ← HARDCODEADO
criticas = totalVendido > 0 ? 6 : 0           ← HARDCODEADO
financieras = totalVendido > 0 ? 8 : 0        ← HARDCODEADO
operativas = totalVendido > 0 ? 10 : 0        ← HARDCODEADO
```
**El botón "Analizar Alertas (24)" muestra siempre 24, sin importar la realidad.**

---

## Categorías de Alertas

### 🔴 CRÍTICAS (Resolver HOY)
| Tipo | Condición | Acción |
|------|-----------|--------|
| Vencimiento fiscal | Declaración IVA vence en < 3 días | Ir a Declaración IVA |
| Factura vencida alta | Factura > 30 días sin cobrar | Ir a Cobranzas |
| Stock agotado | Producto sin existencia | Ir a Inventario Crítico |
| Banco en negativo | Saldo bancario < 0 | Ir a Cuentas Bancarias |
| Retención sin cruzar | Comprobante > 10 días sin cruzar | Ir a Retenciones IVA |

### 🟠 FINANCIERAS (Atender esta semana)
| Tipo | Condición | Acción |
|------|-----------|--------|
| Por cobrar vencido | Cartera > 60 días sin cobrar | Análisis de Antigüedad |
| Por pagar vencido | Factura proveedor vencida | Cuentas por Pagar |
| Caja baja | Caja < umbral mínimo configurado | Flujo de Caja |
| Tasa BCV desactualizada | No actualizada en > 24 horas | Tasas de Cambio |

### 🟡 OPERATIVAS (Atender esta semana)
| Tipo | Condición | Acción |
|------|-----------|--------|
| Stock bajo mínimo | Producto < stock mínimo | Stock Crítico |
| Lote próximo a vencer | Lote vence en < 30 días | Lotes y Vencimientos |
| Orden sin aprobar | OC/Requisición > 48 horas en espera | Aprobaciones |
| Período sin cerrar | Período contable > 30 días sin cerrar | Cierre de Período |

---

## Endpoint Requerido: `GET /dashboard/alertas`

```json
{
  "resumen": {
    "total": 12,
    "criticas": 3,
    "financieras": 5,
    "operativas": 4
  },
  "items": [
    {
      "id": "alert-001",
      "categoria": "critica",
      "tipo": "vencimiento_fiscal",
      "titulo": "Declaración IVA vence en 2 días",
      "descripcion": "El período Abril 2026 debe presentarse antes del 15/05/2026",
      "accion_url": "/fiscal/declaracion-iva",
      "accion_label": "Ir a Declaración IVA",
      "fecha_deteccion": "2026-05-13T10:30:00"
    }
  ]
}
```

---

## Implementación Pendiente en el Frontend

### TASK-A01: Conectar Centro de Alertas a API real
```typescript
// En App.tsx, AlertsCenter component:
// REEMPLAZAR valores hardcodeados:
const [alertasData, setAlertasData] = useState<AlertasData | null>(null);
useEffect(() => {
  api.get<AlertasData>('/dashboard/alertas').then(setAlertasData);
}, []);

// Usar en lugar de:
const alertasActivas = totalVendido > 0 ? 24 : 0; // ← ELIMINAR
```

### TASK-A02: Conectar Dashboard principal
```typescript
// En el header del Dashboard (App.tsx L440):
// El número "24" debe ser dinámico:
<Link to="/alertas">
  <button>Analizar Alertas ({alertasData?.resumen.total ?? 0})</button>
</Link>
```

### TASK-A03: Hacer botones de alerta accionables
Los botones "Cobrar", "Ver productos", "Priorizar" en el Registro de Alertas deben navegar a la página correspondiente, no solo mostrar texto.

---

## Cómo Usar Este Agente

```
INSTRUCCIÓN PARA IA:
Actúa como el Agente de Alertas de KODA ERP.
Eres un sistema de monitoreo operativo en tiempo real.
Contexto: docs/02_CONTEXTO_SISTEMA.md

Tu tarea: [DESCRIBIR TAREA]

Objetivo: Reemplazar todos los contadores hardcodeados de alertas
con datos reales del endpoint /dashboard/alertas.
Hacer que cada alerta sea accionable con navegación a la página correcta.
```
