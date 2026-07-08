from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from decimal import Decimal, ROUND_HALF_UP

from backend.core.database import get_db
from backend.models.hr import Empleado, Nomina
from backend.schemas.hr import NominaResponse
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.core import TasaCambio
from backend.core.security import require_role

router = APIRouter(prefix="/rrhh", tags=["Recursos Humanos y Nómina"])

@router.post("/nomina/procesar", response_model=NominaResponse, status_code=status.HTTP_201_CREATED)
def procesar_nomina_quincenal(
    periodo: str = "Quincena Actual",
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"]))
):
    """
    Genera el lote de nómina calculando el Sueldo Bruto, Deducciones de Ley (IVSS 4%, FAOV 1%)
    y el Sueldo Neto. Genera el Asiento Contable Automático valorizado a la tasa del día.
    """
    empleados = db.query(Empleado).filter(Empleado.activo == 1).all()
    if not empleados:
        raise HTTPException(status_code=400, detail="No hay empleados activos para procesar.")
        
    tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    if not tasa_activa:
        raise HTTPException(status_code=400, detail="Se requiere una Tasa BCV activa para valorizar la nómina.")
        
    tasa_bs = Decimal(str(tasa_activa.valor_ves))
    
    total_asignaciones_usd = Decimal("0.00")
    total_bonos_usd = Decimal("0.00")
    total_ivss_usd = Decimal("0.00")
    total_faov_usd = Decimal("0.00")
    
    for emp in empleados:
        # Calculo de Asignaciones (Salario Base Quincenal)
        salario_quincenal = (Decimal(str(emp.salario_base_usd)) / Decimal("2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        bono_quincenal = (Decimal(str(emp.bono_alimentacion_usd)) / Decimal("2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
        # Calculo de Retenciones Legales de Empleado (Mensualizado prorrateado a la quincena)
        ivss = (salario_quincenal * Decimal("0.04")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        faov = (salario_quincenal * Decimal("0.01")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
        total_asignaciones_usd += salario_quincenal
        total_bonos_usd += bono_quincenal
        total_ivss_usd += ivss
        total_faov_usd += faov
        
    total_deducciones_usd = total_ivss_usd + total_faov_usd
    total_inces_usd = (total_asignaciones_usd * Decimal("0.02")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total_neto_usd = total_asignaciones_usd + total_bonos_usd - total_deducciones_usd
    
    # 1. Crear el registro maestro de la Nómina
    nueva_nomina = Nomina(
        periodo=periodo, 
        total_asignaciones_usd=total_asignaciones_usd,
        total_bonos_usd=total_bonos_usd,
        total_deducciones_usd=total_deducciones_usd,
        total_inces_usd=total_inces_usd,
        total_neto_usd=total_neto_usd,
        tasa_cambio_bs=tasa_bs
    )
    db.add(nueva_nomina)
    db.flush() # Flush para obtener el ID de la nómina
    
    # 2. INTEGRACIÓN CONTABLE PERFECTA EN BOLÍVARES (Libro Diario)
    monto_asignaciones_bs = (total_asignaciones_usd * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_bonos_bs = (total_bonos_usd * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_ivss_bs = (total_ivss_usd * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_faov_bs = (total_faov_usd * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_inces_bs = (total_inces_usd * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    # Usamos resta en Bolívares para asegurar que el asiento cuadre matemáticamente
    monto_neto_bs = monto_asignaciones_bs + monto_bonos_bs - monto_ivss_bs - monto_faov_bs 
    
    asiento = AsientoContable(
        concepto=f"Provisión de Nómina, Retenciones e INCES Patronal: {periodo}",
        referencia=f"NOM-{nueva_nomina.id}",
        total_debe=monto_asignaciones_bs + monto_bonos_bs + monto_inces_bs,
        total_haber=monto_asignaciones_bs + monto_bonos_bs + monto_inces_bs,
        detalles=[
            AsientoDetalle(cuenta_codigo="6.1.01.01", cuenta_nombre="Sueldos y Salarios (Gasto)", debe=monto_asignaciones_bs, haber=Decimal("0.00")),
            AsientoDetalle(cuenta_codigo="6.1.01.02", cuenta_nombre="Bono de Alimentación (Gasto)", debe=monto_bonos_bs, haber=Decimal("0.00")),
            AsientoDetalle(cuenta_codigo="6.1.01.03", cuenta_nombre="Aportes INCES (Gasto Patronal)", debe=monto_inces_bs, haber=Decimal("0.00")),
            AsientoDetalle(cuenta_codigo="2.1.02.02", cuenta_nombre="Retenciones S.S.O. por Pagar", debe=Decimal("0.00"), haber=monto_ivss_bs),
            AsientoDetalle(cuenta_codigo="2.1.02.03", cuenta_nombre="Retenciones F.A.O.V. por Pagar", debe=Decimal("0.00"), haber=monto_faov_bs),
            AsientoDetalle(cuenta_codigo="2.1.02.04", cuenta_nombre="Aportes INCES por Pagar", debe=Decimal("0.00"), haber=monto_inces_bs),
            AsientoDetalle(cuenta_codigo="2.1.02.01", cuenta_nombre="Nómina por Pagar (Sueldo Neto)", debe=Decimal("0.00"), haber=monto_neto_bs)
        ]
    )
    db.add(asiento)
    db.commit()
    db.refresh(nueva_nomina)
    return nueva_nomina