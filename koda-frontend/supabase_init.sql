-- KODA ERP: Supabase Initial Schema

CREATE TABLE almacenes (
	id SERIAL NOT NULL, 
	codigo VARCHAR(20) NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	activo BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (codigo)
);

CREATE TABLE asientos_contables (
	id SERIAL NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	concepto VARCHAR(255) NOT NULL, 
	referencia VARCHAR(100) NOT NULL, 
	total_debe NUMERIC(14, 2) NOT NULL, 
	total_haber NUMERIC(14, 2) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE auditor_sessions (
	id SERIAL NOT NULL, 
	tenant_id VARCHAR(50) NOT NULL, 
	auditor_name VARCHAR(100) NOT NULL, 
	organization VARCHAR(100) NOT NULL, 
	scope VARCHAR(100) NOT NULL, 
	start_date TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	end_date TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	token_hash VARCHAR(255) NOT NULL, 
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE auditoria_logs (
	id SERIAL NOT NULL, 
	usuario VARCHAR(100) NOT NULL, 
	accion VARCHAR(100) NOT NULL, 
	modulo VARCHAR(50) NOT NULL, 
	detalle TEXT, 
	ip VARCHAR(45), 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE centros_costo (
	id SERIAL NOT NULL, 
	codigo VARCHAR(20) NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	activo BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (codigo)
);

CREATE TABLE clientes (
	id SERIAL NOT NULL, 
	rif VARCHAR(50) NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	telefono VARCHAR(50), 
	email VARCHAR(150), 
	direccion VARCHAR(255), 
	PRIMARY KEY (id)
);

CREATE TABLE cuentas_bancarias (
	id SERIAL NOT NULL, 
	banco VARCHAR(100) NOT NULL, 
	numero_cuenta VARCHAR(50) NOT NULL, 
	moneda VARCHAR(3) NOT NULL, 
	saldo_actual NUMERIC(15, 2) NOT NULL, 
	activa BOOLEAN, 
	PRIMARY KEY (id), 
	UNIQUE (numero_cuenta)
);

CREATE TABLE cuentas_contables (
	id SERIAL NOT NULL, 
	codigo VARCHAR(50) NOT NULL, 
	nombre VARCHAR(200) NOT NULL, 
	tipo VARCHAR(30) NOT NULL, 
	nivel INTEGER NOT NULL, 
	activa BOOLEAN NOT NULL, 
	padre_codigo VARCHAR(50), 
	PRIMARY KEY (id)
);

CREATE TABLE declaraciones_iva (
	id SERIAL NOT NULL, 
	periodo VARCHAR(7) NOT NULL, 
	debito_fiscal NUMERIC(15, 2), 
	credito_fiscal_mes NUMERIC(15, 2), 
	retenciones NUMERIC(15, 2), 
	estado VARCHAR(20) NOT NULL, 
	fecha_cierre TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE empleados (
	id SERIAL NOT NULL, 
	cedula VARCHAR(20) NOT NULL, 
	nombre_completo VARCHAR(150) NOT NULL, 
	cargo VARCHAR(100) NOT NULL, 
	salario_base_usd NUMERIC(10, 2) NOT NULL, 
	bono_alimentacion_usd NUMERIC(10, 2) NOT NULL, 
	activo INTEGER, 
	PRIMARY KEY (id)
);

CREATE TABLE empresa (
	id SERIAL NOT NULL, 
	rif VARCHAR(50) NOT NULL, 
	razon_social VARCHAR(200) NOT NULL, 
	nombre_comercial VARCHAR(200), 
	email VARCHAR(150), 
	telefono VARCHAR(50), 
	direccion VARCHAR(255), 
	tipo_contribuyente VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (rif)
);

CREATE TABLE importacion_jobs (
	id SERIAL NOT NULL, 
	tipo VARCHAR(50) NOT NULL, 
	archivo VARCHAR(255) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	registros_ok INTEGER NOT NULL, 
	registros_error INTEGER NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE nominas (
	id SERIAL NOT NULL, 
	periodo VARCHAR(100) NOT NULL, 
	fecha_emision TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	total_asignaciones_usd NUMERIC(14, 2) NOT NULL, 
	total_bonos_usd NUMERIC(14, 2) NOT NULL, 
	total_deducciones_usd NUMERIC(14, 2) NOT NULL, 
	total_neto_usd NUMERIC(14, 2) NOT NULL, 
	asiento_id INTEGER, 
	PRIMARY KEY (id)
);

CREATE TABLE notificaciones_reglas (
	id SERIAL NOT NULL, 
	nombre VARCHAR(100) NOT NULL, 
	canal VARCHAR(30) NOT NULL, 
	activa BOOLEAN NOT NULL, 
	plantilla TEXT, 
	PRIMARY KEY (id)
);

CREATE TABLE numeracion_series (
	id SERIAL NOT NULL, 
	modulo VARCHAR(50) NOT NULL, 
	prefijo VARCHAR(20) NOT NULL, 
	ultimo_numero INTEGER NOT NULL, 
	activo BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE prestamos_uvc (
	id SERIAL NOT NULL, 
	descripcion VARCHAR(255) NOT NULL, 
	monto_uvc NUMERIC(15, 4) NOT NULL, 
	tasa NUMERIC(8, 4) NOT NULL, 
	saldo NUMERIC(15, 4) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha_inicio TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE presupuesto_partidas (
	id SERIAL NOT NULL, 
	centro_costo VARCHAR(50) NOT NULL, 
	concepto VARCHAR(200) NOT NULL, 
	presupuestado NUMERIC(15, 2) NOT NULL, 
	ejecutado NUMERIC(15, 2) NOT NULL, 
	periodo VARCHAR(7) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE productos (
	id SERIAL NOT NULL, 
	sku VARCHAR(50) NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	precio_usd NUMERIC(10, 2) NOT NULL, 
	costo_usd NUMERIC(10, 2) NOT NULL, 
	stock INTEGER NOT NULL, 
	es_exento BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE proveedores (
	id SERIAL NOT NULL, 
	rif VARCHAR(50) NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	telefono VARCHAR(50), 
	email VARCHAR(150), 
	direccion VARCHAR(255), 
	PRIMARY KEY (id)
);

CREATE TABLE reglas_fiscales (
	id SERIAL NOT NULL, 
	nombre VARCHAR(50) NOT NULL, 
	tasa NUMERIC(5, 4) NOT NULL, 
	activa BOOLEAN, 
	fecha_vigencia TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE requisiciones_compra (
	id SERIAL NOT NULL, 
	numero VARCHAR(50) NOT NULL, 
	solicitante VARCHAR(100) NOT NULL, 
	monto_estimado NUMERIC(15, 2) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (numero)
);

CREATE TABLE retenciones_iva (
	id SERIAL NOT NULL, 
	proveedor_rif VARCHAR(50) NOT NULL, 
	proveedor_nombre VARCHAR(200) NOT NULL, 
	numero_factura VARCHAR(50) NOT NULL, 
	base NUMERIC(15, 2) NOT NULL, 
	alicuota NUMERIC(5, 4) NOT NULL, 
	monto NUMERIC(15, 2) NOT NULL, 
	periodo VARCHAR(7) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE sucursales (
	id SERIAL NOT NULL, 
	codigo VARCHAR(20) NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	ciudad VARCHAR(100), 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (codigo)
);

CREATE TABLE tasas_cambio (
	id SERIAL NOT NULL, 
	valor_ves FLOAT NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	fuente VARCHAR(100) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE users (
	id SERIAL NOT NULL, 
	nombre VARCHAR(100) NOT NULL, 
	email VARCHAR(150) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	rol VARCHAR(50) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE vendedores (
	id SERIAL NOT NULL, 
	nombre VARCHAR(150) NOT NULL, 
	codigo VARCHAR(20) NOT NULL, 
	activo BOOLEAN NOT NULL, 
	meta_mensual NUMERIC(15, 2) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (codigo)
);

CREATE TABLE ventas (
	id SERIAL NOT NULL, 
	numero_factura VARCHAR(50) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	subtotal NUMERIC(10, 2) NOT NULL, 
	iva NUMERIC(10, 2) NOT NULL, 
	igtf NUMERIC(10, 2) NOT NULL, 
	total NUMERIC(10, 2) NOT NULL, 
	metodo_pago VARCHAR(50) NOT NULL, 
	tasa_cambio_bs NUMERIC(10, 4) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE ajustes_inventario (
	id SERIAL NOT NULL, 
	producto_id INTEGER NOT NULL, 
	cantidad INTEGER NOT NULL, 
	motivo VARCHAR(255) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha_solicitud TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	fecha_aprobacion TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(producto_id) REFERENCES productos (id)
);

CREATE TABLE anticipos_cliente (
	id SERIAL NOT NULL, 
	cliente_id INTEGER NOT NULL, 
	monto NUMERIC(15, 2) NOT NULL, 
	moneda VARCHAR(3) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(cliente_id) REFERENCES clientes (id)
);

CREATE TABLE asiento_detalles (
	id SERIAL NOT NULL, 
	asiento_id INTEGER NOT NULL, 
	cuenta_codigo VARCHAR(50) NOT NULL, 
	cuenta_nombre VARCHAR(150) NOT NULL, 
	debe NUMERIC(14, 2) NOT NULL, 
	haber NUMERIC(14, 2) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(asiento_id) REFERENCES asientos_contables (id)
);

CREATE TABLE audit_logs (
	id SERIAL NOT NULL, 
	session_id INTEGER NOT NULL, 
	endpoint_accessed VARCHAR(255) NOT NULL, 
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	ip_address VARCHAR(50), 
	row_signature VARCHAR(64) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES auditor_sessions (id)
);

CREATE TABLE compras (
	id SERIAL NOT NULL, 
	proveedor_id INTEGER NOT NULL, 
	numero_factura VARCHAR(50) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	subtotal NUMERIC(10, 2) NOT NULL, 
	iva NUMERIC(10, 2) NOT NULL, 
	total NUMERIC(10, 2) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(proveedor_id) REFERENCES proveedores (id)
);

CREATE TABLE conteos_fisicos (
	id SERIAL NOT NULL, 
	almacen_id INTEGER NOT NULL, 
	producto_id INTEGER NOT NULL, 
	cantidad_sistema NUMERIC(12, 3) NOT NULL, 
	cantidad_fisica NUMERIC(12, 3) NOT NULL, 
	diferencia NUMERIC(12, 3) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(almacen_id) REFERENCES almacenes (id), 
	FOREIGN KEY(producto_id) REFERENCES productos (id)
);

CREATE TABLE cotizaciones (
	id SERIAL NOT NULL, 
	numero VARCHAR(50) NOT NULL, 
	cliente_id INTEGER, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	total NUMERIC(10, 2) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (numero), 
	FOREIGN KEY(cliente_id) REFERENCES clientes (id)
);

CREATE TABLE cuentas_por_cobrar (
	id SERIAL NOT NULL, 
	cliente_id INTEGER NOT NULL, 
	venta_id INTEGER, 
	numero_documento VARCHAR(50) NOT NULL, 
	monto_total NUMERIC(15, 2) NOT NULL, 
	monto_pagado NUMERIC(15, 2) NOT NULL, 
	fecha_emision TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	fecha_vencimiento TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(cliente_id) REFERENCES clientes (id), 
	FOREIGN KEY(venta_id) REFERENCES ventas (id)
);

CREATE TABLE kardex_movimientos (
	id SERIAL NOT NULL, 
	producto_id INTEGER NOT NULL, 
	tipo_movimiento VARCHAR(50) NOT NULL, 
	cantidad INTEGER NOT NULL, 
	documento_referencia VARCHAR(100) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(producto_id) REFERENCES productos (id)
);

CREATE TABLE lotes_producto (
	id SERIAL NOT NULL, 
	producto_id INTEGER NOT NULL, 
	lote VARCHAR(50) NOT NULL, 
	fecha_vencimiento TIMESTAMP WITHOUT TIME ZONE, 
	cantidad NUMERIC(12, 3) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(producto_id) REFERENCES productos (id)
);

CREATE TABLE movimientos_bancarios (
	id SERIAL NOT NULL, 
	cuenta_id INTEGER NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	concepto VARCHAR(255) NOT NULL, 
	monto NUMERIC(15, 2) NOT NULL, 
	tipo VARCHAR(20) NOT NULL, 
	referencia VARCHAR(100), 
	PRIMARY KEY (id), 
	FOREIGN KEY(cuenta_id) REFERENCES cuentas_bancarias (id)
);

CREATE TABLE notas_credito (
	id SERIAL NOT NULL, 
	numero VARCHAR(50) NOT NULL, 
	venta_id INTEGER, 
	cliente_id INTEGER NOT NULL, 
	monto NUMERIC(15, 2) NOT NULL, 
	motivo VARCHAR(255), 
	estado VARCHAR(20) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (numero), 
	FOREIGN KEY(venta_id) REFERENCES ventas (id), 
	FOREIGN KEY(cliente_id) REFERENCES clientes (id)
);

CREATE TABLE ordenes_venta (
	id SERIAL NOT NULL, 
	numero VARCHAR(50) NOT NULL, 
	cliente_id INTEGER, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	total NUMERIC(10, 2) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (numero), 
	FOREIGN KEY(cliente_id) REFERENCES clientes (id)
);

CREATE TABLE transferencias_inventario (
	id SERIAL NOT NULL, 
	origen_almacen_id INTEGER NOT NULL, 
	destino_almacen_id INTEGER NOT NULL, 
	producto_id INTEGER NOT NULL, 
	cantidad NUMERIC(12, 3) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(origen_almacen_id) REFERENCES almacenes (id), 
	FOREIGN KEY(destino_almacen_id) REFERENCES almacenes (id), 
	FOREIGN KEY(producto_id) REFERENCES productos (id)
);

CREATE TABLE transferencias_tesoreria (
	id SERIAL NOT NULL, 
	cuenta_origen_id INTEGER NOT NULL, 
	cuenta_destino_id INTEGER NOT NULL, 
	monto NUMERIC(15, 2) NOT NULL, 
	concepto VARCHAR(255) NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(cuenta_origen_id) REFERENCES cuentas_bancarias (id), 
	FOREIGN KEY(cuenta_destino_id) REFERENCES cuentas_bancarias (id)
);

CREATE TABLE venta_detalles (
	id SERIAL NOT NULL, 
	venta_id INTEGER NOT NULL, 
	producto_id INTEGER NOT NULL, 
	cantidad INTEGER NOT NULL, 
	precio_usd_capturado NUMERIC(10, 2) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(venta_id) REFERENCES ventas (id), 
	FOREIGN KEY(producto_id) REFERENCES productos (id)
);

CREATE TABLE cuentas_por_pagar (
	id SERIAL NOT NULL, 
	proveedor_id INTEGER NOT NULL, 
	compra_id INTEGER, 
	numero_documento VARCHAR(50) NOT NULL, 
	monto_total NUMERIC(15, 2) NOT NULL, 
	monto_pagado NUMERIC(15, 2) NOT NULL, 
	fecha_emision TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	fecha_vencimiento TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(proveedor_id) REFERENCES proveedores (id), 
	FOREIGN KEY(compra_id) REFERENCES compras (id)
);

