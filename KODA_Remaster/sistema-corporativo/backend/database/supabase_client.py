from supabase import create_client, Client
from config.supabase_config import get_supabase_settings
import logging

settings = get_supabase_settings()
logger = logging.getLogger("supabase_auditoria")

# Auditoría de Opaque Keys (Docker Cache Check)
def obfuscate_key(key):
    if not key or len(key) < 10:
        return "***"
    return f"{key[:10]}...{key[-4:]}"

print(f"\n[AUDITORIA] URL Supabase en memoria: {settings.supabase_url}", flush=True)
print(f"[AUDITORIA] API KEY en memoria: {obfuscate_key(settings.supabase_key)}\n", flush=True)

def get_supabase_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_key)

def get_supabase_admin_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
