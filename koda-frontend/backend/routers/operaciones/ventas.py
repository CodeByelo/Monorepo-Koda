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
    NotaEntrega, NotaEntregaItem, AuditoriaLog
)
from backend.schemas.operations import (
    CotizacionCreate, CotizacionStatusUpdate, FacturarCotizacionRequest, CompraCreate,
    RecepcionStockCreate, RecepcionStockResponse, DevolucionProveedorCreate,
    NotaEntregaCreate, NotaEntregaEstadoUpdate
)
from backend.core.security import get_current_user, require_role
from backend.models.core import TasaCambio
from backend.utils.helpers import (
    to_float, periodo_rango, ventas_periodo, tasa_actual, margen_bruto_pct,
    get_almacen_principal_id, verificar_periodo_abierto, resolver_almacen_venta,
    descontar_stock_almacen, resolver_modo_visualizacion_moneda
)
from backend.services.contabilidad import ContabilidadService
from backend.services.facturacion_service import (
    LineaFactura, procesar_emision_factura, resolver_precio_unitario
)
from backend.routers.operaciones._shared import _as_aware, ISLR_WITHHOLDING_TABLE, _resolver_islr_automatico, calcular_reserva_fiscal

ventas_ext_router = APIRouter(prefix="/ventas", tags=["Ventas"], dependencies=[Depends(get_current_user)])


def get_status_color(estado: str) -> str:
    est = (estado or "").lower()
    if est == "borrador":
        return "bg-slate-100 text-slate-700"
    elif est in ("enviada", "pendiente"):
        return "bg-blue-50 text-blue-700 border border-blue-100"
    elif est in ("aceptada", "facturada", "procesada"):
        return "bg-emerald-50 text-emerald-700 border border-emerald-100"
    elif est == "convertida":
        return "bg-teal-50 text-teal-700 border border-teal-100"
    elif est in ("rechazada", "anulada"):
        return "bg-rose-50 text-rose-700 border border-rose-100"
    elif est == "vencida":
        return "bg-amber-50 text-amber-700 border border-amber-100"
    return "bg-slate-100 text-slate-700"


@ventas_ext_router.get("/{id}/pdf")
def descargar_factura_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Genera el PDF oficial de una factura (venta) usando ReportLab."""
    import io
    import os
    from fastapi.responses import StreamingResponse
    from backend.models.operations import Venta
    from backend.routers.entidades import _get_or_create_empresa, _logo_path, get_empresa_logo_image

    # Tenant-scoped lookup: filtro explícito por tenant_id, siguiendo la
    # convención del resto de este router (ver /cotizaciones más abajo).
    # Nota: current_tenant_id_var + with_loader_criteria (core/database.py)
    # ya aplican un filtro automático de tenant a nivel de sesión de ORM,
    # así que esto es defensa en profundidad, no el único guardado.
    venta = db.query(Venta).filter(
        Venta.id == id,
        Venta.tenant_id == current_user.tenant_id,
    ).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    empresa = _get_or_create_empresa(db, current_user)

    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle
    except ImportError:
        raise HTTPException(status_code=500, detail="Librería reportlab no instalada.")

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    ancho, alto = letter

    # Emisor (datos reales del tenant, con fallback si aún no hay Empresa configurada)
    logo_img = get_empresa_logo_image(empresa, current_user.tenant_id)
    texto_x = 50
    if logo_img:
        try:
            logo_w, logo_h = 60, 45
            c.drawImage(
                logo_img,
                50, alto - 50 - logo_h + 10,
                width=logo_w, height=logo_h,
                preserveAspectRatio=True, mask='auto'
            )
            texto_x = 50 + logo_w + 10
        except Exception:
            # Logo corrupto/ilegible: no debe tumbar la generación de la factura.
            texto_x = 50

    c.setFont("Helvetica-Bold", 14)
    c.drawString(texto_x, alto - 50, empresa.razon_social)
    c.setFont("Helvetica", 10)
    c.drawString(texto_x, alto - 65, f"R.I.F.: {empresa.rif}")
    c.drawString(texto_x, alto - 78, empresa.direccion or "")
    
    # Título Documento
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor("#0b5156"))
    c.drawString(380, alto - 50, "FACTURA DE VENTA")
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(380, alto - 68, f"NRO. CONTROL: {venta.numero_factura}")
    c.setFont("Helvetica", 10)
    c.drawString(380, alto - 82, f"FECHA EMISIÓN: {venta.fecha.strftime('%d/%m/%Y')}")
    c.drawString(380, alto - 96, f"ESTADO: {venta.estado}")
    
    # Línea divisoria
    c.setLineWidth(1)
    c.setStrokeColor(colors.HexColor("#e2e8f0"))
    c.line(50, alto - 110, ancho - 50, alto - 110)
    
    # Información del Cliente
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, alto - 130, "DATOS DEL ADQUIRIENTE:")
    c.setFont("Helvetica", 10)
    cliente_nombre = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    cliente_rif = venta.cliente.rif if venta.cliente else "N/A"
    # Modalidad de Moneda del Documento (segura ante valores None/ausentes)
    moneda_doc = getattr(venta, "moneda_documento", None) or "BIMONETARIO"
    metodo_pago = getattr(venta, "metodo_pago", "") or "Efectivo"
    igtf_usd = float(getattr(venta, "igtf_usd", 0) or 0)
    subtotal_usd = float(getattr(venta, "subtotal_usd", 0) or 0)
    iva_usd = float(getattr(venta, "iva_usd", 0) or 0)
    total_usd = float(getattr(venta, "total_usd", 0) or getattr(venta, "total", 0) or 0)
    tasa_val = float(getattr(venta, "tasa_cambio_bs", 0) or 0)
    if tasa_val <= 0:
        tasa_val = 784.6633

    modo = resolver_modo_visualizacion_moneda(moneda_doc)
    es_solo_bolivares = (modo == "SOLO_VES")

    c.drawString(50, alto - 148, f"Razón Social: {cliente_nombre}")
    c.drawString(50, alto - 162, f"R.I.F. / C.I.: {cliente_rif}")
    c.drawString(50, alto - 176, f"Método de Pago: {metodo_pago}")
    if not es_solo_bolivares:
        c.drawString(50, alto - 190, f"Tasa de Cambio: Bs. {tasa_val:,.2f}")
    
    # Tabla de Detalles
    c.line(50, alto - 210, ancho - 50, alto - 210)
    
    if es_solo_bolivares:
        data_tabla = [["CANT.", "DESCRIPCIÓN PRODUCTO", "PRECIO (Bs.)", "TOTAL (Bs.)"]]
    else:
        data_tabla = [["CANT.", "DESCRIPCIÓN PRODUCTO", "PRECIO (USD)", "TOTAL (USD)"]]

    detalles = getattr(venta, "detalles", []) or []
    for item in detalles:
        prod_nombre = item.producto.nombre if (item and getattr(item, "producto", None)) else "Producto"
        precio_usd = float(getattr(item, "precio_usd_capturado", 0) or 0)
        cantidad = float(getattr(item, "cantidad", 1) or 1)
        
        if es_solo_bolivares:
            precio_bs = precio_usd * tasa_val
            sub_total_linea_bs = precio_bs * cantidad
            data_tabla.append([
                f"{cantidad:.0f}",
                prod_nombre.upper(),
                f"Bs. {precio_bs:,.2f}",
                f"Bs. {sub_total_linea_bs:,.2f}"
            ])
        else:
            sub_total_linea = precio_usd * cantidad
            data_tabla.append([
                f"{cantidad:.0f}",
                prod_nombre.upper(),
                f"${precio_usd:.2f}",
                f"${sub_total_linea:.2f}"
            ])
        
    if len(data_tabla) == 1:
        data_tabla.append(["1", "CONSUMO GENERAL", f"${total_usd:.2f}", f"${total_usd:.2f}"])

    t = Table(data_tabla, colWidths=[50, 260, 100, 100])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0b5156")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 9),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    
    # Calcular alto requerido por la tabla
    tabla_alto = len(data_tabla) * 20
    pos_y_tabla = alto - 230 - tabla_alto
    
    t.wrapOn(c, ancho - 100, alto)
    t.drawOn(c, 50, pos_y_tabla)
    
    # Resumen de Totales
    pos_y_totales = pos_y_tabla - 20
    c.setLineWidth(1)
    c.line(50, pos_y_totales, ancho - 50, pos_y_totales)
    
    total_bs = total_usd * tasa_val
    
    if es_solo_bolivares:
        subtotal_bs = subtotal_usd * tasa_val
        iva_bs = iva_usd * tasa_val
        
        c.setFont("Helvetica-Bold", 10)
        c.drawString(350, pos_y_totales - 20, "SUBTOTAL (Bs.):")
        c.drawRightString(ancho - 50, pos_y_totales - 20, f"Bs. {subtotal_bs:,.2f}")
        
        c.drawString(350, pos_y_totales - 35, "I.V.A. (16% Bs.):")
        c.drawRightString(ancho - 50, pos_y_totales - 35, f"Bs. {iva_bs:,.2f}")
        
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.HexColor("#0b5156"))
        c.drawString(350, pos_y_totales - 55, "TOTAL GENERAL (Bs.):")
        c.drawRightString(ancho - 50, pos_y_totales - 55, f"Bs. {total_bs:,.2f}")
    else:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(350, pos_y_totales - 20, "SUBTOTAL (USD):")
        c.drawRightString(ancho - 50, pos_y_totales - 20, f"${subtotal_usd:.2f}")
        
        c.drawString(350, pos_y_totales - 35, "I.V.A. (16% USD):")
        c.drawRightString(ancho - 50, pos_y_totales - 35, f"${iva_usd:.2f}")
        
        if igtf_usd > 0:
            c.drawString(350, pos_y_totales - 50, "I.G.T.F. PERCIBIDO (3%):")
            c.drawRightString(ancho - 50, pos_y_totales - 50, f"${igtf_usd:.2f}")
            offset_y = 65
        else:
            offset_y = 50
            
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0b5156"))
        c.drawString(350, pos_y_totales - offset_y, "TOTAL GENERAL (USD):")
        c.drawRightString(ancho - 50, pos_y_totales - offset_y, f"${total_usd:.2f}")
        
        # Mostrar equivalente en Bs sólo si no es una factura configurada como Solo Divisas estricta
        if modo != "SOLO_USD":
            c.setFont("Helvetica-Bold", 10)
            c.setFillColor(colors.HexColor("#1e293b"))
            c.drawString(350, pos_y_totales - offset_y - 18, "TOTAL EQUIVALENTE (Bs.):")
            c.drawRightString(ancho - 50, pos_y_totales - offset_y - 18, f"Bs. {total_bs:,.2f}")
    
    # Pie de Página Legal
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(ancho / 2, 40, "Este documento es una representación digital válida de la factura correspondiente de Koda ERP.")
    c.drawCentredString(ancho / 2, 28, "Conforme a la providencia administrativa Nro. SNAT/2014/00071 dictada por el SENIAT.")
    
    c.showPage()
    c.save()
    
    buffer.seek(0)
    filename = f"Factura-{venta.numero_factura}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@ventas_ext_router.get("/{id}/ticket")
def descargar_ticket_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Genera el ticket (recibo corto) leyendo la plantilla configurable del
    tenant (tabla plantillas_documento, ver routers/entidades.py). Si el
    tenant no personalizó nada, usa DEFAULT_TICKET_TEMPLATE, que reproduce
    el layout original de esta función antes de que fuera configurable."""
    import io
    from fastapi.responses import StreamingResponse
    from backend.models.operations import Venta
    from backend.models.erp_extended import PlantillaDocumento
    from backend.routers.entidades import _get_or_create_empresa, _logo_path, get_empresa_logo_image, DEFAULT_TICKET_TEMPLATE

    venta = db.query(Venta).filter(
        Venta.id == id,
        Venta.tenant_id == current_user.tenant_id,
    ).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    empresa = _get_or_create_empresa(db, current_user)

    plantilla_row = db.query(PlantillaDocumento).filter(
        PlantillaDocumento.tenant_id == current_user.tenant_id,
        PlantillaDocumento.tipo_documento == "ticket",
    ).first()
    cfg = {**DEFAULT_TICKET_TEMPLATE, **(plantilla_row.config if plantilla_row else {})}

    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
        import os
    except ImportError:
        raise HTTPException(status_code=500, detail="Librería reportlab no instalada.")

    ANCHO = 80 * mm
    alto_estimado = (95 + len(venta.detalles) * 14 + 90) * (72 / 25.4 / 10)
    ALTO = max(150 * mm, alto_estimado * mm)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(ANCHO, ALTO))

    def dibujar(campo_id, texto, y_dinamico=None):
        """Dibuja un campo según su estilo configurado. y_dinamico (en
        puntos reportlab, ya calculado desde abajo) se usa para los campos
        que fluyen después de la tabla de productos (los que tienen
        "y": 0 en el default); si no se pasa, se usa la "y" guardada
        (convertida de mm-desde-arriba a puntos-desde-abajo)."""
        estilo = cfg.get(campo_id, {})
        if not estilo.get("visible", True):
            return y_dinamico
        tam = estilo.get("font_size", 8)
        c.setFont("Helvetica-Bold" if estilo.get("bold") else "Helvetica", tam)
        x_pt = estilo.get("x", 4) * mm
        y_pt = y_dinamico if y_dinamico is not None else (ALTO - estilo.get("y", 10) * mm)
        align = estilo.get("align", "left")
        if align == "center":
            c.drawCentredString(ANCHO / 2, y_pt, texto)
        elif align == "right":
            c.drawRightString(ANCHO - 4 * mm, y_pt, texto)
        else:
            c.drawString(x_pt, y_pt, texto)
        return y_pt

    # --- Logo (si existe) ---
    logo_cfg = cfg.get("logo", {})
    if logo_cfg.get("visible", True):
        logo_img = get_empresa_logo_image(empresa, current_user.tenant_id)
        if logo_img:
            try:
                logo_w, logo_h = 26 * mm, 18 * mm
                x_pt = (ANCHO - logo_w) / 2
                y_pt = ALTO - logo_cfg.get("y", 6) * mm - logo_h
                c.drawImage(logo_img, x_pt, y_pt, width=logo_w, height=logo_h, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass  # Logo corrupto no debe tumbar la generación del ticket.

    # --- Cabecera Centrada ---
    # Razón Social / Nombre Comercial
    dibujar("empresa_nombre", empresa.nombre_comercial or empresa.razon_social)
    # Dirección (ej. Chacaito / Caracas)
    if empresa.direccion:
        dibujar("empresa_direccion", empresa.direccion)
    # RIF de la Empresa
    dibujar("empresa_rif", f"RIF: {empresa.rif}")
    # Teléfono
    if empresa.telefono:
        dibujar("empresa_telefono", f"Tel: {empresa.telefono}")

    # Número de factura y fecha en formato Dia/Mes/Año Hora:Minuto
    fecha_fmt = venta.fecha.strftime('%d/%m/%Y %H:%M') if venta.fecha else ""
    dibujar("factura_numero", f"Factura Nº: {venta.numero_factura}")
    dibujar("factura_fecha", f"Fecha: {fecha_fmt}")

    # Separador Cliente
    y_cli = ALTO - cfg.get("cliente", {}).get("y", 51) * mm
    c.setLineWidth(0.5)
    c.line(4 * mm, y_cli + 10, ANCHO - 4 * mm, y_cli + 10)
    cliente_nombre = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    cliente_rif = f" ({venta.cliente.rif})" if venta.cliente and venta.cliente.rif else ""
    dibujar("cliente", f"Cliente: {cliente_nombre}{cliente_rif}")
    c.line(4 * mm, y_cli - 4, ANCHO - 4 * mm, y_cli - 4)

    modo = resolver_modo_visualizacion_moneda(getattr(venta, "moneda_documento", None))
    es_pago_bolivares_puro = (modo == "SOLO_VES")
    tasa_val = float(venta.tasa_cambio_bs) if float(venta.tasa_cambio_bs) > 0 else 1.0

    # --- Tabla de productos: Producto | Cantidad | Total ---
    y = y_cli - 14
    tam_tabla = cfg["tabla_productos_inicio"].get("font_size", 8)
    c.setFont("Helvetica-Bold", tam_tabla)
    c.drawString(4 * mm, y, "Producto")
    c.drawCentredString(ANCHO / 2 + 6 * mm, y, "Cant.")
    c.drawRightString(ANCHO - 4 * mm, y, "Total (Bs.)" if es_pago_bolivares_puro else "Total ($)")
    y -= 4
    c.line(4 * mm, y, ANCHO - 4 * mm, y)
    y -= (tam_tabla + 3)

    c.setFont("Helvetica", tam_tabla)
    total_descuento_usd = 0.0
    subtotal_gravado_calc = 0.0
    subtotal_exento_calc = 0.0

    for item in venta.detalles:
        prod_nombre = item.producto.nombre if item.producto else "Producto"
        precio_usd = float(item.precio_usd_capturado)
        cantidad = float(item.cantidad)
        total_item_usd = precio_usd * cantidad
        
        # Indicador de Gravabilidad Legal (E) Exento o (G) Gravado 16%
        es_exento = getattr(item.producto, "es_exento", False)
        if es_exento:
            subtotal_exento_calc += total_item_usd
            tag_iva = " (E)"
        else:
            subtotal_gravado_calc += total_item_usd
            tag_iva = " (G)"

        # Comprobar si se vendió con descuento sobre tarifa
        if item.producto and item.producto.precio_usd:
            precio_base = float(item.producto.precio_usd)
            if precio_base > precio_usd:
                total_descuento_usd += (precio_base - precio_usd) * cantidad

        c.drawString(4 * mm, y, f"{prod_nombre[:18]}{tag_iva}")
        c.drawCentredString(ANCHO / 2 + 6 * mm, y, f"{cantidad:g}")
        
        if es_pago_bolivares_puro:
            total_item_bs = total_item_usd * tasa_val
            c.drawRightString(ANCHO - 4 * mm, y, f"Bs.{total_item_bs:,.2f}")
        else:
            c.drawRightString(ANCHO - 4 * mm, y, f"${total_item_usd:.2f}")

        y -= (tam_tabla + 2)
        # Detalle de precio unitario
        c.setFont("Helvetica", max(6, tam_tabla - 2))
        if es_pago_bolivares_puro:
            c.drawString(4 * mm, y, f"  P. Unit: Bs. {precio_usd * tasa_val:,.2f}")
        else:
            c.drawString(4 * mm, y, f"  Ref. unitaria: ${precio_usd:.2f}")
        c.setFont("Helvetica", tam_tabla)
        y -= (tam_tabla + 3)

    c.line(4 * mm, y + 2, ANCHO - 4 * mm, y + 2)
    y -= 8

    # --- Desglose Impositivo y Bimonetario Legal SENIAT ---
    subtotal_val = float(venta.subtotal_usd)
    iva_val = float(venta.iva_usd)
    igtf_val = float(venta.igtf_usd)
    total_val = float(venta.total_usd)
    total_bs_val = total_val * tasa_val

    def fila_total(etiqueta, valor_str, es_bold=False, tam=8):
        nonlocal y
        c.setFont("Helvetica-Bold" if es_bold else "Helvetica", tam)
        c.drawString(4 * mm, y, etiqueta)
        c.drawRightString(ANCHO - 4 * mm, y, valor_str)
        y -= (tam + 3)

    if es_pago_bolivares_puro:
        fila_total("Subtotal (Bs.):", f"Bs. {subtotal_val * tasa_val:,.2f}")
        if subtotal_exento_calc > 0:
            fila_total("Monto Exento (E):", f"Bs. {subtotal_exento_calc * tasa_val:,.2f}")
        if subtotal_gravado_calc > 0:
            fila_total("Base Imponible (G):", f"Bs. {subtotal_gravado_calc * tasa_val:,.2f}")
        fila_total("IVA (16% Bs.):", f"Bs. {iva_val * tasa_val:,.2f}")
        fila_total("TOTAL A PAGAR (Bs.):", f"Bs. {total_bs_val:,.2f}", es_bold=True, tam=10)
    else:
        fila_total("Subtotal Bruto:", f"${subtotal_val:.2f}")
        if total_descuento_usd > 0:
            fila_total("Descuento Comercial:", f"-${total_descuento_usd:.2f}")
        
        if subtotal_exento_calc > 0:
            fila_total("Monto Exento (E):", f"${subtotal_exento_calc:.2f}")
        if subtotal_gravado_calc > 0:
            fila_total("Base Imponible (G):", f"${subtotal_gravado_calc:.2f}")

        fila_total("IVA (16%):", f"${iva_val:.2f}")
        
        if igtf_val > 0:
            fila_total("IGTF Percibido (3%):", f"${igtf_val:.2f}")
        
        fila_total("TOTAL A PAGAR (USD):", f"${total_val:.2f}", es_bold=True, tam=10)
        if modo != "SOLO_USD":
            fila_total("Tasa de Cambio:", f"Bs. {tasa_val:,.2f}", tam=8)
            fila_total("TOTAL EN BOLÍVARES:", f"Bs. {total_bs_val:,.2f}", es_bold=True, tam=9)

    y -= 4
    c.line(4 * mm, y + 2, ANCHO - 4 * mm, y + 2)
    y -= 8

    # --- Método de Pago Registrado ---
    metodo = venta.metodo_pago or "Efectivo"
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(ANCHO / 2, y, f"Forma de Pago: {metodo.upper()}")
    y -= 10
    c.line(4 * mm, y + 2, ANCHO - 4 * mm, y + 2)
    y -= 8

    # --- Mensaje de Garantía Personalizado por la Empresa ---
    mensaje_garantia = getattr(empresa, "mensaje_garantia", None) or cfg.get("garantia_texto", {}).get("texto")
    if mensaje_garantia:
        c.setFont("Helvetica", 7)
        # Dividir en líneas si es largo
        palabras = mensaje_garantia.split()
        linea_actual = []
        for p in palabras:
            linea_actual.append(p)
            if len(" ".join(linea_actual)) > 42:
                c.drawCentredString(ANCHO / 2, y, " ".join(linea_actual))
                y -= 9
                linea_actual = []
        if linea_actual:
            c.drawCentredString(ANCHO / 2, y, " ".join(linea_actual))
            y -= 9
        y -= 4
        c.line(4 * mm, y + 2, ANCHO - 4 * mm, y + 2)
        y -= 8

    # --- Agradecimiento y Redes Sociales (Instagram / Teléfono) ---
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(ANCHO / 2, y, "¡Gracias por su compra!")
    y -= 10

    if empresa.telefono:
        c.setFont("Helvetica", 8)
        c.drawCentredString(ANCHO / 2, y, f"Contacto: {empresa.telefono}")
        y -= 9

    if getattr(empresa, "instagram", None):
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(ANCHO / 2, y, f"IG: @{empresa.instagram.lstrip('@')}")
        y -= 9

    y -= 6
    c.line(4 * mm, y, ANCHO - 4 * mm, y)

    c.showPage()
    c.save()
    buffer.seek(0)
    filename = f"Ticket-{venta.numero_factura}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@ventas_ext_router.get("/cotizaciones")
def cotizaciones(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from sqlalchemy.orm import joinedload
    
    cots = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.cliente))
        .filter(Cotizacion.tenant_id == current_user.tenant_id)
        .order_by(Cotizacion.fecha_emision.desc())
        .all()
    )
        
    return [
        {
            "id": c.numero_cotizacion,
            "id_db": c.id,
            "numero_cotizacion": c.numero_cotizacion,
            "client": c.cliente.nombre if c.cliente else "No especificado",
            "cliente": c.cliente.nombre if c.cliente else "No especificado",
            "cantidad_items": len(c.items),
            "items": None,  # prevent serializing lists of objects which might break React render
            "amount": to_float(c.total),
            "total": to_float(c.total),
            "subtotal": to_float(c.subtotal),
            "descuento_total": to_float(c.descuento_total),
            "estado": c.estado,
            "status": c.estado,
            "statusColor": get_status_color(c.estado),
            "fecha_emision": c.fecha_emision.isoformat() if c.fecha_emision else None,
            "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
            "moneda": c.moneda,
        }
        for c in cots
    ]


@ventas_ext_router.patch("/cotizaciones/{id}/estado")
def actualizar_estado_cotizacion(
    id: int,
    payload: CotizacionStatusUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from fastapi import HTTPException
    
    cot = (
        db.query(Cotizacion)
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == current_user.tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
        
    nuevo_estado = payload.estado.strip()
    estados_validos = {"Borrador", "Enviada", "Aceptada", "Rechazada", "Vencida", "Anulada", "Facturada", "Convertida"}
    if nuevo_estado not in estados_validos:
        raise HTTPException(
            status_code=400,
            detail=f"Estado inválido. Debe ser uno de: {', '.join(estados_validos)}"
        )
        
    cot.estado = nuevo_estado
    db.commit()
    db.refresh(cot)
    
    return {
        "ok": True,
        "id": cot.numero_cotizacion,
        "id_db": cot.id,
        "estado": cot.estado,
        "status": cot.estado,
        "statusColor": get_status_color(cot.estado)
    }


@ventas_ext_router.post("/cotizaciones/{id}/facturar")
def facturar_cotizacion(
    id: int,
    body: Optional[FacturarCotizacionRequest] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Factura una cotización en estado 'Aceptada', descontando inventario real
    y delegando la emisión fiscal y contable en `procesar_emision_factura`.
    """
    tenant_id = current_user.tenant_id
    req_body = body or FacturarCotizacionRequest()

    # 1. Buscar la cotización por ID y validar tenant_id
    cot = (
        db.query(Cotizacion)
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    # 2. Validar que el estado sea 'Aceptada'
    if cot.estado != "Aceptada":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden facturar cotizaciones en estado 'Aceptada'"
        )

    # 3. Validar cliente vinculado
    if not cot.cliente:
        raise HTTPException(
            status_code=400,
            detail="La cotización no tiene un cliente vinculado. Debe vincular un cliente real antes de facturar."
        )

    # 4. Validar que tenga ítems y que cada ítem tenga producto_id real
    if not cot.items:
        raise HTTPException(
            status_code=400,
            detail="La cotización no tiene ítems para facturar."
        )

    for item in cot.items:
        if not item.producto_id:
            raise HTTPException(
                status_code=400,
                detail=f"La línea '{item.descripcion}' no tiene un producto vinculado. Debe vincular un producto real del catálogo antes de facturar."
            )

    try:
        # 5. Resolver y bloquear productos del tenant
        producto_ids = [item.producto_id for item in cot.items]
        unique_producto_ids = list(set(producto_ids))

        productos = db.query(Producto).filter(
            Producto.id.in_(unique_producto_ids),
            Producto.tenant_id == tenant_id
        ).with_for_update().all()
        productos_dict = {p.id: p for p in productos}

        almacen_venta_id = resolver_almacen_venta(db, tenant_id)

        lineas = []
        for item in cot.items:
            producto = productos_dict.get(item.producto_id)
            if not producto:
                raise HTTPException(
                    status_code=400,
                    detail=f"Producto con ID {item.producto_id} no encontrado en el inventario de su empresa."
                )

            cantidad_item = Decimal(str(item.cantidad))
            if producto.stock < cantidad_item:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente para el producto '{producto.nombre}'. Disponible: {producto.stock}, Solicitado: {cantidad_item}"
                )

            producto.stock -= cantidad_item
            descontar_stock_almacen(db, tenant_id, producto.id, almacen_venta_id, cantidad_item)

            lineas.append(LineaFactura(
                producto_id=producto.id,
                cantidad=cantidad_item,
                precio_unitario=resolver_precio_unitario(producto),
                es_exento=bool(producto.es_exento),
            ))

        # 6. Delegar emisión atómica en facturacion_service
        resultado = procesar_emision_factura(
            db=db,
            current_user=current_user,
            cliente=cot.cliente,
            lineas=lineas,
            metodo_pago=req_body.metodo_pago,
            moneda_documento=cot.moneda,
            dias_credito=0,
            vendedor_id=None,
            almacen_id=almacen_venta_id,
        )

        # 7. Actualizar cotización y registrar auditoría
        cot.estado = "Facturada"

        db.add(AuditoriaLog(
            tenant_id=tenant_id,
            usuario=f"{current_user.email} (ID:{current_user.id})",
            accion="VENTA_CREADA",
            modulo="VENTAS",
            detalle=(
                f"Venta creada desde Cotización {cot.numero_cotizacion}: {resultado.numero_factura} | "
                f"Cliente: {cot.cliente.nombre} ({cot.cliente.rif}) | "
                f"Total: {cot.moneda or ''} {resultado.monto_total}"
            ),
        ))

        db.commit()
        db.refresh(resultado.venta)
        db.refresh(cot)

        return {
            "ok": True,
            "numero_factura": resultado.numero_factura,
            "venta_id": resultado.venta.id,
            "estado_cotizacion": cot.estado
        }

    except HTTPException as he:
        db.rollback()
        raise he
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al facturar la cotización: {str(e)}"
        )


@ventas_ext_router.get("/cotizaciones/{id}/pdf")
def descargar_cotizacion_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from fastapi import HTTPException
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from sqlalchemy.orm import joinedload
    import io
    
    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.cliente), joinedload(Cotizacion.items))
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == current_user.tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
        
    buffer = io.BytesIO()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    theme_color = colors.HexColor("#0b5156")
    text_color = colors.HexColor("#334155")
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=theme_color,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=text_color
    )
    
    body_bold = ParagraphStyle(
        'BodyTextBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=text_color
    )
    
    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white
    )
    
    table_body_style = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        textColor=text_color
    )

    story = []
    
    header_data = [
        [
            Paragraph("<b>KODA ERP</b><br/><font size=8 color='#64748b'>Sistema de Gestión Integral modular</font>", body_bold),
            Paragraph(f"<b>COTIZACIÓN</b><br/><font size=11 color='#0b5156'><b>{cot.numero_cotizacion}</b></font>", ParagraphStyle('RightHeader', parent=body_bold, alignment=2))
        ]
    ]
    header_table = Table(header_data, colWidths=[270, 270])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    
    divider = Table([[""]], colWidths=[540])
    divider.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 1.5, theme_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(divider)
    story.append(Spacer(1, 15))
    
    client_name = cot.cliente.nombre if cot.cliente else "No especificado"
    client_rif = cot.cliente.rif if cot.cliente else "No especificado"
    client_dir = cot.cliente.direccion if cot.cliente else "No especificada"
    client_tel = cot.cliente.telefono if cot.cliente else "No especificado"
    
    info_data = [
        [
            Paragraph("<b>CLIENTE:</b>", body_bold),
            Paragraph("<b>DETALLES DE EMISIÓN:</b>", body_bold)
        ],
        [
            Paragraph(f"{client_name}<br/>RIF: {client_rif}<br/>Dirección: {client_dir}<br/>Tlf: {client_tel}", body_style),
            Paragraph(f"Fecha Emisión: {cot.fecha_emision.strftime('%d/%m/%Y')}<br/>Fecha Vencimiento: {cot.fecha_vencimiento.strftime('%d/%m/%Y')}<br/>Moneda: {cot.moneda}<br/>Estado: {cot.estado}", body_style)
        ]
    ]
    info_table = Table(info_data, colWidths=[270, 270])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))
    
    table_data = [
        [
            Paragraph("Cant.", table_header_style),
            Paragraph("Descripción del Producto/Servicio", table_header_style),
            Paragraph("P. Unitario", table_header_style),
            Paragraph("Desc %", table_header_style),
            Paragraph("Total Fila", table_header_style)
        ]
    ]
    
    symbol = "$" if cot.moneda == "USD" else "Bs."
    
    for item in cot.items:
        qty_str = f"{to_float(item.cantidad):g}"
        price_str = f"{symbol} {to_float(item.precio_unitario):,.2f}"
        disc_str = f"{to_float(item.descuento_porcentaje):g}%"
        total_str = f"{symbol} {to_float(item.total_fila):,.2f}"
        
        table_data.append([
            Paragraph(qty_str, table_body_style),
            Paragraph(item.descripcion, table_body_style),
            Paragraph(price_str, table_body_style),
            Paragraph(disc_str, table_body_style),
            Paragraph(total_str, table_body_style)
        ])
        
    items_table = Table(table_data, colWidths=[50, 260, 80, 60, 90])
    
    t_style = [
        ('BACKGROUND', (0,0), (-1,0), theme_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
    ]
    
    for idx in range(1, len(table_data)):
        if idx % 2 == 0:
            t_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor("#f8fafc")))
            
    items_table.setStyle(TableStyle(t_style))
    story.append(items_table)
    story.append(Spacer(1, 20))
    
    totals_data = [
        [Paragraph("Subtotal:", body_bold), Paragraph(f"{symbol} {to_float(cot.subtotal):,.2f}", ParagraphStyle('RightText', parent=body_style, alignment=2))],
        [Paragraph("Descuento Total:", body_bold), Paragraph(f"{symbol} {to_float(cot.descuento_total):,.2f}", ParagraphStyle('RightText', parent=body_style, alignment=2))],
        [Paragraph("TOTAL FINAL:", title_style), Paragraph(f"{symbol} {to_float(cot.total):,.2f}", ParagraphStyle('RightTitle', parent=title_style, alignment=2))]
    ]
    
    totals_table = Table(totals_data, colWidths=[380, 160])
    totals_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LINEABOVE', (0,-1), (-1,-1), 1, theme_color),
    ]))
    story.append(totals_table)
    
    if cot.condiciones:
        story.append(Spacer(1, 30))
        story.append(Paragraph("<b>Condiciones y Notas:</b>", body_bold))
        story.append(Spacer(1, 5))
        story.append(Paragraph(cot.condiciones.replace('\n', '<br/>'), body_style))
        
    doc.build(story)
    buffer.seek(0)
    
    filename = f"Cotizacion-{cot.numero_cotizacion}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@ventas_ext_router.post("/cotizaciones", status_code=201)
def crear_cotizacion(
    cot_in: CotizacionCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    import uuid
    try:
        # 1. Obtener la tasa de cambio activa
        tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
        tasa_val = Decimal(str(tasa_activa.valor_ves)) if tasa_activa else Decimal("36.52")

        # 2. Resolver el cliente por nombre (debe estar pre-registrado en el maestro)
        client_name = cot_in.client.strip()
        c = db.query(Cliente).filter(
            Cliente.nombre.ilike(client_name),
            Cliente.tenant_id == current_user.tenant_id
        ).first()
        if not c:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El cliente '{client_name}' no existe en el sistema. Por favor regístrelo en el maestro de clientes con su RIF correspondiente antes de cotizar."
            )
        
        # 3. Generar número de cotización correlativo
        count = db.query(Cotizacion).filter(Cotizacion.tenant_id == current_user.tenant_id).count()
        numero_cotizacion = f"COT-2026-{str(count + 1).zfill(4)}"

        # 3.5 Totales SIEMPRE derivados server-side desde los ítems reales,
        # nunca de `cot_in.subtotal/discountTotal/totalFinal` (el cliente
        # podía enviar cualquier valor ahí sin que el backend lo validara).
        # Aunque la cotización no es un documento fiscal, sigue siendo la
        # base de la Orden de Venta y de la factura que se genera al
        # aceptarla, así que su total debe ser fiable.
        subtotal_calc = Decimal("0.00")
        descuento_calc = Decimal("0.00")
        total_calc = Decimal("0.00")
        items_totales = []
        for item in cot_in.items:
            linea_bruta = item.quantity * item.price
            linea_descuento = linea_bruta * (item.discountPct / Decimal("100.00"))
            total_fila = linea_bruta - linea_descuento
            subtotal_calc += linea_bruta
            descuento_calc += linea_descuento
            total_calc += total_fila
            items_totales.append(total_fila)

        # 4. Crear la cabecera de la cotización
        nueva_cot = Cotizacion(
            tenant_id=current_user.tenant_id,
            numero_cotizacion=numero_cotizacion,
            cliente_id=c.id,
            fecha_emision=cot_in.emissionDate,
            fecha_vencimiento=cot_in.dueDate,
            moneda=cot_in.currency,
            tasa_cambio=tasa_val,
            subtotal=subtotal_calc,
            descuento_total=descuento_calc,
            total=total_calc,
            condiciones=cot_in.notes,
            estado="Borrador",
            creado_por=uuid.UUID(str(current_user.id)) if hasattr(current_user, 'id') and current_user.id else None
        )
        db.add(nueva_cot)
        db.flush()

        # 5. Guardar los ítems
        for item, total_fila in zip(cot_in.items, items_totales):
            nuevo_item = CotizacionItem(
                cotizacion_id=nueva_cot.id,
                producto_id=None,
                descripcion=item.description,
                cantidad=item.quantity,
                precio_unitario=item.price,
                descuento_porcentaje=item.discountPct,
                total_fila=total_fila
            )
            db.add(nuevo_item)

        db.commit()
        db.refresh(nueva_cot)
        return {
            "ok": True,
            "id": nueva_cot.id,
            "numero_cotizacion": nueva_cot.numero_cotizacion
        }
    except Exception as e:
        db.rollback()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Error al crear cotización: {str(e)}")


@ventas_ext_router.post("/cotizaciones/{id}/orden")
def convertir_cotizacion_a_orden(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Convierte una Cotización 'Aceptada' en una Orden de Venta real.

    Cierra el ciclo Cotización -> Orden de Venta -> Nota de Entrega/Factura
    descrito en el modal de ayuda de SalesOrders.tsx (hasta ahora solo se
    podía facturar directo, sin pasar por Orden de Venta). Sigue el mismo
    patrón que `facturar_cotizacion`: valida estado 'Aceptada' y deriva el
    monto SIEMPRE desde los ítems reales de la cotización, nunca de un total
    enviado por el cliente.
    """
    from decimal import ROUND_HALF_UP

    cot = (
        db.query(Cotizacion)
        .filter(Cotizacion.id == id, Cotizacion.tenant_id == current_user.tenant_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    if cot.estado != "Aceptada":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden convertir a Orden de Venta las cotizaciones en estado 'Aceptada'."
        )

    try:
        tasa = Decimal(str(cot.tasa_cambio)) if cot.tasa_cambio else Decimal("1.0")
        if tasa <= 0:
            tasa = Decimal("1.0")

        total_usd = Decimal("0.00")
        for item in cot.items:
            precio_unitario = Decimal(str(item.precio_unitario))
            descuento_pct = Decimal(str(item.descuento_porcentaje))
            precio_neto = precio_unitario * (Decimal("1.00") - descuento_pct / Decimal("100.00"))
            if cot.moneda == "VES":
                precio_neto = precio_neto / tasa
            total_usd += precio_neto * Decimal(str(item.cantidad))
        total_usd = total_usd.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        count = db.query(OrdenVenta).filter(OrdenVenta.tenant_id == current_user.tenant_id).count()
        numero_orden = f"OV-{datetime.now(timezone.utc).year}-{str(count + 1).zfill(4)}"

        nueva_orden = OrdenVenta(
            tenant_id=current_user.tenant_id,
            numero=numero_orden,
            cliente_id=cot.cliente_id,
            fecha=datetime.now(timezone.utc),
            total_usd=total_usd,
            tasa_cambio_bs=tasa,
            estado="PENDIENTE",
        )
        db.add(nueva_orden)

        cot.estado = "Convertida"

        db.commit()
        db.refresh(nueva_orden)

        return {
            "ok": True,
            "orden_id": nueva_orden.id,
            "numero_orden": nueva_orden.numero,
            "estado_cotizacion": cot.estado,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al convertir la cotización a orden de venta: {str(e)}")


@ventas_ext_router.get("/ordenes")
def ordenes_venta(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Lista las Ordenes de Venta reales del tenant actual.

    Antes esta consulta no filtraba por tenant_id (fuga entre empresas) y
    devolvía objetos ORM crudos sin mapear (el frontend espera `client`/
    `total`/`estado`, no `cliente_id`/`total_usd`), igual que ya se hace en
    /cotizaciones y /notas-entrega más abajo.
    """
    ordenes = (
        db.query(OrdenVenta, Cliente)
        .outerjoin(Cliente, Cliente.id == OrdenVenta.cliente_id)
        .filter(OrdenVenta.tenant_id == current_user.tenant_id)
        .order_by(OrdenVenta.fecha.desc())
        .all()
    )
    return [
        {
            "id": o.numero,
            "id_db": o.id,
            "numero_orden": o.numero,
            "client": c.nombre if c else "No especificado",
            "cliente": c.nombre if c else "No especificado",
            "amount": to_float(o.total_usd),
            "total": to_float(o.total_usd),
            "tasa_cambio_bs": to_float(o.tasa_cambio_bs),
            "estado": o.estado,
            "status": o.estado,
            "statusColor": get_status_color(o.estado),
            "fecha": o.fecha.isoformat() if o.fecha else None,
        }
        for o, c in ordenes
    ]


@ventas_ext_router.get("/notas-entrega")
def notas_entrega(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Lista las Notas de Entrega (remisiones) reales del tenant actual."""
    notas = (
        db.query(NotaEntrega)
        .filter(NotaEntrega.tenant_id == current_user.tenant_id)
        .order_by(NotaEntrega.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": n.id,
            "numero_nota": n.numero_nota,
            "cliente": n.cliente_nombre,
            "fecha": n.fecha_emision.strftime("%d/%m/%Y"),
            "transportista": n.transportista,
            "vehiculo_placa": n.vehiculo_placa,
            "destino": n.destino,
            "estado": n.estado,
            "ov": n.orden_venta_id,
            "orden_venta_id": n.orden_venta_id,
        }
        for n in notas
    ]


@ventas_ext_router.post("/notas-entrega", status_code=201)
def crear_nota_entrega(
    nota_in: NotaEntregaCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Crea una Nota de Entrega real (despacho directo o desde Orden de Venta).

    No exige que el cliente ya exista en el maestro (a diferencia de
    Cotización): el despacho de almacén no debe bloquearse por eso, así que
    se guarda siempre el nombre tal como se escribió (`cliente_nombre`) y,
    adicionalmente, se enlaza `cliente_id` si hay un match.
    """
    tenant_id = current_user.tenant_id
    client_name = nota_in.client.strip()

    cliente = (
        db.query(Cliente)
        .filter(Cliente.tenant_id == tenant_id, Cliente.nombre.ilike(client_name))
        .first()
    )

    if nota_in.sourceOrder is not None:
        orden = (
            db.query(OrdenVenta)
            .filter(OrdenVenta.id == nota_in.sourceOrder, OrdenVenta.tenant_id == tenant_id)
            .first()
        )
        if not orden:
            raise HTTPException(status_code=404, detail="Orden de venta de origen no encontrada.")

    count = db.query(NotaEntrega).filter(NotaEntrega.tenant_id == tenant_id).count()
    numero_nota = f"NE-{datetime.now(timezone.utc).year}-{str(count + 1).zfill(4)}"

    custom_fields_data = [cf.model_dump() for cf in nota_in.logistics.customFields]

    nueva_nota = NotaEntrega(
        tenant_id=tenant_id,
        numero_nota=numero_nota,
        cliente_id=cliente.id if cliente else None,
        cliente_nombre=client_name,
        orden_venta_id=nota_in.sourceOrder,
        fecha_emision=nota_in.emissionDate,
        transportista=nota_in.logistics.carrier,
        vehiculo_placa=nota_in.logistics.vehiclePlate,
        destino=nota_in.logistics.destination,
        notas=nota_in.logistics.notes,
        campos_personalizados=custom_fields_data,
        estado="PENDIENTE",
        creado_por=getattr(current_user, "id", None),
    )
    for item in nota_in.items:
        nueva_nota.items.append(NotaEntregaItem(
            descripcion=item.description,
            cantidad=item.quantity,
        ))

    try:
        db.add(nueva_nota)
        db.commit()
        db.refresh(nueva_nota)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear la nota de entrega: {str(e)}")

    return {
        "id": nueva_nota.id,
        "numero_nota": nueva_nota.numero_nota,
        "cliente": nueva_nota.cliente_nombre,
        "fecha": nueva_nota.fecha_emision.strftime("%d/%m/%Y"),
        "estado": nueva_nota.estado,
        "orden_venta_id": nueva_nota.orden_venta_id,
    }


@ventas_ext_router.patch("/notas-entrega/{id}/estado")
def actualizar_estado_nota_entrega(
    id: int,
    body: NotaEntregaEstadoUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Actualiza el estado de despacho de una Nota de Entrega (PENDIENTE/ENTREGADO/ANULADA)."""
    nota = (
        db.query(NotaEntrega)
        .filter(NotaEntrega.id == id, NotaEntrega.tenant_id == current_user.tenant_id)
        .first()
    )
    if not nota:
        raise HTTPException(status_code=404, detail="Nota de entrega no encontrada")

    estados_validos = {"PENDIENTE", "ENTREGADO", "ANULADA"}
    if body.estado not in estados_validos:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Use uno de: {', '.join(sorted(estados_validos))}")

    nota.estado = body.estado
    db.commit()
    db.refresh(nota)
    return {"id": nota.id, "estado": nota.estado}


@ventas_ext_router.post("/{id}/generar-nota-entrega", status_code=201)
def generar_nota_entrega_desde_venta(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Crea una Nota de Entrega prellenada a partir de una Venta/Factura ya
    emitida: cliente e items se copian de la venta, y se guarda `venta_id`
    para dejar trazabilidad de cuál factura la originó. Los datos logísticos
    (transportista, placa, destino) quedan vacíos — se completan después
    desde el módulo de Notas de Entrega antes del despacho."""
    from backend.models.operations import Venta

    venta = db.query(Venta).filter(
        Venta.id == id,
        Venta.tenant_id == current_user.tenant_id,
    ).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")

    ya_existe = db.query(NotaEntrega).filter(
        NotaEntrega.tenant_id == current_user.tenant_id,
        NotaEntrega.venta_id == id,
    ).first()
    if ya_existe:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe la nota de entrega {ya_existe.numero_nota} para esta factura.",
        )

    cliente_nombre = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"

    count = db.query(NotaEntrega).filter(NotaEntrega.tenant_id == current_user.tenant_id).count()
    numero_nota = f"NE-{datetime.now(timezone.utc).year}-{str(count + 1).zfill(4)}"

    nueva_nota = NotaEntrega(
        tenant_id=current_user.tenant_id,
        numero_nota=numero_nota,
        cliente_id=venta.cliente_id,
        cliente_nombre=cliente_nombre,
        venta_id=venta.id,
        fecha_emision=datetime.now(timezone.utc).date(),
        estado="PENDIENTE",
        creado_por=getattr(current_user, "id", None),
    )
    for detalle in venta.detalles:
        nueva_nota.items.append(NotaEntregaItem(
            producto_id=detalle.producto_id,
            descripcion=detalle.producto.nombre if detalle.producto else "Producto",
            cantidad=detalle.cantidad,
        ))

    try:
        db.add(nueva_nota)
        db.commit()
        db.refresh(nueva_nota)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al generar la nota de entrega: {str(e)}")

    return {
        "id": nueva_nota.id,
        "numero_nota": nueva_nota.numero_nota,
        "venta_id": nueva_nota.venta_id,
    }


@ventas_ext_router.get("/{id}/nota-entrega/pdf")
def descargar_nota_entrega_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Genera y descarga la Nota de Entrega en formato PDF oficial."""
    import io
    from fastapi.responses import StreamingResponse
    from backend.models.operations import Venta
    from backend.models.erp_extended import NotaEntrega, Empresa
    from backend.routers.entidades import _get_or_create_empresa, get_empresa_logo_image
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Table, TableStyle

    venta = db.query(Venta).filter(
        Venta.id == id,
        Venta.tenant_id == current_user.tenant_id,
    ).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    nota = db.query(NotaEntrega).filter(
        NotaEntrega.tenant_id == current_user.tenant_id,
        NotaEntrega.venta_id == id,
    ).first()

    numero_nota_str = nota.numero_nota if nota else f"NE-{datetime.now(timezone.utc).year}-{str(id).zfill(4)}"
    empresa = _get_or_create_empresa(db, current_user)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    ancho, alto = letter

    # Logo
    logo_reader = get_empresa_logo_image(empresa, current_user.tenant_id)
    if logo_reader:
        try:
            c.drawImage(logo_reader, 50, alto - 90, width=120, height=50, preserveAspectRatio=True, mask='auto')
        except Exception:
            pass

    # Cabecera Empresa
    c.setFont("Helvetica-Bold", 12)
    c.drawString(180, alto - 50, empresa.razon_social or empresa.nombre_comercial or "MI EMPRESA")
    c.setFont("Helvetica", 9)
    c.drawString(180, alto - 64, f"R.I.F.: {empresa.rif or 'N/A'}")
    c.drawString(180, alto - 76, f"Dirección: {empresa.direccion or 'N/A'}")
    c.drawString(180, alto - 88, f"Teléfono: {empresa.telefono or 'N/A'}")

    # Título Documento
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor("#0b5156"))
    c.drawString(380, alto - 50, "NOTA DE ENTREGA")
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(380, alto - 68, f"N° DOCUMENTO: {numero_nota_str}")
    c.drawString(380, alto - 82, f"REF. FACTURA: {venta.numero_factura}")
    c.setFont("Helvetica", 10)
    c.drawString(380, alto - 96, f"FECHA: {venta.fecha.strftime('%d/%m/%Y')}")

    # Línea divisoria
    c.setLineWidth(1)
    c.setStrokeColor(colors.HexColor("#e2e8f0"))
    c.line(50, alto - 110, ancho - 50, alto - 110)

    # Datos del Cliente / Despacho
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, alto - 130, "DATOS DE DESPACHO Y RECEPTOR:")
    c.setFont("Helvetica", 10)
    cliente_nombre = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    cliente_rif = venta.cliente.rif if venta.cliente else "N/A"
    cliente_dir = venta.cliente.direccion if getattr(venta.cliente, 'direccion', None) else (empresa.direccion or "En tienda / Almacén Principal")
    c.drawString(50, alto - 148, f"Cliente: {cliente_nombre}")
    c.drawString(50, alto - 162, f"R.I.F. / C.I.: {cliente_rif}")
    c.drawString(50, alto - 176, f"Destino de Entrega: {cliente_dir}")

    # Tabla de Productos
    c.line(50, alto - 195, ancho - 50, alto - 195)
    data_tabla = [["ÍTEM", "CANT.", "DESCRIPCIÓN DEL PRODUCTO", "ESTADO ENTREGA"]]
    
    for idx, item in enumerate(venta.detalles, 1):
        prod_nombre = item.producto.nombre if item.producto else "Producto"
        cantidad = float(item.cantidad)
        data_tabla.append([
            str(idx),
            f"{cantidad:.0f}",
            prod_nombre.upper(),
            "PENDIENTE / DESPACHADO"
        ])

    t = Table(data_tabla, colWidths=[40, 50, 300, 120])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0b5156")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 9),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))

    tabla_alto = len(data_tabla) * 20
    pos_y_tabla = alto - 215 - tabla_alto
    t.wrapOn(c, ancho - 100, alto)
    t.drawOn(c, 50, pos_y_tabla)

    # Firmas
    c.setLineWidth(0.8)
    c.line(70, 90, 230, 90)
    c.line(350, 90, 510, 90)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(150, 75, "ENTREGADO POR / ALMACÉN")
    c.drawCentredString(430, 75, "RECIBIDO CONFORME (CLIENTE)")

    c.showPage()
    c.save()
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={numero_nota_str}.pdf"}
    )


# --- INVENTARIO EXTENDIDO ---
