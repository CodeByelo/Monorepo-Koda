import os

import requests

TEST_LOGIN_EMAIL = os.environ.get("TEST_LOGIN_EMAIL")
TEST_LOGIN_PASSWORD = os.environ.get("TEST_LOGIN_PASSWORD")

if not TEST_LOGIN_EMAIL or not TEST_LOGIN_PASSWORD:
    raise RuntimeError(
        "TEST_LOGIN_EMAIL and TEST_LOGIN_PASSWORD must be set in the environment "
        "to run this regression test. No hardcoded credentials are provided."
    )

res_login = requests.post(
    "http://localhost:8001/auth/login",
    json={"email": TEST_LOGIN_EMAIL, "password": TEST_LOGIN_PASSWORD},
)
print("LOGIN:", res_login.status_code, res_login.text)

if res_login.status_code == 200:
    token = res_login.json()["access_token"]
    res_ventas = requests.get("http://localhost:8001/ventas/reporte", headers={"Authorization": f"Bearer {token}"})
    print("VENTAS REPORTE:", res_ventas.status_code, res_ventas.text)
    
    res_ventas2 = requests.get("http://localhost:8001/ventas", headers={"Authorization": f"Bearer {token}"})
    print("VENTAS:", res_ventas2.status_code, res_ventas2.text)
