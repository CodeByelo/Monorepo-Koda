from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.erp_extended import RetencionIVA, RetencionISLR
from backend.utils.helpers import to_float

def _as_aware(dt):
    """Ensure a datetime is timezone-aware (UTC). Handles naive datetimes from DB."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# --- ISLR automatic withholding on purchase registration ---
ISLR_WITHHOLDING_TABLE = {
    "BIENES_INVENTARIO": None,
}


def _resolver_islr_automatico(categoria):
    """Returns (concepto_codigo, alicuota) if `categoria` maps to a confirmed
    automatic ISLR withholding rule, or None if it should remain manual-only
    (either because no withholding applies, or because the mapping isn't
    confirmed yet)."""
    return ISLR_WITHHOLDING_TABLE.get(categoria)


def calcular_reserva_fiscal(db: Session, tenant_id) -> float:
    """Single source of truth for 'Reserva Fiscal': sum of pending IVA/ISLR
    withholdings owed to SENIAT. Used by both the Pagos and Tesorería
    dashboards so the figure never diverges between modules."""
    ret_iva = db.query(func.sum(RetencionIVA.monto_usd)).filter(
        RetencionIVA.estado == "PENDIENTE",
        RetencionIVA.tenant_id == tenant_id
    ).scalar()
    ret_islr = db.query(func.sum(RetencionISLR.monto_usd)).filter(
        RetencionISLR.estado == "PENDIENTE",
        RetencionISLR.tenant_id == tenant_id
    ).scalar()
    return to_float(ret_iva) + to_float(ret_islr)
