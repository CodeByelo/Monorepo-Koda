from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone

from backend.core.database import get_db
from backend.models.accounting import AsientoContable, CierrePeriodo
from backend.models.erp_extended import AuditoriaLog
from backend.schemas.contabilidad import CierrePeriodoPayload, ReaperturaPeriodoPayload
from backend.utils.helpers import ventas_periodo
from backend.utils.ip_utils import get_real_ip
from backend.core.security import get_current_user, require_role

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
            "estado": c.estado,
            "reabierto_por": c.reabierto_por,
            "fecha_reabierto": c.fecha_reabierto.strftime("%d/%m/%Y %I:%M %p") if c.fecha_reabierto else None,
            "motivo_reapertura": c.motivo_reapertura,
            "veces_reabierto": c.veces_reabierto,
        }
        for c in cierres
    ]


@router.post("/cierre/ejecutar")
def ejecutar_cierre(
    payload: CierrePeriodoPayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"])),
):
    periodo = payload.periodo
    existing = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == current_user.tenant_id
    ).first()

    if existing and existing.estado == "CERRADO":
        raise HTTPException(400, detail=f"El período {periodo} ya se encuentra cerrado")

    real_ip, tcp_ip = get_real_ip(request)
    ip_registrada = real_ip if real_ip == tcp_ip else f"{real_ip} (via {tcp_ip})"

    if existing:
        # Re-cierre de un período que había sido reabierto: se actualiza
        # la misma fila (conserva veces_reabierto y motivo_reapertura como
        # historial de la última reapertura), nunca se pierde el registro.
        existing.estado = "CERRADO"
        existing.fecha_cierre = datetime.now(timezone.utc)
        existing.usuario = current_user.nombre or current_user.email
        accion = "RECIERRE_PERIODO"
    else:
        existing = CierrePeriodo(
            periodo=periodo,
            tenant_id=current_user.tenant_id,
            usuario=current_user.nombre or current_user.email,
            estado="CERRADO",
        )
        db.add(existing)
        accion = "CIERRE_PERIODO"

    db.add(AuditoriaLog(
        usuario=f"{current_user.email} (ID:{current_user.id})",
        accion=accion,
        modulo="CONTABILIDAD_CIERRE",
        detalle=f"Período {periodo} cerrado.",
        ip=ip_registrada,
        tenant_id=current_user.tenant_id,
    ))
    db.commit()
    return {"ok": True, "periodo": periodo}


@router.post("/cierre/reabrir")
def reabrir_cierre(
    payload: ReaperturaPeriodoPayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(["Admin", "Gerente"])),
):
    periodo = payload.periodo
    existing = db.query(CierrePeriodo).filter(
        CierrePeriodo.periodo == periodo,
        CierrePeriodo.tenant_id == current_user.tenant_id
    ).first()
    if not existing or existing.estado != "CERRADO":
        raise HTTPException(400, detail=f"El período {periodo} no se encuentra cerrado")

    real_ip, tcp_ip = get_real_ip(request)
    ip_registrada = real_ip if real_ip == tcp_ip else f"{real_ip} (via {tcp_ip})"

    existing.estado = "REABIERTO"
    existing.reabierto_por = current_user.nombre or current_user.email
    existing.fecha_reabierto = datetime.now(timezone.utc)
    existing.motivo_reapertura = payload.justificacion
    existing.veces_reabierto = (existing.veces_reabierto or 0) + 1

    db.add(AuditoriaLog(
        usuario=f"{current_user.email} (ID:{current_user.id})",
        accion="REAPERTURA_PERIODO",
        modulo="CONTABILIDAD_CIERRE",
        detalle=f"Período {periodo} reabierto. Justificación: {payload.justificacion}",
        ip=ip_registrada,
        tenant_id=current_user.tenant_id,
    ))
    db.commit()
    return {"ok": True, "periodo": periodo, "estado": "REABIERTO"}
