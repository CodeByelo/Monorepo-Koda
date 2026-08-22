# Diagnóstico: Módulo de Facturación — bitácora de trabajo

Documento de continuidad. Última actualización: 2026-08-19.

## 1. Problema original

Al hacer clic en "Módulo de Facturación" en el dashboard institucional, el sistema fallaba de forma intermitente con un error distinto cada vez. Ya se había intentado corregir una vez (commit `f75774c`) y volvió a romperse.

## 2. Arquitectura real (esto no era obvio y costó reconstruirlo)

Hay **tres despliegues distintos** hablando entre sí, no uno solo:

| Pieza | Repo/carpeta | Dónde vive |
|---|---|---|
| Dashboard institucional (frontend) | `KODA_Remaster/sistema-corporativo/frontend-enterprise` | Vercel, proyecto `sistema-corpoelect` |
| Backend institucional | `KODA_Remaster/sistema-corporativo/backend` | Render, contenedor (Dockerfile), **no** es función serverless de Vercel |
| ERP de facturación real (frontend) | `koda-frontend` (raíz del monorepo) | Vercel, `https://koda-billing-front.vercel.app` |
| ERP de facturación real (backend) | `koda-frontend/backend` | Render, `https://koda-backend-contable.onrender.com` |

El botón "Módulo de Facturación" **no implementa facturación en sí** — es un puente SSO: pide un `exchange_code` de un solo uso al backend institucional, que a su vez se lo pide al backend del ERP, y con eso abre `koda-billing-front.vercel.app` en pestaña nueva.

`koda-frontend` (raíz) **sí está en producción**, aunque no tiene carpeta `.vercel` en este checkout — eso solo significa que nadie corrió `vercel link` en esta copia local, no que esté sin desplegar. No confundir con "legacy/abandonado".

## 3. Causas raíz encontradas y corregidas (commits ya subidos a `main`)

1. **Carrera entre dos implementaciones duplicadas del fetch del código SSO** — el botón a veces abría pestaña nueva y a veces el módulo embebido (`BillingModule.tsx`), según cuál fetch resolviera primero. Se centralizó en `frontend-enterprise/src/app/dashboard/utils/billingBridge.ts` (única fuente de verdad) y el botón ahora siempre abre pestaña nueva. — commit `1cdc4a7`
2. **Timeout apilado de ~187s en el peor caso** (`backend/services/koda_frontend_client.py`): 3 intentos × 60s. Reducido a 2 intentos × 5s (~12s peor caso). — commit `189cd2c`
3. **Transacción RLS rota en `billing_router.py`**: `set_config('app.current_tenant_id', ..., true)` se ejecutaba fuera de una transacción, perdiendo su alcance antes del insert de `_log_security_event` (afecta solo al flujo de detección de archivos Excel spoofeados). Corregido envolviendo ambos en `conn.transaction()`. — commit `189cd2c`
4. **CI no corría ningún test** (solo `tsc --noEmit` y `py_compile`). Se agregó job que corre `pytest` real, incluyendo un test nuevo que verifica que el timeout de (2) se respeta. — commit `5111aae`
5. **Regresión de bloqueo de pop-up**: al mover el fetch al momento del clic, `window.open()` quedaba fuera de la ventana de activación de usuario del navegador y se bloqueaba en silencio. Corregido abriendo la pestaña en blanco de forma síncrona en el clic y navegándola después. — commit `1f1f3f4`

## 4. Descartado como causa (verificado con evidencia, no es esto)

- **ContextVar de tenant en middleware**: no aplica a las rutas de facturación, solo a `/documentos` y `/tickets`.
- **Pool de conexiones agotado**: configuración correcta, sin N+1 en el módulo de facturación.
- **`emitir_factura` en `facturacion_router.py`**: transacciones correctas, no tiene el bug de (3).
- **Lado receptor del puente SSO (`koda-frontend/backend`)**: revisado a fondo — validación de clave (`hmac.compare_digest`), expiración de `exchange_code` (120s, tabla real en DB, no memoria), CORS explícito para `koda-billing-front.vercel.app`, todo correcto. Sin bugs encontrados ahí.
- **"Módulo contable"**: no es un botón funcional, es una tarjeta decorativa de marketing en `LandingPage.jsx:1553` sin `onClick`. No está roto — nunca estuvo implementado. Si se quiere una función de contabilidad real, es un desarrollo nuevo, no un bug.
- **`KODA_FRONTEND_API_URL` y `SSO_BRIDGE_INTERNAL_KEY`**: confirmadas configuradas y coincidentes entre ambos backends (el usuario compartió las variables de Render). Descartadas como causa.

## 5. Hallazgos aparte, NO relacionados con el botón de facturación (production, confirmados)

- **`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` no están seteadas** en el backend institucional (Render). Esto rompe "Mensajería Interna" (`GET /documentos`): el error se atrapa y el endpoint devuelve `200 OK` con lista vacía en vez de un error visible — el usuario solo ve la bandeja vacía, sin ningún aviso. **Pendiente: configurar esas 3 variables en Render.**
- **`REDIS_URL` apunta a `redis://redis:6379`** (hostname de docker-compose local, no existe en producción). El rate limiter cae a "fail-open" (funciona, pero sin límite de tasa real). **Pendiente: configurar la URL real del Redis gestionado.**

## 6. Seguridad — acción pendiente urgente

Durante esta sesión se compartieron en el chat las variables de entorno completas de ambos backends, incluyendo secretos reales (contraseña de base de datos, `JWT_SECRET`, tokens de Telegram, claves internas de servicio). **Rotar cuanto antes** (si no se hizo ya): `DATABASE_URL`/`SUPABASE_DB_PASSWORD`, `JWT_SECRET`, `SECRET_KEY`, `AUDIT_LOG_SECRET`, `BOT_INTERNAL_API_KEY`, `SSO_BRIDGE_INTERNAL_KEY` (en ambos backends a la vez, deben seguir coincidiendo), `ORG_SYNC_API_KEY`, `LOGISTICS_INTERNAL_FORWARD_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `DEV_ROLE_MASTER_PASSWORD`.

## 7. Investigación abierta (el botón puede seguir sin abrir nada — esto es lo siguiente a revisar)

Con el puente SSO verificado de punta a punta en el código (ambos lados), las causas que quedan ya no son de código sino de datos/config en vivo:

1. **Verificar en la base de datos del ERP** (`koda-backend-contable`) si el perfil del usuario de prueba tiene `estado` activo y `tenant_id`/tenant válido en las tablas `profiles`/`tenants`. Si no, el backend responde `404` con el mensaje "Tu empresa no tiene el Módulo de Facturación (ERP) activado todavía" — que SÍ debería verse como alerta en pantalla, no como "no pasa nada".
2. **Revisar en el dashboard de Vercel del proyecto `koda-billing-front`** el valor de `VITE_API_URL` — si está vacío o apunta a otro lugar que no sea `https://koda-backend-contable.onrender.com`, el frontend del ERP no podría canjear el código.
3. **Pendiente de obtener**: abrir DevTools (F12) → pestaña Network → clic en el botón → reportar el código de estado HTTP de la petición a `/api/auth/koda-frontend/exchange-code` (200/401/404/502/sin request) y si se abre o no una pestaña en blanco. Esto es lo que va a confirmar cuál de los dos puntos anteriores es la causa real.

## 8. Deuda técnica encontrada, no atendida (fuera de alcance de este trabajo)

- `backend/tests/test_ledger_integration.py`: requiere una Postgres real/`DATABASE_URL` para correr, falla en CI sin eso.
- `backend/tests/test_tenancy.py`: usa `async def test_...` sin plugin `pytest-asyncio`/`anyio` configurado, falla con pytest moderno.

## 9. Commits de esta sesión (rama `main`)

```
1f1f3f4 fix(billing): evitar bloqueo de pop-up al abrir la pestana de facturacion
5111aae ci: ejecutar pytest del backend en el pipeline
189cd2c fix(billing): acotar timeout del puente SSO y corregir alcance de transaccion RLS
1cdc4a7 fix(billing): unificar flujo del boton de facturacion a pestana nueva
```
