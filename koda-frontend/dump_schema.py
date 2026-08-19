import os
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql
from backend.core.database import Base

# Importamos todos los modelos para asegurarnos de que la metadata se pueble correctamente
from backend.models import core, operations, accounting, hr, fiscal, erp_extended, audit

def generate_sql():
    sql_text = "-- KODA ERP: Supabase Initial Schema\n\n"
    
    for table in Base.metadata.sorted_tables:
        create_stmt = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        sql_text += create_stmt.strip() + ";\n\n"
        
    with open("supabase_init.sql", "w", encoding="utf-8") as f:
        f.write(sql_text)
        
    print("El archivo 'supabase_init.sql' ha sido generado exitosamente.")

if __name__ == "__main__":
    generate_sql()
