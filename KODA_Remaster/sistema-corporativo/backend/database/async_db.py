import asyncpg
import asyncio
import logging
import os
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from middleware.context import get_current_tenant_id, get_current_user_role, get_current_user_id

logger = logging.getLogger("sistema_corporativo")
init_lock = asyncio.Lock()
pool: asyncpg.Pool = None

async def init_db_pool():
    global pool

    async with init_lock:
        if pool is not None:
            return

        db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
        print(f"\n>>> DB_URL: {'EXISTS' if db_url else 'NONE'}")

        for attempt in range(5):
            try:
                if not db_url:
                    raise ValueError("DATABASE_URL/SUPABASE_DB_URL no configurada")

                logger.info(f"Intento {attempt + 1}/5")
                # Supabase free plan: session mode max = 15 conexiones.
                # min=1, max=10 deja margen y evita EMAXCONNSESSION al arrancar.
                min_pool_size = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
                max_pool_size = int(os.getenv("DB_POOL_MAX_SIZE", "10"))
                db_command_timeout = float(os.getenv("DB_COMMAND_TIMEOUT_SECONDS", "30"))

                ssl_mode = os.getenv("DB_SSL_MODE", "disable").lower()
                ssl_value = "require" if ssl_mode == "require" else None

                pool = await asyncpg.create_pool(
                    dsn=db_url,
                    min_size=min_pool_size,
                    max_size=max_pool_size,
                    statement_cache_size=0,
                    max_inactive_connection_lifetime=300.0,
                    max_queries=50000,
                    command_timeout=db_command_timeout,
                    ssl=ssl_value
                )
                logger.info("✅ CONEXIÓN EXITOSA - SISTEMA LISTO 🚀")
                return
            except Exception as e:
                logger.error(f"❌ Error: {e}")
                if attempt == 4:
                    if "tenant or user" in str(e).lower():
                        logger.warning(f"⚠️ Warning: No se encontró el tenant o el usuario en la base de datos: {e}. Se permite continuar el inicio de la aplicación.")
                        return
                    raise
                await asyncio.sleep(1)
 # Reducido a 1s para fallar más rápido si es necesario

@asynccontextmanager
async def db_session():
    """Context manager para uso interno (ej: middlewares)"""
    global pool
    if pool is None:
        await init_db_pool()

    # Retry a few times if the pool is still None (e.g. temporary DB unavailability)
    retries = 3
    while pool is None and retries > 0:
        await asyncio.sleep(1)
        await init_db_pool()
        retries -= 1

    if pool is None:
        raise RuntimeError("DB pool no inicializado; revisa DATABASE_URL (o SUPABASE_DB_URL)/DB_SSL_MODE")

    async with pool.acquire() as conn:
        tenant_id = get_current_tenant_id()
        user_role = get_current_user_role()
        user_id = get_current_user_id()

        # ── Fallback: resolve tenant_id from profiles when JWT doesn't carry it ──
        if not tenant_id and user_id:
            try:
                tenant_id = await conn.fetchval(
                    "SELECT tenant_id FROM profiles WHERE id = $1::uuid",
                    str(user_id),
                )
                if tenant_id:
                    tenant_id = str(tenant_id)
                    logger.info(f"tenant_id resolved from profiles for user {user_id}: {tenant_id}")
            except Exception as e:
                logger.warning(f"Could not resolve tenant_id from profiles: {e}")

        try:
            if tenant_id or user_role or user_id:
                queries = []
                params = []
                if tenant_id:
                    queries.append("set_config('app.current_tenant_id', $1, true)")
                    params.append(str(tenant_id))
                if user_role:
                    idx = len(params) + 1
                    queries.append(f"set_config('app.current_user_role', ${idx}, true)")
                    params.append(str(user_role))
                if user_id:
                    idx = len(params) + 1
                    queries.append(f"set_config('app.current_user_id', ${idx}, true)")
                    params.append(str(user_id))
                await conn.execute(f"SELECT {', '.join(queries)}", *params)
            yield conn
        finally:
            try:
                await conn.execute("RESET app.current_tenant_id; RESET app.current_user_role; RESET app.current_user_id")
            except:
                pass


async def get_db_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Generador para dependencias de FastAPI"""
    async with db_session() as conn:
        yield conn
        
