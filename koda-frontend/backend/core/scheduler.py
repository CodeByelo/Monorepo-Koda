"""
backend/core/scheduler.py
──────────────────────────
Programador de tareas en segundo plano (APScheduler) para koda-frontend/backend.

Mismo mecanismo que KODA_Remaster/sistema-corporativo/backend/core/scheduler.py
(AsyncIOScheduler arrancado en el evento "startup" de FastAPI), adaptado a la
convención de imports absolutos `backend.*` de este proyecto. No hay
infraestructura de cron/worker separada: este proceso FastAPI es el único
lugar donde se puede ejecutar algo en un horario, de ahí que el respaldo
automático viva aquí en vez de en un cronjob externo.
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from backend.services.backup_service import BACKUP_INTERVAL_HOURS, ejecutar_backup_programado

logger = logging.getLogger("koda_backend")

scheduler = AsyncIOScheduler()

# ── Job: Respaldo automático de base de datos ──────────────────────────────────
# Configurable vía BACKUP_INTERVAL_HOURS (por defecto cada 24 horas).
scheduler.add_job(
    ejecutar_backup_programado,
    trigger="interval",
    hours=BACKUP_INTERVAL_HOURS,
    id="backup_job",
    replace_existing=True,
    misfire_grace_time=3600,  # 1 hora de gracia si el servidor estaba caído/dormido
)

logger.info(
    "Scheduler inicializado — Job: Respaldo automático de base de datos cada %s horas.",
    BACKUP_INTERVAL_HOURS,
)
