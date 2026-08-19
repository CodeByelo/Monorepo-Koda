"""
Rate Limiter con ventana deslizante de 60 segundos.
- Rutas de autenticación (/login, /auth): máximo 5 req/min por IP (anti-brute-force).
- Resto del sistema: máximo 100 req/min por IP (o por tenant si hay sesión activa).

En caso de fallo de Redis el sistema opera en modo "fail-open" para no bloquear
la operación del negocio, registrando una única advertencia en el log.
"""
from redis.asyncio import Redis
from fastapi import Request, HTTPException
from middleware.context import get_current_tenant_id
import os
import logging

logger = logging.getLogger("sistema_corporativo")

REDIS_URL = (os.getenv("REDIS_URL") or "").strip()
redis_client = Redis.from_url(REDIS_URL) if REDIS_URL else None
_redis_warning_logged = False

# Prefijos de rutas que activan el límite estricto de autenticación
AUTH_ROUTE_PREFIXES = ("/login", "/auth")

# Límites de la ventana de 60 segundos
WINDOW_SECONDS   = 60
LIMIT_GLOBAL     = 1200  # peticiones por minuto por IP (rutas generales)
LIMIT_AUTH       = 5     # peticiones por minuto por IP (rutas de autenticación)


def _is_auth_route(path: str) -> bool:
    """Determina si la ruta pertenece al perímetro de autenticación."""
    normalized = path.lower()
    return any(normalized.startswith(prefix) for prefix in AUTH_ROUTE_PREFIXES)


async def rate_limiter_middleware(request: Request):
    """
    Middleware de Rate Limiting con granularidad por ruta.

    Ventana: 60 segundos (fixed-window counter en Redis).
    Claves Redis:
      - rate_limit:auth:ip:<ip>     → rutas /login y /auth (límite 5)
      - rate_limit:tenant:<tenant>:ip:<ip>  → tenants autenticados  (límite 1200)
      - rate_limit:ip:<ip>          → IPs anónimas          (límite 1200)
    """
    if redis_client is None:
        return  # Fail-open si Redis no está configurado

    client_ip = request.client.host if request.client else "unknown"
    path = request.url.path

    # Exclusión de rutas críticas de infraestructura y salud
    if path == "/" or path.startswith("/health") or path.startswith("/db-check") or path == "/favicon.ico":
        return

    # ── Ruta de autenticación → límite estricto por IP ─────────────────────
    if _is_auth_route(path):
        key   = f"rate_limit:auth:ip:{client_ip}"
        limit = LIMIT_AUTH
    else:
        # ── Ruta general → diferenciar por tenant (sesión activa) o por IP ──
        tenant_id = get_current_tenant_id()
        if tenant_id:
            key   = f"rate_limit:tenant:{tenant_id}:ip:{client_ip}"
            limit = LIMIT_GLOBAL
        else:
            key   = f"rate_limit:ip:{client_ip}"
            limit = LIMIT_GLOBAL

    await _check_limit(key, limit, path, client_ip)


async def _check_limit(key: str, limit: int, path: str, client_ip: str):
    """Incrementa el contador en Redis y lanza HTTP 429 si se supera el límite."""
    global _redis_warning_logged

    async with redis_client.pipeline(transaction=True) as pipe:
        try:
            await pipe.incr(key)
            await pipe.expire(key, WINDOW_SECONDS)
            results = await pipe.execute()
            count = int(results[0] or 0)

            if count > limit:
                logger.warning(
                    f"[RATE LIMIT] IP={client_ip} PATH={path} "
                    f"COUNT={count} LIMIT={limit} KEY={key}"
                )
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Demasiadas solicitudes. Intente nuevamente en un minuto."
                        if limit == LIMIT_GLOBAL
                        else "Demasiados intentos de autenticación. Espere 1 minuto antes de reintentar."
                    ),
                    headers={"Retry-After": str(WINDOW_SECONDS)},
                )
        except Exception as error:
            if isinstance(error, HTTPException):
                raise error
            # Fail-open: Redis caído no debe paralizar el sistema
            if not _redis_warning_logged:
                logger.warning(f"[RATE LIMITER] Redis no disponible (fail-open): {error}")
                _redis_warning_logged = True
