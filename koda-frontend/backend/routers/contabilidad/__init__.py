from fastapi import APIRouter
from . import cuentas, matriz, asientos, reportes, cierre

router = APIRouter(prefix="/contabilidad", tags=["Contabilidad"])

router.include_router(cuentas.router)
router.include_router(matriz.router)
router.include_router(asientos.router)
router.include_router(reportes.router)
router.include_router(cierre.router)
