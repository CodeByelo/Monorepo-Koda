import functools
import json
import uuid
import logging
import inspect
from fastapi import Request, HTTPException, Response
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from redis.asyncio import Redis
import os

logger = logging.getLogger("idempotency")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379").strip()
try:
    redis_client = Redis.from_url(REDIS_URL) if REDIS_URL else None
except Exception as e:
    logger.warning(f"Error inicializando Redis client: {e}")
    redis_client = None

def require_idempotency(func):
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        async def execute_func():
            if inspect.iscoroutinefunction(func):
                return await func(*args, **kwargs)
            else:
                return func(*args, **kwargs)

        # Encontrar el objeto request
        request = kwargs.get("request")
        if not request:
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
        
        if not request:
            # Si no hay request en los parámetros del endpoint, fallar de manera segura y continuar
            return await execute_func()
            
        idem_key = request.headers.get("X-Idempotency-Key")
        if not idem_key:
            raise HTTPException(status_code=400, detail="Falta el encabezado X-Idempotency-Key.")
            
        try:
            uuid.UUID(idem_key)
        except ValueError:
            raise HTTPException(status_code=400, detail="El encabezado X-Idempotency-Key debe ser un UUID valido.")
            
        # Si Redis no está inicializado, fail-open directo
        if not redis_client:
            return await execute_func()
            
        redis_key = f"idempotency:{idem_key}"
        redis_failed = False
        is_new = True
        
        try:
            try:
                # Intentar registrar la llave como "processing" (con EX = 24h, NX = True)
                is_new = await redis_client.set(redis_key, "processing", ex=86400, nx=True)
            except Exception as redis_err:
                logger.warning(f"Redis fallo durante verificacion de idempotencia (fail-open): {redis_err}")
                redis_failed = True
                is_new = True
                
            if not redis_failed and not is_new:
                # La llave ya existe. Obtener su estado.
                cached_val = await redis_client.get(redis_key)
                if cached_val == b"processing":
                    raise HTTPException(status_code=409, detail="Solicitud duplicada en proceso. Por favor, espere.")
                
                if cached_val:
                    try:
                        data = json.loads(cached_val.decode("utf-8"))
                        return JSONResponse(
                            status_code=data.get("status_code", 200),
                            content=data.get("content"),
                            headers=data.get("headers")
                        )
                    except Exception as parse_err:
                        logger.warning(f"Error leyendo respuesta cacheada de idempotencia: {parse_err}")
                        pass
            
            # Ejecutar el endpoint real
            result = await execute_func()
            
            # Intentar almacenar la respuesta en Redis (si Redis no falló antes)
            if not redis_failed:
                try:
                    status_code = 200
                    content = result
                    headers = {}
                    
                    if isinstance(result, Response):
                        status_code = result.status_code
                        if hasattr(result, "body"):
                            try:
                                content = json.loads(result.body.decode("utf-8"))
                            except Exception:
                                content = result.body.decode("utf-8")
                        else:
                            content = None
                        headers = dict(result.headers)
                    else:
                        content = jsonable_encoder(result)
                    
                    # Eliminar headers conflictivos
                    safe_headers = {k: v for k, v in headers.items() if k.lower() not in ("content-length", "set-cookie")}
                    
                    cache_payload = {
                        "status_code": status_code,
                        "content": content,
                        "headers": safe_headers
                    }
                    await redis_client.set(redis_key, json.dumps(cache_payload), ex=86400)
                except Exception as redis_save_err:
                    logger.warning(f"No se pudo guardar respuesta en Redis (fail-open): {redis_save_err}")
            
            return result
            
        except Exception as e:
            if isinstance(e, HTTPException):
                if e.status_code != 409 and not redis_failed:
                    try:
                        await redis_client.delete(redis_key)
                    except Exception:
                        pass
                raise e
            
            if not redis_failed:
                try:
                    await redis_client.delete(redis_key)
                except Exception:
                    pass
            raise e

    return wrapper
