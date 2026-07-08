"""Migraciones ligeras SQLite para alinear esquema con modelos actuales."""
import sqlite3
import os
from backend.core.database import DATABASE_URL


def run_sqlite_migrations():
    if not DATABASE_URL.startswith("sqlite"):
        return
    path = DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
    if path.startswith("./"):
        path = path[2:]
    if not os.path.exists(path):
        return

    conn = sqlite3.connect(path)
    cur = conn.cursor()

    def has_column(table: str, column: str) -> bool:
        cur.execute(f"PRAGMA table_info({table})")
        return column in [row[1] for row in cur.fetchall()]

    def has_table(table: str) -> bool:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
        return cur.fetchone() is not None

    ventas_cols = {
        "estado": "VARCHAR(20) DEFAULT 'ACTIVA'",
        "subtotal": "NUMERIC(10,2) DEFAULT 0",
        "iva": "NUMERIC(10,2) DEFAULT 0",
        "igtf": "NUMERIC(10,2) DEFAULT 0",
        "metodo_pago": "VARCHAR(50) DEFAULT 'Efectivo'",
        "tasa_cambio_bs": "NUMERIC(10,4) DEFAULT 36.52",
        "numero_factura": "VARCHAR(50) DEFAULT ''",
    }
    if has_table("ventas"):
        for col, typedef in ventas_cols.items():
            if not has_column("ventas", col):
                cur.execute(f"ALTER TABLE ventas ADD COLUMN {col} {typedef}")

    if has_table("cuentas_por_pagar") and not has_column("cuentas_por_pagar", "numero_documento"):
        cur.execute("ALTER TABLE cuentas_por_pagar ADD COLUMN numero_documento VARCHAR(50) DEFAULT ''")

    if has_table("cuentas_por_cobrar") and not has_column("cuentas_por_cobrar", "numero_documento"):
        cur.execute("ALTER TABLE cuentas_por_cobrar ADD COLUMN numero_documento VARCHAR(50) DEFAULT ''")

    conn.commit()
    conn.close()
