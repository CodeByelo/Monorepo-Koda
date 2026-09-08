import os
import pytest

# Asegurar variables de entorno dummy si no están definidas
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/koda_test"
for key in [
    "SECRET_KEY", "AUDIT_LOG_SECRET", "BOT_INTERNAL_API_KEY",
    "ORG_SYNC_API_KEY", "LOGISTICS_INTERNAL_FORWARD_KEY",
    "SSO_BRIDGE_INTERNAL_KEY", "TELEGRAM_LINK_INTERNAL_API_KEY",
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
]:
    if not os.getenv(key):
        os.environ[key] = f"dummy_secret_key_at_least_32_chars_{key.lower()}"

from backend.core.database import current_tenant_id_var
from backend.main import app


@pytest.fixture(autouse=True)
def reset_test_state():
    """
    Fixture autouse para aislar completamente el estado entre tests:
    1. Resetea current_tenant_id_var a None antes y después de cada test.
    2. Guarda una foto de los dependency_overrides previos y los restaura al finalizar,
       evitando fugar mocks locales a otros tests sin destruir overrides a nivel de módulo.
    """
    current_tenant_id_var.set(None)
    overrides_antes = dict(app.dependency_overrides)
    yield
    current_tenant_id_var.set(None)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(overrides_antes)
