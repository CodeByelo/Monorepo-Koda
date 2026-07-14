"""
Router de Facturación Fiscal — Endpoint /v1/facturacion/emitir

Este endpoint es el punto de entrada oficial para emitir una factura fiscal
con validez legal en Venezuela (SENIAT). Implementa:

1. Autenticación obligatoria: Solo usuarios con sesión válida pueden emitir.
2. Registro de auditoría completo: Usuario, IP real, hash del documento.
3. Firma de integridad SHA-256 del contenido de la factura.
4. Cálculo de IVA (16%) e IGTF (3%) en el servidor (no en el cliente).
5. Generación de Número de Control fiscal.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import TasaCambio, Profile
from backend.models.fiscal import ReglaFiscal, CorrelativoFiscal
from backend.models.operations import Cliente, Producto, Venta, VentaDetalle, KardexMovimiento
from backend.models.erp_extended import AuditoriaLog, CuentaPorCobrar
from backend.utils.ip_utils import get_real_ip
from backend.schemas.operations import FacturaEmisionRequest

router = APIRouter(prefix="/v1/facturacion", tags=["Facturación Fiscal"])

TWO_PLACES = Decimal("0.01")


def _generate_document_hash(
    numero_factura: str,
    numero_control: str,
    cliente_rif: str,
    base_imponible: Decimal,
    monto_iva: Decimal,
    monto_total: Decimal,
    emitido_por: str,
    timestamp: datetime,
) -> str:
    """
    Genera una firma SHA-256 del contenido de la factura.
    Si cualquier campo cambia en la BD, el hash ya no coincidirá.
    Este hash se imprime en el PDF para que auditores externos puedan verificarlo.
    """
    content = (
        f"{numero_factura}|{numero_control}|{cliente_rif}|"
        f"{base_imponible}|{monto_iva}|{monto_total}|"
        f"{emitido_por}|{timestamp.isoformat()}"
    )
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@router.post("/emitir", status_code=status.HTTP_201_CREATED)
def emitir_factura_fiscal(
    request: Request,
    body: FacturaEmisionRequest,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    """
    Emite una Factura Fiscal con validez SENIAT.

    Registra en AuditoriaLog:
    - El usuario que emitió (email + ID)
    - La IP real del solicitante (incluyendo detrás de VPN/proxy)
    - El hash de integridad del documento generado

    Si la IP de conexión TCP difiere de la IP extraída de headers (posible VPN),
    se registra el formato: "IP_REAL (via IP_PROXY)" para análisis forense.
    """
    # --- 1. Extraer IP real (VPN-aware) ---
    real_ip, tcp_ip = get_real_ip(request)
    ip_registrada = real_ip if real_ip == tcp_ip else f"{real_ip} (via {tcp_ip})"

    # --- 2. Validar cliente ---
    cliente_id_raw = body.cliente_id

    # El frontend envía el cliente_id como UUID generado, intentar buscar por id numérico también
    cliente = None
    # Intentar parsear como UUID y buscar por id numérico embebido
    try:
        # Formato: "00000000-0000-0000-0000-{id_padded}"
        numeric_id = int(str(cliente_id_raw).split("-")[-1])
        cliente = db.query(Cliente).filter(Cliente.id == numeric_id).first()
    except (ValueError, IndexError):
        pass

    if not cliente or (cliente.tenant_id and str(cliente.tenant_id) != str(current_user.tenant_id)):
        raise HTTPException(status_code=404, detail="Cliente no encontrado en la base de datos de su empresa.")

    # --- 3. Obtener tasa BCV activa ---
    tasa_activa = db.query(TasaCambio).order_by(TasaCambio.fecha.desc()).first()
    if not tasa_activa:
        raise HTTPException(status_code=400, detail="No hay tasa de cambio BCV registrada.")
    tasa_bs = Decimal(str(tasa_activa.valor_ves))

    # --- 4. Obtener reglas fiscales activas ---
    regla_iva = db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IVA", ReglaFiscal.activa == True).first()
    tasa_iva = Decimal(str(regla_iva.tasa)) if regla_iva else Decimal("0.16")

    regla_igtf = db.query(ReglaFiscal).filter(ReglaFiscal.nombre == "IGTF", ReglaFiscal.activa == True).first()
    tasa_igtf = Decimal(str(regla_igtf.tasa)) if regla_igtf else Decimal("0.03")

    aplica_igtf = body.aplica_igtf
    moneda = body.moneda_documento
    metodo_pago = body.metodo_pago
    detalles_in = body.detalles

    if not detalles_in:
        raise HTTPException(status_code=400, detail="La factura debe tener al menos un detalle.")

    # --- 5. Calcular montos y descontar inventario ---
    base_imponible = Decimal("0.00")
    detalles_para_guardar = []

    for det in detalles_in:
        prod_key = str(det.producto_id)
        cantidad = Decimal(str(det.cantidad))
        precio_unit = Decimal(str(det.precio_unitario))

        if cantidad <= 0:
            raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

        # Buscar producto por SKU o ID con bloqueo (with_for_update)
        producto = db.query(Producto).filter(
            (Producto.sku == prod_key) | (Producto.id == prod_key if prod_key.isdigit() else False)
        ).with_for_update().first()

        if not producto or (producto.tenant_id and str(producto.tenant_id) != str(current_user.tenant_id)):
            raise HTTPException(status_code=404, detail=f"Producto '{prod_key}' no encontrado en su inventario.")

        if producto.stock < cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para el producto '{producto.nombre}'. Disponible: {producto.stock}, Solicitado: {cantidad}"
            )

        # Descontar stock del producto
        producto.stock -= cantidad

        subtotal_linea = (cantidad * precio_unit).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        base_imponible += subtotal_linea

        detalles_para_guardar.append({
            "producto_id": producto.id,
            "descripcion": det.descripcion or producto.nombre,
            "cantidad": cantidad,
            "precio_unitario": precio_unit,
            "subtotal": subtotal_linea,
        })

    monto_iva = (base_imponible * tasa_iva).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    monto_igtf = Decimal("0.00")
    if aplica_igtf and moneda != "VED":
        monto_igtf = ((base_imponible + monto_iva) * tasa_igtf).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    monto_total = (base_imponible + monto_iva + monto_igtf).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    # --- 6. Generar Número de Control Fiscal ---
    correlativo_obj = db.query(CorrelativoFiscal).filter(
        CorrelativoFiscal.tipo_documento == "FACTURA"
    ).with_for_update().first()

    if not correlativo_obj:
        correlativo_obj = CorrelativoFiscal(tipo_documento="FACTURA", prefijo="FAC-", siguiente_numero=1, tenant_id=current_user.tenant_id)
        db.add(correlativo_obj)
        db.flush()

    numero_seq = correlativo_obj.siguiente_numero
    correlativo_obj.siguiente_numero += 1
    numero_factura = f"FACT-{str(numero_seq).zfill(8)}"
    numero_control = f"00-{str(numero_seq).zfill(8)}"

    # --- 7. Timestamp de emisión ---
    now = datetime.now(timezone.utc)

    # --- 8. Generar hash de integridad del documento ---
    hash_integridad = _generate_document_hash(
        numero_factura=numero_factura,
        numero_control=numero_control,
        cliente_rif=cliente.rif or "",
        base_imponible=base_imponible,
        monto_iva=monto_iva,
        monto_total=monto_total,
        emitido_por=current_user.email,
        timestamp=now,
    )

    # --- 9. Guardar la Venta en la BD con columnas correctas ---
    retencion_iva = Decimal("0.00")
    if getattr(cliente, "es_contribuyente_especial", False):
        retencion_iva = (monto_iva * Decimal("0.75")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    nueva_venta = Venta(
        cliente_id=cliente.id,
        numero_factura=numero_factura,
        fecha=now,
        subtotal_usd=base_imponible,
        iva_usd=monto_iva,
        igtf_usd=monto_igtf,
        retencion_iva_usd=retencion_iva,
        total_usd=monto_total,
        metodo_pago=metodo_pago,
        tasa_cambio_bs=tasa_bs,
        estado="ACTIVA",
        creado_por=current_user.id,
        tenant_id=current_user.tenant_id
    )

    db.add(nueva_venta)
    db.flush()  # Para obtener el ID sin commit todavía

    # Guardar detalles de la venta y registrar en el Kardex
    for det in detalles_para_guardar:
        detalle = VentaDetalle(
            venta_id=nueva_venta.id,
            producto_id=det["producto_id"],
            cantidad=det["cantidad"],
            precio_usd_capturado=det["precio_unitario"],
            tenant_id=current_user.tenant_id
        )
        db.add(detalle)

        # Rastro forense e inmutable en el Kardex
        kardex_mov = KardexMovimiento(
            producto_id=det["producto_id"],
            tipo_movimiento="Venta",
            cantidad=-det["cantidad"],
            documento_referencia=numero_factura,
            tenant_id=current_user.tenant_id
        )
        db.add(kardex_mov)

    # --- 10. Crear Cuenta por Cobrar ---
    monto_cxc = (monto_total - retencion_iva).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    cxc = CuentaPorCobrar(
        cliente_id=cliente.id,
        venta_id=nueva_venta.id,
        monto_original=monto_cxc,
        saldo=monto_cxc,
        moneda=moneda,
        estado="PENDIENTE",
        fecha_emision=now,
    )
    db.add(cxc)

    # --- 11. Registrar en el Ledger de Auditoría con usuario + IP real ---
    log_detalle = (
        f"Factura Fiscal emitida: {numero_factura} | "
        f"Control: {numero_control} | "
        f"Cliente: {cliente.nombre} ({cliente.rif}) | "
        f"Total: {moneda} {monto_total} | "
        f"Hash: {hash_integridad[:16]}..."
    )
    db.add(AuditoriaLog(
        usuario=f"{current_user.email} (ID:{current_user.id})",
        accion="EMISION_FISCAL",
        modulo="FACTURACION_FISCAL",
        detalle=log_detalle,
        ip=ip_registrada,
    ))

    # --- 12. Commit atómico de toda la transacción ---
    db.commit()
    db.refresh(nueva_venta)

    return {
        "numero_factura": numero_factura,
        "numero_control": numero_control,
        "hash_integridad": hash_integridad,
        "fecha_emision": now.isoformat(),
        "cliente": {
            "id": cliente.id,
            "nombre": cliente.nombre,
            "rif": cliente.rif,
        },
        "moneda_documento": moneda,
        "base_imponible": float(base_imponible),
        "monto_iva": float(monto_iva),
        "monto_igtf": float(monto_igtf),
        "monto_total": float(monto_total),
        "tasa_bcv": float(tasa_bs),
        "emitido_por": current_user.email,
        "ip_origen": ip_registrada,
        "estado": "ACTIVA",
    }
