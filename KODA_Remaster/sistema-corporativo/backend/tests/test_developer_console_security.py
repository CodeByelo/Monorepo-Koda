"""
Tests para el blindaje del Panel de Dueño (Developer Console):
1. Blindaje contra eliminar el último usuario con rol Desarrollador (rol_id = 4).
2. Bloqueo de eliminación de empresas (tenants) que ya tengan registros en el ERP.
"""
import os
import uuid
import pytest
from fastapi.testclient import TestClient
from jose import jwt

from main import app
import database.async_db as async_db
from auth.supabase_auth import get_current_user
from routers.developer_router import require_developer

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"

client = TestClient(app)

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"
DEV_USERNAME = "dev_master"


def _make_dev_token(user_id: str = DEV_USER_ID, username: str = DEV_USERNAME) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "email": f"{username}@koda.test",
        "role": "Desarrollador",
        "rol": "Desarrollador",
        "tenant_id": None
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


class FakeConnection:
    """Mock de conexión asyncpg para pruebas unitarias de endpoints protegidos."""
    def __init__(self, profiles_db=None, erp_tables_db=None, orgs_db=None):
        # profiles_db: dict de user_id -> {"id": uuid, "rol_id": int, "estado": bool, "username": str}
        self.profiles = profiles_db if profiles_db is not None else {}
        # erp_tables_db: dict de (tabla, tenant_id) -> count
        self.erp_data = erp_tables_db if erp_tables_db is not None else {}
        # orgs_db: dict de tenant_id -> name
        self.orgs = orgs_db if orgs_db is not None else {}
        self.user_orgs = []
        self.deleted_profiles = []
        self.deleted_tenants = []

    def transaction(self):
        class _Tx:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                return False
        return _Tx()

    async def fetchrow(self, query, *args):
        # Buscar usuario en profiles
        if "SELECT id, rol_id, estado FROM profiles" in query:
            user_id = str(args[0])
            p = self.profiles.get(user_id)
            if p:
                return {"id": p["id"], "rol_id": p["rol_id"], "estado": p["estado"]}
            return None
        return None

    async def fetchval(self, query, *args):
        # Conteo de desarrolladores activos
        if "SELECT count(*) FROM profiles WHERE rol_id = 4 AND estado = TRUE" in query:
            count = sum(1 for p in self.profiles.values() if p["rol_id"] == 4 and p["estado"] is True)
            return count

        # Consulta existencia tenant
        if "SELECT name FROM organizations WHERE id =" in query:
            t_id = str(args[0])
            return self.orgs.get(t_id)

        # Conteo de registros en tablas ERP
        if "SELECT count(*) FROM" in query:
            for tabla in ["ventas", "productos", "clientes", "facturas", "cuentas_bancarias", "asientos_contables"]:
                if f"FROM {tabla} WHERE tenant_id =" in query:
                    t_id = str(args[0])
                    return self.erp_data.get((tabla, t_id), 0)
            return 0

        return None

    async def execute(self, query, *args):
        if "DELETE FROM profiles WHERE id =" in query:
            user_id = str(args[0])
            if user_id in self.profiles:
                del self.profiles[user_id]
            self.deleted_profiles.append(user_id)
        elif "DELETE FROM user_organizations WHERE user_id =" in query:
            user_id = str(args[0])
            self.user_orgs = [uo for uo in self.user_orgs if uo["user_id"] != user_id]
        elif "DELETE FROM app_users WHERE id =" in query:
            pass
        elif "DELETE FROM organizations WHERE id =" in query:
            t_id = str(args[0])
            if t_id in self.orgs:
                del self.orgs[t_id]
            self.deleted_tenants.append(t_id)
        return "OK"


class FakePool:
    def __init__(self, conn: FakeConnection):
        self._conn = conn

    def acquire(self):
        conn = self._conn
        class _AcquireCtx:
            async def __aenter__(self):
                return conn
            async def __aexit__(self, *args):
                return False
        return _AcquireCtx()


def test_delete_user_bloquea_ultimo_desarrollador_activo(monkeypatch):
    """
    1. Si hay 2 desarrolladores activos (dev1, dev2), eliminar a dev2 funciona (queda dev1).
    2. Intentar eliminar al desarrollador restante cuando solo queda 1 debe fallar con HTTP 409.
    """
    dev1_id = "11111111-1111-1111-1111-111111111111"
    dev2_id = "22222222-2222-2222-2222-222222222222"

    profiles_data = {
        dev1_id: {"id": dev1_id, "rol_id": 4, "estado": True, "username": "henry_dev"},
        dev2_id: {"id": dev2_id, "rol_id": 4, "estado": True, "username": "drodriguez_dev"}
    }
    fake_conn = FakeConnection(profiles_db=profiles_data)
    fake_pool = FakePool(fake_conn)
    monkeypatch.setattr(async_db, "pool", fake_pool)

    # Autenticarse como dev1 para operar sobre dev2
    token_dev1 = _make_dev_token(user_id=dev1_id, username="henry_dev")

    # 1. Eliminar dev2 cuando hay 2 activos -> DEBE FUNCIONAR (status 200)
    res_delete_dev2 = client.delete(f"/dev/users/{dev2_id}", headers={"Authorization": f"Bearer {token_dev1}"})
    assert res_delete_dev2.status_code == 200, res_delete_dev2.text
    assert dev2_id not in fake_conn.profiles
    assert len(fake_conn.profiles) == 1

    # Autenticarse con otro desarrollador para intentar eliminar a dev1 (ya que uno no puede borrarse a sí mismo)
    other_caller_token = _make_dev_token(user_id="99999999-9999-9999-9999-999999999999", username="otro_dev")

    # 2. Intentar eliminar a dev1 siendo el ÚLTIMO activo -> DEBE FALLAR CON 409
    res_delete_last_dev = client.delete(f"/dev/users/{dev1_id}", headers={"Authorization": f"Bearer {other_caller_token}"})
    assert res_delete_last_dev.status_code == 409, res_delete_last_dev.text
    assert "No puedes eliminar al único Desarrollador activo del sistema" in res_delete_last_dev.json()["detail"]
    assert dev1_id in fake_conn.profiles  # Sigue intacto en la base de datos


def test_delete_user_limpia_user_organizations(monkeypatch):
    """
    Verifica que al eliminar un usuario, también se eliminen sus registros
    asociados en user_organizations para evitar filas huérfanas.
    """
    user_id = "44444444-4444-4444-4444-444444444444"
    org_id = "55555555-5555-5555-5555-555555555555"

    profiles_data = {
        user_id: {"id": user_id, "rol_id": 3, "estado": True, "username": "emp_regular"}
    }
    user_orgs_data = [
        {"user_id": user_id, "organization_id": org_id, "role": "member"}
    ]

    fake_conn = FakeConnection(profiles_db=profiles_data)
    fake_conn.user_orgs = user_orgs_data
    fake_pool = FakePool(fake_conn)
    monkeypatch.setattr(async_db, "pool", fake_pool)

    dev_token = _make_dev_token()

    res = client.delete(f"/dev/users/{user_id}", headers={"Authorization": f"Bearer {dev_token}"})
    assert res.status_code == 200, res.text
    assert user_id not in fake_conn.profiles
    assert len(fake_conn.user_orgs) == 0  # Fila en user_organizations limpiada


def test_delete_tenant_bloquea_si_tiene_datos_en_erp(monkeypatch):
    """
    1. Si un tenant tiene registros en productos del ERP, el DELETE /dev/tenants/{id}
       debe responder con HTTP 409 mencionando 'productos'.
    2. Al eliminar los registros del ERP, reintentar el borrado del tenant funciona exitosamente (status 200).
    """
    tenant_id = "33333333-3333-3333-3333-333333333333"
    orgs_data = {tenant_id: "Empresa Con Datos ERP"}
    erp_data = {("productos", tenant_id): 5}  # 5 productos asociados a este tenant

    fake_conn = FakeConnection(orgs_db=orgs_data, erp_tables_db=erp_data)
    fake_pool = FakePool(fake_conn)
    monkeypatch.setattr(async_db, "pool", fake_pool)

    dev_token = _make_dev_token()

    # 1. Intento de borrado con productos en ERP -> DEBE RECHAZAR CON 409
    res = client.delete(f"/dev/tenants/{tenant_id}", headers={"Authorization": f"Bearer {dev_token}"})
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert "esta empresa tiene 5 registro(s) en 'productos' del ERP" in detail
    assert tenant_id in fake_conn.orgs  # No se eliminó

    # 2. Se limpian o migran los datos del ERP (count = 0)
    fake_conn.erp_data[("productos", tenant_id)] = 0

    # 3. Reintento de borrado -> DEBE FUNCIONAR (status 200)
    res_ok = client.delete(f"/dev/tenants/{tenant_id}", headers={"Authorization": f"Bearer {dev_token}"})
    assert res_ok.status_code == 200, res_ok.text
    assert tenant_id not in fake_conn.orgs
    assert tenant_id in fake_conn.deleted_tenants
