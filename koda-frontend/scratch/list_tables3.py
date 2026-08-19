import sqlite3
db_path = "/home/byelo/koda-backend/koda-frontend/erp_bimonetario.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
print(cur.fetchall())
conn.close()
