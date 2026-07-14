from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from backend.services.rate_limiter import check_rate_limit
from backend.core.database import Base, engine, DATABASE_URL

print(f"\033[95m[SYSTEM] FastAPI verificando motor BD. Conexión apuntada a: {DATABASE_URL.split('@')[-1] if DATABASE_URL and '@' in DATABASE_URL else DATABASE_URL}\033[0m")
if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
    raise SystemExit("\033[91m[SYSTEM CRITICAL] ERROR: El backend solo puede iniciar conectado a PostgreSQL (Supabase).\033[0m")



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
    hr as hr_router, productos, proveedores, audit, entidades,
    dashboard_ext, fiscal_ext, contabilidad_ext, modulos_ext, admin_ext, extras_ext,
    pagos, reportes, developer, developer_router, payroll, facturacion, telegram_api,
    forense, telemetry,
)
from backend.routers import logistica as logistica_router
from backend.utils.seed_extended import seed_extended_data
from sqlalchemy import text

# Asegurar que todos los modelos están registrados en Base antes de create_all
Base.metadata.create_all(bind=engine)

# Intentar migrar la base de datos agregando la columna total_inces_usd si no existe
try:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE public.nominas ADD COLUMN IF NOT EXISTS total_inces_usd NUMERIC(15, 2) DEFAULT 0.00 NOT NULL"))
        print("\033[92m[DB MIGRATION] Columna total_inces_usd garantizada en la tabla nominas.\033[0m")
        connection.execute(text("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50)"))
        print("\033[92m[DB MIGRATION] Columna telegram_chat_id garantizada en la tabla profiles.\033[0m")
        connection.execute(text("ALTER TABLE public.declaraciones_iva DROP CONSTRAINT IF EXISTS declaraciones_iva_periodo_key"))
        print("\033[92m[DB MIGRATION] Restricción única sobre declaraciones_iva (periodo) removida.\033[0m")
        connection.execute(text("ALTER TABLE public.correlativos_fiscales DROP CONSTRAINT IF EXISTS correlativos_fiscales_tipo_documento_key"))
        print("\033[92m[DB MIGRATION] Restricción única sobre correlativos_fiscales (tipo_documento) removida.\033[0m")
except Exception as migration_error:
    print(f"\033[93m[DB MIGRATION WARNING] No se pudo alterar la tabla para migración: {migration_error}\033[0m")

from backend.core.database import SessionLocal
from backend.models.core import TasaCambio
from backend.models.fiscal import ReglaFiscal, INPCIndice
from decimal import Decimal


def _seed_database():
    db = SessionLocal()
    try:
        if not db.query(TasaCambio).first():
            db.add(TasaCambio(valor_ves=36.52, fuente="BCV (Por defecto)"))
        if not db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IVA").first():
            db.add(ReglaFiscal(nombre="IVA", tasa=Decimal("0.1600"), activa=True))
        if not db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IGTF").first():
            db.add(ReglaFiscal(nombre="IGTF", tasa=Decimal("0.0300"), activa=True))

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
    allow_credentials=True,
    allow_methods=["*"],  # Permitir todos los métodos (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Permitir todos los encabezados
)

# Routers del núcleo (ventas, inventario, maestros)
app.include_router(auth.router)
app.include_router(rates.router)
app.include_router(modulos_ext.ventas_ext_router)
app.include_router(sales.router)
app.include_router(fiscal.router)
app.include_router(audit.router)
app.include_router(fiscal_ext.router)
app.include_router(modulos_ext.inventario_ext_router)
app.include_router(inventory.router)
app.include_router(accounting_router.router)
app.include_router(contabilidad_ext.router)
app.include_router(hr_router.router)
app.include_router(productos.router)
app.include_router(entidades.router)
app.include_router(modulos_ext.clientes_ext_router)
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
# Búnker Forense — trazabilidad inmutable de entidades del sistema
app.include_router(forense.router)
# Telemetría Omniscience
app.include_router(telemetry.router)

# Endpoints de Dashboard para el Frontend
@app.get("/repo_dashboard_resumen", tags=["Reportes Financieros"])
def get_repo_dashboard_resumen():
    from fastapi import HTTPException
    from backend.services.reportes import ReporteService
    db = SessionLocal()
    try:
        return ReporteService.dashboard_resumen(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/repo_estado_resultados", tags=["Reportes Financieros"])
def get_repo_estado_resultados():
    from fastapi import HTTPException
    from backend.services.reportes import ReporteService
    db = SessionLocal()
    try:
        return ReporteService.obtener_estado_resultados(db)
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
