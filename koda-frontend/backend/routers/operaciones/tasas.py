from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from typing import Optional, List

from backend.core.database import get_db
from backend.models.operations import (
    Venta, Cliente, Proveedor, Producto, VentaDetalle, KardexMovimiento, EvaluacionProveedor
)
from backend.models.erp_extended import (
    Compra, CuentaPorCobrar, CuentaPorPagar, CuentaBancaria, MovimientoBancario,
    Cotizacion, CotizacionItem, OrdenVenta, RequisicionCompra, TransferenciaInventario,
    RetencionIVA, RetencionISLR, Vendedor, Almacen, RecepcionStock, DevolucionProveedor, LoteProducto,
    NotaCredito, AnticipoCliente, Cheque, FondoCajaChica, GastoCajaChica, StockPorAlmacen,
    NotaEntrega, NotaEntregaItem
)
from backend.schemas.operations import (
    CotizacionCreate, CotizacionStatusUpdate, CompraCreate, RecepcionStockCreate, RecepcionStockResponse,
    DevolucionProveedorCreate, NotaEntregaCreate, NotaEntregaEstadoUpdate
)
from backend.core.security import get_current_user, require_role
from backend.models.core import TasaCambio
from backend.utils.helpers import to_float, periodo_rango, ventas_periodo, tasa_actual, margen_bruto_pct, get_almacen_principal_id, verificar_periodo_abierto
from backend.services.contabilidad import ContabilidadService
from backend.routers.operaciones._shared import _as_aware, ISLR_WITHHOLDING_TABLE, _resolver_islr_automatico, calcular_reserva_fiscal

tasas_router = APIRouter(prefix="/tasas", tags=["Tasas"], dependencies=[Depends(get_current_user)])


@tasas_router.get("/bcv")
def tasa_bcv_alias(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Bug 3 fix: usar el helper canónico tasa_actual() en vez de reimplementar
    # la consulta sin filtro de tenant. Esto:
    # 1. Acota la búsqueda al tenant del usuario (evita devolver la tasa de otro tenant).
    # 2. Usa el fallback correcto del proyecto (784.66, no el 36.52 obsoleto).
    # 3. Garantiza consistencia con el resto del sistema fiscal que ya usa tasa_actual().
    return {"valor": tasa_actual(db, current_user.tenant_id), "fuente": "BCV"}


# --- CLIENTES SEGMENTOS ---
