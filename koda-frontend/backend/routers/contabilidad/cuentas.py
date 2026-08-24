from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.core.database import get_db
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.erp_extended import CuentaContable
from backend.core.security import get_current_user

router = APIRouter()

PLAN_CUENTAS_DEFAULT = [
    ("1", "ACTIVO", "ACTIVO", 1),
    ("1.1", "ACTIVO CORRIENTE", "ACTIVO", 2),
    ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
    ("1.1.02", "Cuentas por Cobrar Comerciales", "ACTIVO", 3),
    ("1.1.03", "Inventario de Mercancía", "ACTIVO", 3),
    ("1.1.04", "IVA Crédito Fiscal", "ACTIVO", 3),
    ("1.1.05", "Anticipo de Retención de IVA", "ACTIVO", 3),
    ("2", "PASIVO", "PASIVO", 1),
    ("2.1", "PASIVO CORRIENTE", "PASIVO", 2),
    ("2.1.01", "Cuentas por Pagar Comerciales", "PASIVO", 3),
    ("2.1.02", "IVA Débito Fiscal por Pagar", "PASIVO", 3),
    ("2.1.03", "IGTF por Pagar", "PASIVO", 3),
    ("2.1.04", "Nómina por Pagar", "PASIVO", 3),
    ("2.1.05", "Otras Retenciones por Pagar", "PASIVO", 3),
    ("3", "PATRIMONIO", "PATRIMONIO", 1),
    ("3.1", "PATRIMONIO NETO", "PATRIMONIO", 2),
    ("3.1.01", "Capital Social", "PATRIMONIO", 3),
    ("4", "INGRESOS", "INGRESO", 1),
    ("4.1", "INGRESOS OPERACIONALES", "INGRESO", 2),
    ("4.1.01", "Ventas de Mercancía", "INGRESO", 3),
    ("5", "EGRESOS / GASTOS", "EGRESO", 1),
    ("5.1", "COSTOS Y GASTOS OPERACIONALES", "EGRESO", 2),
    ("5.1.01", "Costo de Ventas", "EGRESO", 3),
    ("5.1.02", "Sueldos y Salarios Base (Gasto)", "EGRESO", 3),
    ("5.1.03", "Otras Asignaciones (Gasto)", "EGRESO", 3),
    ("5.1.04", "Gastos por Mermas y Faltantes", "EGRESO", 3),
    ("5.1.05", "Resultado por Exposición a la Inflación (REI)", "EGRESO", 3),
]


def _seed_cuentas(db: Session, tenant_id):
    for codigo, nombre, tipo, nivel in PLAN_CUENTAS_DEFAULT:
        existing = db.query(CuentaContable).filter(
            CuentaContable.codigo == codigo,
            CuentaContable.tenant_id == tenant_id
        ).first()
        if not existing:
            db.add(CuentaContable(codigo=codigo, nombre=nombre, tipo=tipo, nivel=nivel, activa=True, tenant_id=tenant_id))
    db.commit()


@router.get("/cuentas")
def listar_cuentas(activas: Optional[bool] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    q = db.query(CuentaContable).filter(CuentaContable.tenant_id == current_user.tenant_id)
    if activas:
        q = q.filter(CuentaContable.activa == True)
    return q.order_by(CuentaContable.codigo).all()


class CuentaUpdate(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    naturaleza: Optional[str] = None
    activa: Optional[bool] = None


@router.put("/cuentas/{id}")
def actualizar_cuenta(id: int, body: CuentaUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cuenta = db.query(CuentaContable).filter(
        CuentaContable.id == id,
        CuentaContable.tenant_id == current_user.tenant_id
    ).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta contable no encontrada")
    
    if body.nombre is not None:
        cuenta.nombre = body.nombre
    if body.tipo is not None:
        cuenta.tipo = body.tipo
    if body.naturaleza is not None:
        cuenta.naturaleza = body.naturaleza
    if body.activa is not None:
        cuenta.activa = body.activa
        
    db.commit()
    db.refresh(cuenta)
    return {"ok": True, "cuenta": {
        "id": cuenta.id,
        "codigo": cuenta.codigo,
        "nombre": cuenta.nombre,
        "tipo": cuenta.tipo,
        "naturaleza": cuenta.naturaleza,
        "activa": cuenta.activa
    }}


@router.delete("/cuentas/{id}")
def eliminar_cuenta(id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cuenta = db.query(CuentaContable).filter(
        CuentaContable.id == id,
        CuentaContable.tenant_id == current_user.tenant_id
    ).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta contable no encontrada")
        
    from backend.models.accounting import AsientoDetalle
    has_movs = db.query(AsientoDetalle).join(AsientoContable).filter(
        AsientoDetalle.cuenta_codigo == cuenta.codigo,
        AsientoContable.tenant_id == current_user.tenant_id
    ).first()
    if has_movs:
        raise HTTPException(status_code=400, detail="No se puede eliminar una cuenta que tiene asientos contables registrados.")
        
    db.delete(cuenta)
    db.commit()
    return {"ok": True, "message": "Cuenta contable eliminada con éxito"}


PLAN_COMERCIAL = [
    ("1", "ACTIVO", "ACTIVO", 1),
    ("1.1", "ACTIVO CORRIENTE", "ACTIVO", 2),
    ("1.1.01", "Caja y Bancos", "ACTIVO", 3),
    ("1.1.02", "Cuentas por Cobrar Comerciales", "ACTIVO", 3),
    ("1.1.03", "Inventario de Mercancía de Comercio", "ACTIVO", 3),
    ("1.1.04", "IVA Crédito Fiscal", "ACTIVO", 3),
    ("1.1.05", "Anticipo de Retención de IVA", "ACTIVO", 3),
    ("1.2", "ACTIVO NO CORRIENTE", "ACTIVO", 2),
    ("1.2.01", "Propiedades, Planta y Equipo", "ACTIVO", 3),
    ("1.2.02", "Edificaciones Comerciales", "ACTIVO", 3),
    ("1.2.03", "Equipos de Computación", "ACTIVO", 3),
    ("2", "PASIVO", "PASIVO", 1),
    ("2.1", "PASIVO CORRIENTE", "PASIVO", 2),
    ("2.1.01", "Cuentas por Pagar Comerciales", "PASIVO", 3),
    ("2.1.02", "IVA Débito Fiscal por Pagar", "PASIVO", 3),
    ("2.1.03", "IGTF por Pagar", "PASIVO", 3),
    ("2.1.04", "Nómina por Pagar", "PASIVO", 3),
    ("2.1.05", "Otras Retenciones por Pagar", "PASIVO", 3),
    ("3", "PATRIMONIO", "PATRIMONIO", 1),
    ("3.1", "PATRIMONIO NETO", "PATRIMONIO", 2),
    ("3.1.01", "Capital Social", "PATRIMONIO", 3),
    ("3.1.02", "Reserva Legal", "PATRIMONIO", 3),
    ("4", "INGRESOS", "INGRESO", 1),
    ("4.1", "INGRESOS OPERACIONALES", "INGRESO", 2),
    ("4.1.01", "Ventas de Mercancía (Comercial)", "INGRESO", 3),
    ("4.1.02", "Ventas por Canales Digitales", "INGRESO", 3),
    ("5", "EGRESOS / GASTOS", "EGRESO", 1),
    ("5.1", "COSTOS Y GASTOS OPERACIONALES", "EGRESO", 2),
    ("5.1.01", "Costo de Ventas (Comercial)", "EGRESO", 3),
    ("5.1.02", "Sueldos y Salarios Base (Gasto)", "EGRESO", 3),
    ("5.1.03", "Otras Asignaciones (Gasto)", "EGRESO", 3),
    ("5.1.04", "Gastos por Mermas y Faltantes", "EGRESO", 3),
    ("5.1.05", "Resultado por Exposición a la Inflación (REI)", "EGRESO", 3),
    ("5.1.06", "Servicios Públicos de Tiendas", "EGRESO", 3),
]

PLAN_SERVICIOS = [
    ("1", "ACTIVO", "ACTIVO", 1),
    ("1.1", "ACTIVO CORRIENTE", "ACTIVO", 2),
    ("1.1.01", "Caja y Bancos (Servicios)", "ACTIVO", 3),
    ("1.1.02", "Cuentas por Cobrar por Servicios", "ACTIVO", 3),
    ("1.1.04", "IVA Crédito Fiscal", "ACTIVO", 3),
    ("1.1.05", "Anticipo de Retención de IVA", "ACTIVO", 3),
    ("1.2", "ACTIVO NO CORRIENTE", "ACTIVO", 2),
    ("1.2.01", "Mobiliario y Equipos de Oficina", "ACTIVO", 3),
    ("1.2.02", "Equipos Tecnológicos / Servidores", "ACTIVO", 3),
    ("2", "PASIVO", "PASIVO", 1),
    ("2.1", "PASIVO CORRIENTE", "PASIVO", 2),
    ("2.1.01", "Proveedores de Servicios por Pagar", "PASIVO", 3),
    ("2.1.02", "IVA Débito Fiscal por Pagar", "PASIVO", 3),
    ("2.1.03", "IGTF por Pagar", "PASIVO", 3),
    ("2.1.04", "Honorarios Profesionales por Pagar", "PASIVO", 3),
    ("2.1.05", "Otras Retenciones por Pagar", "PASIVO", 3),
    ("3", "PATRIMONIO", "PATRIMONIO", 1),
    ("3.1", "PATRIMONIO NETO", "PATRIMONIO", 2),
    ("3.1.01", "Capital Social", "PATRIMONIO", 3),
    ("3.1.02", "Utilidades Acumuladas", "PATRIMONIO", 3),
    ("4", "INGRESOS", "INGRESO", 1),
    ("4.1", "INGRESOS OPERACIONALES", "INGRESO", 2),
    ("4.1.01", "Ingresos por Servicios Profesionales", "INGRESO", 3),
    ("4.1.02", "Ingresos por Consultorías / Asesorías", "INGRESO", 3),
    ("5", "EGRESOS / GASTOS", "EGRESO", 1),
    ("5.1", "COSTOS Y GASTOS OPERACIONALES", "EGRESO", 2),
    ("5.1.01", "Costo de Servicios Prestados", "EGRESO", 3),
    ("5.1.02", "Honorarios de Consultores Subcontratados", "EGRESO", 3),
    ("5.1.03", "Sueldos del Personal Técnico", "EGRESO", 3),
    ("5.1.04", "Gasto de Suscripciones y Software SaaS", "EGRESO", 3),
    ("5.1.05", "Resultado por Exposición a la Inflación (REI)", "EGRESO", 3),
    ("5.1.06", "Gastos de Publicidad y Eventos", "EGRESO", 3),
]

PLAN_INDUSTRIAL = [
    ("1", "ACTIVO", "ACTIVO", 1),
    ("1.1", "ACTIVO CORRIENTE", "ACTIVO", 2),
    ("1.1.01", "Caja y Bancos (Industrial)", "ACTIVO", 3),
    ("1.1.02", "Cuentas por Cobrar de Clientes Industriales", "ACTIVO", 3),
    ("1.1.03", "Inventario de Materia Prima", "ACTIVO", 3),
    ("1.1.04", "IVA Crédito Fiscal", "ACTIVO", 3),
    ("1.1.05", "Anticipo de Retención de IVA", "ACTIVO", 3),
    ("1.1.06", "Inventario de Productos en Proceso", "ACTIVO", 3),
    ("1.1.07", "Inventario de Productos Terminados", "ACTIVO", 3),
    ("1.2", "ACTIVO NO CORRIENTE", "ACTIVO", 2),
    ("1.2.01", "Maquinaria e Instalaciones Industriales", "ACTIVO", 3),
    ("1.2.02", "Herramientas y Moldes de Producción", "ACTIVO", 3),
    ("1.2.03", "Vehículos de Carga y Distribución", "ACTIVO", 3),
    ("2", "PASIVO", "PASIVO", 1),
    ("2.1", "PASIVO CORRIENTE", "PASIVO", 2),
    ("2.1.01", "Proveedores de Materia Prima por Pagar", "PASIVO", 3),
    ("2.1.02", "IVA Débito Fiscal por Pagar", "PASIVO", 3),
    ("2.1.03", "IGTF por Pagar", "PASIVO", 3),
    ("2.1.04", "Sueldos y Salarios de Planta por Pagar", "PASIVO", 3),
    ("2.1.05", "Otras Retenciones por Pagar", "PASIVO", 3),
    ("3", "PATRIMONIO", "PATRIMONIO", 1),
    ("3.1", "PATRIMONIO NETO", "PATRIMONIO", 2),
    ("3.1.01", "Capital Social", "PATRIMONIO", 3),
    ("3.1.02", "Reservas de Reinversión de Capital", "PATRIMONIO", 3),
    ("4", "INGRESOS", "INGRESO", 1),
    ("4.1", "INGRESOS OPERACIONALES", "INGRESO", 2),
    ("4.1.01", "Ventas de Productos Terminados (Industrial)", "INGRESO", 3),
    ("4.1.02", "Ventas de Subproductos de Desecho", "INGRESO", 3),
    ("5", "EGRESOS / GASTOS", "EGRESO", 1),
    ("5.1", "COSTOS Y GASTOS OPERACIONALES", "EGRESO", 2),
    ("5.1.01", "Costo de Producción y Ventas (Manufactura)", "EGRESO", 3),
    ("5.1.02", "Mano de Obra Directa (Gasto Fábrica)", "EGRESO", 3),
    ("5.1.03", "Mantenimiento Preventivo de Maquinarias", "EGRESO", 3),
    ("5.1.04", "Combustibles, Energía Eléctrica y Agua Industrial", "EGRESO", 3),
    ("5.1.05", "Resultado por Exposición a la Inflación (REI)", "EGRESO", 3),
    ("5.1.06", "Depreciación de Maquinarias de Planta", "EGRESO", 3),
]


@router.post("/cuentas/importar-plantilla")
def importar_plantilla(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    plantilla = body.get("plantilla", "Comercial")
    
    if plantilla == "Servicios":
        plan_elegido = PLAN_SERVICIOS
    elif plantilla == "Industrial":
        plan_elegido = PLAN_INDUSTRIAL
    else:
        plan_elegido = PLAN_COMERCIAL

    # Obtener códigos de cuentas con movimientos en los asientos contables del tenant actual
    codigos_con_movimientos = db.query(AsientoDetalle.cuenta_codigo).join(AsientoContable).filter(
        AsientoContable.tenant_id == current_user.tenant_id
    ).distinct().all()
    codigos_con_movimientos_list = [c[0] for c in codigos_con_movimientos]
    
    # Eliminar cuentas del tenant actual que no tengan movimientos para hacer una importación limpia
    cuentas_para_borrar = db.query(CuentaContable).filter(
        CuentaContable.tenant_id == current_user.tenant_id,
        ~CuentaContable.codigo.in_(codigos_con_movimientos_list)
    ).all()
    for c in cuentas_para_borrar:
        db.delete(c)
    db.commit()
    
    importadas_count = 0
    for codigo, nombre, tipo, nivel in plan_elegido:
        existing = db.query(CuentaContable).filter(
            CuentaContable.codigo == codigo,
            CuentaContable.tenant_id == current_user.tenant_id
        ).first()
        if not existing:
            db.add(CuentaContable(
                codigo=codigo,
                nombre=nombre,
                tipo=tipo,
                nivel=nivel,
                activa=True,
                naturaleza="ACREEDORA" if tipo in ["PASIVO", "PATRIMONIO", "INGRESO"] else "DEUDORA",
                tenant_id=current_user.tenant_id
            ))
            importadas_count += 1
            
    db.commit()
    return {"ok": True, "importadas": importadas_count, "plantilla": plantilla}
