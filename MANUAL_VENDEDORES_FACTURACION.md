# 📖 Guía Operativa y Técnica: Gestión de Equipo Comercial, Facturación y Comisiones en KODA

Esta guía detalla de manera integral el funcionamiento, la arquitectura y los procesos operativos del **Módulo de Equipo Comercial (Asesores y Vendedores)**, la **Facturación Fiscal/Comercial Multimoneda** y el **Cálculo de Comisiones** en el ecosistema **KODA ERP** y **KODA Remaster**.

---

## 1. Gestión del Equipo Comercial (Asesores y Vendedores)

### 💡 Arquitectura y Tipos de Entidad:
1. **Asesor / Vendedor Comercial (`vendedores`):**
   * Es la entidad de fuerza comercial asociada al catálogo.
   * Contiene nombre, código (`VND-001`), `% de comisión base`, meta mensual en USD, teléfono y correo.
   * **No requiere obligatoriamente una cuenta de acceso al sistema.**
   * Puede operar como un vendedor externo o un código asignable en facturas y notas de entrega.

2. **Vinculación Opcional con Usuario Corporativo (`vendedores.user_id ➔ profiles.id`):**
   * Si el vendedor además tiene acceso al portal institucional/ERP, se vincula su perfil mediante `user_id`.
   * Esto habilita la vista de autoservicio del vendedor (`GET /vendedores/me`), donde puede consultar sus ventas acumuladas y comisiones generadas en tiempo real sin ver las ventas de otros compañeros.

---

### 📍 Acceso y Ubicación en la Plataforma:
* **En KODA ERP (Panel Administrativo):** Menú Lateral ➔ `Configuración` ➔ `Usuarios y Roles` (`/admin/usuarios`).
* **En KODA ERP (Reporte Comercial):** Menú Lateral ➔ `Reportes` ➔ `Gestión Vendedores` (`/reportes/vendedores`).
* **En KODA Remaster (Dashboard Corporativo):** Menú Lateral ➔ `Mi Negocio` / `Equipo` ➔ `Equipo Comercial`.
* **Búsqueda Rápida (`Ctrl + K`):** Escribe `Vendedores` o `Comisiones`.

---

### 📋 Paso a Paso para la Gestión del Equipo Comercial:

#### A. Crear un nuevo Vendedor
1. Ingresa a **Gestión de Vendedores** (`/reportes/vendedores`).
2. Haz clic en el botón superior **`+ Nuevo Vendedor`**.
3. Completa los campos:
   * **Nombre Completo:** (ej. `Carlos Pérez`).
   * **Código de Vendedor:** (ej. `VND-001` — si se deja vacío, el sistema genera automáticamente un correlativo secuencial `VND-XXX`).
   * **Porcentaje de Comisión Base (%):** (ej. `5.00%`).
   * **Meta Mensual de Ventas (USD):** (ej. `$2,500.00`).
   * **Email y Teléfono de Contacto:** Datos para envío de reportes y notificaciones.
   * **Vincular a Usuario del Sistema (Opcional):** Selecciona el usuario si el vendedor tiene login propio.
4. Haz clic en **"Guardar Vendedor"**.

#### B. Modificación y Ajuste de Comisiones
1. En la lista o tabla de vendedores, pulsa sobre el botón **"Editar"** o **"Configurar Comisión"**.
2. Modifica el porcentaje aplicable (ej. ajustar de `5%` a `7.5%`).
3. Guarda los cambios. *(Las facturas emitidas previamente mantendrán la comisión histórica congelada en su registro contable)*.

#### C. Activar / Desactivar Vendedores
* Puedes alternar el switch **Activo/Inactivo**. Un vendedor inactivo no aparecerá en el menú desplegable al momento de emitir nuevas facturas, pero conservará su historial y reportes intactos.

---

## 2. Facturación Fiscal y Asignación de Vendedores

### 📍 Ubicación:
* **Menú Lateral:** `Facturación` ➔ `Nueva Factura` (`/nueva-fiscal` o `/nueva`).
* **Punto de Venta (POS Rápido):** `/pos`.

---

### 📋 Flujo de Emisión:

#### Paso 1: Configurar Cliente y Moneda
1. **Cliente / RIF:** Selecciona el cliente registrado o ingresa un nuevo contribuyente.
2. **Moneda Base:**
   * **USD ($):** Cálculo en dólares con equivalencia a Bolívares según tasa oficial BCV del día.
   * **VED (Bs.):** Facturación en moneda nacional.
3. **Método de Pago:** Si se elige pago en divisas (efectivo/transferencia internacional), se activa automáticamente el cálculo de **IGTF (3%)**.

#### Paso 2: Asignación del Vendedor
* En el selector desplegable **"Vendedor Asignado"**, selecciona el asesor correspondiente (ej. `Carlos Pérez - VND-001`).
* Si la factura es generada directamente por un vendedor logueado, su código vendrá preseleccionado por defecto.

#### Paso 3: Carga de Ítems y Tarifas
* Agrega los productos desde el inventario.
* Selecciona la escala de precios correspondiente (**Detal**, **Mayor**, **Distribuidor**).
* El sistema calcula subtotales, IVA (16%), Exentos e IGTF en tiempo real.

#### Paso 4: Emisión Atómica y Registro
Al hacer clic en **"Emitir Factura Fiscal"**, el motor ejecuta:
1. Asignación del número correlativo fiscal consecutivo y Número de Control SENIAT.
2. Generación del hash criptográfico **SHA-256** para auditoría fiscal.
3. Descuento automático de stock en Kardex.
4. Registro de la Cuenta por Cobrar (CxC).
5. Asiento contable de partida doble en el Libro Diario.
6. Registro de la comisión a favor del vendedor asignado.

---

## 3. Consulta de Comisiones y Liquidación

### 📊 Reporte de Rendimiento:
* **Desde el Panel de Administración:**
  * Ve a `/reportes/vendedores`.
  * Visualiza: **Ventas Totales ($)**, **Meta Alcanzada (%)**, **Comisión Acumulada ($)** y **Facturas Emitidas**.
* **Desde el Autoservicio del Vendedor (`/vendedores/me`):**
  * El vendedor con cuenta propia puede consultar su acumulado del mes, su porcentaje de avance de meta y el detalle de sus ventas aprobadas.

---

## 4. Referencia de API REST (Backend Corporativo)

Para integraciones y desarrollo técnico, los endpoints disponibles bajo el prefijo `/vendedores` son:

| Método | Endpoint | Permisos | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/vendedores/me` | Vendedor Autenticado | Obtiene estadísticas y comisiones del usuario actual. |
| `GET` | `/vendedores/` | Admin / CEO / Gerente | Lista todos los vendedores del tenant (soporta filtro `?activo=true/false`). |
| `GET` | `/vendedores/{id}` | Admin / CEO / Gerente | Obtiene detalle de un vendedor y sus últimas 20 facturas. |
| `POST` | `/vendedores/` | Admin / CEO | Crea un nuevo vendedor comercial en el catálogo. |
| `PUT` | `/vendedores/{id}` | Admin / CEO | Actualiza datos generales, meta o estado del vendedor. |
| `PATCH` | `/vendedores/{id}/comision` | Admin / CEO | Actualiza únicamente el porcentaje de comisión. |
| `DELETE` | `/vendedores/{id}` | Admin / CEO | Desactiva/elimina un vendedor (soft delete). |

---

## 5. Resumen de Rutas y Accesos Rápidos

| Módulo | Ruta URL | Función Principal |
| :--- | :--- | :--- |
| **Equipo Comercial (Vendedores)** | `/reportes/vendedores` y `/admin/usuarios` | Gestión de asesores, comisiones y metas comerciales. |
| **Emisión de Facturas** | `/nueva-fiscal` | Formulario de facturación fiscal con asignación de vendedor. |
| **Punto de Venta (POS)** | `/pos` | Venta directa de mostrador y emisión de tickets. |
| **Historial de Facturas** | `/historial` | Reimpresión, descarga de PDF y anulación de comprobantes. |
| **Directorio de Clientes** | `/clientes` | Gestión de RIF, direcciones y condiciones de pago. |
| **Catálogo de Productos** | `/inventario` | Control de stock, tiers de precios y SKU. |

