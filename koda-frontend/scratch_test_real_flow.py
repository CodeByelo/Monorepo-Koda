import requests

def test_real_flow():
    # 1. Login to Koda Remaster backend on port 8000
    # Koda Remaster backend is mapped to api.localhost inside docker?
    # No, let's look at docker-compose.yml:
    # "8000:8000" maps to the main Koda Remaster backend!
    # Let's verify by posting to http://localhost:8000/api/auth/login
    # Wait, Koda Remaster auth router is included in main.py:
    # app.include_router(auth_router.router)
    # Let's try http://localhost:8000/auth/login or /api/auth/login
    
    url = "http://localhost:8000/auth/login"
    payload = {
        "username": "Hrodriguez",
        "password": "MasterPasswordSuperSecure2026!"
    }
    
    print("Logging in to Koda Remaster...")
    resp = requests.post(url, json=payload)
    print("Login status:", resp.status_code)
    if resp.status_code != 200:
        print("Login failed! Response:", resp.text)
        return
        
    data = resp.json()
    token = data["access_token"]
    print("Successfully got Koda Remaster Token!")
    
    # 2. Call facturacion-backend on port 8001 (which maps to 8000 inside koda_facturacion_backend)
    # Endpoint: GET /ventas
    headers = {
        "Authorization": f"Bearer {token}"
    }
    print("Calling facturacion-backend /ventas...")
    resp_ventas = requests.get("http://localhost:8001/ventas", headers=headers)
    print("Ventas status:", resp_ventas.status_code)
    print("Ventas text:", resp_ventas.text[:200])

if __name__ == "__main__":
    test_real_flow()
