import asyncio
import os
import random
import uuid
import json
from datetime import datetime, timedelta, timezone
import asyncpg
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)
db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")

# Lists for random names and cargos
NOMBRES = ["Juan", "María", "Carlos", "Ana", "Pedro", "Luis", "Sofía", "Miguel", "Laura", "Diego", 
           "Gabriela", "Jose", "Daniela", "Alejandro", "Valentina", "Manuel", "Camila", "Andrés", "Lucía", "Francisco"]
APELLIDOS = ["González", "Rodríguez", "Pérez", "Gómez", "Fernández", "López", "Martínez", "Díaz", "Hernández", "Sánchez",
             "Álvarez", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Medina", "Herrera", "Suárez", "Giménez"]
CARGOS = ["Analista de Soporte", "Desarrollador Junior", "Desarrollador Senior", "Gerente Operativo", "Asistente Administrativo",
          "Auditor Fiscal", "Contador Principal", "Especialista de Nómina", "Especialista de Ventas", "Supervisor de Almacén"]
CONCEPTOS = ["Pago de Nómina Mensual", "Compra de Equipos de Oficina", "Factura de Venta Corporativa", "Ajuste Contable Anual",
             "Pago de Servicios Eléctricos", "Adquisición de Licencias SaaS", "Reembolso de Gastos de Viaje", "Servicios de Auditoría Externa"]
CUENTAS = [
    ("1.1.01.01", "Caja General"),
    ("1.1.01.02", "Banco Provincial"),
    ("1.1.01.03", "Banco de Venezuela"),
    ("1.2.02.01", "Cuentas por Cobrar Clientes"),
    ("2.1.01.01", "Cuentas por Pagar Proveedores"),
    ("4.1.02.05", "Gasto de Personal"),
    ("4.1.02.10", "Gasto de Alquileres"),
    ("5.1.01.01", "Ingresos por Ventas")
]

def random_date_naive():
    now = datetime.utcnow()
    days_ago = random.randint(0, 365)
    hours_ago = random.randint(0, 23)
    minutes_ago = random.randint(0, 59)
    return now - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)

def random_date_aware():
    now = datetime.now(timezone.utc)
    days_ago = random.randint(0, 365)
    hours_ago = random.randint(0, 23)
    minutes_ago = random.randint(0, 59)
    return now - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)

async def seed_data():
    if not db_url:
        print("DATABASE_URL/SUPABASE_DB_URL not found!")
        return

    print("Connecting to database...")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    
    try:
        # Clean up mutable tables first to prevent duplicate errors
        print("Cleaning up old seeded mutable records...")
        await conn.execute("DELETE FROM recibos_nomina")
        await conn.execute("DELETE FROM empleados")
        
        # Avoid foreign key constraint issues with profiles
        await conn.execute("UPDATE profiles SET gerencia_id = NULL")
        await conn.execute("DELETE FROM gerencias")
        
        await conn.execute("DELETE FROM asiento_detalles")
        await conn.execute("DELETE FROM asientos_contables")
        print("Clean up complete.")

        # 1. Fetch target tenant_id and profile_id for username = 'hrodriguez'
        print("Looking up tenant_id for user 'hrodriguez'...")
        target_profile_row = await conn.fetchrow(
            "SELECT id, tenant_id FROM profiles WHERE LOWER(username) = 'hrodriguez'"
        )
        if target_profile_row:
            master_tenant_id = target_profile_row['tenant_id']
            hrodriguez_profile_id = target_profile_row['id']
            print(f"Using master tenant_id: {master_tenant_id} (derived from 'hrodriguez')")
        else:
            print("Warning: Profile 'hrodriguez' not found. Fetching fallback active profile.")
            fallback_row = await conn.fetchrow(
                "SELECT id, tenant_id FROM profiles WHERE tenant_id IS NOT NULL LIMIT 1"
            )
            if fallback_row:
                master_tenant_id = fallback_row['tenant_id']
                hrodriguez_profile_id = fallback_row['id']
                print(f"Fallback to tenant_id: {master_tenant_id} from profile {fallback_row['id']}")
            else:
                # Organizations fallback
                fallback_org_id = await conn.fetchval("SELECT id FROM organizations LIMIT 1")
                if not fallback_org_id:
                    print("No organizations found in database. Please register one first.")
                    return
                master_tenant_id = fallback_org_id
                hrodriguez_profile_id = None
                print(f"Fallback to first organization tenant_id: {master_tenant_id}")

        # 2. Fetch or Insert Gerencias
        print("Checking official org structure config...")
        cfg_val = await conn.fetchval("SELECT config FROM organizations WHERE id = $1::uuid", master_tenant_id)
        
        official_names = []
        if cfg_val:
            if isinstance(cfg_val, str):
                try:
                    import json
                    cfg_val = json.loads(cfg_val)
                except Exception:
                    pass
            if isinstance(cfg_val, dict) and "org_structure" in cfg_val:
                for group in cfg_val["org_structure"]:
                    for item in group.get("items", []):
                        official_names.append(item.strip())
                        
        if official_names:
            print(f"Found {len(official_names)} official departments. Creating them if not exist...")
            for name in official_names:
                exists = await conn.fetchval(
                    "SELECT 1 FROM gerencias WHERE LOWER(nombre) = LOWER($1) AND tenant_id = $2::uuid LIMIT 1",
                    name, master_tenant_id
                )
                if not exists:
                    await conn.execute(
                        "INSERT INTO gerencias (nombre, siglas, categoria, tenant_id) VALUES ($1, $2, $3, $4::uuid)",
                        name, name[:3].upper(), "Gestión", master_tenant_id
                    )
        else:
            print("No official org structure found. Generating 50 Gerencias...")
            gerencias_data = []
            categorias = ["Operativa", "Administrativa", "Tecnología", "Soporte", "Finanzas"]
            for i in range(1, 51):
                name = f"Gerencia de {random.choice(categorias)} Grupo {i}"
                siglas = f"GER-{i:02d}"
                cat = random.choice(categorias)
                gerencias_data.append((name, siglas, cat, master_tenant_id))
            await conn.executemany("""
                INSERT INTO gerencias (nombre, siglas, categoria, tenant_id)
                VALUES ($1, $2, $3, $4)
            """, gerencias_data)
            
        # Retrieve all gerencias to associate with employees and ledger events
        gerencia_rows = await conn.fetch("SELECT id, nombre, tenant_id FROM gerencias WHERE tenant_id = $1::uuid", master_tenant_id)
        gerencia_ids = [row['id'] for row in gerencia_rows]
        gerencia_map = {row['nombre'].strip().lower(): row['id'] for row in gerencia_rows}
        print(f"Gerencias seeded/resolved successfully. Count in DB for master tenant: {len(gerencia_ids)}")

        # Update profiles to point to appropriate/random gerencias
        print("Updating profiles with appropriate gerencia_ids...")
        profiles = await conn.fetch("SELECT id, username FROM profiles WHERE tenant_id = $1::uuid", master_tenant_id)
        
        # We find specific IDs for key roles if they exist
        g_general_id = gerencia_map.get("gerencia general")
        g_tech_id = gerencia_map.get("gerencia nacional de tecnologías de la información y la comunicación") or gerencia_map.get("tecnología")
        g_admin_id = gerencia_map.get("gerencia nacional de administración") or gerencia_map.get("administración")
        
        for p in profiles:
            username = p['username']
            if username == "ceo_final01" and g_general_id:
                target_g = g_general_id
            elif username in ("Hrodriguez", "carlos_sistemas_kod") and g_tech_id:
                target_g = g_tech_id
            elif username == "ana_admin_kod" and g_admin_id:
                target_g = g_admin_id
            else:
                target_g = random.choice(gerencia_ids) if gerencia_ids else None
                
            if target_g:
                await conn.execute("UPDATE profiles SET gerencia_id = $1 WHERE id = $2", target_g, p['id'])

        # 3. Insert 1,000 Empleados
        print("Generating 1,000 Empleados...")
        empleados_data = []
        for i in range(1000):
            nombre = random.choice(NOMBRES)
            apellido = random.choice(APELLIDOS)
            nombre_completo = f"{nombre} {apellido}"
            cedula = f"V-{random.randint(10000000, 30000000)}"
            cargo = random.choice(CARGOS)
            salario = float(round(random.uniform(300, 5000), 2))
            bono = float(round(random.uniform(40, 150), 2))
            gerencia = random.choice(gerencia_ids)
            
            empleados_data.append((master_tenant_id, cedula, nombre_completo, cargo, salario, bono, 1, gerencia))
            
        await conn.executemany("""
            INSERT INTO empleados (tenant_id, cedula, nombre_completo, cargo, salario_base_usd, bono_alimentacion_usd, activo, gerencia_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """, empleados_data)
        print("1,000 Empleados seeded successfully.")

        # 4. Insert 10,000 Accounting Transactions (Asientos Contables + Detalles)
        print("Generating 10,000 Asientos Contables and Detalles...")
        asientos_data = []
        detalles_data = []
        
        # We need current active profile ids to link as "creado_por" or "actor_id"
        profile_rows = await conn.fetch("SELECT id FROM profiles WHERE tenant_id = $1", master_tenant_id)
        profile_ids = [p['id'] for p in profile_rows]
            
        # In case we don't have profiles matching the tenant
        default_profile_id = hrodriguez_profile_id or (profile_ids[0] if profile_ids else None)

        # Insert 10,000 Asientos Contables
        ref_seq = 1
        for i in range(10000):
            fecha = random_date_naive()
            concepto = random.choice(CONCEPTOS)
            referencia = f"REF-{ref_seq:06d}"
            ref_seq += 1
            monto = float(round(random.uniform(10, 50000), 2))
            tasa = float(round(random.uniform(36.0, 38.0), 4))
            
            asientos_data.append((master_tenant_id, fecha, concepto, referencia, monto, monto, tasa, "ACTIVO"))

        # We will insert them and let PostgreSQL generate the IDs
        print("Bulk inserting 10,000 asientos_contables headers...")
        await conn.executemany("""
            INSERT INTO asientos_contables (tenant_id, fecha, concepto, referencia, total_debe_usd, total_haber_usd, tasa_cambio_bs, estado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """, asientos_data)
        
        # Fetch the inserted asientos contables to get their IDs
        print("Fetching inserted asientos_contables IDs...")
        inserted_asientos = await conn.fetch("""
            SELECT id, tenant_id, total_debe_usd, total_haber_usd
            FROM asientos_contables
            ORDER BY id DESC
            LIMIT 10000
        """)
        
        print(f"Successfully fetched {len(inserted_asientos)} asientos. Constructing details...")
        
        # For each asiento, generate a balanced debit and credit detail
        for row in inserted_asientos:
            asiento_id = row['id']
            monto = row['total_debe_usd']
            
            # Debit detail
            debit_cuenta = random.choice(CUENTAS[:4]) # Select asset/expense account
            detalles_data.append((master_tenant_id, asiento_id, debit_cuenta[0], debit_cuenta[1], monto, 0.00))
            
            # Credit detail
            credit_cuenta = random.choice(CUENTAS[4:]) # Select liability/revenue account
            detalles_data.append((master_tenant_id, asiento_id, credit_cuenta[0], credit_cuenta[1], 0.00, monto))

        print("Bulk inserting 20,000 asiento_detalles lines...")
        await conn.executemany("""
            INSERT INTO asiento_detalles (tenant_id, asiento_id, cuenta_codigo, cuenta_nombre, debe_usd, haber_usd)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, detalles_data)
        print("Accounting transactions seeded successfully.")

        # 5. Insert 10,000 events in koda_event_ledger
        print("Generating 10,000 Immutable Ledger events...")
        ledger_data = []
        event_types = ["ticket.creado", "ticket.asignado", "ticket.cerrado", "factura.emitida", "nomina.pago_aprobado", "usuario.registro"]
        aggregate_types = ["ticket", "ticket", "ticket", "factura", "nomina", "usuario"]
        severities = ["info", "info", "info", "info", "info", "info", "warning", "critical"]
        
        for i in range(10000):
            event_id = uuid.uuid4()
            idx = random.randint(0, len(event_types)-1)
            event_type = event_types[idx]
            agg_type = aggregate_types[idx]
            agg_id = str(uuid.uuid4())
            
            gerencia = random.choice(gerencia_ids)
            
            actor_id = random.choice(profile_ids) if profile_ids else default_profile_id
            
            payload = json.dumps({"monto": round(random.uniform(5, 10000), 2), "description": f"Event trigger {event_type}"})
            metadata = json.dumps({"ip_address": f"192.168.1.{random.randint(1, 254)}", "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            severity = random.choice(severities)
            occurred_at = random_date_aware()
            
            ledger_data.append((event_id, event_type, 1, agg_type, agg_id, gerencia, actor_id, master_tenant_id, payload, metadata, severity, occurred_at, occurred_at))

        print("Bulk inserting 10,000 events in koda_event_ledger...")
        await conn.executemany("""
            INSERT INTO koda_event_ledger (event_id, event_type, event_version, aggregate_type, aggregate_id, gerencia_id, actor_id, tenant_id, payload, metadata, severity, occurred_at, recorded_at)
            VALUES ($1, $2, $3, $4::koda_aggregate_type, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::koda_event_severity, $12, $13)
        """, ledger_data)
        
        print("✅ SEEDING COMPLETE! CAOS INJECTED SUCCESSFULLY FOR MASTER TENANT! 😈🚀")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
