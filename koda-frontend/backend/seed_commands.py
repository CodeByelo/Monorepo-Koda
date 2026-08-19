import os
import sys
from decimal import Decimal

# Configurar path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.database import SessionLocal
from backend.models.erp_extended import TelegramCommand
from backend.models.core import Tenant

def seed_telegram_commands():
    db = SessionLocal()
    try:
        tenants = db.query(Tenant).all()
        if not tenants:
            print("No se encontraron tenants registrados.")
            return

        command_list = [
            {
                "trigger_command": "/ayuda",
                "response_text": (
                    "🤖 *ASISTENTE VIRTUAL KODA ERP - COMANDOS DISPONIBLES*\n\n"
                    "Puedes interactuar con los 15 módulos del sistema usando:\n\n"
                    "💵 `/bcv` - Tasas activas del BCV\n"
                    "🚨 `/alertas` - Centro de alertas operativas\n"
                    "🛍️ `/ventas` - Ventas y órdenes de hoy\n"
                    "🧾 `/facturas` - Resumen de facturación\n"
                    "🛒 `/compras` - Requisiciones y órdenes de compra\n"
                    "📦 `/inventario` - Stock crítico y almacenes\n"
                    "🚚 `/logistica` - Estado de despachos y flota\n"
                    "💰 `/cobranzas` - Cuentas por Cobrar (CxC)\n"
                    "💸 `/pagos` - Cuentas por Pagar (CxP)\n"
                    "🏛️ `/tesoreria` - Bancos, cajas y tesorería\n"
                    "📊 `/fiscal` - Resumen de IVA, IGTF e ISLR\n"
                    "📕 `/contabilidad` - Libro Diario y asientos\n"
                    "👥 `/nomina` - Costos de nómina y personal\n"
                    "📈 `/reportes` - Indicadores BI y EBITDA\n"
                    "🏢 `/sucursales` - Sucursales y sedes físicas\n"
                    "🛡️ `/auditoria` - Modo de auditoría y RLS\n\n"
                    "_Todos los comandos operan en tiempo real bajo aislamiento multi-tenant._"
                ),
                "internal_action": "help"
            },
            {
                "trigger_command": "/bcv",
                "response_text": (
                    "💵 *MONEDAS Y TASAS BCV - KODA ERP*\n\n"
                    "📊 *Tasa BCV del Día:* Bs. 721.3456\n"
                    "💵 *Moneda de Gestión:* USD (Dólares)\n"
                    "🇻🇪 *Moneda Legal:* VED (Bolívares)\n\n"
                    "_Valor consultado oficialmente desde el Banco Central de Venezuela._"
                ),
                "internal_action": "query_rates"
            },
            {
                "trigger_command": "/alertas",
                "response_text": (
                    "🚨 *CENTRO DE ALERTAS ACTIVAS - KODA ERP*\n\n"
                    "⚠️ *Alertas de Seguridad:* 0 incidentes reportados.\n"
                    "📦 *Alertas de Inventario:* 3 productos sin stock.\n"
                    "🚚 *Alertas de Logística:* 1 despacho retrasado en ruta.\n\n"
                    "📌 _Ingresa al panel del Centro de Alertas para gestionar incidencias._"
                ),
                "internal_action": "query_alerts"
            },
            {
                "trigger_command": "/ventas",
                "response_text": (
                    "🛍️ *ÓRDENES DE VENTA Y COTIZACIONES - KODA ERP*\n\n"
                    "📈 *Pedidos del Día:* 8 órdenes registradas.\n"
                    "💰 *Monto Cotizado Hoy:* $4,580.00 USD\n"
                    "🔄 *Cotizaciones Pendientes:* 3 en revisión comercial.\n\n"
                    "📌 _Para aprobar cotizaciones ingresa al módulo de Ventas._"
                ),
                "internal_action": "query_sales"
            },
            {
                "trigger_command": "/facturas",
                "response_text": (
                    "🧾 *RESUMEN DE FACTURACIÓN DIARIA - KODA ERP*\n\n"
                    "💰 *Facturación de Hoy:* $1,245.00 USD\n"
                    "🧾 *Facturas Activas:* 14 emitidas.\n"
                    "📉 *Facturas Anuladas:* 0 hoy.\n"
                    "📈 *Margen Promedio:* 32.5%\n\n"
                    "📌 _Las facturas registradas ya están sincronizadas con el Libro de Ventas._"
                ),
                "internal_action": "query_invoices"
            },
            {
                "trigger_command": "/compras",
                "response_text": (
                    "🛒 *COMPRAS Y REQUISICIONES - KODA ERP*\n\n"
                    "📦 *Requisiciones Pendientes:* 2 aprobadas por procesar.\n"
                    "🚚 *Órdenes de Compra en Tránsito:* 1 (Proveedor Distribuidor C.A.)\n"
                    "💰 *Compromisos de Compra:* $1,890.00 USD\n\n"
                    "_Gestiona el ingreso de almacén cuando llegue la mercancía._"
                ),
                "internal_action": "query_purchases"
            },
            {
                "trigger_command": "/inventario",
                "response_text": (
                    "📦 *VALORACIÓN Y STOCK DE INVENTARIO - KODA ERP*\n\n"
                    "⚠️ *Productos Agotados:* 3 SKUs\n"
                    "📉 *Productos Bajo Mínimo:* 8 SKUs\n"
                    "📦 *Total SKUs Registrados:* 42\n"
                    "💰 *Valor Total Estimado Almacén:* $28,950.00 USD\n\n"
                    "🛒 _Por favor, emita compras para reabastecer stock._"
                ),
                "internal_action": "query_stock"
            },
            {
                "trigger_command": "/logistica",
                "response_text": (
                    "🚚 *ESTADO DE LA LOGÍSTICA Y DESPACHOS - KODA ERP*\n\n"
                    "🟡 *Turnos Programados:* 1 en espera.\n"
                    "🔵 *Turnos En Ruta:* 1 en tránsito.\n"
                    "✅ *Choferes en Ruta:* Henry Rodriguez (Vehículo Placa: AAA-111)\n"
                    "📦 *Estatus de Entrega:* Recepción conforme de la ruta FAC-00000004.\n\n"
                    "📌 _Para monitorear el mapa en vivo, ingrese al módulo de Logística._"
                ),
                "internal_action": "query_logistics"
            },
            {
                "trigger_command": "/cobranzas",
                "response_text": (
                    "💰 *CUENTAS POR COBRAR (CxC) - KODA ERP*\n\n"
                    "💵 *Saldo de Cartera Activa:* $14,230.00 USD\n"
                    "⏳ *Cuentas Vencidas (>30 días):* $1,200.00 USD\n"
                    "📈 *Cobranza Recibida Hoy:* $850.00 USD\n\n"
                    "📝 _Se han enviado notificaciones de pago automáticas a clientes con mora._"
                ),
                "internal_action": "query_collections"
            },
            {
                "trigger_command": "/pagos",
                "response_text": (
                    "💸 *CUENTAS POR PAGAR (CxP) Y COMPROMISOS - KODA ERP*\n\n"
                    "💵 *Total CxP a Proveedores:* $8,450.00 USD\n"
                    "⏳ *Pagos que Vencen Esta Semana:* $1,500.00 USD\n"
                    "✅ *Pagos Ejecutados Hoy:* $450.00 USD\n\n"
                    "_Revise la programación de pagos en Tesorería para autorizaciones._"
                ),
                "internal_action": "query_payments"
            },
            {
                "trigger_command": "/tesoreria",
                "response_text": (
                    "🏛️ *SALDOS CONSOLIDADOS DE TESORERÍA - KODA ERP*\n\n"
                    "🏦 *Banesco USD:* $18,450.00\n"
                    "🏦 *Mercantil Bs (BCV):* Bs. 320,400.00 (Equivalente: $444.17 USD)\n"
                    "💵 *Fondo Caja Chica Principal:* $150.00 USD\n"
                    "📉 *Gastos Registrados Hoy:* $45.00 USD\n\n"
                    "✅ _El balance consolidado de caja y bancos está conciliado al 100%._"
                ),
                "internal_action": "query_treasury"
            },
            {
                "trigger_command": "/fiscal",
                "response_text": (
                    "🏛️ *OBLIGACIONES FISCALES Y IMPUESTOS - KODA ERP*\n\n"
                    "📊 *Débito Fiscal IVA Acumulado:* $199.20 USD\n"
                    "💵 *Retenciones de IVA Recibidas:* $45.00 USD\n"
                    "📉 *IGTF 3% Acumulado:* $37.35 USD\n"
                    "📆 *Declaración Mensual:* Período 2026-07 en estado BORRADOR.\n\n"
                    "📄 _El RIF de la empresa está verificado como Contribuyente Especial._"
                ),
                "internal_action": "query_fiscal"
            },
            {
                "trigger_command": "/contabilidad",
                "response_text": (
                    "📕 *ESTADO CONTABLE Y LIBRO DIARIO - KODA ERP*\n\n"
                    "📝 *Asientos de Ventas de Hoy:* 8 asientos generados automáticamente.\n"
                    "📝 *Asientos de Costo de Ventas (COGS):* Sincronizados con Kardex.\n"
                    "⚖️ *Balance de Comprobación:* Cuadrado (Activos = Pasivos + Patrimonio).\n\n"
                    "📊 _Los movimientos de caja y facturación generan contabilidad en tiempo real._"
                ),
                "internal_action": "query_accounting"
            },
            {
                "trigger_command": "/nomina",
                "response_text": (
                    "👥 *GESTIÓN DE PERSONAL Y NÓMINA - KODA ERP*\n\n"
                    "👥 *Personal Activo:* 12 empleados.\n"
                    "💵 *Nómina Acumulada Quincenal:* $2,450.00 USD\n"
                    "📈 *Retenciones IVSS / FAOV:* Calculadas y al día.\n"
                    "🏭 *Aporte INCES Estimado:* $49.00 USD\n\n"
                    "📌 _La nómina del período actual se encuentra pre-calculada en borrador._"
                ),
                "internal_action": "query_payroll"
            },
            {
                "trigger_command": "/reportes",
                "response_text": (
                    "📈 *INDICADORES DE NEGOCIO (BI) - KODA ERP*\n\n"
                    "💰 *Facturación Mensual:* $12,450.00 USD\n"
                    "📊 *Margen Bruto Promedio:* 32.5%\n"
                    "📉 *Gastos Operativos (OPEX):* $3,400.00 USD\n"
                    "📈 *EBITDA Estimado:* $8,245.00 USD\n\n"
                    "_Para reportes de varianza presupuestaria, ingrese a Reportes Avanzados._"
                ),
                "internal_action": "query_reports"
            },
            {
                "trigger_command": "/sucursales",
                "response_text": (
                    "🏢 *SEDES Y PUNTOS DE VENTA ACTIVOS - KODA ERP*\n\n"
                    "📍 *Sede Principal:* Caracas, Real Ven - *Activa*\n"
                    "📍 *Depósito Central:* Almacén Este - *Activo*\n\n"
                    "✅ _Todos los puntos físicos de despacho y depósitos operan con normalidad._"
                ),
                "internal_action": "query_branches"
            },
            {
                "trigger_command": "/auditoria",
                "response_text": (
                    "🛡️ *CONTROL DE AUDITORÍA Y SEGURIDAD - KODA ERP*\n\n"
                    "🔒 *Aislamiento RLS:* Activo (Multi-tenant seguro)\n"
                    "💼 *Sesión SENIAT:* Modo Auditoría Temporal Disponible\n"
                    "📝 *Último Log:* Cambio de Perfil por Henry Rodriguez (Desarrollador)\n\n"
                    "✅ _El sistema cumple con los lineamientos de resguardo de información fiscal._"
                ),
                "internal_action": "query_audit"
            }
        ]

        inserted_count = 0
        # Primero limpiar comandos existentes para poblar el set limpio completo
        db.query(TelegramCommand).delete()
        db.commit()

        for tenant in tenants:
            for cmd in command_list:
                new_cmd = TelegramCommand(
                    trigger_command=cmd["trigger_command"],
                    response_text=cmd["response_text"],
                    internal_action=cmd["internal_action"],
                    is_active=True,
                    tenant_id=tenant.id
                )
                db.add(new_cmd)
                inserted_count += 1

        db.commit()
        print(f"Éxito: Se registraron {inserted_count} comandos predeterminados de Telegram (cobertura total de 15 módulos).")

    except Exception as e:
        db.rollback()
        print(f"Error al poblar comandos: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_telegram_commands()
