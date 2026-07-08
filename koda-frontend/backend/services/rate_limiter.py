"""
Rate Limiter con ventana deslizante de 60 segundos para el backend de facturación.

Límites:
  - /auth/login y /auth/register: máximo 5 req/min por IP  (anti-brute-force)
  - Resto de rutas:               máximo 100 req/min por IP

Fail-open: si Redis no está disponible la petición pasa sin restricción
y se registra una única advertencia en el log.
"""
import os
import logging
from fastapi import Request, HTTPException
from redis import Redis

logger = logging.getLogger("koda_facturacion")

REDIS_URL = (os.getenv("REDIS_URL") or "").strip()
_redis: Redis | None = None
_redis_warning_logged = False

# Inicialización perezosa del cliente (sincrónico, compatible con endpoints sync)
def _get_redis() -> Redis | None:
    global _redis
    if _redis is None and REDIS_URL:
        try:
            _redis = Redis.from_url(REDIS_URL, decode_responses=True)
        except Exception:
            pass
    return _redis

# Prefijos de rutas de autenticación
AUTH_ROUTE_PREFIXES = ("/auth/login", "/auth/register", "/auth")

WINDOW_SECONDS = 60
LIMIT_GLOBAL   = 1200
LIMIT_AUTH     = 5


def _is_auth_route(path: str) -> bool:
    normalized = path.lower()
    return any(normalized.startswith(prefix) for prefix in AUTH_ROUTE_PREFIXES)


def check_rate_limit(request: Request) -> None:
    """
    Dependencia de FastAPI para Rate Limiting.
    Uso: añadir `Depends(check_rate_limit)` al router o globalmente en el app.
    """
    global _redis_warning_logged
    client = _get_redis()
    if client is None:
        return  # Fail-open si Redis no está disponible

    from backend.utils.ip_utils import get_real_ip_str
    client_ip: str = get_real_ip_str(request)
    path: str = request.url.path

    # Exclusión de rutas de salud o recursos estáticos del sistema
    if path == "/" or path.startswith("/health") or path == "/favicon.ico":
        return

    if _is_auth_route(path):
        key   = f"rl:facturacion:auth:{client_ip}"
        limit = LIMIT_AUTH
    else:
        key   = f"rl:facturacion:ip:{client_ip}"
        limit = LIMIT_GLOBAL

    try:
        pipe = client.pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, WINDOW_SECONDS)
        results = pipe.execute()
        count = int(results[0] or 0)

        if count > limit:
            logger.warning(
                f"[RATE LIMIT FACTURACION] IP={client_ip} PATH={path} "
                f"COUNT={count} LIMIT={limit}"
            )
            raise HTTPException(
                status_code=429,
                detail=(
                    "Demasiados intentos de autenticación. Espere 1 minuto antes de reintentar."
                    if _is_auth_route(path)
                    else "Demasiadas solicitudes. Intente nuevamente en un minuto."
                ),
                headers={"Retry-After": str(WINDOW_SECONDS)},
            )
    except Exception as error:
        if isinstance(error, HTTPException):
            raise error
        if not _redis_warning_logged:
            logger.warning(f"[RATE LIMITER FACTURACION] Redis no disponible (fail-open): {error}")
            _redis_warning_logged = True
