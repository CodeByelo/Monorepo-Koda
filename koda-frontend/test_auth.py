import requests

res_login = requests.post("http://localhost:8001/auth/login", json={"email": "Hrodriguez", "password": "Daniel1910**"})
print("LOGIN:", res_login.status_code, res_login.text)

if res_login.status_code == 200:
    token = res_login.json()["access_token"]
    res_ventas = requests.get("http://localhost:8001/ventas/reporte", headers={"Authorization": f"Bearer {token}"})
    print("VENTAS REPORTE:", res_ventas.status_code, res_ventas.text)
    
    res_ventas2 = requests.get("http://localhost:8001/ventas", headers={"Authorization": f"Bearer {token}"})
    print("VENTAS:", res_ventas2.status_code, res_ventas2.text)
