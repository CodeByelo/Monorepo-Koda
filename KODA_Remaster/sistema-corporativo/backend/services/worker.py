import os
from arq import create_pool
from arq.connections import RedisSettings

# Herramienta para encolar tareas desde FastAPI
async def get_worker_pool():
    return await create_pool(RedisSettings(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379))
    ))

# Definición de tareas (Worker)
async def send_email_task(ctx, email: str, subject: str, body: str):
    """Ejemplo de tarea asíncrona offloaded."""
    print(f"Enviando email a {email}...")
    # Lógica real de SMTP/Sendgrid aquí
    return True

async def generate_pdf_report(ctx, tenant_id: str, report_data: dict):
    """Generación de PDF pesada."""
    print(f"Generando reporte para {tenant_id}...")
    # Lógica pydf2 / reportlab aquí
    return {"status": "completed", "url": "..."}

class WorkerSettings:
    """Configuración del worker de ARQ."""
    functions = [send_email_task, generate_pdf_report]
    redis_settings = RedisSettings(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379))
    )
