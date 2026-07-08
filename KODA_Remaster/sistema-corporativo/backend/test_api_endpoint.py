import asyncio
import os
import time
from routers.ai_router import analyze_with_ai, AIAnalyzeRequest
from database.async_db import db_session, init_db_pool

async def main():
    print("Initializing DB Pool...")
    await init_db_pool()
    
    payload = AIAnalyzeRequest(
        mode="preventive",
        user_prompt="¿Me puedes dar un resumen de las últimas facturas de venta y retenciones?"
    )
    current_user = {"tenant_id": "89fd839a-bd5e-419b-abb1-393987fc2d7e"}
    
    print("\nInvoking analyze_with_ai endpoint logic...")
    start_time = time.time()
    
    async with db_session() as conn:
        res = await analyze_with_ai(payload, current_user, conn)
        
    duration = time.time() - start_time
    print("\n" + "="*50)
    print(f"API RESPONSE IN {duration:.2f} SECONDS:")
    print("="*50)
    print("Context Summary:", res.get("context_summary"))
    print("Response text:\n", res.get("response"))
    print("="*50)

if __name__ == "__main__":
    # Make sure we don't hit SSL verification issues in local env if needed
    os.environ["DB_SSL_MODE"] = "require"
    asyncio.run(main())
