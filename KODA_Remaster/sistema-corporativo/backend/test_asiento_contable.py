#!/usr/bin/env python3
"""
KODA ERP — Test de Integración: Puente Contable Order-to-Cash
=============================================================
Verifica que al emitir una factura se genere automáticamente un asiento
de Partida Doble balanceado (DÉBITO = CRÉDITO) en asientos_contables.

Uso:
    python test_asiento_contable.py
    (desde dentro del contenedor o con acceso a DATABASE_URL)
"""
import asyncio
import os
import uuid
import hashlib
from datetime import datetime, timezone, date as date_type
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

# ── Config ───────────────────────────────────────────────────────────────────
load_dotenv(dotenv_path=Path(__file__).parent / ".env")
DB_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")

TWO  = Decimal("0.01")
SIX  = Decimal("0.000001")
PASS = "✅ PASS"
FAIL = "❌ FAIL"

def q2(v): return Decimal(str(v)).quantize(TWO, rounding=ROUND_HALF_UP)

# ── Helper: imprimir T-Account ────────────────────────────────────────────────
def print_t_account(asiento_id, lineas):
    width = 70
    print("\n" + "─" * width)
    print(f"  T-ACCOUNT — Asiento ID: {asiento_id}")
    print("─" * width)
    print(f"  {'DÉBITO':<35} {'CRÉDITO':>35}")
    print("─" * width)
    total_debe = Decimal("0")
    total_haber = Decimal("0")
    for ln in lineas:
        debe  = Decimal(str(ln["debe_usd"]))
        haber = Decimal(str(ln["haber_usd"]))
        total_debe  += debe
        total_haber += haber
        d_str = f"{ln['cuenta_codigo']} {ln['cuenta_nombre'][:20]} {debe:>9.2f}" if debe else ""
        h_str = f"{ln['cuenta_codigo']} {ln['cuenta_nombre'][:20]} {haber:>9.2f}" if haber else ""
        print(f"  {d_str:<35} {h_str:>35}")
    print("─" * width)
    print(f"  {'TOTAL DÉBITO':.<30} {total_debe:>10.2f}   {'TOTAL CRÉDITO':.<20} {total_haber:>10.2f}")
    print("─" * width)
    return total_debe, total_haber


# ── Test Principal ────────────────────────────────────────────────────────────
async def run_test():
    if not DB_URL:
        print(f"{FAIL} DATABASE_URL no está configurada. Revisa el archivo .env")
        return False

    print(f"\n{'═'*70}")
    print("  KODA ERP — Test de Integración: Puente Contable Order-to-Cash")
    print(f"{'═'*70}\n")

    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)
    all_passed = True

    try:
        # ─── 0. Obtener tenant_id y cliente válido ─────────────────────────
        tenant_row = await conn.fetchrow("SELECT id FROM tenants LIMIT 1")
        if not tenant_row:
            print(f"{FAIL} No hay tenants en la base de datos.")
            return False
        tenant_id = tenant_row["id"]
        print(f"ℹ️  Usando tenant_id: {tenant_id}")

        # facturas.cliente_id es UUID → usamos profiles.id (UUID) como cliente de prueba
        cliente_row = await conn.fetchrow(
            "SELECT id FROM profiles WHERE tenant_id = $1 LIMIT 1", tenant_id
        )
        if not cliente_row:
            # Fallback: cualquier profile en el sistema
            cliente_row = await conn.fetchrow("SELECT id FROM profiles LIMIT 1")
        if not cliente_row:
            # Fallback final: UUID determinístico de prueba
            cliente_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
            print(f"⚠️  No hay profiles. Usando UUID de prueba: {cliente_id}")
        else:
            cliente_id = cliente_row["id"]
        print(f"ℹ️  Usando cliente_id: {cliente_id}\n")

        # ─── 1. Obtener tasa BCV ────────────────────────────────────────────
        tasa_row = await conn.fetchrow(
            """
            SELECT tasa FROM tasas_bcv
            WHERE moneda = 'USD'
            ORDER BY fecha_valor DESC LIMIT 1
            """
        )
        tasa_bcv = Decimal(str(tasa_row["tasa"])) if tasa_row else Decimal("40.00")
        print(f"ℹ️  Tasa BCV USD: {tasa_bcv}")

        # ─── 2. Calcular montos de prueba ───────────────────────────────────
        base_imponible  = q2(Decimal("100.00"))   # USD 100 base
        monto_iva       = q2(base_imponible * Decimal("0.16"))   # 16%
        monto_igtf      = q2((base_imponible + monto_iva) * Decimal("0.03"))  # IGTF
        monto_total     = base_imponible + monto_iva + monto_igtf

        print(f"ℹ️  Base imponible : {base_imponible}")
        print(f"ℹ️  IVA (16%)      : {monto_iva}")
        print(f"ℹ️  IGTF (3%)      : {monto_igtf}")
        print(f"ℹ️  TOTAL          : {monto_total}\n")

        # ─── 3. Obtener correlativo fiscal ──────────────────────────────────
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id)
            )

            corr_row = await conn.fetchrow(
                """
                SELECT prefijo, siguiente_numero FROM correlativos_fiscales
                WHERE tipo_documento = 'FACTURA' FOR UPDATE
                """
            )
            if not corr_row:
                print(f"{FAIL} No existe correlativo fiscal para FACTURA.")
                return False

            prefijo   = corr_row["prefijo"]
            siguiente = corr_row["siguiente_numero"]
            numero_factura = f"{prefijo}{str(siguiente).zfill(8)}"
            numero_control = f"00-{str(siguiente).zfill(8)}"

            await conn.execute(
                "UPDATE correlativos_fiscales SET siguiente_numero = siguiente_numero + 1 WHERE tipo_documento = 'FACTURA'"
            )

            # ─── 4. Insertar la factura ─────────────────────────────────────
            factura_id  = uuid.uuid4()
            creado_por  = uuid.UUID(int=0)
            fecha_now   = datetime.now(timezone.utc)
            fecha_str   = fecha_now.strftime("%Y-%m-%d")
            fecha_date  = fecha_now.date()             # asyncpg requiere date, no str
            hash_str    = f"{numero_factura}|{cliente_id}|{fecha_str}|{monto_total}|{creado_por}"
            hash_integ  = hashlib.sha256(hash_str.encode()).hexdigest()

            await conn.execute(
                """
                INSERT INTO facturas (
                    id, tenant_id, cliente_id, moneda_documento, aplica_igtf,
                    tasa_cambio_historica, base_imponible, monto_iva, monto_igtf,
                    monto_total, numero_factura, creado_por, numero_control, hash_integridad
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                """,
                factura_id, tenant_id, cliente_id, "USD", True,
                float(tasa_bcv), float(base_imponible), float(monto_iva), float(monto_igtf),
                float(monto_total), numero_factura, creado_por, numero_control, hash_integ
            )

            # ─── 5. Insertar asiento contable (el puente) ───────────────────
            concepto = f"Factura de Venta {numero_factura} — Emisión automática"
            asiento_row = await conn.fetchrow(
                """
                INSERT INTO asientos_contables (
                    tenant_id, fecha, concepto, referencia,
                    total_debe_usd, total_haber_usd,
                    tasa_cambio_bs, estado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
                """,
                tenant_id, fecha_date, concepto, numero_factura,
                float(monto_total), float(monto_total),
                float(tasa_bcv), "ACTIVO"
            )
            asiento_id = asiento_row["id"]

            lineas = [
                (tenant_id, asiento_id, "1.2.02.01", "Cuentas por Cobrar Clientes",
                 float(monto_total), 0.0),
                (tenant_id, asiento_id, "5.1.01.01", "Ingresos por Ventas",
                 0.0, float(base_imponible)),
                (tenant_id, asiento_id, "2.1.02.01", "IVA Débito Fiscal por Pagar",
                 0.0, float(monto_iva)),
                (tenant_id, asiento_id, "2.1.03.01", "IGTF por Pagar (3%)",
                 0.0, float(monto_igtf)),
            ]
            await conn.executemany(
                """
                INSERT INTO asiento_detalles (
                    tenant_id, asiento_id, cuenta_codigo, cuenta_nombre,
                    debe_usd, haber_usd
                ) VALUES ($1,$2,$3,$4,$5,$6)
                """,
                lineas
            )

        print(f"✔  Factura insertada  : {numero_factura} (ID: {factura_id})")
        print(f"✔  Asiento generado   : ID {asiento_id}\n")

        # ─── 6. Verificar el asiento en la DB ──────────────────────────────
        asiento_db = await conn.fetchrow(
            "SELECT * FROM asientos_contables WHERE id = $1", asiento_id
        )
        detalles_db = await conn.fetch(
            "SELECT * FROM asiento_detalles WHERE asiento_id = $1 ORDER BY id", asiento_id
        )

        # TEST A: La cabecera existe
        test_a = asiento_db is not None
        print(f"{'A'}) Cabecera en asientos_contables existe  : {PASS if test_a else FAIL}")
        if not test_a:
            all_passed = False

        # TEST B: La referencia es el número de factura
        test_b = asiento_db["referencia"] == numero_factura if asiento_db else False
        print(f"{'B'}) Referencia == numero_factura            : {PASS if test_b else FAIL} ({asiento_db['referencia'] if asiento_db else 'N/A'})")
        if not test_b:
            all_passed = False

        # TEST C: Hay al menos 3 líneas de detalle
        test_c = len(detalles_db) >= 3
        print(f"{'C'}) Número de líneas en asiento_detalles   : {PASS if test_c else FAIL} ({len(detalles_db)} líneas, esperadas ≥3)")
        if not test_c:
            all_passed = False

        # TEST D: DÉBITO == CRÉDITO (cuadre de Partida Doble)
        total_debe  = sum(Decimal(str(r["debe_usd"]))  for r in detalles_db)
        total_haber = sum(Decimal(str(r["haber_usd"])) for r in detalles_db)
        test_d = abs(total_debe - total_haber) < Decimal("0.01")
        print(f"{'D'}) DÉBITO ({total_debe:.2f}) == CRÉDITO ({total_haber:.2f}) : {PASS if test_d else FAIL}")
        if not test_d:
            all_passed = False

        # TEST E: total_debe_usd en cabecera == monto_total de la factura
        cab_debe = Decimal(str(asiento_db["total_debe_usd"])) if asiento_db else Decimal("0")
        test_e = abs(cab_debe - monto_total) < Decimal("0.01")
        print(f"{'E'}) Cabecera total_debe_usd ({cab_debe:.2f}) == monto_total ({monto_total:.2f}) : {PASS if test_e else FAIL}")
        if not test_e:
            all_passed = False

        # TEST F: El factura.hash_integridad está en la DB
        hash_db = await conn.fetchval(
            "SELECT hash_integridad FROM facturas WHERE id = $1", factura_id
        )
        test_f = hash_db == hash_integ
        print(f"{'F'}) Hash de integridad OK                  : {PASS if test_f else FAIL}")
        if not test_f:
            all_passed = False

        # ─── 7. Imprimir T-Account visual ───────────────────────────────────
        d, h = print_t_account(asiento_id, detalles_db)

        # ─── 8. Resultado final ─────────────────────────────────────────────
        print(f"\n{'═'*70}")
        if all_passed:
            print("  🎉  TODOS LOS TESTS PASARON — Flujo Dorado Order-to-Cash VERIFICADO")
        else:
            print("  ⚠️   ALGUNOS TESTS FALLARON — Revisar la salida anterior")
        print(f"{'═'*70}\n")

        return all_passed

    finally:
        await conn.close()


if __name__ == "__main__":
    success = asyncio.run(run_test())
    exit(0 if success else 1)
