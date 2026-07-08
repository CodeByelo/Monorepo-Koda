import sys
import requests
import uuid
from datetime import datetime

BASE_URL = "http://localhost:8000"

def test_logistics_flow():
    print("🚀 Starting Logistics End-to-End API Verification...")
    
    suffix = str(uuid.uuid4())[:8]
    placa = f"TST{suffix.upper()}"
    vehiculo_nombre = f"Kenworth Test {suffix}"
    chofer_nombre = f"Chofer Test {suffix}"
    cedula = f"V-{suffix}"

    # 1. Get initial vehicles list
    print("\n1. Testing GET /api/logistica/vehiculos...")
    resp = requests.get(f"{BASE_URL}/api/logistica/vehiculos")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    initial_vehicles = resp.json()
    print(f"✔️ GET /api/logistica/vehiculos success. Found {len(initial_vehicles)} initial vehicles.")

    # 2. Create test vehicle
    print("\n2. Testing POST /api/logistica/vehiculos (create vehicle)...")
    payload_vehiculo = {
        "nombre": vehiculo_nombre,
        "placa": placa,
        "tipo": "CAMION",
        "marca": "Kenworth",
        "modelo": "T680",
        "anio": 2022,
        "color": "Blanco",
        "capacidad_kg": 15000.0,
        "km_actuales": 12000.0,
        "proximo_servicio_km": 15000.0
    }
    resp = requests.post(f"{BASE_URL}/api/logistica/vehiculos", json=payload_vehiculo)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
    res_vehiculo = resp.json()
    vehiculo_id = res_vehiculo["id"]
    print(f"✔️ POST /api/logistica/vehiculos success. Created Vehicle ID: {vehiculo_id}")

    # Verify vehicle was added and can be fetched
    resp = requests.get(f"{BASE_URL}/api/logistica/vehiculos")
    vehicles = resp.json()
    created_veh = [v for v in vehicles if v["id"] == vehiculo_id]
    assert len(created_veh) == 1, "Created vehicle not found in list"
    assert created_veh[0]["nombre"] == vehiculo_nombre
    assert created_veh[0]["placa"] == placa
    print("✔️ Vehicle verified in GET list.")

    # 3. Create test driver
    print("\n3. Testing POST /api/logistica/choferes (create driver)...")
    payload_chofer = {
        "nombre": chofer_nombre,
        "cedula": cedula,
        "telefono": "0412-1111111",
        "telegram_chat_id": "987654321",
        "licencia_tipo": "Quinta"
    }
    resp = requests.post(f"{BASE_URL}/api/logistica/choferes", json=payload_chofer)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
    res_chofer = resp.json()
    chofer_id = res_chofer["id"]
    print(f"✔️ POST /api/logistica/choferes success. Created Driver ID: {chofer_id}")

    # 4. Create Turno de Despacho
    print("\n4. Testing POST /api/logistica/turnos (create dispatch shift)...")
    today_iso = datetime.now().isoformat()
    payload_turno = {
        "vehiculo_id": vehiculo_id,
        "chofer_id": chofer_id,
        "fecha_salida": today_iso,
        "destino": "Valencia",
        "ruta_descripcion": "Autopista Regional del Centro",
        "observaciones": "Entrega prioritaria de alimentos",
        "nota_entrega_ref": "NE-10293"
    }
    resp = requests.post(f"{BASE_URL}/api/logistica/turnos", json=payload_turno)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
    turno = resp.json()
    turno_id = turno["id"]
    assert turno["numero_turno"] is not None
    print(f"✔️ POST /api/logistica/turnos success. Created Turno ID: {turno_id}, Numero: {turno['numero_turno']}")

    # 5. Verify Dashboard Statistics
    print("\n5. Testing GET /api/logistica/dashboard (KPI stats)...")
    resp = requests.get(f"{BASE_URL}/api/logistica/dashboard")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    dash = resp.json()
    print("✔️ Dashboard details:")
    print(f"   - Total Vehículos: {dash['vehiculos']['total']}")
    print(f"   - Vehículos Disponibles: {dash['vehiculos']['disponibles']}")
    print(f"   - Total Choferes: {dash['choferes']['total']}")
    print(f"   - Turnos Programados Hoy: {dash['turnos_hoy']['programados']}")

    # 6. Update Turno State (EN_RUTA)
    print("\n6. Testing PUT /api/logistica/turnos/{id}/estado (change status to EN_RUTA)...")
    resp = requests.put(f"{BASE_URL}/api/logistica/turnos/{turno_id}/estado", json={"estado": "EN_RUTA"})
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    turno_updated = resp.json()
    assert turno_updated["nuevo_estado"] == "EN_RUTA"
    print(f"✔️ Turno ID {turno_id} state successfully updated to EN_RUTA.")

    # 7. Create Maintenance Entry
    print("\n7. Testing POST /api/logistica/mantenimiento (create maintenance entry)...")
    payload_maint = {
        "vehiculo_id": vehiculo_id,
        "tipo": "PREVENTIVO",
        "descripcion": "Cambio de Aceite de Motor",
        "costo_usd": 120.50,
        "km_al_servicio": 12500.0,
        "proximo_km": 17500.0
    }
    resp = requests.post(f"{BASE_URL}/api/logistica/mantenimiento", json=payload_maint)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
    maint = resp.json()
    maint_id = maint["id"]
    print(f"✔️ POST /api/logistica/mantenimiento success. Created Maintenance ID: {maint_id}")

    # 8. Verify Maintenance History
    print("\n8. Testing GET /api/logistica/mantenimiento...")
    resp = requests.get(f"{BASE_URL}/api/logistica/mantenimiento", params={"vehiculo_id": vehiculo_id})
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    history = resp.json()
    assert len(history) >= 1
    assert history[0]["descripcion"] == "Cambio de Aceite de Motor"
    print(f"✔️ GET /api/logistica/mantenimiento success. Found {len(history)} entries for vehicle ID {vehiculo_id}.")

    print("\n🎉 ALL LOGISTICS END-TO-END API TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    try:
        test_logistics_flow()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ Test assertion failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
