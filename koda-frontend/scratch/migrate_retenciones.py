import sqlite3

db_path = "/home/byelo/koda-backend/koda-frontend/erp_bimonetario.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE retenciones_iva RENAME COLUMN proveedor_rif TO agente_rif;")
    cur.execute("ALTER TABLE retenciones_iva RENAME COLUMN proveedor_nombre TO agente_nombre;")
    print("Renamed columns.")
except Exception as e:
    print("Rename failed or already done:", e)

try:
    cur.execute("ALTER TABLE retenciones_iva ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'PRACTICADA';")
    print("Added tipo.")
except Exception as e:
    print("tipo might exist:", e)

try:
    cur.execute("ALTER TABLE retenciones_iva ADD COLUMN numero_comprobante VARCHAR(50);")
    print("Added numero_comprobante.")
except Exception as e:
    print("numero_comprobante might exist:", e)

try:
    cur.execute("ALTER TABLE retenciones_iva ADD COLUMN fecha_comprobante DATETIME;")
    print("Added fecha_comprobante.")
except Exception as e:
    print("fecha_comprobante might exist:", e)

conn.commit()
conn.close()
print("DB migration completed.")
