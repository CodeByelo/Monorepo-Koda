import os

# --- Sentry (monitoreo de errores) ---
# Desactivado por defecto: sólo se inicializa si SENTRY_DSN está definida en el
# entorno. Sin DSN, esto es un no-op silencioso (no imprime nada, no falla).
_SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
if _SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=0.1,
        environment=os.getenv("ENVIRONMENT", "development"),
    )

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from backend.services.rate_limiter import check_rate_limit
from backend.core.database import Base, engine, DATABASE_URL
from backend.core.security import get_current_user

print(f"\033[95m[SYSTEM] FastAPI motor BD verificado. Conexión apuntada a: {DATABASE_URL.split('@')[-1] if DATABASE_URL and '@' in DATABASE_URL else DATABASE_URL}\033[0m")



# Importar TODOS los modelos para create_all
from backend.models import core, operations, accounting, hr, fiscal as fiscal_model, audit, logistics_new
from backend.models import erp_extended

__all__ = [
    "core",
    "operations",
    "accounting",
    "hr",
    "fiscal_model",
    "audit",
    "erp_extended",
    "logistics_new",
]
from backend.routers import (
    auth, rates, sales, fiscal, inventory, accounting as accounting_router,
    hr as hr_router, productos, proveedores, audit, entidades, clientes,
    dashboard_ext, fiscal_ext, contabilidad_ext, modulos_ext, admin_ext, extras_ext,
    pagos, reportes, developer, developer_router, payroll, facturacion, telegram_api,
    forense, telemetry, bot_api, garantias, sso_bridge,
)
from backend.routers import logistica as logistica_router
from backend.utils.seed_extended import seed_extended_data
from sqlalchemy import text

# Asegurar que todos los modelos están registrados en Base antes de create_all
try:
    Base.metadata.create_all(bind=engine, checkfirst=True)
except Exception as create_err:
    pass

# Intentar migrar la base de datos agregando columnas de forma segura
try:
    with engine.begin() as connection:
        sql_nominas = "ALTER TABLE nominas ADD COLUMN total_inces_usd NUMERIC(15, 2) DEFAULT 0.00" if engine.name == "sqlite" else "ALTER TABLE public.nominas ADD COLUMN IF NOT EXISTS total_inces_usd NUMERIC(15, 2) DEFAULT 0.00 NOT NULL"
        connection.execute(text(sql_nominas))
except Exception:
    pass

try:
    with engine.begin() as connection:
        sql_profiles = "ALTER TABLE profiles ADD COLUMN telegram_chat_id VARCHAR(50)" if engine.name == "sqlite" else "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50)"
        connection.execute(text(sql_profiles))
        if engine.name != "sqlite":
            connection.execute(text("ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS imagen_url TEXT;"))
            connection.execute(text("ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS vendedor_id INTEGER;"))
            connection.execute(text("ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS retencion_iva_usd NUMERIC(15,2) DEFAULT 0.00;"))
            connection.execute(text("ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS igtf_usd NUMERIC(15,2) DEFAULT 0.00;"))
            connection.execute(text("ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS creado_por UUID;"))
            # Migración para que correlativos_fiscales sea único por (tenant_id, tipo_documento) y no global
            connection.execute(text("DROP INDEX IF EXISTS public.ix_public_correlativos_fiscales_tipo_documento;"))
            connection.execute(text("DROP INDEX IF EXISTS public.ix_correlativos_fiscales_tipo_documento;"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_correlativos_fiscales_tipo_documento ON public.correlativos_fiscales (tipo_documento);"))
            connection.execute(text("ALTER TABLE public.correlativos_fiscales DROP CONSTRAINT IF EXISTS _tenant_correlativos_tipo_doc_uc;"))
            connection.execute(text("ALTER TABLE public.correlativos_fiscales ADD CONSTRAINT _tenant_correlativos_tipo_doc_uc UNIQUE (tenant_id, tipo_documento);"))
        else:
            for col_sql in [
                "ALTER TABLE productos ADD COLUMN imagen_url TEXT",
                "ALTER TABLE ventas ADD COLUMN vendedor_id INTEGER",
                "ALTER TABLE ventas ADD COLUMN retencion_iva_usd NUMERIC(15,2) DEFAULT 0.00",
                "ALTER TABLE ventas ADD COLUMN igtf_usd NUMERIC(15,2) DEFAULT 0.00",
                "ALTER TABLE ventas ADD COLUMN creado_por VARCHAR(36)",
            ]:
                try:
                    connection.execute(text(col_sql))
                except Exception:
                    pass
except Exception as e:
    print(f"[SYSTEM] Error in auto-migration for ventas columns: {e}")

from backend.core.database import SessionLocal
from backend.models.core import TasaCambio
from backend.models.fiscal import ReglaFiscal, INPCIndice
from decimal import Decimal


def _seed_database():
    db = SessionLocal()
    try:
        from backend.models.operations import Cliente, Producto
        from backend.models.fiscal import CorrelativoFiscal
        from backend.routers.rates import _perform_bcv_sync

        if not db.query(TasaCambio).first():
            try:
                _perform_bcv_sync(db)
            except Exception as e:
                db.add(TasaCambio(valor_ves=Decimal("757.54"), fuente="BCV (Oficial Respaldo)"))
                db.commit()
        if not db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IVA").first():
            db.add(ReglaFiscal(nombre="IVA", tasa=Decimal("0.1600"), activa=True))
        if not db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IGTF").first():
            db.add(ReglaFiscal(nombre="IGTF", tasa=Decimal("0.0300"), activa=True))

        # Seed Cliente base si no existen
        if not db.query(Cliente).first():
            db.add_all([
                Cliente(
                    rif="J-00000000-0",
                    nombre="Consumidor Final",
                    telefono="+58 212 000-0000",
                    email="consumidor@koda.com",
                    direccion="Caracas, Venezuela",
                    es_contribuyente_especial=False
                ),
                Cliente(
                    rif="J-30000000-1",
                    nombre="Empresa Comercializadora Koda, C.A.",
                    telefono="+58 212 555-0100",
                    email="contacto@koda.com",
                    direccion="Av. Principal de Las Mercedes, Caracas",
                    es_contribuyente_especial=True
                )
            ])

        # Seed Productos base si no existen
        if not db.query(Producto).first():
            db.add_all([
                Producto(
                    sku="PROD-001",
                    nombre="Licencia Koda ERP Pro (Anual)",
                    precio_usd=Decimal("250.00"),
                    costo_usd=Decimal("50.00"),
                    stock=Decimal("100.00"),
                    es_exento=False
                ),
                Producto(
                    sku="PROD-002",
                    nombre="Servicio de Soporte Técnico y Mantenimiento",
                    precio_usd=Decimal("80.00"),
                    costo_usd=Decimal("20.00"),
                    stock=Decimal("500.00"),
                    es_exento=False
                ),
                Producto(
                    sku="PROD-003",
                    nombre="Consultoría Fiscal y Auditoría Contable",
                    precio_usd=Decimal("150.00"),
                    costo_usd=Decimal("30.00"),
                    stock=Decimal("50.00"),
                    es_exento=True
                )
            ])

        # Seed CorrelativoFiscal si no existe
        if not db.query(CorrelativoFiscal).filter(CorrelativoFiscal.tipo_documento == "FACTURA").first():
            db.add(CorrelativoFiscal(tipo_documento="FACTURA", prefijo="FAC-", siguiente_numero=1))

        # Seed INPC indices if not present
        if not db.query(INPCIndice).first():
            inpc_data = [
                (2025, 10, Decimal("100.0000")),
                (2025, 11, Decimal("103.5000")),
                (2025, 12, Decimal("107.2000")),
                (2026, 1, Decimal("110.8000")),
                (2026, 2, Decimal("114.1000")),
                (2026, 3, Decimal("117.3000")),
                (2026, 4, Decimal("120.5000")),
                (2026, 5, Decimal("124.0000")),
            ]
            for anio, mes, val in inpc_data:
                db.add(INPCIndice(anio=anio, mes=mes, indice=val))
        db.commit()
    except Exception as e:
        db.rollback()
        print("Error al inicializar datos:", e)
    finally:
        db.close()



_seed_database()
seed_extended_data()

app = FastAPI(
    title="KODA ERP - API Bimonetario (Bs/$)",
    description="Motor de Backend modular y escalable para el ERP Bimonetario de KODA. Soporta transacciones muti-moneda en tiempo real.",
    version="1.0.0"
)

from fastapi.staticfiles import StaticFiles
import os
os.makedirs("backend/static", exist_ok=True)
app.mount("/static", StaticFiles(directory="backend/static"), name="static")

# Configuración de Orígenes Permitidos para CORS (DEBE ir antes de los routers)
origins = [
    "http://localhost:5173",  # React + Vite por defecto
    "http://127.0.0.1:5173",
    "http://localhost:3000",  # React clásico o Next.js
    "http://127.0.0.1:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:8000",
    "https://koda-billing-front.vercel.app",
    "https://monorepo-koda.vercel.app",
    "https://koda-remaster.vercel.app",
    "https://monorepo-koda.onrender.com",
    "https://koda-backend-contable.onrender.com",
]

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Middleware global de Rate Limiting (100 req/min, 5 req/min en rutas /auth)."""
    from fastapi import HTTPException as _HTTPException
    from fastapi.responses import JSONResponse as _JSONResponse
    try:
        check_rate_limit(request)
    except _HTTPException as e:
        headers = dict(e.headers) if e.headers else {}
        return _JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail},
            headers=headers,
        )
    return await call_next(request)



app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],  # Permitir todos los métodos (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Permitir todos los encabezados
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Middleware de cabeceras de seguridad HTTP (OWASP best practices)."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://*.vercel.app https://koda-billing-front.vercel.app http://localhost:* https://*.ts.net; frame-ancestors 'self' https://*.vercel.app https://monorepo-koda.vercel.app https://koda-billing-front.vercel.app http://localhost:3000 http://localhost:5173 http://localhost:5174 https://*.ts.net;"
    )
    if os.getenv("NODE_ENV", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    from fastapi.responses import JSONResponse
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Error interno en el servidor: {str(exc)}"},
    )
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

# Routers del núcleo (ventas, inventario, maestros)
app.include_router(auth.router)
app.include_router(rates.router)
app.include_router(modulos_ext.ventas_ext_router)
app.include_router(sales.router)
app.include_router(modulos_ext.inventario_ext_router)
app.include_router(inventory.router)
app.include_router(fiscal.router)
app.include_router(audit.router)
app.include_router(fiscal_ext.router)
app.include_router(accounting_router.router)
app.include_router(contabilidad_ext.router)
app.include_router(hr_router.router)
app.include_router(productos.router)
app.include_router(clientes.router)
app.include_router(entidades.router)
app.include_router(proveedores.router)
# Módulos extendidos
app.include_router(dashboard_ext.router)
app.include_router(modulos_ext.compras_router)
app.include_router(modulos_ext.cobranzas_router)
app.include_router(modulos_ext.pagos_router)
app.include_router(modulos_ext.tesoreria_router)
app.include_router(modulos_ext.reportes_router)
app.include_router(modulos_ext.tasas_router)
app.include_router(admin_ext.router)
app.include_router(telegram_api.router)
app.include_router(extras_ext.router)
app.include_router(pagos.router)
app.include_router(reportes.router)
app.include_router(developer.router)
app.include_router(developer_router.router)
app.include_router(payroll.router)
app.include_router(payroll.router, prefix="/api")
# Facturación Fiscal (Ledger, auditoría de emisión y firma SHA-256)
app.include_router(facturacion.router)
# Módulo Logística (Flota, Choferes, Turnos de Despacho, Mantenimiento)
app.include_router(logistica_router.router)
app.include_router(logistica_router.router, prefix="/logistica")
# Búnker Forense — trazabilidad inmutable de entidades del sistema
app.include_router(forense.router)
# Telemetría Omniscience
app.include_router(telemetry.router)
# API de servicio para el bot de Telegram (backend externo, clave compartida)
app.include_router(bot_api.router)
app.include_router(sso_bridge.router)
# Garantías de producto/venta
app.include_router(garantias.router)

# Endpoints de Dashboard para el Frontend
@app.get("/repo_dashboard_resumen", tags=["Reportes Financieros"])
def get_repo_dashboard_resumen(current_user = Depends(get_current_user)):
    from fastapi import HTTPException
    from backend.services.reportes import ReporteService
    db = SessionLocal()
    try:
        return ReporteService.dashboard_resumen(db, current_user.tenant_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/repo_estado_resultados", tags=["Reportes Financieros"])
def get_repo_estado_resultados(current_user = Depends(get_current_user)):
    from fastapi import HTTPException
    from backend.services.reportes import ReporteService
    db = SessionLocal()
    try:
        return ReporteService.obtener_estado_resultados(db, tenant_id=current_user.tenant_id if current_user else None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# Ruta base de verificación de salud de la API (Healthcheck)
@app.get("/", tags=["Health"])
def health_check():
    return {
        "status": "online",
        "message": "KODA ERP Bimonetario API está en funcionamiento y lista para transacciones.",
        "currency_support": ["VES", "USD"]
    }

# ===================================================================
# SCHEDULER — Respaldo automático de base de datos (APScheduler)
# ===================================================================
# No existe infraestructura de cron/worker separada para koda-frontend: este
# mismo proceso FastAPI es el único lugar donde se puede ejecutar algo en un
# horario, por eso el scheduler se arranca aquí (mismo patrón que
# KODA_Remaster/sistema-corporativo/backend/core/scheduler.py).
@app.on_event("startup")
async def iniciar_scheduler():
    try:
        from backend.core.scheduler import scheduler as backup_scheduler

        backup_scheduler.start()
        app.state.backup_scheduler = backup_scheduler
        print("\033[92m[SYSTEM] Scheduler de respaldos automáticos iniciado.\033[0m")
    except Exception as sched_err:
        print(f"\033[91m[SYSTEM] No se pudo iniciar el scheduler de respaldos: {sched_err}\033[0m")
        app.state.backup_scheduler = None


@app.on_event("shutdown")
async def detener_scheduler():
    backup_scheduler = getattr(app.state, "backup_scheduler", None)
    if backup_scheduler is not None:
        try:
            backup_scheduler.shutdown(wait=False)
        except Exception:
            pass
