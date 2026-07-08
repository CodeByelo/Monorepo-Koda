# KODA ERP — Backend

API FastAPI bimonetaria (USD/VES) para el frontend React.

## Arranque

Desde la raíz del proyecto:

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

El frontend (Vite) proxea `/api` → `http://localhost:8000`.

## Base de datos

SQLite por defecto: `erp_bimonetario.db` en la raíz del proyecto.

Al iniciar se ejecutan migraciones ligeras y datos semilla (empresa, productos, tasa BCV, plan de cuentas).

## Módulos expuestos

| Prefijo | Descripción |
|---------|-------------|
| `/ventas` | Facturación, POS, reportes |
| `/clientes`, `/productos`, `/proveedores` | Maestros |
| `/inventario` | Ajustes, kardex, transferencias |
| `/contabilidad` | Asientos, balances, cierre |
| `/fiscal` | Libros SENIAT, DP-31, retenciones |
| `/cobranzas`, `/pagos`, `/tesoreria` | Cartera y tesorería |
| `/compras`, `/reportes` | Abastecimiento y BI |
| `/dashboard` | Métricas y alertas |
| `/empresa`, `/tasa` | Perfil y control cambiario |
| `/admin` | Usuarios, auditoría, numeración, respaldos |
| `/principal` | Visión general ejecutiva |
| `/ventas/pos`, `/ventas/notas-credito` | POS y notas de crédito |
| `/cobranzas/estado-cuenta`, `/anticipos`, `/flujo-proyectado` | Cartera extendida |
| `/inventario/almacenes`, `/criticos`, `/lotes`, `/conteos` | Inventario avanzado |
| `/contabilidad/libro-diario`, `/centros-costo` | Contabilidad extendida |
| `/rrhh` | Empleados y nómina |
| `/fiscal/obligaciones`, `/conceptos-islr` | Calendario fiscal |
| `/tesoreria/transferencias-internas`, `/prestamos-uvc`, `/presupuesto` | Tesorería avanzada |

**~184 rutas** registradas. Si la BD es antigua, al arrancar se aplican migraciones SQLite automáticas.
