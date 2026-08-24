from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

from backend.core.database import get_db
from backend.models.erp_extended import CuentaContable
from backend.core.security import get_current_user

router = APIRouter()

# ─── MATRIZ DE INTEGRACIÓN ────────────────────────────────────────────────────

EVENTOS_DEFAULT = [
    {"evento": "VENTA_CONTADO",    "modulo": "VENTAS",   "titulo": "Venta de Mercancía (Contado)",   "desc": "Factura pagada al momento.", "readonly_debe": False, "readonly_haber": False},
    {"evento": "IVA_DEBITO",       "modulo": "VENTAS",   "titulo": "IVA Débito Fiscal",              "desc": "Impuesto generado en ventas.", "readonly_debe": True,  "readonly_haber": False},
    {"evento": "COMPRA_INVENTARIO","modulo": "COMPRAS",  "titulo": "Compra de Inventario",           "desc": "Recepción de mercancía comercial.", "readonly_debe": False, "readonly_haber": False},
    {"evento": "IVA_CREDITO",      "modulo": "COMPRAS",  "titulo": "IVA Crédito Fiscal",             "desc": "Impuesto soportado en compras.", "readonly_debe": False, "readonly_haber": True},
    {"evento": "NOMINA_GASTO",     "modulo": "RRHH",     "titulo": "Gasto de Nómina",                "desc": "Registro del costo de nómina mensual.", "readonly_debe": False, "readonly_haber": False},
    {"evento": "COBRO_CLIENTE",    "modulo": "COBROS",   "titulo": "Cobro a Cliente (Efectivo)",     "desc": "Entrada de efectivo por cobro de factura.", "readonly_debe": False, "readonly_haber": False},
]

def _seed_matriz(db: Session):
    from backend.models.erp_extended import MatrizIntegracion
    for ev in EVENTOS_DEFAULT:
        existing = db.query(MatrizIntegracion).filter(MatrizIntegracion.evento == ev["evento"]).first()
        if not existing:
            db.add(MatrizIntegracion(evento=ev["evento"], activo=True))
    db.commit()

class MatrizLineaUpdate(BaseModel):
    evento: str
    cuenta_debe_codigo: Optional[str] = None
    cuenta_haber_codigo: Optional[str] = None

class MatrizSave(BaseModel):
    lineas: List[MatrizLineaUpdate]
    usuario: Optional[str] = "Sistema"


@router.get("/matriz-integracion")
def get_matriz_integracion(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import MatrizIntegracion
    _seed_matriz(db)
    registros = db.query(MatrizIntegracion).all()
    reg_map = {r.evento: r for r in registros}

    cuentas = db.query(CuentaContable).filter(
        CuentaContable.activa == True,
        CuentaContable.tenant_id == current_user.tenant_id
    ).order_by(CuentaContable.codigo).all()
    cuentas_list = [{"id": c.id, "codigo": c.codigo, "nombre": c.nombre, "tipo": c.tipo} for c in cuentas]

    resultado = []
    for ev in EVENTOS_DEFAULT:
        reg = reg_map.get(ev["evento"])
        resultado.append({
            "evento": ev["evento"],
            "modulo": ev["modulo"],
            "titulo": ev["titulo"],
            "desc": ev["desc"],
            "readonly_debe": ev["readonly_debe"],
            "readonly_haber": ev["readonly_haber"],
            "cuenta_debe_codigo": reg.cuenta_debe_codigo if reg else None,
            "cuenta_haber_codigo": reg.cuenta_haber_codigo if reg else None,
            "ultima_modificacion": reg.ultima_modificacion.strftime("%d/%m/%Y %H:%M") if reg and reg.ultima_modificacion else None,
        })

    return {"lineas": resultado, "cuentas": cuentas_list}


@router.post("/matriz-integracion")
def save_matriz_integracion(body: MatrizSave, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.erp_extended import MatrizIntegracion
    _seed_matriz(db)
    for linea in body.lineas:
        reg = db.query(MatrizIntegracion).filter(MatrizIntegracion.evento == linea.evento).first()
        if reg:
            reg.cuenta_debe_codigo = linea.cuenta_debe_codigo
            reg.cuenta_haber_codigo = linea.cuenta_haber_codigo
            reg.ultima_modificacion = datetime.now(timezone.utc)
            reg.usuario_modificacion = body.usuario
        else:
            db.add(MatrizIntegracion(
                evento=linea.evento,
                cuenta_debe_codigo=linea.cuenta_debe_codigo,
                cuenta_haber_codigo=linea.cuenta_haber_codigo,
                usuario_modificacion=body.usuario,
                activo=True
            ))
    db.commit()
    return {"ok": True, "message": "Matriz guardada correctamente", "total": len(body.lineas)}


@router.post("/matriz-integracion/sincronizar")
def sincronizar_matriz(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Sincroniza la tabla de eventos con los eventos predefinidos del sistema."""
    from backend.models.erp_extended import MatrizIntegracion
    _seed_matriz(db)
    return {"ok": True, "message": f"Sincronización completada. {len(EVENTOS_DEFAULT)} eventos verificados."}
