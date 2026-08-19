# Enterprise Runbook - Sistema Corporativo

Guía operativa para la resolución de incidencias en entornos multi-tenant.

## 🚨 Escenarios de Emergencia

### 1. Sospecha de Fuga de Datos (Data Leak)

**Síntoma**: Un usuario reporta ver datos que no le pertenecen.
**Acción Inmediata**:

1. Verificar políticas RLS: `SELECT * FROM pg_policies;`
2. Revisar logs JSON filtrando por el `tenant_id` afectado.
3. Verificar que `async_db.py` esté realizando el `RESET app.current_tenant_id` correctamente.
4. Si persiste, suspender el servicio temporalmente y auditar el `ContextVar` en el middleware.

### 2. Saturación de Conexiones (DB Saturation)

**Síntoma**: Errores `500` o `Too many connections` en los logs.
**Acción**:

1. Revisar `pg_stat_activity` para ver conexiones colgadas.
2. Aumentar `max_size` en `init_db_pool()` si el hardware lo permite.
3. Verificar que los logs no muestren fugas de conexiones (conexiones que no se devuelven al pool).

### 3. Caída de Componentes (Redis/Cache)

**Síntoma**: Endpoint `/health/ready` retorna `503`.
**Acción**:

1. Reiniciar servicio de Redis.
2. El sistema caerá a "modo degradado" (queries directas a DB sin caché de membresía).
3. Monitorear latencia en la DB principal mientras se recupera el caché.

## 🛠️ Mantenimiento

- **Backup**: Realizar dumps periódicos. Para restaurar un solo tenant, usar `pg_dump --table=documentos --where="tenant_id='...' "`.
- **Rotación de Secretos**: Cambiar `JWT_SECRET` forzará el deslogueo de todos los usuarios de todos los tenants.

## 📞 Contactos de Emergencia

- **SRE Team**: @sre-support
- **DBA**: @db-admins
