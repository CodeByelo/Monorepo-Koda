import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

# Asegurar que el directorio backend esté en sys.path
sys.path.append("/app")

from jose import jwt
from httpx import AsyncClient, ASGITransport

from main import app
from database.async_db import db_session
from routers.ledger_router import event_buffer, KodaEventCreate, AggregateType, EventSeverity

# JWT Auth config
SECRET_KEY = os.getenv("JWT_SECRET", "tu_clave_secreta_muy_segura_cambiala_en_produccion")
ALGORITHM = "HS256"

def create_test_token(user_id: str, tenant_id: str):
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "username": "tester",
        "role": "Desarrollador" # Usamos rol privilegiado para poder gestionar estados
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def test_ledger_flow():
    print("--- STARTING LEDGER INTEGRATION TESTS ---")
    
    # Asegurar que las particiones existen manualmente sin iniciar el worker
    from routers.ledger_router import ensure_current_partition_exists
    
    tenant_id = None
    user_id = None
    profile_created = False
    
    async with db_session() as conn:
        await ensure_current_partition_exists(conn)
        org_id = await conn.fetchval("SELECT id FROM organizations LIMIT 1")
        if not org_id:
            org_id = await conn.fetchval("INSERT INTO organizations (nombre) VALUES ('Test Org') RETURNING id")
        tenant_id = str(org_id)
        
        user_id = str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO profiles (id, username, nombre, apellido, rol_id, tenant_id, estado)
            VALUES ($1::uuid, $2, 'Test', 'User', 4, $3::uuid, true)
            """,
            uuid.UUID(user_id), f"tester_{user_id[:8]}", uuid.UUID(tenant_id)
        )
        profile_created = True
        
    try:
        token = create_test_token(user_id, tenant_id)
        
        # 1. Test Pydantic validation: secrets forbidden
        print("1. Testing payload secrets validation...")
        try:
            KodaEventCreate(
                event_type="ticket.creado",
                aggregate_type=AggregateType.ticket,
                aggregate_id="12345", 
                gerencia_id=1,        
                payload={"action": "test", "password": "supersecretpassword"},
                severity=EventSeverity.info
            )
            assert False, "Should have raised ValueError for forbidden key 'password'"
        except ValueError as e:
            print(" -> Correctly blocked secret payload:", e)
            
        # 2. Test POST /api/v1/ledger/events endpoint (integrated with Supabase Auth)
        print("2. Testing POST /api/v1/ledger/events...")
        event_payload = {
            "event_type": "ticket.cerrado",
            "aggregate_type": "ticket",
            "aggregate_id": "987654", 
            "gerencia_id": 2,
            "payload": {
                "campo": "estado",
                "valor_anterior": "abierto",
                "valor_nuevo": "cerrado",
                "delta_horas": 4.5
            },
            "severity": "info"
        }
        
        # Utilizar AsyncClient con ASGITransport
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/ledger/events",
                json=event_payload,
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 202, f"Expected 202, got {response.status_code}: {response.text}"
            response_json = response.json()
            print(" -> Response JSON:", response_json)
            assert response_json["status"] == "accepted"
            event_id = response_json["event_id"]
            
            import threading
            print("Test event_buffer ID:", id(event_buffer), file=sys.stderr, flush=True)
            print("Test thread ID:", threading.get_ident(), file=sys.stderr, flush=True)
            try:
                print("Test event loop ID:", id(asyncio.get_running_loop()), file=sys.stderr, flush=True)
            except RuntimeError:
                print("Test event loop ID: No running loop", file=sys.stderr, flush=True)
            print("Queue size before flush:", event_buffer._queue.qsize(), file=sys.stderr, flush=True)
            
            import sys as pysys
            for k, v in list(pysys.modules.items()):
                if "ledger_router" in k and hasattr(v, "event_buffer"):
                    print(f"sys.modules key: {k} -> ID: {id(v.event_buffer)} (queue={v.event_buffer._queue.qsize()})", file=sys.stderr, flush=True)
            
            # Flush manual del buffer
            print(" -> Flushing event buffer manually...", file=sys.stderr, flush=True)
            await event_buffer._flush_pending()
            
            # Check in DB if the event has been written
            print(" -> Checking database for direct event...")
            async with db_session() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM koda_event_ledger WHERE event_id = $1::uuid",
                    uuid.UUID(event_id)
                )
                assert row is not None, "Event was not found in database after flush!"
                print(" -> Found event in DB! event_type:", row["event_type"])
                assert row["aggregate_id"] == "987654"
                
                # Test DB Level Immutability (trigger test)
                print(" -> Testing database level immutability (trigger blocks UPDATE)...")
                try:
                    await conn.execute(
                        "UPDATE koda_event_ledger SET event_type = 'hack' WHERE event_id = $1::uuid",
                        uuid.UUID(event_id)
                    )
                    assert False, "Should have failed to UPDATE a ledger row!"
                except Exception as e:
                    print(" -> Correctly blocked UPDATE on DB level:", str(e))
                    assert "restrict_violation" in str(e) or "VIOLACIÓN DE INMUTABILIDAD" in str(e)

            # 3. Test tickets lifecycle telemetry integration
            print("3. Testing Tickets Lifecycle Telemetry Integration...")
            
            # A) Crear ticket
            ticket_payload = {
                "titulo": "Fallo en servidor de producción",
                "descripcion": "El servidor de producción se encuentra offline tras la actualización.",
                "prioridad": "alta"
            }
            res_create = await ac.post(
                "/tickets",
                json=ticket_payload,
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res_create.status_code == 200, f"Failed to create ticket: {res_create.text}"
            ticket_data = res_create.json()
            ticket_id = ticket_data["id"]
            print(f" -> Created ticket ID: {ticket_id}")

            # B) Asignar ticket (estado: en-proceso)
            res_assign = await ac.patch(
                f"/tickets/{ticket_id}/estado",
                json={"estado": "en-proceso", "observaciones": "Asignado al técnico de guardia"},
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res_assign.status_code == 200, f"Failed to assign ticket: {res_assign.text}"
            print(" -> Assigned ticket successfully.")

            # C) Cerrar/resolver ticket (estado: resuelto)
            res_close = await ac.patch(
                f"/tickets/{ticket_id}/estado",
                json={"estado": "resuelto", "observaciones": "Se reinició el socket de red y ya responde."},
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res_close.status_code == 200, f"Failed to resolve ticket: {res_close.text}"
            print(" -> Resolved ticket successfully.")

            # D) Flush manual del buffer para guardar los eventos
            print(" -> Flushing event buffer manually for tickets...")
            await event_buffer._flush_pending()

            # E) Verificar base de datos
            print(" -> Verifying ticket events in koda_event_ledger...")
            async with db_session() as conn:
                # Verificar ticket.creado
                evt_creado = await conn.fetchrow(
                    "SELECT * FROM koda_event_ledger WHERE aggregate_id = $1 AND event_type = 'ticket.creado'",
                    str(ticket_id)
                )
                assert evt_creado is not None, "Telemetry event 'ticket.creado' not found!"
                assert evt_creado["tenant_id"] == uuid.UUID(tenant_id)
                assert evt_creado["actor_id"] == uuid.UUID(user_id)
                assert evt_creado["payload"]["titulo"] == "Fallo en servidor de producción"
                print("   [OK] ticket.creado verified.")

                # Verificar ticket.asignado
                evt_asignado = await conn.fetchrow(
                    "SELECT * FROM koda_event_ledger WHERE aggregate_id = $1 AND event_type = 'ticket.asignado'",
                    str(ticket_id)
                )
                assert evt_asignado is not None, "Telemetry event 'ticket.asignado' not found!"
                assert evt_asignado["tenant_id"] == uuid.UUID(tenant_id)
                assert evt_asignado["actor_id"] == uuid.UUID(user_id)
                assert evt_asignado["payload"]["valor_nuevo"] == "en-proceso"
                print("   [OK] ticket.asignado verified.")

                # Verificar ticket.cerrado
                evt_cerrado = await conn.fetchrow(
                    "SELECT * FROM koda_event_ledger WHERE aggregate_id = $1 AND event_type = 'ticket.cerrado'",
                    str(ticket_id)
                )
                assert evt_cerrado is not None, "Telemetry event 'ticket.cerrado' not found!"
                assert evt_cerrado["tenant_id"] == uuid.UUID(tenant_id)
                assert evt_cerrado["actor_id"] == uuid.UUID(user_id)
                assert evt_cerrado["payload"]["valor_nuevo"] == "resuelto"
                print("   [OK] ticket.cerrado verified.")
    finally:
        await event_buffer.stop()
        if profile_created:
            async with db_session() as conn:
                try:
                    if 'ticket_id' in locals() and ticket_id:
                        await conn.execute("DELETE FROM ticket_events WHERE ticket_id = $1", ticket_id)
                        await conn.execute("DELETE FROM tickets WHERE id = $1", ticket_id)
                    await conn.execute("DELETE FROM profiles WHERE id = $1::uuid", uuid.UUID(user_id))
                except Exception as cleanup_err:
                    print("Error in cleanup:", cleanup_err)

    print("--- ALL LEDGER INTEGRATION TESTS PASSED SUCCESSFULLY! ---")

if __name__ == "__main__":
    asyncio.run(test_ledger_flow())
