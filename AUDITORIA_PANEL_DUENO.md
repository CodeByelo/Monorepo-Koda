# Auditoría Funcional Completa — Panel de Dueño (Developer Console)

**Repositorio auditado:** `KODA_Remaster`  
**Frontend:** `sistema-corporativo/frontend-enterprise/src/app/dashboard/developer/page.tsx`  
**Backend:** `sistema-corporativo/backend/routers/developer_router.py`  
**Endpoints auxiliares:** `auth_router.py`, `internal_router.py`, `main.py`  
**Fecha:** 2026-09-08  
**Estado:** Auditoría y diagnóstico completos (sin modificación de código ni alteración de datos de producción).

---

## Resumen Ejecutivo

El Panel de Dueño cuenta con **lógica real de backend** construida en FastAPI (`developer_router.py`) con control de acceso RBAC estricto (`require_developer`), pools asíncronos (`asyncpg`), y eventos en tiempo real (`WebSocket`). No es una maqueta cosmética.

Sin embargo, la auditoría reveló **inconsistencias UX/Backend**, **vulnerabilidades de autogestión/bloqueo** y, muy críticamente, un **desacople arquitectónico severo en el borrado de tenants (`DELETE /dev/tenants/{id}`)**, el cual elimina datos institucionales pero deja **77 tablas del ERP huérfanas** con IDs colgantes en la misma base de datos física.

A continuación se detalla el análisis ítem por ítem con su calificación:
- ✅ **Funciona como se espera**
- ⚠️ **Funciona pero con observaciones / riesgos**
- ❌ **No funciona o presenta un fallo crítico**

---

## 1. Gestión de Empresas (Tenants)

### 1.1 Creación de Empresas (`POST /dev/tenants`) — ✅
- **Comportamiento en Backend:**
  - Recibe `TenantCreate (nombre, plan_id, max_users, allowed_modules)`.
  - Genera automáticamente un slug único (`slug = f"{slug}-{uuid.uuid4().hex[:6]}"`).
  - Serializa `config` como JSONB con `max_users` y `allowed_modules`.
  - Inserta en `organizations (name, slug, config, plan_id) RETURNING id`.
  - Registra evento de auditoría en `security_events` (`evento="tenant_created"`).
- **Frontend:** Envía la carga correctamente distinguiendo si se seleccionó un plan predefinido (`plan_id`) o modo `'custom'` (`max_users`, `allowed_modules`).

### 1.2 Edición de Empresa (`PUT /dev/tenants/{tenant_id}`) — ✅
- **Comportamiento en Backend:**
  - Valida la existencia del tenant vía `SELECT id FROM organizations WHERE id = $1::uuid`.
  - Ejecuta `UPDATE organizations SET name = $1, config = $2::jsonb, plan_id = $3 WHERE id = $4::uuid`.
  - Registra evento `tenant_updated`.
- **Frontend:** El formulario de edición modal permite cambiar nombre, plan asociado y configuración de módulos. Al recargar la página, `getTenants()` (`GET /dev/tenants`) hace JOIN con `subscription_plans` y recupera los datos persistidos en PostgreSQL.

### 1.3 Eliminación de Empresa (`DELETE /dev/tenants/{tenant_id}`) — ⚠️
- **Comportamiento en Backend (`developer_router.py` L893-L935):**
  - Ejecuta una transacción atómica `async with conn.transaction():` que borra en orden estricto:
    ```sql
    DELETE FROM security_events WHERE tenant_id = $1::uuid;
    DELETE FROM tickets WHERE tenant_id = $1::uuid;
    DELETE FROM documentos WHERE tenant_id = $1::uuid;
    DELETE FROM user_organizations WHERE organization_id = $1::uuid;
    DELETE FROM app_users WHERE organization_id = $1::uuid;
    DELETE FROM profiles WHERE tenant_id = $1::uuid;
    DELETE FROM gerencias WHERE tenant_id = $1::uuid;
    DELETE FROM organizations WHERE id = $1::uuid;
    ```
  - La eliminación en el sistema institucional es **real, física y atómica**.

### 1.4 Caso Crítico: Huérfanos en el ERP (`koda-frontend/backend`) — ❌
- **Diagnóstico:**
  La base de datos física es compartida entre `KODA_Remaster` (Sistema Corporativo) y `koda-frontend` (ERP Administrativo/Contable). La tabla `organizations` pertenece a `KODA_Remaster`. En los modelos del ERP (`koda-frontend/backend/models/`), las tablas definen `tenant_id = Column(UUID(as_uuid=True))` **sin una llave foránea (`ForeignKey`) hacia `organizations(id)`**, justamente porque nacieron como microservicios separados.
- **Impacto:**
  Al invocar `DELETE /dev/tenants/{tenant_id}`, PostgreSQL no arroja error de FK ni borra en cascada las tablas del ERP. Como resultado, **quedan exactamente 77 tablas con registros huérfanos**.
- **Tablas afectadas detectadas en los modelos ERP:**
  1. **Ventas y Facturación:** `ventas`, `venta_detalles`, `pagos_venta`, `cotizaciones`, `ordenes_venta`, `notas_entrega`, `notas_credito`.
  2. **Inventario y Productos:** `productos`, `lotes_producto`, `almacenes`, `stock_por_almacen`, `ajustes_inventario`, `kardex_movimientos`, `transferencias_inventario`, `conteos_fisicos`, `garantias`.
  3. **Clientes y Proveedores:** `clientes`, `anticipos_cliente`, `proveedores`, `evaluaciones_proveedor`, `devoluciones_proveedor`.
  4. **Tesorería y Finanzas:** `cuentas_bancarias`, `movimientos_bancarios`, `cheques`, `cuentas_por_cobrar`, `cuentas_por_pagar`, `fondos_caja_chica`, `gastos_caja_chica`, `transferencias_tesoreria`, `colocaciones_inversiones`, `prestamos_uvc`.
  5. **Contabilidad:** `cuentas_contables`, `asientos_contables`, `asiento_detalles`, `cierres_periodos`, `matriz_integracion`, `presupuesto_partidas`.
  6. **Fiscal / Seniat:** `correlativos_fiscales`, `reglas_fiscales`, `retenciones_iva`, `retenciones_islr`, `declaraciones_iva`, `declaracion_islr`, `inpc_indices`.
  7. **Nómina y RRHH:** `empleados`, `nominas`, `rh_employees`, `rh_concepts`, `rh_payroll_periods`, `rh_payroll_details`.
  8. **Logística:** `crews`, `crew_members`, `vehiculos`, `choferes`, `turnos_despacho`, `dispatch_records`, `logistics_plans`, `notification_jobs`.
  9. **Configuración y Auditoría ERP:** `empresa`, `sucursales`, `vendedores`, `numeracion_series`, `plantillas_documento`, `tasas_cambio`, `tenant_integration_settings`, `audit_logs`, `auditoria_logs`, `auditor_sessions`, `importacion_jobs`, `notificaciones_reglas`, `telegram_commands`.

- **Opciones de Solución para Decisión con Henry:**
  - **Opción (a) [Recomendada a corto plazo]: Bloqueo preventivo.** En `DELETE /dev/tenants/{tenant_id}`, realizar un `SELECT COUNT(*) FROM ventas WHERE tenant_id = $1` (o en `empresa`, `productos`). Si count > 0, rechazar con HTTP 409 Conflict: *"No se puede eliminar la empresa porque contiene operaciones comerciales y contables en el ERP. Debe ser archivada."*
  - **Opción (b): Soft Delete (`is_active = FALSE` / `archived_at`).** No borrar físicamente de `organizations`, sino marcar el tenant como inactivo/suspendido, impidiendo el inicio de sesión pero preservando la integridad tributaria e histórica exigida por ley.
  - **Opción (c): Purga completa en cascada inter-servicio.** Si realmente se desea borrar todo (por ejemplo, para tenants de prueba), extender la transacción para incluir `DELETE FROM ventas WHERE tenant_id = ...` en las 77 tablas o invocar un endpoint interno de purga en el ERP.

---

## 2. Gestión de Planes

### 2.1 Creación de Plan (`POST /dev/plans`) — ✅
- **Comportamiento en Backend:**
  - Recibe `name`, `max_users`, `allowed_modules` (array de strings), `price`, `features`, `sort_order`.
  - Serializa `allowed_modules` y `features` como JSONB (`$3::jsonb`, `$5::jsonb`).
  - Guarda en `subscription_plans` con `is_active = TRUE`.
  - Permite subconjuntos específicos de módulos (ej. `["crm", "inventario"]`).
- **Persistencia comprobada:** La columna en base de datos es de tipo `JSONB`, almacenando correctamente los arrays.

### 2.2 Edición de Plan (`PUT /dev/plans/{plan_id}`) — ✅
- **Comportamiento en Backend:**
  - Genera una query dinámica de actualización según los campos recibidos en `PlanUpdate`.
  - Si se envían `max_users` o `allowed_modules`, los actualiza adecuadamente.
  - Al recargar la lista en la UI, los valores se leen mediante `GET /dev/plans`.

### 2.3 Eliminación vs Desactivación de Plan (`DELETE /dev/plans/{plan_id}`) — ⚠️
- **Inconsistencia Identificada entre Backend y UI:**
  - **Backend (`developer_router.py` L701):**
    ```python
    # Soft delete by marking inactive, as plans might be linked to existing tenants
    await conn.execute("UPDATE subscription_plans SET is_active = FALSE WHERE id = $1", plan_id)
    ```
    El backend hace un **soft-delete** (`is_active = FALSE`) para proteger la integridad referencial de los tenants que tengan ese `plan_id`.
  - **Frontend (`page.tsx` L585 y L1250):**
    - El diálogo de confirmación dice: `¿Seguro que deseas desactivar el plan "${name}"?`.
    - Pero el botón en la tabla tiene ícono de papelera (`Trash2`) y el tooltip/código se titula `deletePlan`.
    - Además, en `GET /dev/plans`, la lista devuelve **todos** los planes (activos e inactivos). Al marcarse `is_active = false`, el plan sigue apareciendo en la tabla del panel de desarrollador con un badge "Inactivo", pero en `/public/plans` (L774) sí se filtra con `WHERE is_active = TRUE`.
  - **Veredicto:** Funciona de forma segura (no rompe tenants asociados), pero la UI debería rotular el botón explícitamente como "Desactivar" y ofrecer la opción de reactivarlo (`PUT is_active = true`), ya que una vez desactivado no hay botón en la interfaz para volver a activarlo.

### 2.4 Carga de Imagen de Plan (`POST /dev/plans/{plan_id}/image`) — ✅
- **Comportamiento en Backend:**
  - Guarda el archivo en `./uploads/plan_{plan_id}_{uuid}.{ext}`.
  - Actualiza la columna `image_url = '/uploads/...'` en `subscription_plans`.
- **Servicio del archivo en Backend (`main.py` L402):**
  - Está montado: `app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")`.
  - La URL devuelta es navegable y servida correctamente por FastAPI.

---

## 3. Gestión de Usuarios

### 3.1 Creación de Usuario (`POST /dev/users`) — ✅
- **Comportamiento en Backend:**
  - Hashea la contraseña con `auth.security.get_password_hash` (bcrypt).
  - Valida duplicidad en `username` o `email`.
  - Resuelve o crea dinámicamente la gerencia (por defecto "Tecnología") para el `tenant_id`.
  - Inserta en `profiles` con `estado = TRUE`.
  - Si se asignó un `tenant_id`, inserta la membresía en `user_organizations` (`owner` para rol CEO, `admin` para roles 2/5, `member` para rol 3).
- **Capacidad de Login:** Dado que la contraseña se hashea con el mismo algoritmo y el perfil se inserta en `profiles` con su respectiva gerencia y estado activo, el usuario puede iniciar sesión directamente en `/auth/login`.

### 3.2 Eliminación de Usuario (`DELETE /dev/users/{user_id}`) — ⚠️
- **Comportamiento en Backend (`developer_router.py` L1289-L1310):**
  - Valida que el desarrollador autenticado no se borre a sí mismo:
    ```python
    if str(current_user.get("sub")) == user_id:
        raise HTTPException(status_code=400, detail="No puede eliminarse a sí mismo.")
    ```
  - Elimina el registro físico de `profiles`:
    ```sql
    DELETE FROM profiles WHERE id = $1::uuid;
    ```
- **Problema de Huérfanos en `user_organizations`:**
  - La tabla `user_organizations` no está vinculada por `ON DELETE CASCADE` a `profiles` en todos los esquemas (`user_organizations` usa `user_id UUID`). El endpoint no ejecuta `DELETE FROM user_organizations WHERE user_id = $1::uuid`.

### 3.3 Protección del Último Desarrollador — ❌
- **Vulnerabilidad Crítica:**
  - Si existen dos desarrolladores (ejemplo: `dev_henry` y `dev_drodriguez`):
    - `dev_henry` puede eliminar a `dev_drodriguez`.
    - Ahora solo queda `dev_henry`.
    - Si se crea un tercer usuario temporal o si se envía una petición con un token de desarrollador a eliminar al penúltimo, **el backend NO valida cuántos usuarios con rol Desarrollador (`rol_id = 4`) quedan en el sistema**.
  - Si un desarrollador elimina al otro y luego su cuenta sufre un bloqueo o error de credenciales, la plataforma queda **completamente desprovista de acceso al Developer Console**.
  - **Recomendación:** Agregar en `DELETE /dev/users/{user_id}`:
    ```python
    target_role = await conn.fetchval("SELECT rol_id FROM profiles WHERE id = $1::uuid", user_id)
    if target_role == 4:
        dev_count = await conn.fetchval("SELECT COUNT(*) FROM profiles WHERE rol_id = 4")
        if dev_count <= 1:
            raise HTTPException(status_code=400, detail="Operación bloqueada: no se puede eliminar el único Desarrollador activo del sistema.")
    ```

---

## 4. Sesiones Activas y Kill Switch

### 4.1 Monitoreo en Tiempo Real vía WebSocket (`/dev/ws` y `/session/connect`) — ✅
- **Comportamiento en Backend:**
  - `ConnectionManager` gestiona en memoria `active_sessions: Dict[str, ActiveSession]` y `developer_connections: Set[WebSocket]`.
  - Cuando cualquier usuario abre una pestaña en el sistema institucional, el cliente se conecta a `/session/connect?modulo=...&device=...` y envía su token JWT en el primer frame.
  - Al autenticarse, `manager.register_session()` envía inmediatamente a todos los desarrolladores conectados en `/dev/ws` un mensaje con el listado actualizado de sesiones:
    ```json
    { "type": "active_sessions", "data": [ ... ] }
    ```
- **Frontend:** La tabla de "Sesiones Activas" se actualiza reactivamente en vivo.

### 4.2 Botón de "Desconectar Sesión" (`POST /dev/disconnect`) — ✅
- **Comportamiento en Backend (`developer_router.py` L939-L986):**
  - Localiza la sesión en memoria por `session_id`.
  - **Bloqueo preventivo de reconexión:** Ejecuta `manager.block_user(session.user_id, duration_seconds=120)` para evitar que bucles de reconexión del frontend restablezcan la sesión al instante.
  - **Terminación del WebSocket activo:** Envía al cliente un mensaje JSON antes del corte:
    ```json
    {
      "type": "force_close",
      "reason": "manual_disconnect",
      "message": "Su sesión ha sido terminada manualmente por un desarrollador."
    }
    ```
    Y cierra el socket con código de cierre `code=4003`.
  - Registra evento `cierre forzado manual` en `security_events`.
  - Emite broadcast de alerta de abuso y actualiza las sesiones activas a los demás desarrolladores.
- **Veredicto:** El corte de sesión es **real y forzado a nivel de socket**, no un mero cambio cosmético en la vista.

---

## 5. Provisioning (Token de Activación)

### 5.1 Generación de Token (`POST /dev/provision/token`) — ✅
- **Comportamiento en Backend:**
  - Genera 32 bytes criptográficos aleatorios: `secrets.token_urlsafe(32)`.
  - Calcula su hash SHA-256 (`token_hash`).
  - Almacena en la tabla `provisioning_tokens`:
    - `tenant_id`, `token_hash`, `max_users`, `expires_at`, `is_used = FALSE`.
  - Devuelve al panel de desarrollador el `token` plano, `expires_at` y `tenant_id`.

### 5.2 Consumo y Validación del Token — ✅
- **Investigación del flujo en el repositorio:**
  - Se confirmó que el flujo **SÍ está implementado y conectado**:
    1. **Endpoint de consumo:** `POST /claim-account` en `auth_router.py` (L354-L485).
    2. **Componente de UI:** `AccountClaimForm.tsx` (`frontend-enterprise/src/components/AccountClaimForm.tsx` L51).
    3. **Ruta:** Accesible para nuevos clientes que reciben el token de aprovisionamiento.
  - **Lógica de `/claim-account`:**
    - Recibe el token plano, calcula su SHA-256 y verifica que exista en `provisioning_tokens`, que `is_used = FALSE` y que no haya expirado (`expires_at > NOW()`).
    - Crea el perfil del usuario administrador/CEO inicial para esa empresa.
    - Asocia al usuario en `user_organizations` con rol `owner`.
    - Actualiza el límite de usuarios (`max_users`) en `organizations.config`.
    - Marca el token como consumido (`UPDATE provisioning_tokens SET is_used = TRUE`).
    - Registra el evento de seguridad `ACCOUNT_CLAIMED`.
- **Veredicto:** El módulo de aprovisionamiento está **completo y funcional**.

---

## 6. Métricas y Eventos de Seguridad

### 6.1 Métricas del Sistema (`GET /dev/system-metrics`) — ⚠️
- **Comportamiento en Backend (`developer_router.py` L1164-L1237):**
  - **CPU y Memoria:** Utiliza la librería de sistema operativo `psutil`:
    - `psutil.cpu_percent(interval=0.1)`: Lectura real de consumo del CPU del host.
    - `psutil.getloadavg()`: Carga promedio real a 1 minuto (en Linux/Render; en Windows devuelve 0.0 si no está soportado).
    - `psutil.virtual_memory()`: Memoria RAM total, usada y porcentaje real.
  - **Base de Datos:** Ejecuta un `SELECT 1` real en el pool de PostgreSQL. Si responde, `services.database = True`.
  - **Redis:** Ejecuta un ping real a `REDIS_URL`.
  - **Observación:**
    - Los servicios `loki` y `vector` están hardcodeados como `True` en el retorno JSON (`"loki": True, "vector": True`), y `ollama_ok` está en `False`.
    - En la pestaña "Recursos" del panel, el frontend lee periódicamente estas métricas cada 5 segundos mediante polling.
  - **Veredicto:** Las métricas de hardware (CPU, RAM) y conectividad a base de datos son **100% reales**, pero los indicadores de Loki y Vector son estáticos.

### 6.2 Eventos Críticos de Seguridad (`GET /dev/security-events/critical`) — ✅
- **Comportamiento en Backend (`developer_router.py` L987-L1025):**
  - Realiza una consulta SQL real sobre la tabla `security_events`:
    ```sql
    SELECT id, tenant_id, user_id, username, evento, detalles, estado, ip_origen as ip_address, created_at
    FROM security_events
    WHERE evento IN (
        'cierre forzado por duplicidad',
        'intento de conexión bloqueado por límite de licencia',
        'cierre forzado manual'
    )
    ORDER BY created_at DESC
    LIMIT 50;
    ```
  - La tabla refleja eventos generados por `manager.enforce_concurrency_limit` y `disconnect_session`.
- **Veredicto:** Son eventos **reales** registrados en base de datos.

---

## Matriz Resumen de la Auditoría

| Ítem | Funcionalidad | Estado | Causa / Diagnóstico |
| :--- | :--- | :---: | :--- |
| **1.1** | Crear Empresa (`POST /dev/tenants`) | ✅ | Crea registro real en `organizations` con slug y JSONB de configuración. |
| **1.2** | Editar Empresa (`PUT /dev/tenants/{id}`) | ✅ | Actualiza nombre, plan y módulos. Persiste tras recarga. |
| **1.3** | Eliminar Empresa (`DELETE /dev/tenants/{id}`) | ⚠️ | Borra en cascada tablas institucionales, pero no contempla el ERP. |
| **1.4** | Integridad ERP al borrar Tenant | ❌ | **77 tablas del ERP quedan huérfanas** con `tenant_id` colgante. |
| **2.1** | Crear Plan (`POST /dev/plans`) | ✅ | Guarda en `subscription_plans` con `allowed_modules` JSONB. |
| **2.2** | Editar Plan (`PUT /dev/plans/{id}`) | ✅ | Modifica `max_users`, módulos y precio correctamente. |
| **2.3** | Desactivar / Eliminar Plan | ⚠️ | Backend hace soft-delete (`is_active=false`), pero la UI muestra ícono de papelera y no hay botón para reactivar. |
| **2.4** | Imagen de Plan (`POST /dev/plans/{id}/image`) | ✅ | Guarda en `/uploads/` y FastAPI sirve el archivo estático. |
| **3.1** | Crear Usuario (`POST /dev/users`) | ✅ | Hashea contraseña con bcrypt, asocia gerencia y permite login real. |
| **3.2** | Eliminar Usuario (`DELETE /dev/users/{id}`) | ⚠️ | Borra en `profiles` pero no limpia en `user_organizations`. |
| **3.3** | Protección de Último Desarrollador | ❌ | **Sin validación**: permite eliminar a otros desarrolladores sin verificar si queda al menos uno activo. |
| **4.1** | Monitoreo en tiempo real WebSocket | ✅ | `ConnectionManager` transmite en vivo altas y bajas de sesión. |
| **4.2** | Botón Desconectar Sesión (Kill Switch) | ✅ | Corta el WebSocket con código 4003 y bloquea reconexión por 120s. |
| **5.1** | Generar Token de Aprovisionamiento | ✅ | Genera token criptográfico y guarda hash SHA-256 con expiración. |
| **5.2** | Consumo de Token de Aprovisionamiento | ✅ | Implementado y funcional en `/claim-account` (`AccountClaimForm.tsx`). |
| **6.1** | Métricas del Servidor (`/dev/system-metrics`) | ⚠️ | CPU, RAM y DB son reales (`psutil`, `SELECT 1`); Loki/Vector hardcodeados. |
| **6.2** | Eventos Críticos de Seguridad | ✅ | Consulta real sobre `security_events` con filtros de eventos de abuso. |

---

## Recomendaciones Prioritarias para Henry y el Equipo

1. **Bloqueo Inmediato de Borrado si hay Datos ERP:** Modificar `DELETE /dev/tenants/{tenant_id}` para verificar si existen ventas, productos o cuentas contables en el ERP antes de permitir la eliminación. Si existen datos, forzar el uso de archivo/suspensión.
2. **Protección Anti-Lockout en Usuarios Desarrollador:** Evitar que se pueda eliminar a un desarrollador si el conteo total de desarrolladores es $\le 1$.
3. **Aclaración UI en Planes:** Cambiar la etiqueta de "Eliminar Plan" a "Desactivar Plan", y añadir un interruptor o botón para "Reactivar Plan" (`is_active = true`).
4. **Limpieza en Cascada de Membresías de Usuario:** Asegurar que al eliminar un usuario de `profiles`, se limpie también la fila en `user_organizations`.
