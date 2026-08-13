import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL (o SUPABASE_DB_URL) debe estar definido en el entorno. "
        "No existe una cadena de conexión por defecto."
    )
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # 1. Asegurar campos en turnos_despacho
    conn.execute(text("ALTER TABLE public.turnos_despacho ADD COLUMN IF NOT EXISTS venta_id INTEGER REFERENCES public.ventas(id);"))
    conn.execute(text("ALTER TABLE public.turnos_despacho ADD COLUMN IF NOT EXISTS km_retorno NUMERIC(12, 2);"))
    
    # 2. Tabla turnos_despacho_ventas
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS public.turnos_despacho_ventas (
            id SERIAL PRIMARY KEY,
            turno_id INTEGER NOT NULL REFERENCES public.turnos_despacho(id) ON DELETE CASCADE,
            venta_id INTEGER NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
            orden_parada INTEGER NOT NULL DEFAULT 1,
            estado_entrega VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
            evidencia_foto_url VARCHAR(500),
            motivo_rechazo TEXT
        );
    """))

    # 3. Tabla turnos_gastos
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS public.turnos_gastos (
            id SERIAL PRIMARY KEY,
            turno_id INTEGER NOT NULL REFERENCES public.turnos_despacho(id) ON DELETE CASCADE,
            categoria VARCHAR(50) NOT NULL,
            monto_usd NUMERIC(12, 2) NOT NULL,
            litros_combustible NUMERIC(10, 2),
            descripcion TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """))

    # 4. Tabla logistica_ledger
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS public.logistica_ledger (
            id SERIAL PRIMARY KEY,
            turno_id INTEGER NOT NULL REFERENCES public.turnos_despacho(id) ON DELETE CASCADE,
            estado_anterior VARCHAR(30),
            estado_nuevo VARCHAR(30) NOT NULL,
            fecha_cambio TIMESTAMP DEFAULT NOW(),
            usuario VARCHAR(100) NOT NULL,
            motivo TEXT,
            hash_seguridad VARCHAR(64) NOT NULL
        );
    """))

    # 5. Tabla cuarentena_logistica
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS public.cuarentena_logistica (
            id SERIAL PRIMARY KEY,
            turno_id INTEGER NOT NULL REFERENCES public.turnos_despacho(id) ON DELETE CASCADE,
            producto_id INTEGER NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
            cantidad NUMERIC(15, 2) NOT NULL,
            motivo TEXT NOT NULL,
            estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_REVISION',
            created_at TIMESTAMP DEFAULT NOW()
        );
    """))

    conn.commit()

print('Altered and advanced tables created successfully')
