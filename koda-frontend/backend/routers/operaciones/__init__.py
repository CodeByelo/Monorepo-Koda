from .compras import compras_router
from .cobranzas import cobranzas_router
from .pagos import pagos_router
from .tesoreria import tesoreria_router
from .reportes import reportes_router
from .ventas import ventas_ext_router
from .inventario import inventario_ext_router
from .tasas import tasas_router

__all__ = [
    "compras_router",
    "cobranzas_router",
    "pagos_router",
    "tesoreria_router",
    "reportes_router",
    "ventas_ext_router",
    "inventario_ext_router",
    "tasas_router",
]
