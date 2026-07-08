"""
rates_router.py
───────────────
Integración con el Banco Central de Venezuela (BCV) via pyBCV.

Endpoints:
  GET  /api/v1/rates/current  — público, lee de la BD (ultra-rápido)
  POST /api/v1/rates/sync     — protegido (CEO, Administrador, Desarrollador)
                                fuerza actualización leyendo pyBCV

La función `sync_rates_from_bcv` también es invocada por el APScheduler
que se registra en main.py (Mon-Fri, 8:00 AM VET = 12:00 UTC).
"""

import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth.supabase_auth import get_current_user
from database.async_db import get_db_connection, db_session

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/api/v1/rates", tags=["rates"])

# ──────────────────────────────────────────────────────────────────────────────
# ROLES CON ACCESO AL ENDPOINT DE SINCRONIZACIÓN MANUAL
# ──────────────────────────────────────────────────────────────────────────────
_ALLOWED_ROLES = {"ceo", "administrador", "desarrollador", "developer", "dev"}


def _require_privileged_role(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency que valida que el usuario tenga uno de los roles permitidos."""
    role: str = str(current_user.get("role") or current_user.get("rol") or "").strip().lower()
    if role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: se requiere rol CEO, Administrador o Desarrollador."
        )
    return current_user


# ──────────────────────────────────────────────────────────────────────────────
# LÓGICA CENTRAL DE SINCRONIZACIÓN
# ──────────────────────────────────────────────────────────────────────────────

def _fetch_bcv_rates_sync() -> dict:
    """
    Llama a pyBCV de forma SÍNCRONA (scraping del portal BCV).
    Se ejecuta en un ThreadPoolExecutor para no bloquear el event loop.
    Retorna un dict con las tasas: {"USD": float, "EUR": float}
    """
    from pyBCV import Currency  # import tardío para aislar el módulo síncrono

    currency = Currency()
    result = {}

    usd_raw = currency.get_rate("USD")
    eur_raw = currency.get_rate("EUR")

    if usd_raw is None or eur_raw is None:
        raise ValueError("pyBCV retornó None para USD o EUR — el portal BCV puede estar caído.")

    # pyBCV puede devolver strings con comas venezolanas (ej. "36,45") o floats
    def _parse(val) -> float:
        if isinstance(val, (int, float)):
            return float(val)
        return float(str(val).replace(",", ".").strip())

    result["USD"] = _parse(usd_raw)
    result["EUR"] = _parse(eur_raw)
    return result


async def sync_rates_from_bcv(conn=None) -> dict:
    """
    Corrutina principal de sincronización:
    1. Llama a pyBCV en un ThreadPoolExecutor (evita bloquear asyncio).
    2. Hace UPSERT en la tabla `bcv_rates`.
    3. En caso de error de BCV, registra el log y NO toca la BD
       (se preserva la última tasa válida).

    Retorna un dict con el resultado:
      {"status": "ok"|"error", "rates": {...}, "message": str}

    El parámetro `conn` es opcional: si se omite, la función abre
    su propia conexión (útil para el scheduler que no tiene contexto de request).
    """
    loop = asyncio.get_event_loop()

    # ── 1. Obtener tasas de pyBCV en hilo separado ──
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            rates = await loop.run_in_executor(pool, _fetch_bcv_rates_sync)
        logger.info(f"✅ pyBCV sync exitoso: USD={rates['USD']}, EUR={rates['EUR']}")
    except Exception as bcv_err:
        logger.error(
            f"❌ Error al consultar pyBCV (portal BCV posiblemente caído): {bcv_err}. "
            "La última tasa válida en la BD se mantiene intacta."
        )
        return {
            "status": "error",
            "rates": None,
            "message": f"No se pudo obtener la tasa del BCV: {str(bcv_err)}. "
                       "La última tasa válida en base de datos permanece sin cambios."
        }

    # ── 2. Persistir en la BD ──
    upsert_sql = """
        INSERT INTO bcv_rates (currency, rate, updated_at, source)
        VALUES ($1, $2, NOW(), 'pyBCV')
        ON CONFLICT (currency)
        DO UPDATE SET
            rate       = EXCLUDED.rate,
            updated_at = EXCLUDED.updated_at,
            source     = EXCLUDED.source
    """

    async def _do_upsert(db_conn):
        await db_conn.execute(upsert_sql, "USD", rates["USD"])
        await db_conn.execute(upsert_sql, "EUR", rates["EUR"])

    try:
        if conn is not None:
            await _do_upsert(conn)
        else:
            # Abrir conexión propia (modo scheduler)
            async with db_session() as db_conn:
                await _do_upsert(db_conn)
    except Exception as db_err:
        logger.error(f"❌ Error al persistir tasas BCV en la BD: {db_err}")
        return {
            "status": "error",
            "rates": rates,
            "message": f"Las tasas se obtuvieron del BCV pero no se pudieron guardar: {str(db_err)}"
        }

    return {
        "status": "ok",
        "rates": {
            "USD": rates["USD"],
            "EUR": rates["EUR"],
        },
        "message": "Tasas sincronizadas correctamente desde el BCV."
    }


# ──────────────────────────────────────────────────────────────────────────────
# SCHEMAS DE RESPUESTA
# ──────────────────────────────────────────────────────────────────────────────

class RateEntry(BaseModel):
    currency: str
    rate: float
    updated_at: datetime
    source: Optional[str] = "pyBCV"


class CurrentRatesResponse(BaseModel):
    USD: Optional[RateEntry] = None
    EUR: Optional[RateEntry] = None
    fetched_at: datetime


class SyncResponse(BaseModel):
    status: str        # "ok" | "error"
    message: str
    rates: Optional[dict] = None


# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

from fastapi import Response

@router.get(
    "/current",
    response_model=CurrentRatesResponse,
    summary="Obtener tasa BCV actual (desde BD)",
    description=(
        "Retorna la última tasa de cambio USD/EUR registrada en la base de datos. "
        "**Nunca** hace una llamada en vivo al BCV. Endpoint público y ultra-ráp-ido."
    ),
)
async def get_current_rates(response: Response, conn=Depends(get_db_connection)):
    """Lee la tasa vigente desde la BD — sin auth, sin llamadas externas."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    rows = await conn.fetch(
        "SELECT currency, rate, updated_at, source FROM bcv_rates WHERE currency IN ('USD', 'EUR')"
    )

    result: dict[str, RateEntry] = {}
    for row in rows:
        result[row["currency"]] = RateEntry(
            currency=row["currency"],
            rate=float(row["rate"]),
            updated_at=row["updated_at"],
            source=row["source"],
        )

    return CurrentRatesResponse(
        USD=result.get("USD"),
        EUR=result.get("EUR"),
        fetched_at=datetime.now(timezone.utc),
    )


@router.post(
    "/sync",
    response_model=SyncResponse,
    summary="Forzar sincronización de tasas BCV",
    description=(
        "Fuerza una lectura en vivo del portal del BCV via pyBCV y actualiza la BD. "
        "**Requiere rol: CEO, Administrador o Desarrollador.**"
    ),
)
async def force_sync_rates(
    request: Request,
    current_user: dict = Depends(_require_privileged_role),
    conn=Depends(get_db_connection),
):
    """Endpoint protegido: sincronización manual de tasas BCV."""
    username = current_user.get("username") or current_user.get("sub", "desconocido")
    role = current_user.get("role") or current_user.get("rol", "")
    logger.info(f"🔄 Sincronización manual de tasas BCV solicitada por '{username}' (rol: {role})")

    result = await sync_rates_from_bcv(conn=conn)

    # Log de auditoría (best-effort, no interrumpe el flujo)
    try:
        await conn.execute(
            """
            INSERT INTO security_events
                (tenant_id, user_id, username, evento, event_type, detalles, estado, page, ip_origen)
            VALUES ($1::uuid, $2::uuid, $3, $4, $4, $5, $6, $7, $8)
            """,
            current_user.get("tenant_id"),
            current_user.get("sub"),
            username,
            "BCV_RATES_SYNC",
            f"Sincronización manual — status: {result['status']}",
            "success" if result["status"] == "ok" else "error",
            "/api/v1/rates/sync",
            request.client.host if request.client else None,
        )
    except Exception as audit_err:
        logger.warning(f"No se pudo registrar evento de auditoría BCV sync: {audit_err}")

    # Si hubo error de BCV, retornamos 200 con status "error" (la BD está intacta)
    return SyncResponse(**result)
