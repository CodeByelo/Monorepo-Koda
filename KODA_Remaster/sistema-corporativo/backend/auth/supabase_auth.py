import os
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from typing import Optional

# CONFIGURACIÓN JWT (Heredada del main)
# JWT_SECRET es obligatorio: sin fallback hardcodeado. Falla al importar si falta o es débil.
SECRET_KEY = os.getenv("JWT_SECRET", "")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET no configurado o inseguro: debe definirse como variable de entorno "
        "con un valor de al menos 32 caracteres. No existe valor por defecto."
    )
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)


def _extract_token(request: Request, bearer_token: Optional[str]) -> Optional[str]:
    """
    Extrae el token JWT con la siguiente prioridad:
    1. Cookie httpOnly 'sgd_token' (más segura, no accesible por JS)
    2. Header 'Authorization: Bearer <token>' (fallback para APIs externas)
    """
    # 1. Cookie httpOnly (prioridad máxima)
    cookie_token = request.cookies.get("sgd_token")
    if cookie_token:
        return cookie_token

    # 2. Bearer token del header (vía oauth2_scheme o manual)
    if bearer_token:
        return bearer_token

    # 3. Header manual (para clientes que no usen el esquema OAuth2)
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return None


async def get_current_user(request: Request, token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    resolved_token = _extract_token(request, token)
    if not resolved_token:
        raise credentials_exception

    try:
        payload = jwt.decode(resolved_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        
        # Ensure 'role' is always present in payload as fallback for 'rol'
        if "role" not in payload and "rol" in payload:
            payload["role"] = payload["rol"]
            
        return payload
    except JWTError:
        raise credentials_exception
    except Exception:
        raise credentials_exception
