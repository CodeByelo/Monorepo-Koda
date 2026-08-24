from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone

from backend.core.database import get_db
from backend.models.accounting import AsientoContable, CierrePeriodo
from backend.utils.helpers import ventas_periodo
from backend.core.security import get_current_user

router = APIRouter()


@router.get("/cierre/checklist")
def cierre_checklist(periodo: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    ventas_count = ventas_periodo(db, current_user.tenant_id, periodo).count()
    
    y, m = map(int, periodo.split("-"))
    start_date = datetime(y, m, 1, 0, 0, 0, tzinfo=timezone.utc)
    if m == 12:
        end_date = datetime(y + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_date = datetime(y, m + 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    unbalanced_asientos = db.query(AsientoContable).filter(
        AsientoContable.tenant_id == current_user.tenant_id,
        AsientoContable.fecha >= start_date,
        AsientoContable.fecha < end_date,
        func.round(AsientoContable.total_debe_usd, 2) != func.round(AsientoContable.total_haber_usd, 2)
    ).all()
    unbalanced_count = len(unbalanced_asientos)
    asientos_ok = (unbalanced_count == 0)
    
    desc_asientos = "Verificación de partida doble completada."
    if unbalanced_count > 0:
        desc_asientos = f"Hay {unbalanced_count} asiento(s) descuadrado(s) (Ej. Asiento ID: {unbalanced_asientos[0].id}). Revise contabilidad."

    from backend.models.operations import AjusteInventario
    pending_adjustments = db.query(AjusteInventario).filter(
        AjusteInventario.tenant_id == current_user.tenant_id,
        AjusteInventario.fecha_solicitud >= start_date,
        AjusteInventario.fecha_solicitud < end_date,
        AjusteInventario.estado == "PENDIENTE"
    ).all()
    pending_adjustments_count = len(pending_adjustments)
    inventario_ok = (pending_adjustments_count == 0)
    
    desc_inventario = "Cierre de lotes y valorización completada."
    if pending_adjustments_count > 0:
        desc_inventario = f"Tiene {pending_adjustments_count} ajustes pendientes (Ej. Ajuste ID: {pending_adjustments[0].id}). Revise inventario."

    checklist_items = [
        {
            "id": "1",
            "task": "Libro de ventas consolidado",
            "desc": f"Facturas del período: {ventas_count} emitidas." if ventas_count > 0 else f"Sin facturas registradas en {periodo}. Debe emitir al menos una.",
            "responsible": "Dpto. Facturación",
            "status": "Completado" if ventas_count > 0 else "No iniciado",
            "link": "/historial"
        },
        {
            "id": "2",
            "task": "Asientos contables cuadrados",
            "desc": desc_asientos,
            "responsible": "Contabilidad Senior",
            "status": "Completado" if asientos_ok else "No iniciado",
            "link": "/contabilidad/diario"
        },
        {
            "id": "3",
            "task": "Inventario valorizado",
            "desc": desc_inventario,
            "responsible": "Dpto. Almacén",
            "status": "Completado" if inventario_ok else "No iniciado",
            "link": "/inventario/ajustes"
        }
    ]
    
    completados_count = sum([1 for ok in [ventas_count > 0, unbalanced_count == 0, inventario_ok] if ok])
    pendientes_count = sum([1 for ok in [ventas_count > 0, unbalanced_count == 0, inventario_ok] if not ok])

    return {
        "periodo": periodo,
        "checklist": checklist_items,
        "items": [
            {"tarea": "Libro de ventas consolidado", "ok": ventas_count > 0},
            {"tarea": "Asientos contables cuadrados", "ok": unbalanced_count == 0},
            {"tarea": "Inventario valorizado", "ok": inventario_ok},
        ],
        "listo": (ventas_count > 0 and unbalanced_count == 0 and inventario_ok),
        "metricas": {
            "labelPeriodo": "Período",
            "valuePeriodo": periodo,
            "descPeriodo": "En proceso de cierre",
            "completados": f"{completados_count} / 3",
            "pendientes": str(pendientes_count),
            "vencimiento": "15 días hábiles"
        }
    }


@router.get("/cierres/historial")
def cierres_historial(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cierres = db.query(CierrePeriodo).filter(
        CierrePeriodo.tenant_id == current_user.tenant_id
    ).order_by(CierrePeriodo.periodo.desc()).all()
    return [
        {
            "id": c.id,
            "periodo": c.periodo,
            "fecha_cierre": c.fecha_cierre.strftime("%d/%m/%Y %I:%M %p") if c.fecha_cierre else "-",
            "usuario": c.usuario,
            "admin": c.usuario,
            "estado": "CERRADO"
        }
        for c in cierres
    ]


@router.post("/cierre/ejecutar")
def ejecutar_cierre(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    periodo = body.get("periodo")
    if not periodo:
        raise HTTPException(400, detail="Período requerido")

    existing = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        raise HTTPException(400, detail=f"El período {periodo} ya se encuentra cerrado")

    nuevo_cierre = CierrePeriodo(
        periodo=periodo,
        tenant_id=current_user.tenant_id,
        usuario=current_user.nombre or current_user.email
    )
    db.add(nuevo_cierre)
    db.commit()
    return {"ok": True, "periodo": periodo}


@router.post("/cierre/reabrir")
def reabrir_cierre(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    periodo = body.get("periodo")
    if not periodo:
        raise HTTPException(400, detail="Período requerido")

    existing = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == current_user.tenant_id
    ).first()
    if not existing:
        raise HTTPException(400, detail=f"El período {periodo} no se encuentra cerrado")

    db.delete(existing)
    db.commit()
    return {"ok": True}
