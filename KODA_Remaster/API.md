# API Documentation - Sistema Corporativo Enterprise

## Autenticación

Todas las rutas (excepto `/login` y `/register`) requieren una cabecera `Authorization: Bearer <JWT>`.

### JWT Claims Requeridos:

- `sub`: ID del usuario.
- `tenant_id`: ID de la organización activa.
- `role`: Rol del usuario en dicha organización.

## Endpoints Públicos

### POST `/login`

Autentica un usuario y devuelve el token inicial del tenant por defecto.

- **Request**: `OAuth2PasswordRequestForm`
- **Response**: JWT + User Data.

## Endpoints de Gestión

### POST `/api/auth/switch-organization`

Cambia el contexto de organización.

- **Body**: `{"organization_id": "UUID"}`
- **Response**: Nuevo JWT con el contexto actualizado.
- **Errores**: `403` si el usuario no pertenece a la organización solicitada.

## Endpoints de Negocio (Multi-Tenant)

### GET `/documentos`

Lista documentos de la organización actual (aislado por RLS).

- **Header**: `Authorization: Bearer <JWT>`
- **Response**: Array de documentos pertenecientes ÚNICAMENTE al `tenant_id` del token.

## Health Checks

### GET `/health/live`

Verifica que el proceso de la API está corriendo.

- **Success**: `200 OK`

### GET `/health/ready`

Verifica que las dependencias (DB/Pool) están operativas.

- **Success**: `200 OK`
- **Failure**: `503 Service Unavailable`

---

_Todos los logs de la API incluyen Tracy ID para debugging._
