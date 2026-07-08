import os
import sys
import random

# Agregar la raíz del proyecto al path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.database import SessionLocal
from backend.models import erp_extended
from backend.models.operations import Proveedor, EvaluacionProveedor

def seed_evaluaciones():
    db = SessionLocal()
    try:
        proveedores = db.query(Proveedor).all()
        if not proveedores:
            print("No hay proveedores. Creando proveedores de prueba...")
            nombres = ["TechCorp CA", "Suministros Globales", "Inversiones El Faro", "MegaDistribuidora JD"]
            for i, nombre in enumerate(nombres):
                prov = Proveedor(rif=f"J-{3000000+i}-0", nombre=nombre, telefono="0414-0000000", email=f"contacto{i}@test.com", direccion="Caracas")
                db.add(prov)
            db.commit()
            proveedores = db.query(Proveedor).all()

        for prov in proveedores:
            # Eliminar evaluaciones anteriores
            db.query(EvaluacionProveedor).filter(EvaluacionProveedor.proveedor_id == prov.id).delete()

            # Crear nueva evaluación con datos semi-aleatorios realistas
            score_precio = random.randint(60, 95)
            score_calidad = random.randint(70, 100)
            score_entrega = random.randint(50, 100)
            
            riesgo_imp = random.uniform(0.0, 40.0)
            riesgo_vol = random.uniform(0.0, 20.0)
            estabilidad = random.uniform(70.0, 100.0)
            
            tasa_merma = random.uniform(0.0, 8.0) # Algunas tendrán alerta (>5.0)

            ev = EvaluacionProveedor(
                proveedor_id=prov.id,
                score_precio=score_precio,
                score_calidad=score_calidad,
                score_entrega=score_entrega,
                riesgo_importacion_pct=riesgo_imp,
                volatilidad_precio_pct=riesgo_vol,
                estabilidad_proveedor_pct=estabilidad,
                tasa_merma_pct=tasa_merma
            )
            db.add(ev)
        
        db.commit()
        print(f"Se generaron evaluaciones de prueba para {len(proveedores)} proveedores.")

    except Exception as e:
        db.rollback()
        print(f"Error al poblar evaluaciones: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_evaluaciones()
