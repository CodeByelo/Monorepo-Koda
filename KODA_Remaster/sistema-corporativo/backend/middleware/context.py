from contextvars import ContextVar
from fastapi import Request
from jose import jwt
import os
import logging

logger = logging.getLogger("sistema_corporativo")

# Contextvars
tenant_id_var: ContextVar[str] = ContextVar("tenant_id", default=None)
user_id_var: ContextVar[str] = ContextVar("user_id", default=None)
user_role_var: ContextVar[str] = ContextVar("user_role", default=None)
trace_id_var: ContextVar[str] = ContextVar("trace_id", default=None)

def get_current_tenant_id():
    return tenant_id_var.get()

def get_current_user_id():
    return user_id_var.get()

def get_current_user_role():
    return user_role_var.get()

def get_current_trace_id():
    return trace_id_var.get()

async def extract_user_from_token(request: Request):
    """
    Función de extracción robusta para asegurar que el tenant_id 
    llegue al contexto de sesión de la base de datos.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, None, None
    
    token = auth_header.split(" ")[1]
    # Sincronizado con auth/security.py
    secret_key = os.getenv("JWT_SECRET", "tu_clave_secreta_muy_segura_cambiala_en_produccion")
    
    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        role = payload.get("role") or payload.get("rol")
        logger.info(f"🔑 user_id extraído: {user_id}, role: {role}")
        return user_id, payload.get("tenant_id"), role
    except Exception as e:
        logger.error(f"Error decodificando JWT: {e}")
        return None, None, None
