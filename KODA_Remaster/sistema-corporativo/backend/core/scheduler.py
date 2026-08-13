"""
core/scheduler.py
─────────────────
Configuración central del programador de tareas en segundo plano (APScheduler) para Koda ERP.
"""

import os
import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.bcv_service import fetch_and_save_bcv_rates

logger = logging.getLogger("sistema_corporativo")

# Inicializamos el scheduler con zona horaria de Venezuela para sincronizar a la hora oficial local
scheduler = AsyncIOScheduler(timezone="America/Caracas")

# ── Job 1: Sincronización automática de tasas BCV ──────────────────────────────
# Se ejecuta a las 8:00 AM y a la 1:00 PM (13:00) hora de Venezuela, lunes a viernes
scheduler.add_job(
    fetch_and_save_bcv_rates,
    trigger="cron",
    day_of_week="mon-fri",
    hour="8,13",
    minute=0,
    id="bcv_rates_sync_job",
    replace_existing=True,
    misfire_grace_time=3600,  # Grace time de 1 hora si el servidor está apagado
)


async def _keep_alive_ping() -> None:
    """
    Ping al propio healthcheck del backend cada 10 minutos.
    Evita el cold start de Render (free tier duerme tras 15 min de inactividad),
    que era la causa de los ~10 segundos de latencia percibidos en el login.
    Solo activo si RENDER_SELF_URL está configurada en las variables de entorno.
    """
    self_url = os.getenv("RENDER_SELF_URL", "").rstrip("/")
    if not self_url:
        return  # No configurado — no hacer nada (dev local)

    try:
        import httpx  # httpx ya es dependencia transitiva de FastAPI/httpcore
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{self_url}/health")
            logger.debug("🏓 Keep-alive ping → %s [%s]", self_url, resp.status_code)
    except Exception as ping_err:
        # Un ping fallido no debe detener el scheduler
        logger.warning("⚠️ Keep-alive ping fallido: %s", ping_err)


# ── Job 2: Keep-alive para evitar cold start de Render ─────────────────────────
# Cada 10 minutos (Render duerme tras 15 min de inactividad)
scheduler.add_job(
    _keep_alive_ping,
    trigger="interval",
    minutes=10,
    id="render_keep_alive_job",
    replace_existing=True,
    misfire_grace_time=60,
)

logger.info(
    "📅 Scheduler inicializado — Jobs: BCV Sync (Lun-Vie 8:00/13:00 VET) | "
    "Keep-alive (cada 10 min, activo si RENDER_SELF_URL está configurada)"
)
