"""
services/bcv_service.py
───────────────────────
Servicio para la extracción automatizada y almacenamiento histórico de tasas BCV (USD/EUR).
"""

import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta, date
from database.async_db import db_session
from pyBCV import Currency

logger = logging.getLogger("sistema_corporativo")

class BCV:
    """
    Wrapper compatible para emular instanciación pybcv.BCV()
    utilizando el módulo pyBCV.Currency de la versión instalada (1.1.2).
    """
    def __init__(self):
        self.currency = Currency()
        
    def get_rate(self, code: str) -> float:
        val = self.currency.get_rate(code)
        if isinstance(val, (int, float)):
            return float(val)
        return float(str(val).replace(",", ".").strip())

    def get_fecha(self) -> str:
        return self.currency.get_rate("Fecha")


async def fetch_and_save_bcv_rates() -> dict:
    """
    Extrae las tasas actuales de USD y EUR de pyBCV y las guarda en la tabla tasas_bcv.
    Si el BCV está caído, emite un warning en logs y mantiene la última tasa válida.
    """
    loop = asyncio.get_event_loop()
    
    def _fetch_sync():
        client = BCV()
        usd = client.get_rate("USD")
        eur = client.get_rate("EUR")
        fecha_str = client.get_fecha()
        return usd, eur, fecha_str

    try:
        # Ejecutar scraping síncrono en ThreadPoolExecutor para no bloquear el event loop de FastAPI
        with ThreadPoolExecutor(max_workers=1) as pool:
            usd, eur, fecha_str = await loop.run_in_executor(pool, _fetch_sync)
        logger.info(f"✅ pyBCV extraction success: USD={usd}, EUR={eur}, Date={fecha_str}")
    except Exception as e:
        logger.warning(
            f"⚠️ Advertencia al consultar tasas del BCV (portal posiblemente caído): {e}. "
            "Se mantiene la última tasa válida en base de datos sin cambios."
        )
        return {
            "status": "warning",
            "message": f"BCV no disponible: {e}"
        }

    # Mapeo de meses en español para convertir 'Fecha' a date objeto de Python
    months_map = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
        'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    }
    
    try:
        parts = fecha_str.strip().split()
        day = int(parts[1])
        month_name = parts[3].lower()
        month = months_map[month_name]
        year = int(parts[5])
        fecha_valor = date(year, month, day)
    except Exception as parse_err:
        logger.error(f"❌ Error al procesar fecha del BCV '{fecha_str}': {parse_err}. Usando fecha local de Venezuela.")
        vet_tz = timezone(timedelta(hours=-4))
        fecha_valor = datetime.now(vet_tz).date()

    # Query para realizar el UPSERT en la tabla histórica de tasas_bcv
    upsert_sql = """
        INSERT INTO tasas_bcv (moneda, tasa, fecha_valor, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (moneda, fecha_valor)
        DO UPDATE SET
            tasa = EXCLUDED.tasa,
            created_at = EXCLUDED.created_at
    """
    
    try:
        async with db_session() as conn:
            # 1. Persistir histórico en tasas_bcv
            await conn.execute(upsert_sql, "USD", usd, fecha_valor)
            await conn.execute(upsert_sql, "EUR", eur, fecha_valor)
            
            # 2. Mantener la tabla bcv_rates actualizada para la compatibilidad de lectura actual
            await conn.execute("""
                INSERT INTO bcv_rates (currency, rate, updated_at, source)
                VALUES ($1, $2, NOW(), 'pyBCV')
                ON CONFLICT (currency)
                DO UPDATE SET
                    rate = EXCLUDED.rate,
                    updated_at = EXCLUDED.updated_at,
                    source = EXCLUDED.source
            """, "USD", usd)
            
            await conn.execute("""
                INSERT INTO bcv_rates (currency, rate, updated_at, source)
                VALUES ($1, $2, NOW(), 'pyBCV')
                ON CONFLICT (currency)
                DO UPDATE SET
                    rate = EXCLUDED.rate,
                    updated_at = EXCLUDED.updated_at,
                    source = EXCLUDED.source
            """, "EUR", eur)
            
        logger.info(f"✅ Tasas persistidas exitosamente (fecha_valor={fecha_valor})")
        return {
            "status": "ok",
            "rates": {"USD": usd, "EUR": eur},
            "fecha_valor": fecha_valor
        }
    except Exception as db_err:
        logger.error(f"❌ Error al guardar tasas BCV en base de datos: {db_err}")
        return {
            "status": "error",
            "message": f"Error persistencia DB: {db_err}"
        }
