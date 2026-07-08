import uuid
import logging
from decimal import Decimal
from typing import Literal
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user
from routers.ledger_router import event_buffer, KodaEventInternal, AggregateType, EventSeverity, EventMetadata

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/api/v1/nomina", tags=["Nómina"])

class PagoCreate(BaseModel):
    empleado_id: uuid.UUID
    monto_neto: Decimal = Field(..., gt=0)
    concepto: str = Field(..., min_length=3, max_length=250)
    moneda: Literal['VED', 'USD']

class PagoResponse(BaseModel):
    pago_id: uuid.UUID
    empleado_id: uuid.UUID
    monto_neto: float
    concepto: str
    moneda: str
    creado_en: datetime
    status: str = "procesado"

@router.post(
    "/aprobar-pago",
    response_model=PagoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Aprobar Pago de Nómina",
    description="Inserta el recibo de nómina de forma transaccional y registra el evento en el Ledger inmutable."
)
async def aprobar_pago(
    body: PagoCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id_str = current_user.get("sub")
    tenant_id_str = current_user.get("tenant_id")
    
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token no contiene un tenant_id válido."
        )
        
    try:
        actor_id = uuid.UUID(user_id_str) if user_id_str else uuid.UUID(int=0)
        tenant_id = uuid.UUID(tenant_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ID de usuario o inquilino no es un UUID válido."
        )

    # Convert body.empleado_id (UUID) to integer ID (as defined in existing empleados table)
    # The frontend generates UUIDs format: 00000000-0000-0000-0000-[12 digit padded ID]
    try:
        empleado_id_int = int(body.empleado_id.hex[-12:])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ID del empleado no se pudo procesar a un ID entero válido."
        )

    # 1. Obtener la gerencia_id del empleado
    try:
        row_empleado = await conn.fetchrow(
            """
            SELECT gerencia_id 
            FROM empleados 
            WHERE id = $1 AND tenant_id = $2
            """,
            empleado_id_int,
            tenant_id
        )
        if not row_empleado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Empleado con ID {body.empleado_id} no encontrado en este tenant."
            )
        empleado_gerencia_id = row_empleado["gerencia_id"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al verificar empleado: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar base de datos de empleados: {str(e)}"
        )

    # 2. Inserción Transaccional en Base de Datos
    pago_id = uuid.uuid4()
    creado_en = datetime.utcnow()
    
    try:
        async with conn.transaction():
            # Configurar tenant en RLS
            await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id))
            
            # Insertar recibo de nómina
            await conn.execute(
                """
                INSERT INTO recibos_nomina (
                    id, tenant_id, empleado_id, monto_neto, concepto, moneda, creado_por, creado_en
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                pago_id,
                tenant_id,
                empleado_id_int,
                body.monto_neto,
                body.concepto,
                body.moneda,
                actor_id,
                creado_en
            )
    except Exception as e_db:
        logger.exception("Error en transacción de registro de pago de nómina")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error de base de datos al registrar el pago de nómina: {str(e_db)}"
        )

    # 3. Inyección Forense en la Sombra (Fire-and-Forget / Aislado)
    try:
        evento_nomina = KodaEventInternal(
            event_type="nomina.pago_aprobado",
            aggregate_type=AggregateType.nomina,
            aggregate_id=str(pago_id),
            gerencia_id=empleado_gerencia_id,
            actor_id=actor_id,
            tenant_id=tenant_id,
            payload={
                "empleado_uuid": str(body.empleado_id),
                "monto_pagado": float(body.monto_neto),
                "concepto": body.concepto,
                "moneda_pago": body.moneda
            },
            severity=EventSeverity.info,
            metadata=EventMetadata(
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent")
            )
        )
        evento_nomina.idempotency_key = evento_nomina.compute_idempotency_key()
        await event_buffer.enqueue(evento_nomina)
    except Exception as e_event:
        logger.error(f"Error crítico aislando telemetría de nómina: {e_event}")

    return PagoResponse(
        pago_id=pago_id,
        empleado_id=body.empleado_id,
        monto_neto=float(body.monto_neto),
        concepto=body.concepto,
        moneda=body.moneda,
        creado_en=creado_en
    )
