from fastapi import APIRouter
from . import reglas, dashboard, libros, declaraciones, retenciones, reportes_pdf

router = APIRouter(prefix="/fiscal", tags=["Fiscal SENIAT"])

router.include_router(reglas.router)
router.include_router(dashboard.router)
router.include_router(libros.router)
router.include_router(declaraciones.router)
router.include_router(retenciones.router)
router.include_router(reportes_pdf.router)
