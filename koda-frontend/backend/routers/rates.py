from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from backend.core.database import get_db, SessionLocal
from backend.models.core import TasaCambio
from backend.schemas.core import TasaCambioCreate, TasaCambioResponse
from backend.core.security import require_role, get_current_user
from backend.models.erp_extended import AuditoriaLog
import requests # type: ignore
import requests.exceptions # type: ignore
from bs4 import BeautifulSoup
import asyncio
import logging
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# NOTA: Importamos List de typing para compatibilidad con esquemas
from typing import List
import time as _time

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasa", tags=["Control Cambiario"])

# ── Caché en memoria para /tasa/actual (evita query a BD en cada request) ───
_tasa_cache: dict = {}      # {"data": {...}, "ts": float}
_TASA_CACHE_TTL = 60        # 60 segundos de validez

@router.get("", response_model=List[TasaCambioResponse])
def get_tasas(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Endpoint público para obtener el historial de tasas de cambio registradas.
    Retorna la lista ordenada cronológicamente con paginación para evitar colapso de RAM.
    """
    tasas = db.query(TasaCambio).filter(
        (TasaCambio.tenant_id == current_user.tenant_id) | (TasaCambio.tenant_id.is_(None))
    ).order_by(TasaCambio.fecha.desc()).offset(skip).limit(limit).all()
    return tasas

@router.get("/actual")
def get_tasa_actual(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Endpoint público para obtener la tasa de cambio activa más reciente.
    Sincroniza automáticamente en vivo con el BCV si no hay registros o si la tasa supera las 12 horas.
    """
    tenant_id = getattr(current_user, "tenant_id", None)
    cache_key = f"tasa_{tenant_id}"
    if cache_key in _tasa_cache and (_time.time() - _tasa_cache[cache_key]["ts"]) < _TASA_CACHE_TTL:
        return _tasa_cache[cache_key]["data"]

    tasa = db.query(TasaCambio).filter(
        (TasaCambio.tenant_id == tenant_id) | (TasaCambio.tenant_id.is_(None))
    ).order_by(TasaCambio.fecha.desc()).first()

    # Si no hay tasa en la BD o tiene más de 12 horas, intentar sincronizar en vivo con el BCV
    needs_sync = False
    if not tasa:
        needs_sync = True
    elif tasa.fecha:
        from datetime import datetime, timezone, timedelta
        now_utc = datetime.now(timezone.utc)
        t_fecha = tasa.fecha.replace(tzinfo=timezone.utc) if tasa.fecha.tzinfo is None else tasa.fecha
        if (now_utc - t_fecha) > timedelta(hours=12):
            needs_sync = True

    if needs_sync:
        try:
            tasa = _perform_bcv_sync(db)
        except Exception as sync_err:
            logger.warning("No se pudo sincronizar en vivo con el BCV: %s", sync_err)

    if not tasa:
        tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()

    valor_ves_num = float(getattr(tasa, "valor_ves", 757.54)) if tasa else 757.54
    result = {
        "id": getattr(tasa, "id", 1),
        "tasa": valor_ves_num,
        "valor_ves": valor_ves_num,
        "tasa_referencial": valor_ves_num * 1.15,
        "fecha": getattr(tasa, "fecha", None),
        "fuente": getattr(tasa, "fuente", "BCV (Sincronización Automática)")
    }
    _tasa_cache[cache_key] = {"data": result, "ts": _time.time()}
    return result

@router.put("/manual")
def tasa_manual(body: dict = Body(...), db: Session = Depends(get_db), current_user=Depends(require_role(["Admin", "Gerente"]))):
    try:
        valor = body.get("tasa") or body.get("tasa_referencial") or body.get("valor_ves")
        if valor is None:
            raise HTTPException(status_code=400, detail="Debe enviar 'tasa' o 'valor_ves'")
        
        # Check if we should override the last one or create a new one
        fuente_nombre = f"Manual ({getattr(current_user, 'nombre', getattr(current_user, 'username', 'Usuario'))})"
        db_tasa = TasaCambio(
            valor_ves=float(valor), 
            fuente=fuente_nombre,
            tenant_id=current_user.tenant_id
        )
        db.add(db_tasa)
        
        # Add Audit Log
        from datetime import datetime, timezone
        audit = AuditoriaLog(
            tenant_id=current_user.tenant_id,
            usuario=getattr(current_user, 'username', 'Usuario') or 'Usuario',
            accion="ACTUALIZACION_TASA_CAMBIO",
            modulo="Tesorería",
            detalle=f"El usuario ajustó manualmente la tasa de cambio a Bs. {valor}",
            ip="N/A",
            fecha=datetime.now(timezone.utc)
        )
        db.add(audit)
        
        db.commit()
        db.refresh(db_tasa)
        return {
            "id": db_tasa.id,
            "tasa": float(db_tasa.valor_ves),
            "tasa_referencial": float(db_tasa.valor_ves) * 1.15,
            "fecha": db_tasa.fecha,
            "fuente": db_tasa.fuente
        }
    except Exception as e:
        import traceback
        error_msg = f"Error interno: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("", response_model=TasaCambioResponse, status_code=status.HTTP_201_CREATED)
def create_tasa(
    tasa_in: TasaCambioCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    """
    Endpoint protegido: Solo usuarios con rol 'Admin' o 'Gerente' pueden registrar una nueva tasa.
    """
    db_tasa = TasaCambio(
        valor_ves=tasa_in.valor_ves,
        fuente=tasa_in.fuente
    )
    db.add(db_tasa)
    db.commit()
    db.refresh(db_tasa)
    return db_tasa

def _perform_bcv_sync(db: Session) -> TasaCambio:
    """
    Lógica central compartida para extraer la tasa del BCV.
    Utiliza scraping directo del portal BCV con fallback automático a DolarApi Oficial.
    """
    tasa_float = None
    fuente_nombre = "BCV (Sincronización Automática)"

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get("https://www.bcv.org.ve/", verify=False, timeout=4, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
        dolar_div = soup.find("div", id="dolar")
        if dolar_div and dolar_div.find("strong"):
            tasa_str = dolar_div.find("strong").text.strip().replace(",", ".")
            tasa_float = float(tasa_str)
    except Exception as e:
        logger.warning(f"KODA Auto-Sync: Scraping directo a bcv.org.ve no disponible ({e}). Intentando API oficial de respaldo...")

    if tasa_float is None:
        try:
            r = requests.get("https://ve.dolarapi.com/v1/dolares/oficial", timeout=5)
            r.raise_for_status()
            data = r.json()
            prom = data.get("promedio") or data.get("venta")
            if prom:
                tasa_float = float(prom)
                fuente_nombre = "BCV (Vía DolarApi Oficial)"
        except Exception as e:
            logger.error(f"KODA Auto-Sync: API de respaldo también falló: {e}")

    if tasa_float is None:
        raise ValueError("No se pudo obtener la tasa BCV de ninguna fuente.")

    # Inteligencia: Verificar si la tasa ya es igual a la última registrada
    ultima_tasa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    if ultima_tasa and float(ultima_tasa.valor_ves) == tasa_float:
        return ultima_tasa

    # Si es nueva, la registramos
    db_tasa = TasaCambio(
        valor_ves=tasa_float,
        fuente=fuente_nombre
    )
    db.add(db_tasa)
    db.commit()
    db.refresh(db_tasa)

    # Limpiar caché
    global _tasa_cache
    _tasa_cache.clear()

    return db_tasa

@router.get("/historial")
def historial_tasas(limite: int = 30, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(TasaCambio).filter(
        (TasaCambio.tenant_id == current_user.tenant_id) | (TasaCambio.tenant_id.is_(None))
    ).order_by(TasaCambio.fecha.desc()).limit(limite).all()

@router.post("/sincronizar", response_model=TasaCambioResponse, status_code=status.HTTP_201_CREATED)
@router.post("/sync-bcv", response_model=TasaCambioResponse, status_code=status.HTTP_201_CREATED)
def sync_tasa_bcv(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["Admin", "Gerente"])),
):
    """
    Endpoint manual por si un administrador desea forzar la sincronización en un momento específico.
    """
    try:
        return _perform_bcv_sync(db)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Fallo de comunicación con el BCV: {str(e)}"
        )

from starlette.concurrency import run_in_threadpool

async def bcv_sync_task():
    """
    Tarea en segundo plano (Cronjob).
    Ejecuta la revisión 4 veces al día (cada 6 horas).
    La primera ejecución tiene un timeout de 5s para no bloquear el inicio.
    """
    first_run = True
    while True:
        db = SessionLocal()
        try:
            if first_run:
                # Primera ejecución: timeout de 5s para no bloquear el inicio del servidor
                try:
                    await asyncio.wait_for(
                        run_in_threadpool(_perform_bcv_sync, db),
                        timeout=5.0
                    )
                    logger.info("KODA Auto-Sync: Sincronización inicial BCV completada.")
                except asyncio.TimeoutError:
                    logger.warning("KODA Auto-Sync: BCV no respondió en 5s al iniciar. Se usará la última tasa guardada.")
                first_run = False
            else:
                await run_in_threadpool(_perform_bcv_sync, db)
                logger.info("KODA Auto-Sync: Revisión del BCV completada.")
        except Exception as e:
            logger.error(f"KODA Auto-Sync Error: No se pudo verificar el BCV. Detalles: {e}")
        finally:
            db.close()
        
        # Esperar 6 horas (6 * 60 * 60 segundos = 21600 segundos)
        await asyncio.sleep(21600)

@router.on_event("startup") # type: ignore
async def startup_event():
    """Inicia el motor automático al encender el servidor."""
    asyncio.create_task(bcv_sync_task())
