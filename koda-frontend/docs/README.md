# KODA ERP — DOCUMENTACIÓN OFICIAL
**Versión:** 1.0 | **Última actualización:** 2026-05-21 | **Auditado por:** Antigravity AI

---

## 📁 Estructura de Documentación

| Documento | Descripción | Audiencia |
|-----------|-------------|-----------|
| [01_AUDITORIA_COMPLETA.md](./01_AUDITORIA_COMPLETA.md) | Auditoría forense completa del frontend. 47 hallazgos. Categorías de errores. | Dev, QA, Gerencia |
| [02_CONTEXTO_SISTEMA.md](./02_CONTEXTO_SISTEMA.md) | Contexto completo del sistema para IAs. Stack, endpoints, reglas. | IAs, Devs nuevos |
| [03_PLAN_DE_CORRECCIONES.md](./03_PLAN_DE_CORRECCIONES.md) | Plan de trabajo detallado. Fix por fix, módulo por módulo. | Dev team |
| [04_SKILLS_IA.md](./04_SKILLS_IA.md) | Base de conocimiento fiscal y contable para agentes IA. | Agentes IA |

---

## 🤖 Agentes Disponibles

| Agente | Archivo | Responsabilidad |
|--------|---------|----------------|
| Homologador | [agents/homologador/](../agents/homologador/AGENT_HOMOLOGADOR.md) | Revisión para cumplimiento SENIAT |
| Contador | [agents/contador/](../agents/contador/AGENT_CONTADOR.md) | Módulos contables VEN-NIF |
| Facturador | [agents/facturador/](../agents/facturador/AGENT_FACTURADOR.md) | Facturación Providencia 00071 |
| Auditor Fiscal | [agents/auditor-fiscal/](../agents/auditor-fiscal/AGENT_AUDITOR_FISCAL.md) | Cumplimiento tributario |
| Tesorero | [agents/tesorero/](../agents/tesorero/AGENT_TESORERO.md) | Liquidez, bancos, cobranzas |
| Alertas | [agents/alertas/](../agents/alertas/AGENT_ALERTAS.md) | Sistema de alertas operativas |

---

## 🚨 Estado de Prioridades (Post-Auditoría 2026-05-21)

### 🔴 BLOQUEA PRODUCCIÓN (Hacer antes de ir live)
1. Reemplazar todos los datos hardcodeados de empresa (RIF, Razón Social) → Mock
2. Conectar módulo Fiscal a endpoints reales
3. Corregir bug de URL localhost en `GeneralLedger.tsx`
4. Corregir ruta de navegación en `ManualJournalEntry.tsx`
5. Corregir template literal en `BalanceSheet.tsx`
6. Remover usuario hardcodeado del Layout (Henry Rodriguez)

### 🟠 ALTA PRIORIDAD
7. Conectar Dashboard a métricas reales (eliminar cálculos inventados)
8. Implementar funciones en botones de exportación fiscal
9. Conectar módulos de Tesorería, Cobranzas y Pagos
10. Corregir detección de Contribuyente Especial (no es por prefijo del RIF)

### 🟡 PRIORIDAD MEDIA
11. Implementar búsqueda funcional en todas las tablas
12. Conectar módulo de Contabilidad completo
13. Conectar módulo de Reportes
14. Implementar períodos seleccionables en módulos fiscales

---

## 📊 Resumen de la Auditoría

| Categoría | Hallazgos | Críticos | Resueltos |
|-----------|-----------|----------|-----------|
| Datos Hardcodeados / Mocks | 28 | 22 | 0 |
| Botones Sin Función | 21 | 8 | 0 |
| Bugs de Código | 5 | 3 | 0 |
| Búsquedas Sin Implementar | 8 | 0 | 0 |
| Módulos Sin API | 5 módulos completos | 2 | 0 |
| **TOTAL** | **62** | **33** | **0** |

---

## 🏗️ Guía Rápida para Desarrolladores

### Antes de tocar cualquier archivo:
1. Leer `02_CONTEXTO_SISTEMA.md` completo
2. Revisar si el módulo está en la auditoría `01_AUDITORIA_COMPLETA.md`
3. Seguir el plan en `03_PLAN_DE_CORRECCIONES.md`

### Para instruir a una IA:
```
Lee docs/02_CONTEXTO_SISTEMA.md y docs/04_SKILLS_IA.md primero.
Luego actúa como [nombre del agente de agents/].
Tu tarea: [descripción de la tarea]
```

### Reglas de oro:
- ❌ NUNCA `fetch('http://localhost:8000/...')` — usar `api.get('/...')`
- ❌ NUNCA datos de empresa hardcodeados
- ❌ NUNCA `alert()` para operaciones de negocio
- ✅ SIEMPRE manejar `isLoading` y `error`
- ✅ SIEMPRE interfaces TypeScript para la API
- ✅ SIEMPRE el plan de cuentas y los libros vienen del backend
