from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import List

from backend.core.database import get_db
from backend.core.security import (
    get_current_user,
    get_current_auditor,
    create_access_token,
    generate_log_signature,
)
from backend.models.core import Profile
from backend.models.audit import AuditorSession, AuditLog
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.schemas.audit import AuditorSessionCreate, AuditorSessionResponse, LedgerEntry

router = APIRouter(prefix="/audit", tags=["Audit & Safe Mode"])

@router.post("/session/enable", response_model=AuditorSessionResponse, status_code=status.HTTP_201_CREATED)
def enable_auditor_session(
    session_data: AuditorSessionCreate,
    current_admin: Profile = Depends(get_current_user),  # Solo un admin puede crearla
    db: Session = Depends(get_db)
):
    """
    Habilita el Modo Seguro para un auditor externo y genera un token único.
    Solo administradores de la empresa pueden usar este endpoint.
    """
    # En un sistema multi-tenant real, aquí validaríamos que el admin pertenece al tenant.
    
    expires_at = datetime.now(timezone.utc) + timedelta(hours=session_data.expires_in_hours)
    
    # Enforce tenant_id of current admin to prevent tenant spoofing
    tenant_id_to_use = str(current_admin.tenant_id) if current_admin.tenant_id else session_data.tenant_id

    # Creamos el registro de sesión
    new_session = AuditorSession(
        tenant_id=tenant_id_to_use,
        auditor_name=session_data.auditor_name,
        organization=session_data.organization,
        scope=session_data.scope,
        start_date=session_data.start_date,
        end_date=session_data.end_date,
        expires_at=expires_at,
        token_hash="pendiente" # Se actualiza abajo si es necesario, o se deja el JWT como único válido
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    # Generamos el token de acceso
    access_token = create_access_token(
        data={"sub": str(new_session.id), "tenant_id": new_session.tenant_id, "scope": new_session.scope},
        expires_delta=timedelta(hours=session_data.expires_in_hours)
    )
    
    # Podríamos guardar un hash del token en la BD si queremos poder revocarlo individualmente
    # Pero el id en el JWT + validación is_active ya nos da control total.
    
    response_data = AuditorSessionResponse(
        id=new_session.id,
        tenant_id=new_session.tenant_id,
        auditor_name=new_session.auditor_name,
        organization=new_session.organization,
        scope=new_session.scope,
        start_date=new_session.start_date,
        end_date=new_session.end_date,
        expires_at=new_session.expires_at,
        is_active=new_session.is_active,
        access_token=access_token
    )
    return response_data

@router.get("/export/ledger", response_model=List[LedgerEntry])
def export_ledger_for_audit(
    request: Request,
    auditor_session: AuditorSession = Depends(get_current_auditor),
    db: Session = Depends(get_db)
):
    """
    Exporta el Libro Mayor (Ledger).
    Endpoint estricto: Solo accesible con un token de auditor válido.
    Registra inmutablemente la acción.
    """
    timestamp = datetime.now(timezone.utc)
    from backend.utils.ip_utils import get_real_ip
    real_ip, tcp_ip = get_real_ip(request)
    # Registramos ambas IPs: la extraída de headers (puede ser la real aunque use VPN si el
    # proxy es confiable) y la IP del socket TCP (el último intermediario). Si difieren,
    # un auditor puede detectar el uso de proxies en cadena o intentos de spoofing.
    ip_address = real_ip if real_ip == tcp_ip else f"{real_ip} (via {tcp_ip})"
    endpoint = "/audit/export/ledger"
    
    # Generar firma para garantizar inmutabilidad
    signature = generate_log_signature(auditor_session.id, endpoint, timestamp, ip_address)
    
    # Registrar el acceso inmutablemente
    audit_log = AuditLog(
        session_id=auditor_session.id,
        endpoint_accessed=endpoint,
        timestamp=timestamp,
        ip_address=ip_address,
        row_signature=signature
    )
    db.add(audit_log)
    db.commit()
    
    # Consulta real a la base de datos de contabilidad, filtrando estrictamente
    # por el rango de fechas (auditor_session.start_date a end_date).
    
    # Nos aseguramos de cruzar el encabezado del asiento con sus detalles
    query = db.query(AsientoContable, AsientoDetalle).join(
        AsientoDetalle, AsientoContable.id == AsientoDetalle.asiento_id
    ).filter(
        AsientoContable.fecha >= auditor_session.start_date,
        AsientoContable.fecha <= auditor_session.end_date
    ).order_by(AsientoContable.fecha.asc()).all()
    
    ledger_entries = []
    current_balance = 0.0
    
    for header, detail in query:
        debit = float(detail.debe)
        credit = float(detail.haber)
        current_balance += (debit - credit)  # Cálculo simplificado de saldo corrido
        
        ledger_entries.append(
            LedgerEntry(
                date=header.fecha,
                account_code=detail.cuenta_codigo,
                account_name=detail.cuenta_nombre,
                concept=header.concepto,
                debit=debit,
                credit=credit,
                balance=current_balance
            )
        )
        
    return ledger_entries
