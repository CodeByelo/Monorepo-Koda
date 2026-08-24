from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
import calendar

from backend.core.database import get_db
from backend.models.core import Profile
from backend.models.erp_extended import Compra, RetencionIVA, Empresa
from backend.models.fiscal import ReglaFiscal
from backend.utils.helpers import ventas_periodo, periodo_rango, to_float, tasa_actual
from backend.core.security import get_current_user

router = APIRouter()


def _tasa_iva(db: Session, tenant_id) -> Decimal:
    regla = db.query(ReglaFiscal).filter(
        ReglaFiscal.nombre == "IVA",
        ReglaFiscal.activa == True,
        ReglaFiscal.tenant_id == tenant_id,
    ).first()
    return Decimal(str(regla.tasa)) if regla else Decimal("0.16")


@router.get("/dashboard")
def fiscal_dashboard(periodo: str = Query(...), db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    ventas = ventas_periodo(db, current_user.tenant_id, periodo).all()
    inicio, fin = periodo_rango(periodo)
    compras = db.query(Compra).filter(
        Compra.fecha >= inicio,
        Compra.fecha < fin,
        Compra.estado == "ACTIVA",
        Compra.tenant_id == current_user.tenant_id,
    ).all()

    total_ventas = sum(to_float(v.total) for v in ventas)
    iva_ventas = sum(to_float(v.iva) for v in ventas)
    base_ventas = sum(to_float(v.subtotal) for v in ventas)

    iva_compras = sum(to_float(c.iva) for c in compras)
    base_compras = sum(to_float(c.subtotal) for c in compras)

    tasa = tasa_actual(db, current_user.tenant_id)

    # Convert to Bs
    debitos_fiscales = iva_ventas * tasa
    creditos_fiscales = iva_compras * tasa
    base_ventas_bs = base_ventas * tasa
    base_compras_bs = base_compras * tasa

    # Calculate Retenciones Soportadas (IVA)
    # IVA Withheld by our clients (RECIBIDAS)
    retenciones = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo == "RECIBIDA",
        RetencionIVA.tenant_id == current_user.tenant_id,
    ).all()
    retenciones_soportadas = sum(to_float(r.monto_usd) for r in retenciones)
    # Lógica básica Calendario SENIAT (asumiendo dígito 0 por defecto)
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7
    nm = m + 1
    ny = y
    if nm > 12:
        nm = 1
        ny += 1
        
    calendario = [
        {
            "fecha": f"{ny}-{nm:02d}-15",
            "fecha_label": f"15 {calendar.month_abbr[nm].upper()}",
            "tipo": "IVA",
            "titulo": "Declaración Definitiva de IVA",
            "descripcion": f"Pago correspondiente al período {periodo}",
            "link": "/fiscal/declaracion-iva",
            "link_text": "Generar Declaración"
        },
        {
            "fecha": f"{ny}-{nm:02d}-10",
            "fecha_label": f"10 {calendar.month_abbr[nm].upper()}",
            "tipo": "ISLR",
            "titulo": "Retenciones de ISLR",
            "descripcion": f"Enteramiento de retenciones del período {periodo}",
            "link": "/fiscal/retenciones-islr",
            "link_text": "Ver Retenciones"
        }
    ]

    return {
        "periodo": periodo,
        "metrics": [
            {"label": "Ventas del período", "value": f"${total_ventas:,.2f}", "desc": f"{len(ventas)} facturas", "color": "text-[#0b5156]"},
            {"label": "IVA Débito", "value": f"Bs. {debitos_fiscales:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), "desc": "Ventas gravadas", "color": "text-red-600"},
            {"label": "Libros", "value": "OK" if ventas else "VACÍO", "desc": "Libro de ventas", "color": "text-green-600"},
            {"label": "Próximo Venc.", "value": f"15 {calendar.month_abbr[nm].upper()}", "desc": "Declaración de IVA", "color": "text-amber-500"},
        ],
        "resumen_libros": {
            "debitos_fiscales": debitos_fiscales,
            "base_ventas": base_ventas_bs,
            "creditos_fiscales": creditos_fiscales,
            "base_compras": base_compras_bs,
            "retenciones_soportadas": retenciones_soportadas
        },
        "calendario": calendario,
    }


@router.get("/calendario")
def calendario_fiscal(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    perfil = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    rif = perfil.rif if perfil and perfil.rif else "J-00000000-0"
    digito = int(rif[-1]) if rif[-1].isdigit() else 0
    # Empresa no tiene tipo_contribuyente, asumo False por defecto o si lo tiene lo leo
    especial = False
    if hasattr(perfil, "tipo_contribuyente"):
        especial = perfil.tipo_contribuyente == "ESPECIAL"
    
    now = datetime.now()
    y, m = now.year, now.month
    
    # Reglas simples:
    # IVA Especial: día 10 + digito
    # ISLR Especial: día 15 + digito
    
    dia_iva = 10 + digito if especial else 15
    dia_islr = 15 + digito if especial else 20
    
    def next_date(day):
        try:
            return datetime(y, m, day)
        except ValueError:
            return datetime(y, m, 28)
            
    vencimientos = [
        {
            "fecha_limite": next_date(dia_iva).strftime("%d/%m/%Y"),
            "nombre": "Declaración y Pago de IVA",
            "descripcion": f"Correspondiente al período {m-1:02d}/{y}",
            "tipo": "IVA",
            "estado": "PENDIENTE",
            "link": "/fiscal/declaracion-iva",
            "mes": calendar.month_abbr[m].upper(),
            "urgente": (next_date(dia_iva) - now).days < 5
        },
        {
            "fecha_limite": next_date(dia_islr).strftime("%d/%m/%Y"),
            "nombre": "Anticipos de ISLR",
            "descripcion": f"Enteramiento quincenal/mensual",
            "tipo": "ISLR",
            "estado": "PENDIENTE",
            "link": "/fiscal/declaracion-islr",
            "mes": calendar.month_abbr[m].upper(),
            "urgente": (next_date(dia_islr) - now).days < 5
        }
    ]
    
    return {
        "vencimientos": vencimientos,
        # NOTA: KODA no calcula el estado real de cumplimiento fiscal ante el SENIAT
        # (no tiene integración con el ente ni datos de sanciones/multas). Antes se
        # devolvía aquí un resumen fijo ("100% al día, 0 sanciones") sin verificación
        # alguna. Se omite deliberadamente para no reportar un cumplimiento falso;
        # el frontend debe mostrar un estado vacío/"--" ante la ausencia de "metricas".
    }
