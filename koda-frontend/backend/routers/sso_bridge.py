"""
routers/sso_bridge.py
───────────────────────
Puente de SSO real entre KODA_Remaster/sistema-corporativo/backend (el
sistema institucional donde el usuario ya inició sesión) y este backend
(koda-frontend, el ERP). Antes de este endpoint, el iframe del "Módulo de
Facturación" en frontend-enterprise (BillingModule.tsx) cargaba
koda-frontend SIN ningún token ni código de sesión, por lo que
`ProtectedRoute` (koda-frontend/src/App.tsx) mostraba "Acceso Restringido"
a CUALQUIER usuario, sin importar su rol.

Flujo completo:
1. El usuario ya está autenticado en KODA_Remaster (JWT propio de ESE
   backend). KODA_Remaster y este backend leen la MISMA tabla física
   `profiles` en la misma base Postgres de Supabase — no son identidades
   separadas, es la misma fila de usuario en ambos sistemas.
2. KODA_Remaster expone GET /auth/koda-frontend/exchange-code (protegido
   por SU propia sesión de usuario), que internamente llama a ESTE
   endpoint pasando el `profile_id` ya extraído y validado del JWT de esa
   sesión — nunca un valor que el cliente pudiera manipular.
3. Este endpoint verifica que ese `profile_id` exista, esté activo y
   pertenezca a un tenant válido en la tabla `profiles` de ESTE backend
   (no todos los tenants institucionales tienen el ERP provisionado), y
   emite un exchange_code de un solo uso REUTILIZANDO exactamente el mismo
   mecanismo que ya usa POST /auth/exchange-code (ver
   `routers/auth.py::issue_exchange_code`) — no se inventa un segundo
   sistema de códigos paralelo.
4. frontend-enterprise redirige el iframe a
   `{koda-frontend}?exchange_code=...`, que `AuthProvider.tsx` ya sabe
   consumir contra POST /api/auth/exchange (mecanismo preexistente, sin
   cambios en este trabajo).

Protegido por una clave compartida NUEVA y de mínimo privilegio
(`SSO_BRIDGE_INTERNAL_KEY`, header `X-SSO-Bridge-Key`, ver
`backend.core.security.verify_sso_bridge_key`), DISTINTA de
BOT_INTERNAL_API_KEY/ORG_SYNC_API_KEY: este endpoint mintea sesiones reales
del ERP — se trata con el mismo cuidado que un endpoint de login, nunca se
combina con `get_current_user`/JWT de usuario.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import verify_sso_bridge_key
from backend.models.core import Profile, Tenant
from backend.routers.auth import issue_exchange_code

router = APIRouter(
    prefix="/internal/auth/sso-bridge",
    tags=["SSO Bridge (service-to-service)"],
    dependencies=[Depends(verify_sso_bridge_key)],
)


class SsoBridgeIssueRequest(BaseModel):
    profile_id: str


@router.post("/issue")
def issue_sso_bridge_code(payload: SsoBridgeIssueRequest, db: Session = Depends(get_db)):
    """
    Emite un exchange_code de un solo uso (30s, consumible exactamente una
    vez) para `profile_id`, invocado EXCLUSIVAMENTE por
    KODA_Remaster/sistema-corporativo/backend — nunca directamente por un
    navegador. El `profile_id` ya fue validado del lado de KODA_Remaster
    contra el JWT de sesión de ESE backend; aquí solamente se confirma que
    la MISMA fila de `profiles` (ambos backends comparten la base de datos
    física) existe, está activa y pertenece a un tenant real en ESTE
    backend.

    Nota deliberada: no se registra el `profile_id` ni el `exchange_code`
    en logs de nivel INFO — mismo criterio que el resto de identificadores
    sensibles de este backend (ver `services/auth.py`, que solo los expone
    a nivel DEBUG, nunca en producción).
    """
    try:
        profile_uuid = uuid.UUID(str(payload.profile_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="profile_id inválido: debe ser un UUID.")

    user = db.query(Profile).filter(Profile.id == profile_uuid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este usuario no tiene una cuenta provisionada en el ERP (Módulo de Facturación).",
        )

    # Nota: el sistema corporativo (KODA_Remaster) define `estado` como BOOLEAN
    # (TRUE/FALSE) en la MISMA tabla `profiles`, mientras que este backend lo
    # modela como Integer (1/0). Usar `not user.estado` es compatible con ambos
    # tipos: FALSE, 0 y None evalúan como inactivo.
    if not user.estado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La cuenta de este usuario en el ERP se encuentra inactiva.",
        )

    if not user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este usuario no tiene una empresa (tenant) asociada en el ERP.",
        )

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        # Si la empresa fue creada en el sistema corporativo pero aún no tiene fila en `tenants`,
        # la auto-provisionamos como ACTIVA para garantizar acceso sin fricción.
        tenant = Tenant(
            id=user.tenant_id,
            nombre_empresa=getattr(user, "nombre_empresa", None) or "Empresa KODA ERP",
            estado_licencia="ACTIVA"
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
    elif tenant.estado_licencia != "ACTIVA":
        tenant.estado_licencia = "ACTIVA"
        db.commit()

    exchange_code = issue_exchange_code(user.id, db)
    return {"exchange_code": exchange_code}
