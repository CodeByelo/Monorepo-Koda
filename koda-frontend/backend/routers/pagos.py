from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from decimal import Decimal

# Importar dependencias de base de datos
from backend.core.database import get_db

# Importar el helper de idempotencia
from backend.utils.idempotency import require_idempotency


# Importar modelos requeridos desde erp_extended
from backend.models.erp_extended import (
    CuentaPorCobrar,
    MovimientoBancario,
    CuentaBancaria
)

# Importar el servicio contable
from backend.services.contabilidad import ContabilidadService


from backend.core.security import get_current_user

router = APIRouter(
    prefix="/pagos",
    tags=["Pagos"],
    dependencies=[Depends(get_current_user)]
)

class PagoRegistroRequest(BaseModel):
    cliente_id: int
    monto_pagado_usd: Decimal
    tasa_cambio_bs: Decimal
    cuenta_bancaria_id: int
    referencia: str

@router.post("/registrar", status_code=status.HTTP_200_OK)
@require_idempotency
def registrar_pago(request: Request, pago: PagoRegistroRequest, db: Session = Depends(get_db)):
    """
    Registra un pago de cliente, liquida sus Cuentas por Cobrar (CxC) pendientes
    y crea el movimiento bancario correspondiente.
    """
    # 1. Validación inicial
    if pago.monto_pagado_usd <= 0:
        raise HTTPException(status_code=400, detail="El monto del pago debe ser mayor a 0.")

    try:
        # 2. Buscar la cuenta bancaria para validar su existencia
        cuenta_bancaria = db.query(CuentaBancaria).filter(CuentaBancaria.id == pago.cuenta_bancaria_id).first()
        if not cuenta_bancaria:
            raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")

        # 3. Buscar cuentas por cobrar PENDIENTES del cliente (más antiguas primero)
        cuentas_pendientes = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.cliente_id == pago.cliente_id,
            CuentaPorCobrar.estado == "PENDIENTE"
        ).order_by(CuentaPorCobrar.fecha_emision.asc()).all()

        monto_restante = pago.monto_pagado_usd

        # 4. Aplicar el pago a las CxC
        for cxc in cuentas_pendientes:
            if monto_restante <= 0:
                break
                
            saldo_cxc = cxc.monto_total_usd - cxc.monto_pagado_usd
            
            if monto_restante >= saldo_cxc:
                # Se paga completa esta CxC
                cxc.monto_pagado_usd += saldo_cxc
                cxc.estado = "PAGADA"
                monto_restante -= saldo_cxc
            else:
                # Se abona parcialmente
                cxc.monto_pagado_usd += monto_restante
                monto_restante = Decimal('0.00')

        # 5. Registrar el Movimiento Bancario (INGRESO)
        nuevo_movimiento = MovimientoBancario(
            cuenta_id=pago.cuenta_bancaria_id,
            concepto=f"Pago de CxC - Cliente {pago.cliente_id} - Ref: {pago.referencia}",
            monto_usd=pago.monto_pagado_usd,
            tasa_cambio_bs=pago.tasa_cambio_bs,
            tipo="INGRESO",
            referencia=pago.referencia,
            estado="ACTIVO"
        )
        db.add(nuevo_movimiento)

        # 6. Actualizar el saldo de la cuenta bancaria
        cuenta_bancaria.saldo_actual_usd += pago.monto_pagado_usd

        # 7. Generar Asiento Contable Automático para el Pago
        ContabilidadService.generar_asiento_pago(pago, db)

        # Confirmar la transacción
        db.commit()

        return {
            "mensaje": "Pago registrado exitosamente",
            "monto_aplicado": pago.monto_pagado_usd,
            "monto_sobrante_no_aplicado": monto_restante
        }

    except HTTPException as http_exc:
        db.rollback()
        raise http_exc
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al procesar el pago: {str(e)}"
        )
