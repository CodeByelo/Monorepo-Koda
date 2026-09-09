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
import os

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

# ── Job: Keep-alive para evitar cold start de Render ────────────────────────────
# Ping a la raíz del propio backend cada 10 minutos. Evita que Render duerma la
# instancia (plan free duerme tras ~15 min de inactividad, causando ~50s de
# demora en la primera petición). Solo activo si RENDER_SELF_URL está definida
# en el entorno (no hace nada en local/dev).
async def _keep_alive_ping() -> None:
    self_url = os.getenv("RENDER_SELF_URL", "").rstrip("/")
    if not self_url:
        return

    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{self_url}/")
            logger.debug("🏓 Keep-alive ping → %s [%s]", self_url, resp.status_code)
    except Exception as ping_err:
        logger.warning("⚠️ Keep-alive ping fallido: %s", ping_err)


scheduler.add_job(
    _keep_alive_ping,
    trigger="interval",
    minutes=10,
    id="render_keep_alive_job",
    replace_existing=True,
    misfire_grace_time=60,
)

logger.info(
    "Scheduler inicializado — Jobs: Respaldo automático de base de datos (cada %s horas) | "
    "Keep-alive (cada 10 min, activo si RENDER_SELF_URL está configurada)",
    BACKUP_INTERVAL_HOURS,
)
