from fastapi import Request, HTTPException
from middleware.context import tenant_id_var, user_id_var, user_role_var, trace_id_var, extract_user_from_token
import uuid
import logging

logger = logging.getLogger("sistema_corporativo")

async def get_tenant_context(request: Request):
    """
    Middleware definitivo para asegurar que tenant_id y user_id
    estén disponibles en el hilo actual de ejecución.
    """
    user_id, tenant_id, role = await extract_user_from_token(request)

    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido o ausente")
    
    # Establecer variables de contexto (Thread-local para FastAPI)
    u_token = user_id_var.set(user_id)
    t_token = tenant_id_var.set(tenant_id)
    r_token = user_role_var.set(role)
    tr_token = trace_id_var.set(str(uuid.uuid4()))
    
    # Adjuntar a la request para fácil acceso en controladores
    request.state.user_id = user_id
    request.state.tenant_id = tenant_id
    request.state.user_role = role
    
    logger.info(f"Contexto establecido: User={user_id}, Tenant={tenant_id}, Role={role}")
    
    return request
