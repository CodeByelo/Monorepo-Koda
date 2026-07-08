import requests
import uuid
import time
import concurrent.futures
import sys

BASE_URL = "http://localhost:8000"

def run_tests():
    print("--- INICIANDO PRUEBAS DE IDEMPOTENCIA ---")

    # 1. Probar solicitud sin cabecera X-Idempotency-Key (debe dar 400)
    print("\n1. Probando solicitud sin cabecera X-Idempotency-Key...")
    res = requests.post(f"{BASE_URL}/test-idempotency-endpoint", json={"data": "test"})
    assert res.status_code == 400, f"Error: Se esperaba 400 pero se obtuvo {res.status_code}"
    assert "Falta el encabezado X-Idempotency-Key" in res.json()["detail"], f"Mensaje inesperado: {res.json()}"
    print("✔️  Solicitud sin cabecera rechazada correctamente (400)")

    # 2. Probar solicitud con cabecera no UUID (debe dar 400)
    print("\n2. Probando solicitud con cabecera no UUID...")
    res = requests.post(
        f"{BASE_URL}/test-idempotency-endpoint", 
        json={"data": "test"}, 
        headers={"X-Idempotency-Key": "no-soy-un-uuid"}
    )
    assert res.status_code == 400, f"Error: Se esperaba 400 pero se obtuvo {res.status_code}"
    assert "UUID valido" in res.json()["detail"], f"Mensaje inesperado: {res.json()}"
    print("✔️  Solicitud con formato no UUID rechazada correctamente (400)")

    # 3. Registrar primera solicitud legítima (debe dar 200 y guardar en cache)
    key_1 = str(uuid.uuid4())
    print(f"\n3. Registrando primera solicitud con key={key_1}...")
    res_1 = requests.post(
        f"{BASE_URL}/test-idempotency-endpoint", 
        json={"data": "transaccion-1"}, 
        headers={"X-Idempotency-Key": key_1}
    )
    assert res_1.status_code == 200, f"Error: Se esperaba 200 pero se obtuvo {res_1.status_code}"
    data_1 = res_1.json()
    t1 = data_1["timestamp"]
    print(f"✔️  Primera solicitud procesada exitosamente. Timestamp: {t1}")

    # 4. Re-enviar con la misma clave (debe responder de inmediato con la respuesta cacheada original)
    print(f"\n4. Re-enviando solicitud con la misma key={key_1}...")
    res_2 = requests.post(
        f"{BASE_URL}/test-idempotency-endpoint", 
        json={"data": "transaccion-1"}, 
        headers={"X-Idempotency-Key": key_1}
    )
    assert res_2.status_code == 200, f"Error: Se esperaba 200 pero se obtuvo {res_2.status_code}"
    data_2 = res_2.json()
    t2 = data_2["timestamp"]
    assert t1 == t2, f"Error: El timestamp cambio! Se esperaba que fuera cacheado. T1={t1}, T2={t2}"
    assert data_1["data"] == data_2["data"], "Los datos no coinciden"
    print(f"✔️  Cache hit exitoso! Se retorno la respuesta original. Timestamp: {t2}")

    # 5. Solicitar con una clave diferente (debe dar 200 y nuevo timestamp)
    key_2 = str(uuid.uuid4())
    print(f"\n5. Registrando solicitud con nueva key={key_2}...")
    res_3 = requests.post(
        f"{BASE_URL}/test-idempotency-endpoint", 
        json={"data": "transaccion-1"}, 
        headers={"X-Idempotency-Key": key_2}
    )
    assert res_3.status_code == 200, f"Error: Se esperaba 200 pero se obtuvo {res_3.status_code}"
    t3 = res_3.json()["timestamp"]
    assert t1 != t3, f"Error: Se esperaba un nuevo timestamp, pero se obtuvo el mismo: {t3}"
    print(f"✔️  Nueva solicitud procesada con exito. Nuevo Timestamp: {t3}")

    # 6. Probar concurrencia / solicitudes simultaneas (doble clic)
    # Enviamos en paralelo dos peticiones con la misma key y un delay
    key_concurrente = str(uuid.uuid4())
    print(f"\n6. Probando solicitudes simultaneas (concurrencia) con key={key_concurrente}...")
    
    def send_request(delay):
        try:
            return requests.post(
                f"{BASE_URL}/test-idempotency-endpoint",
                json={"data": "concurrente", "delay": delay},
                headers={"X-Idempotency-Key": key_concurrente}
            )
        except Exception as e:
            return e

    # Usar ThreadPoolExecutor para enviar en paralelo
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        # Peticion A con delay de 1 seg, Peticion B se envia casi inmediatamente despues
        future_a = executor.submit(send_request, 1)
        time.sleep(0.1) # Breve espera para asegurar orden de llegada
        future_b = executor.submit(send_request, 0)
        
        res_a = future_a.result()
        res_b = future_b.result()

    print(f"   Respuesta A: Código {res_a.status_code}, Cuerpo: {res_a.json() if hasattr(res_a, 'json') else res_a}")
    print(f"   Respuesta B: Código {res_b.status_code}, Cuerpo: {res_b.json() if hasattr(res_b, 'json') else res_b}")

    # Una de las dos debe ser 200 y la otra debe ser 409 (Conflict)
    status_codes = {res_a.status_code, res_b.status_code}
    assert 200 in status_codes, "Ninguna solicitud dio status 200"
    assert 409 in status_codes, "Ninguna solicitud dio status 409 (Conflict)"
    print("✔️  Bloqueo de concurrencia (doble clic) exitoso! Una solicitud proceso y la otra fue rechazada con 409 Conflict.")

    print("\n🎉 ¡TODAS LAS PRUEBAS DE IDEMPOTENCIA PASARON EXITOSAMENTE!")

if __name__ == "__main__":
    run_tests()
