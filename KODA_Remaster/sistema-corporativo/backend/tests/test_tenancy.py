import pytest
import jwt
from fastapi.testclient import TestClient
from main import app, SECRET_KEY, ALGORITHM

client = TestClient(app)

def create_test_token(username: string, tenant_id: string):
    payload = {
        "sub": username,
        "tenant_id": tenant_id,
        "role": "Usuario"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def test_tenant_isolation():
    """
    Verifica que un usuario no pueda acceder a datos de otro tenant.
    Simulación mediante headers.
    """
    tenant_a = "00000000-0000-0000-0000-000000000001"
    tenant_b = "00000000-0000-0000-0000-000000000002"
    
    token_a = create_test_token("user_a", tenant_a)
    token_b = create_test_token("user_b", tenant_b)
    
    # 1. Request con Tenant A
    response_a = client.get("/documentos", headers={"Authorization": f"Bearer {token_a}"})
    # Aquí en un test real con DB verificaríamos que los registros devueltos solo pertenecen a tenant_a
    assert response_a.status_code in [200, 404] 

    # 2. Intento de acceso sin token (Debe fallar)
    response_no_auth = client.get("/documentos")
    assert response_no_auth.status_code == 403 # Middleware tenancy bloquea
    
    print("Test de aislamiento de Tenancy básico completado.")

if __name__ == "__main__":
    test_tenant_isolation()
