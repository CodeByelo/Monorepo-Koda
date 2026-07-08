from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_user, require_role
from backend.models.core import Profile, TasaCambio
from backend.models.hr import RHConcept, RHEmployee, RHPayrollDetail, RHPayrollPeriod, Nomina
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.schemas.payroll import (
    ConceptCreate,
    ConceptResponse,
    EmployeeResponse,
    EmployeeUpdate,
    PayrollDetailBulkSave,
    PayrollDetailResponse,
    PayrollPeriodCreate,
    PayrollPeriodResponse,
    PrePayrollProcessEmployeeItem,
    PrePayrollProcessResponse,
)

router = APIRouter(prefix="/payroll", tags=["Nómina Dinámica"])
TWO_PLACES = Decimal("0.01")


def _round_money(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _require_tenant(current_user):
    if not getattr(current_user, "tenant_id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="El usuario no tiene tenant activo.")
    return current_user.tenant_id


def _get_period_or_404(db: Session, period_id: int) -> RHPayrollPeriod:
    period = db.query(RHPayrollPeriod).filter(RHPayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Período de nómina no encontrado.")
    return period


def _profile_full_name(profile: Profile) -> str:
    name = " ".join(part for part in [profile.nombre, getattr(profile, "apellido", None)] if part)
    return name or profile.username or profile.email or str(profile.id)


def _sync_profile_employees(db: Session, current_user) -> None:
    tenant_id = _require_tenant(current_user)
    profiles = (
        db.query(Profile)
        .filter(Profile.tenant_id == tenant_id, Profile.estado.is_(True))
        .order_by(Profile.nombre.asc().nullslast(), Profile.email.asc().nullslast())
        .all()
    )
    profile_ids = [profile.id for profile in profiles]

    if profile_ids:
        deleted = (
            db.query(RHEmployee)
            .filter(RHEmployee.tenant_id == tenant_id, RHEmployee.id.notin_(profile_ids))
            .delete(synchronize_session=False)
        )
    else:
        deleted = db.query(RHEmployee).filter(RHEmployee.tenant_id == tenant_id).delete(synchronize_session=False)

    changed = deleted > 0
    for profile in profiles:
        employee = (
            db.query(RHEmployee)
            .filter(RHEmployee.id == profile.id, RHEmployee.tenant_id == tenant_id)
            .first()
        )
        next_name = _profile_full_name(profile)
        next_cargo = profile.rol
        if employee:
            if employee.nombres != next_name:
                employee.nombres = next_name
                changed = True
            if employee.cargo != next_cargo:
                employee.cargo = next_cargo
                changed = True
            if employee.status != "activo":
                employee.status = "activo"
                changed = True
            continue

        created_at = getattr(profile, "created_at", None)
        db.add(
            RHEmployee(
                id=profile.id,
                tenant_id=tenant_id,
                cedula=f"USR-{str(profile.id)[:8]}",
                nombres=next_name,
                cargo=next_cargo,
                fecha_ingreso=created_at.date() if created_at else date.today(),
                sueldo_base_mensual=Decimal("0.00"),
                tipo_cuenta_bancaria="SIN DEFINIR",
                numero_cuenta="SIN DEFINIR",
                status="activo",
            )
        )
        changed = True

    if changed:
        db.commit()


@router.get("/employees", response_model=List[EmployeeResponse])
def list_employees(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _sync_profile_employees(db, current_user)
    return (
        db.query(RHEmployee)
        .join(Profile, RHEmployee.id == Profile.id)
        .filter(
            RHEmployee.tenant_id == _require_tenant(current_user),
            RHEmployee.status == "activo",
            Profile.tenant_id == _require_tenant(current_user),
            Profile.estado.is_(True),
        )
        .order_by(RHEmployee.nombres.asc())
        .all()
    )


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    tenant_id = _require_tenant(current_user)
    employee = db.query(RHEmployee).filter(
        RHEmployee.id == employee_id,
        RHEmployee.tenant_id == tenant_id
    ).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Empleado no encontrado.")
        
    employee.sueldo_base_mensual = payload.sueldo_base_mensual
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/concepts", response_model=List[ConceptResponse])
def list_concepts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_tenant(current_user)
    return db.query(RHConcept).order_by(RHConcept.tipo.asc(), RHConcept.nombre.asc()).all()


@router.post("/concepts", response_model=ConceptResponse, status_code=status.HTTP_201_CREATED)
def create_concept(
    concept_in: ConceptCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    _require_tenant(current_user)
    exists = db.query(RHConcept).filter(RHConcept.nombre == concept_in.nombre).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un concepto con ese nombre.")

    concept = RHConcept(**concept_in.model_dump())
    db.add(concept)
    db.commit()
    db.refresh(concept)
    return concept


@router.get("/periods", response_model=List[PayrollPeriodResponse])
def list_periods(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_tenant(current_user)
    return db.query(RHPayrollPeriod).order_by(RHPayrollPeriod.fecha_inicio.desc()).all()


@router.post("/periods", response_model=PayrollPeriodResponse, status_code=status.HTTP_201_CREATED)
def create_period(
    period_in: PayrollPeriodCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    _require_tenant(current_user)
    exists = db.query(RHPayrollPeriod).filter(RHPayrollPeriod.nombre_periodo == period_in.nombre_periodo).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un período con ese nombre.")

    period = RHPayrollPeriod(**period_in.model_dump())
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


@router.get("/details", response_model=List[PayrollDetailResponse])
def list_details(
    period_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_tenant(current_user)
    _get_period_or_404(db, period_id)
    return (
        db.query(RHPayrollDetail)
        .join(RHEmployee, RHPayrollDetail.employee_id == RHEmployee.id)
        .join(Profile, RHEmployee.id == Profile.id)
        .filter(
            RHPayrollDetail.period_id == period_id,
            RHEmployee.tenant_id == _require_tenant(current_user),
            Profile.tenant_id == _require_tenant(current_user),
            Profile.estado.is_(True),
        )
        .all()
    )


@router.post("/details/bulk", response_model=List[PayrollDetailResponse])
def bulk_save_details(
    payload: PayrollDetailBulkSave,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    _require_tenant(current_user)
    _get_period_or_404(db, payload.period_id)

    saved_details: list[RHPayrollDetail] = []
    try:
        for item in payload.details:
            if item.period_id != payload.period_id:
                raise HTTPException(status_code=400, detail="Todos los detalles deben pertenecer al período indicado.")

            employee = (
                db.query(RHEmployee)
                .join(Profile, RHEmployee.id == Profile.id)
                .filter(
                    RHEmployee.id == item.employee_id,
                    RHEmployee.tenant_id == _require_tenant(current_user),
                    RHEmployee.status == "activo",
                    Profile.tenant_id == _require_tenant(current_user),
                    Profile.estado.is_(True),
                )
                .first()
            )
            concept = db.query(RHConcept).filter(RHConcept.id == item.concept_id).first()
            if not employee or not concept:
                raise HTTPException(status_code=404, detail="Empleado o concepto no encontrado.")

            detail = (
                db.query(RHPayrollDetail)
                .filter(
                    RHPayrollDetail.employee_id == item.employee_id,
                    RHPayrollDetail.period_id == item.period_id,
                    RHPayrollDetail.concept_id == item.concept_id,
                )
                .first()
            )
            if detail:
                detail.monto = _round_money(item.monto)
                detail.cantidad_horas_dias = item.cantidad_horas_dias
            else:
                detail = RHPayrollDetail(**item.model_dump())
                detail.monto = _round_money(item.monto)
                db.add(detail)
            saved_details.append(detail)

        db.commit()
        for detail in saved_details:
            db.refresh(detail)
        return saved_details
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"No se pudieron guardar los detalles de nómina: {exc}") from exc


@router.post("/process", response_model=PrePayrollProcessResponse)
def process_pre_payroll(
    period_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    _require_tenant(current_user)
    _sync_profile_employees(db, current_user)
    period = _get_period_or_404(db, period_id)
    employees = (
        db.query(RHEmployee)
        .join(Profile, RHEmployee.id == Profile.id)
        .filter(
            RHEmployee.tenant_id == _require_tenant(current_user),
            RHEmployee.status == "activo",
            Profile.tenant_id == _require_tenant(current_user),
            Profile.estado.is_(True),
        )
        .order_by(RHEmployee.nombres.asc())
        .all()
    )
    if not employees:
        raise HTTPException(status_code=400, detail="No hay empleados activos para calcular la pre-nómina.")

    details = (
        db.query(RHPayrollDetail)
        .join(RHConcept, RHPayrollDetail.concept_id == RHConcept.id)
        .filter(RHPayrollDetail.period_id == period.id)
        .all()
    )
    details_by_employee = {}
    for detail in details:
        details_by_employee.setdefault(detail.employee_id, []).append(detail)

    days = (period.fecha_fin - period.fecha_inicio).days + 1
    is_semimonthly = days <= 16
    period_type = "quincenal" if is_semimonthly else "mensual"

    total_base = Decimal("0.00")
    total_asignaciones = Decimal("0.00")
    total_deducciones = Decimal("0.00")
    total_neto = Decimal("0.00")
    items: list[PrePayrollProcessEmployeeItem] = []

    for employee in employees:
        base = Decimal(str(employee.sueldo_base_mensual))
        base_period = _round_money(base / Decimal("2") if is_semimonthly else base)
        asignaciones = Decimal("0.00")
        deducciones = Decimal("0.00")

        for detail in details_by_employee.get(employee.id, []):
            amount = _round_money(detail.monto)
            if detail.concept.tipo == "asignacion":
                asignaciones += amount
            else:
                deducciones += amount

        neto = _round_money(base_period + asignaciones - deducciones)
        asignaciones = _round_money(asignaciones)
        deducciones = _round_money(deducciones)

        total_base += base_period
        total_asignaciones += asignaciones
        total_deducciones += deducciones
        total_neto += neto

        items.append(
            PrePayrollProcessEmployeeItem(
                employee_id=employee.id,
                cedula=employee.cedula,
                nombres=employee.nombres,
                cargo=employee.cargo,
                sueldo_base=base_period,
                asignaciones=asignaciones,
                deducciones=deducciones,
                neto=neto,
            )
        )

    return PrePayrollProcessResponse(
        period_id=period.id,
        nombre_periodo=period.nombre_periodo,
        dias_periodo=days,
        tipo_periodo=period_type,
        total_base=_round_money(total_base),
        total_asignaciones=_round_money(total_asignaciones),
        total_deducciones=_round_money(total_deducciones),
        total_neto=_round_money(total_neto),
        employees=items,
    )


@router.post("/process/confirm")
def confirm_payroll(
    period_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    tenant_id = _require_tenant(current_user)
    period = _get_period_or_404(db, period_id)
    if period.status == "procesado":
        raise HTTPException(status_code=400, detail="Este período ya fue procesado y contabilizado.")
        
    tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    if not tasa_activa:
        raise HTTPException(status_code=400, detail="Se requiere una Tasa BCV activa para valorizar la nómina.")
    tasa_bs = Decimal(str(tasa_activa.valor_ves))

    report = process_pre_payroll(period_id, db, current_user)
    
    nueva_nomina = Nomina(
        tenant_id=tenant_id,
        periodo=f"{report.tipo_periodo.capitalize()} - {report.nombre_periodo}", 
        total_asignaciones_usd=report.total_base, 
        total_bonos_usd=report.total_asignaciones, 
        total_deducciones_usd=report.total_deducciones,
        total_inces_usd=Decimal("0.00"),
        total_neto_usd=report.total_neto,
        tasa_cambio_bs=tasa_bs
    )
    db.add(nueva_nomina)
    db.flush()
    
    monto_base_bs = (report.total_base * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_asignaciones_bs = (report.total_asignaciones * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_deducciones_bs = (report.total_deducciones * tasa_bs).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_neto_bs = monto_base_bs + monto_asignaciones_bs - monto_deducciones_bs 
    
    asiento = AsientoContable(
        tenant_id=tenant_id,
        concepto=f"Provisión de Nómina Dinámica: {report.nombre_periodo}",
        referencia=f"NOM-{nueva_nomina.id}",
        total_debe=monto_base_bs + monto_asignaciones_bs,
        total_haber=monto_base_bs + monto_asignaciones_bs,
        detalles=[
            AsientoDetalle(cuenta_codigo="6.1.01.01", cuenta_nombre="Sueldos y Salarios Base (Gasto)", debe=monto_base_bs, haber=Decimal("0.00")),
            AsientoDetalle(cuenta_codigo="6.1.01.02", cuenta_nombre="Otras Asignaciones (Gasto)", debe=monto_asignaciones_bs, haber=Decimal("0.00")),
            AsientoDetalle(cuenta_codigo="2.1.02.05", cuenta_nombre="Otras Retenciones por Pagar", debe=Decimal("0.00"), haber=monto_deducciones_bs),
            AsientoDetalle(cuenta_codigo="2.1.02.01", cuenta_nombre="Nómina por Pagar (Sueldo Neto)", debe=Decimal("0.00"), haber=monto_neto_bs)
        ]
    )
    db.add(asiento)
    
    period.status = "procesado"
    db.commit()
    return {"message": "Nómina confirmada exitosamente", "nomina_id": nueva_nomina.id}
