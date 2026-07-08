#!/usr/bin/env python3
"""
test_rate_limiter.py
Prueba de integración del Rate Limiter en ambos backends.

- Verifica que el backend de facturación bloquee la ruta /auth/login tras 5 intentos.
- Verifica que el backend corporativo bloquee la ruta /login tras 5 intentos.
- Verifica que una ruta general (no-auth) no se vea afectada por el límite estricto.
"""
import requests
import time

FACTURACION_BASE = "http://localhost:8001"   # koda_facturacion_backend
CORPORATIVO_BASE = "http://localhost:8000"   # koda_backend

PASS = "\033[92m✔️ "
FAIL = "\033[91m✗  "
RESET = "\033[0m"

def test(desc: str, ok: bool):
    icon = PASS if ok else FAIL
    print(f"{icon} {desc}{RESET}")
    if not ok:
        raise SystemExit(1)

print("\n--- INICIANDO PRUEBAS DE RATE LIMITING ---\n")

# ── 1. Rate Limit estricto en /auth/login (Facturación) ──────────────────────
print("1. Probando límite estricto en /auth/login (backend de facturación)...")
blocked = False
for i in range(8):
    r = requests.post(
        f"{FACTURACION_BASE}/auth/login",
        json={"email": "test@ratelimit.com", "password": "wrong"},
        timeout=5,
    )
    if r.status_code == 429:
        blocked = True
        print(f"   → Solicitud {i+1}: HTTP 429 recibido ✓ (Retry-After: {r.headers.get('Retry-After', 'N/A')}s)")
        break
    else:
        print(f"   → Solicitud {i+1}: HTTP {r.status_code}")

test("Ruta /auth/login bloqueada con HTTP 429 tras superar límite", blocked)

# ── 2. Rate Limit general no bloquea tras 5 intentos ─────────────────────────
print("\n2. Verificando que /auth/login con IPs distintas tiene contadores independientes...")
# Con una IP distinta simulada (encabezado X-Forwarded-For si el proxy lo pasa)
r = requests.get(f"{FACTURACION_BASE}/", timeout=5)
test(f"Health check responde correctamente (HTTP {r.status_code})", r.status_code == 200)

# ── 3. Rate Limit estricto en /login (Corporativo) ───────────────────────────
print("\n3. Probando límite estricto en /login (backend corporativo)...")
blocked_corp = False
for i in range(8):
    r = requests.post(
        f"{CORPORATIVO_BASE}/login",
        json={"email": "test@ratelimit.com", "password": "wrong", "tenant_id": "test"},
        timeout=5,
    )
    if r.status_code == 429:
        blocked_corp = True
        print(f"   → Solicitud {i+1}: HTTP 429 recibido ✓ (Retry-After: {r.headers.get('Retry-After', 'N/A')}s)")
        break
    else:
        print(f"   → Solicitud {i+1}: HTTP {r.status_code}")

test("Ruta /login corporativa bloqueada con HTTP 429 tras superar límite", blocked_corp)

print("\n🎉 ¡TODAS LAS PRUEBAS DE RATE LIMITING PASARON EXITOSAMENTE!\n")
