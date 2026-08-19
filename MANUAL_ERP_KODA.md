# 📖 Manual Operativo Paso a Paso — Módulo ERP KODA

Esta guía práctica te explica con exactitud **qué botones pulsar, qué campos llenar y cómo ejecutar cada acción** dentro del Módulo de Facturación y ERP de KODA.

---

## 📑 Índice de Operaciones
1. [Cómo Acceder al ERP](#1-cómo-acceder-al-erp)
2. [Ventas y Facturación Fiscal](#2-ventas-y-facturación-fiscal)
   - [2.1. Emitir una Factura de Venta](#21-emitir-una-factura-de-venta-paso-a-paso)
   - [2.2. Usar el Punto de Venta Rápido (POS)](#22-usar-el-punto-de-venta-rápido-pos)
   - [2.3. Crear una Cotización / Presupuesto](#23-crear-una-cotización--presupuesto)
3. [Inventario y Almacenes](#3-inventario-y-almacenes)
   - [3.1. Crear un Nuevo Producto](#31-crear-un-nuevo-producto)
   - [3.2. Realizar una Transferencia entre Almacenes](#32-realizar-una-transferencia-entre-almacenes)
   - [3.3. Ajuste de Inventario (Entrada / Salida / Mermas)](#33-ajuste-de-inventario-entrada--salida--mermas)
4. [Compras y Proveedores](#4-compras-y-proveedores)
   - [4.1. Registrar un Proveedor](#41-registrar-un-proveedor)
   - [4.2. Cargar una Factura de Compra](#42-cargar-una-factura-de-compra)
5. [Tesorería, Cobranzas y Pagos](#5-tesorería-cobranzas-y-pagos)
   - [5.1. Registrar Cobro de Factura a Crédito (CxC)](#51-registrar-cobro-de-factura-a-crédito-cxc)
   - [5.2. Registrar Pago a Proveedor (CxP)](#52-registrar-pago-a-proveedor-cxp)
6. [Módulo Fiscal (SENIAT / Retenciones)](#6-módulo-fiscal-seniat--retenciones)
   - [6.1. Generar Comprobante de Retención de IVA / ISLR](#61-generar-comprobante-de-retención-de-iva--islr)
   - [6.2. Exportar Libros de Ventas y Compras](#62-exportar-libros-de-ventas-y-compras)
7. [Nómina y Recursos Humanos](#7-nómina-y-recursos-humanos)
   - [7.1. Registrar un Empleado](#71-registrar-un-empleado)
   - [7.2. Procesar Nómina y Recibos](#72-procesar-nómina-y-recibos)

---

## 1. Cómo Acceder al ERP

1. En el menú lateral izquierdo de KODA, haz clic en **`MI NEGOCIO`**.
2. Selecciona **`Módulo de Facturación`**.
3. *Opcional:* Si deseas trabajar a pantalla completa, haz clic en el botón **`Abrir en ventana completa`** ubicado en la esquina superior derecha del banner.

---

## 2. Ventas y Facturación Fiscal

### 2.1. Emitir una Factura de Venta (Paso a Paso)
**Ruta:** Menú lateral del ERP ➔ `Facturación` ➔ `Nueva Factura`

1. **Datos del Cliente:**
   - En el buscador **"Buscar Cliente"**, escribe el RIF, Cédula o Razón Social.
   - Si no existe, haz clic en el botón **`+ Nuevo Cliente`**, llena los campos obligatorios (*Nombre, Cédula/RIF, Teléfono, Dirección Fiscal*) y presiona **`Guardar`**.
2. **Seleccionar Tarifa de Precios:**
   - En el selector de tarifa, elige entre: **Detal**, **Mayor** o **Gran Mayor**. Los precios de los productos se actualizarán automáticamente.
3. **Agregar Productos:**
   - En el campo **"Buscar producto por SKU o Nombre"**, escribe el nombre del ítem o usa un lector de código de barras.
   - Modifica la **Cantidad**.
   - Haz clic en el botón **`+ Agregar`**.
4. **Condiciones y Forma de Pago:**
   - Elige **Contado** o **Crédito** (si es crédito, define los días de plazo).
   - En **Método de Pago**, selecciona:
     - **Divisa / USD Efectivo:** El sistema calculará el **3% de IGTF** automáticamente.
     - **Bolívares (Pago Móvil / Transferencia / Punto):** El total se calculará según la **Tasa Oficial BCV** del día.
5. **Emitir Factura:**
   - Revisa el resumen (Subtotal, IVA 16%, IGTF 3%, Total $ / Total Bs).
   - Haz clic en el botón verde **`Emitir Factura`**.
   - Aparecerá la ventana de confirmación para **`Imprimir Ticket / Factura PDF`**.

---

### 2.2. Usar el Punto de Venta Rápido (POS)
**Ruta:** Menú lateral del ERP ➔ `Ventas` ➔ `Punto de Venta`

1. Haz clic en las tarjetas de productos o escanea el código de barras.
2. Cada clic suma una unidad en el panel derecho.
3. Haz clic en el botón azul **`Cobrar [Monto $]`**.
4. En la ventana modal, ingresa con qué monto paga el cliente (en $ o en Bs). El sistema te indicará el **Vuelto exacto**.
5. Presiona **`Confirmar Pago e Imprimir`**.

---

### 2.3. Crear una Cotización / Presupuesto
**Ruta:** Menú lateral del ERP ➔ `Ventas` ➔ `Cotizaciones` ➔ `+ Nueva Cotización`

1. Selecciona el cliente y la validez en días (ej. 7 días).
2. Agrega los productos solicitados.
3. Haz clic en **`Guardar Cotización`**.
4. **Para facturarla luego:** Cuando el cliente apruebe, ve a la lista de Cotizaciones, busca la cotización y haz clic en el botón **`Convertir a Factura`**.

---

## 3. Inventario y Almacenes

### 3.1. Crear un Nuevo Producto
**Ruta:** Menú lateral del ERP ➔ `Inventario` ➔ `Productos`

1. Haz clic en el botón **`+ Nuevo Producto`** (arriba a la derecha).
2. Llena la ficha:
   - **SKU / Código:** (Ej. `PROD-001`).
   - **Nombre:** Descripción completa del producto.
   - **Costo USD ($):** Costo de adquisición.
   - **Precio Detal ($), Mayor ($), Gran Mayor ($):** Precios de venta al público.
   - **Stock Inicial y Stock Mínimo:** Alerta cuando quede poca mercancía.
   - **¿Exento de IVA?:** Marca la casilla si es un producto sin impuesto (0% IVA).
3. Haz clic en **`Guardar Producto`**.

---

### 3.2. Realizar una Transferencia entre Almacenes
**Ruta:** Menú lateral del ERP ➔ `Inventario` ➔ `Transferencias`

1. Haz clic en **`+ Nueva Transferencia`**.
2. Selecciona el **Almacén Origen** y el **Almacén Destino**.
3. Selecciona el producto y la cantidad a mover.
4. Escribe una nota u observación (ej. "Reposición sucursal centro").
5. Haz clic en **`Procesar Transferencia`**. Ambos inventarios se actualizarán inmediatamente.

---

### 3.3. Ajuste de Inventario (Entrada / Salida / Mermas)
**Ruta:** Menú lateral del ERP ➔ `Inventario` ➔ `Ajustes`

1. Haz clic en **`+ Nuevo Ajuste`**.
2. Selecciona el Tipo:
   - **Entrada:** Para agregar stock no proveniente de compras estándar.
   - **Salida / Merma:** Para dar de baja productos vencidos o dañados.
3. Selecciona el producto, indica la cantidad y el motivo.
4. Haz clic en **`Aplicar Ajuste`**.

---

## 4. Compras y Proveedores

### 4.1. Registrar un Proveedor
**Ruta:** Menú lateral del ERP ➔ `Compras` ➔ `Proveedores` ➔ `+ Nuevo Proveedor`

1. Ingresa el **RIF** (ej. `J-12345678-9`) y la **Razón Social**.
2. Configura si es **Contribuyente Especial** y el porcentaje de retención habitual (ej. 75% o 100%).
3. Haz clic en **`Guardar`**.

---

### 4.2. Cargar una Factura de Compra
**Ruta:** Menú lateral del ERP ➔ `Compras` ➔ `Nueva Compra`

1. Selecciona el **Proveedor**.
2. Escribe el **Número de Factura del Proveedor** y el **Número de Control**.
3. Agrega los productos comprados con su costo unitario y cantidad recibida.
4. Haz clic en **`Registrar Compra`**.
   - *El stock se sumará al inventario y se generará la Cuenta por Pagar (CxP).*

---

## 5. Tesorería, Cobranzas y Pagos

### 5.1. Registrar Cobro de Factura a Crédito (CxC)
**Ruta:** Menú lateral del ERP ➔ `Cobranzas` ➔ `Cuentas por Cobrar`

1. Ubica la factura pendiente en la lista.
2. Haz clic en el botón verde **`Registrar Pago`** al final de la fila.
3. Ingresa el monto abonado (puede ser pago total o abono parcial).
4. Selecciona la cuenta bancaria donde entró el dinero y la referencia bancaria.
5. Haz clic en **`Confirmar Cobro`**.

---

### 5.2. Registrar Pago a Proveedor (CxP)
**Ruta:** Menú lateral del ERP ➔ `Pagos` ➔ `Cuentas por Pagar`

1. Ubica la factura del proveedor por pagar.
2. Haz clic en **`Pagar`**.
3. Selecciona la cuenta bancaria de salida y el comprobante de transferencia.
4. Haz clic en **`Guardar Pago`**.

---

## 6. Módulo Fiscal (SENIAT / Retenciones)

### 6.1. Generar Comprobante de Retención de IVA / ISLR
**Ruta:** Menú lateral del ERP ➔ `Fiscal` ➔ `Retenciones IVA` / `Retenciones ISLR`

1. Haz clic en **`+ Generar Comprobante`**.
2. Selecciona la factura de compra correspondiente.
3. El sistema calculará el 75% o 100% del IVA según el proveedor.
4. Haz clic en **`Emitir y Descargar Comprobante`** para imprimir el formato oficial con número de comprobante.

---

### 6.2. Exportar Libros de Ventas y Compras
**Ruta:** Menú lateral del ERP ➔ `Fiscal` ➔ `Libro de Ventas` o `Libro de Compras`

1. Selecciona el **Mes y Año** a declarar.
2. Haz clic en el botón **`Generar Libro`**.
3. Haz clic en **`Exportar Excel`** o **`Exportar PDF`** para la declaración tributaria.

---

## 7. Nómina y Recursos Humanos

### 7.1. Registrar un Empleado
**Ruta:** Menú lateral del ERP ➔ `RRHH` ➔ `Empleados` ➔ `+ Nuevo Empleado`

1. Completa los datos personales: Cédula, Nombres, Cargo, Departamento y Fecha de Ingreso.
2. En la pestaña **Salario**, define el sueldo base mensual (en USD o Bs).
3. Haz clic en **`Guardar Empleado`**.

---

### 7.2. Procesar Nómina y Recibos
**Ruta:** Menú lateral del ERP ➔ `Nómina` ➔ `Procesar Nómina`

1. Selecciona el período (ej. `1ra Quincena Mayo 2026`).
2. Haz clic en **`Calcular Nómina`** (el sistema aplicará deducciones de IVSS, FAOV y asignaciones).
3. Haz clic en **`Aprobar y Cerrar Nómina`**.
4. Haz clic en **`Descargar Todos los Recibos de Pago (PDF)`**.
