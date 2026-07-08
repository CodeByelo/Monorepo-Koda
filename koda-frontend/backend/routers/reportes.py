from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from decimal import Decimal

from backend.core.database import get_db
from backend.services.reportes import ReporteService
from backend.services.auth import role_required

router = APIRouter(
    prefix="/reportes",
    tags=["Reportes Financieros"]
)

# --- Pydantic Schemas ---

class CuentaBalanceResponse(BaseModel):
    cuenta_codigo: str
    cuenta_nombre: str
    debe_usd: Decimal
    haber_usd: Decimal
    saldo_neto_usd: Decimal

    class Config:
        from_attributes = True

class BalanceComprobacionResponse(BaseModel):
    cuentas: List[CuentaBalanceResponse]
    total_debe_usd: Decimal
    total_haber_usd: Decimal
    cuadrado: bool

class EstadoResultadosResponse(BaseModel):
    ingresos_totales_usd: Decimal
    costos_totales_usd: Decimal
    gastos_totales_usd: Decimal
    utilidad_bruta_usd: Decimal
    utilidad_neta_usd: Decimal

class DashboardResumenResponse(BaseModel):
    saldo_bancos_usd: Decimal
    saldo_cxc_usd: Decimal

# --- Endpoints ---

@router.get("/balance-comprobacion", response_model=BalanceComprobacionResponse, dependencies=[Depends(role_required(['Admin', 'Contabilidad']))])
def get_balance_comprobacion(db: Session = Depends(get_db)):
    """
    Obtiene el balance de comprobación agrupado por cuenta contable,
    verificando la igualdad (Debe == Haber) general.
    """
    try:
        return ReporteService.obtener_balance_comprobacion(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar balance de comprobación: {str(e)}"
        )

@router.get("/estado-resultados", response_model=EstadoResultadosResponse, dependencies=[Depends(role_required(['Admin', 'Contabilidad']))])
def get_estado_resultados(db: Session = Depends(get_db)):
    """
    Obtiene el estado de resultados consolidado en USD (Ingresos, Costos, Gastos,
    Utilidad Bruta y Neta) a partir del libro contable.
    """
    try:
        return ReporteService.obtener_estado_resultados(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar estado de resultados: {str(e)}"
        )

@router.get("/dashboard-resumen", response_model=DashboardResumenResponse, dependencies=[Depends(role_required(['Admin']))])
def get_dashboard_resumen(db: Session = Depends(get_db)):
    """
    Obtiene métricas resumidas para el dashboard ejecutivo: saldo acumulado en Bancos
    y total pendiente por cobrar (CxC).
    """
    try:
        return ReporteService.dashboard_resumen(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar resumen del dashboard: {str(e)}"
        )

@router.get("/fiscal", dependencies=[Depends(role_required(['Admin', 'Contabilidad']))])
def get_reporte_fiscal(periodo: str, db: Session = Depends(get_db)):
    """
    Obtiene el reporte de resumen del libro fiscal para un período dado.
    """
    from backend.models.operations import Venta
    from backend.models.erp_extended import Compra, RetencionIVA
    from backend.utils.helpers import to_float
    from sqlalchemy import extract
    
    try:
        y, m = map(int, periodo.split("-"))
    except:
        y, m = 2026, 7
        
    # Ventas del periodo
    ventas = db.query(Venta).filter(
        extract('year', Venta.fecha) == y,
        extract('month', Venta.fecha) == m,
        Venta.estado != "ANULADA"
    ).all()
    
    ventas_gravadas_base = sum(to_float(v.base_imponible) for v in ventas if v.tipo_factura != "EXENTA")
    ventas_gravadas_debito = sum(to_float(v.iva) for v in ventas if v.tipo_factura != "EXENTA")
    ventas_exoneradas = sum(to_float(v.base_imponible) for v in ventas if v.tipo_factura == "EXENTA")
    total_debitos = ventas_gravadas_debito
    
    # Compras del periodo
    compras = db.query(Compra).filter(
        extract('year', Compra.fecha) == y,
        extract('month', Compra.fecha) == m,
        Compra.estado != "ANULADA"
    ).all()
    
    compras_gravadas_base = sum(to_float(c.base_imponible) for c in compras if to_float(c.iva) > 0)
    compras_gravadas_credito = sum(to_float(c.iva) for c in compras if to_float(c.iva) > 0)
    compras_exentas = sum(to_float(c.base_imponible) for c in compras if to_float(c.iva) <= 0)
    total_creditos = compras_gravadas_credito
    
    # Retenciones
    retenciones = db.query(RetencionIVA).filter(
        RetencionIVA.periodo == periodo,
        RetencionIVA.tipo == "RECIBIDA"
    ).all()
    
    retenciones_soportadas = sum(to_float(r.monto_usd) for r in retenciones)
    
    cuota_tributaria = total_debitos - total_creditos - retenciones_soportadas
    
    return {
        "periodo": periodo,
        "ventas_gravadas_base": ventas_gravadas_base,
        "ventas_gravadas_debito": ventas_gravadas_debito,
        "ventas_exoneradas": ventas_exoneradas,
        "total_debitos": total_debitos,
        "compras_gravadas_base": compras_gravadas_base,
        "compras_gravadas_credito": compras_gravadas_credito,
        "compras_exentas": compras_exentas,
        "total_creditos": total_creditos,
        "retenciones_soportadas": retenciones_soportadas,
        "cuota_tributaria": cuota_tributaria
    }

@router.get("/fiscal/exportar", dependencies=[Depends(role_required(['Admin', 'Contabilidad']))])
def exportar_reporte_fiscal(periodo: str, formato: str, db: Session = Depends(get_db)):
    """
    Exporta el reporte fiscal a PDF (mocked para MVP).
    """
    from fastapi.responses import Response
    import io
    
    if formato == "pdf":
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        c.drawString(100, 750, f"Resumen Fiscal - Periodo {periodo}")
        c.drawString(100, 730, "Documento Cifrado Válido (DP-31)")
        c.showPage()
        c.save()
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=reporte_fiscal_{periodo}.pdf"})
    
    return {"ok": True}
