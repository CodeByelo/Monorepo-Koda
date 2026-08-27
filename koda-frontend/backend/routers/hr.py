import calendar
import re
from datetime import date, datetime, timezone

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

_MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}


def _derivar_rango_periodo(periodo: str) -> tuple[date, date]:
    """Deriva fecha_inicio/fecha_fin reales a partir del string libre `periodo`
    (ej. "Quincena 1 - Mayo 2026"). Si el texto no trae quincena+mes+año
    reconocibles (ej. el default "Quincena Actual"), se usa la quincena
    calendario vigente hoy como aproximación razonable. Este rango es el que
    se compara con routers/payroll.py (que ya tiene fechas exactas vía
    RHPayrollPeriod) para detectar solapamientos entre los dos motores.
    """
    texto = periodo.lower()
    quincena_match = re.search(r"quincena\s*(1|2)", texto)
    year_match = re.search(r"(20\d{2})", texto)
    mes_num = None
    for nombre, numero in _MESES_ES.items():
        if nombre in texto:
            mes_num = numero
            break

    if quincena_match and year_match and mes_num:
        quincena_num = int(quincena_match.group(1))
        year = int(year_match.group(1))
        if quincena_num == 1:
            return date(year, mes_num, 1), date(year, mes_num, 15)
        ultimo_dia = calendar.monthrange(year, mes_num)[1]
        return date(year, mes_num, 16), date(year, mes_num, ultimo_dia)

    # Fallback: no se pudo parsear el texto libre -> se usa la quincena
    # calendario vigente (hoy) como rango real y consistente.
    hoy = datetime.now(timezone.utc).date()
    if hoy.day <= 15:
        return date(hoy.year, hoy.month, 1), date(hoy.year, hoy.month, 15)
    ultimo_dia = calendar.monthrange(hoy.year, hoy.month)[1]
    return date(hoy.year, hoy.month, 16), date(hoy.year, hoy.month, ultimo_dia)


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
    fecha_inicio, fecha_fin = _derivar_rango_periodo(periodo)

    # GUARD: este backend tiene DOS motores de nómina independientes y paralelos
    # (este endpoint y routers/payroll.py POST /payroll/process/confirm) que pueden
    # generar, cada uno por su cuenta, una fila de Nomina + AsientoContable para el
    # mismo tenant/período, arriesgando doble contabilización silenciosa. Ambos
    # motores pueblan fecha_inicio/fecha_fin en la MISMA tabla `nominas`, así que
    # consultamos aquí esa tabla compartida para detectar si el OTRO motor (o este
    # mismo) ya procesó un período que se solapa con el actual.
    solapamiento = db.query(Nomina).filter(
        Nomina.tenant_id == current_user.tenant_id,
        Nomina.fecha_inicio.isnot(None),
        Nomina.fecha_fin.isnot(None),
        Nomina.fecha_inicio <= fecha_fin,
        Nomina.fecha_fin >= fecha_inicio,
    ).first()
    if solapamiento:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una nómina procesada para este período en el sistema. Verifique antes de continuar.",
        )

    empleados = db.query(Empleado).filter(
        Empleado.activo == 1,
        Empleado.tenant_id == current_user.tenant_id,
    ).all()
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
        tenant_id=current_user.tenant_id,
        periodo=periodo,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
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
        tenant_id=current_user.tenant_id,
        concepto=f"Provisión de Nómina, Retenciones e INCES Patronal: {periodo}",
        referencia=f"NOM-{nueva_nomina.id}",
        tasa_cambio_bs=tasa_bs,
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