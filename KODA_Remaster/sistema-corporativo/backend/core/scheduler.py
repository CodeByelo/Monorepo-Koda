"""
core/scheduler.py
─────────────────
Configuración central del programador de tareas en segundo plano (APScheduler) para Koda ERP.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.bcv_service import fetch_and_save_bcv_rates

logger = logging.getLogger("sistema_corporativo")

# Inicializamos el scheduler con zona horaria de Venezuela para sincronizar a la hora oficial local
scheduler = AsyncIOScheduler(timezone="America/Caracas")

# Tarea programada: Sincronización automática de lunes a viernes
# Se ejecuta a las 8:00 AM y a la 1:00 PM (13:00) hora de Venezuela
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

logger.info("📅 Tareas del Scheduler inicializadas (BCV Sync programado: Lun-Vie 8:00 AM / 1:00 PM VET)")
