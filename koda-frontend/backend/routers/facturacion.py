"""
Router de Facturación Fiscal — Endpoint /v1/facturacion/emitir

Este endpoint es el punto de entrada oficial para emitir una factura fiscal
con validez legal en Venezuela (SENIAT). Implementa:

1. Autenticación obligatoria: Solo usuarios con sesión válida pueden emitir.
2. Registro de auditoría completo: Usuario, IP real, hash del documento.
3. Firma de integridad SHA-256 del contenido de la factura.
4. Cálculo de IVA (16%) e IGTF (3%) en el servidor (no en el cliente),
   respetando productos exentos y derivando el IGTF a partir del método
   de pago / moneda del documento (nunca de un flag enviado por el cliente).
5. Generación de Número de Control fiscal, aislado por tenant.
6. Generación de los asientos contables (venta + costo de ventas) en la
   misma transacción atómica que la factura.

El cálculo de impuestos, el correlativo fiscal y los asientos contables
viven en `backend.services.facturacion_service`, compartido con
`routers/sales.py`, para que ambos puntos de entrada nunca diverjan.
"""

import hashlib
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models.core import Profile
from backend.models.operations import Cliente, Producto
from backend.models.erp_extended import AuditoriaLog
from backend.utils.ip_utils import get_real_ip
from backend.schemas.operations import FacturaEmisionRequest
from backend.services.facturacion_service import LineaFactura, procesar_emision_factura

router = APIRouter(prefix="/v1/facturacion", tags=["Facturación Fiscal"])


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

    Toda la operación (venta, detalles, kardex, cuenta por cobrar, asientos
    contables y log de auditoría) se confirma en una única transacción: si
    cualquier paso falla, no queda ni factura ni asiento a medias.
    """
    tenant_id = current_user.tenant_id

    # --- 1. Extraer IP real (VPN-aware) ---
    real_ip, tcp_ip = get_real_ip(request)
    ip_registrada = real_ip if real_ip == tcp_ip else f"{real_ip} (via {tcp_ip})"

    # --- 2. Validar cliente (SIEMPRE aislado por tenant) ---
    cliente_id_raw = body.cliente_id

    cliente = None
    try:
        if str(cliente_id_raw).isdigit():
            cliente = db.query(Cliente).filter(
                Cliente.id == int(cliente_id_raw),
                Cliente.tenant_id == tenant_id,
            ).first()
        else:
            numeric_id = int(str(cliente_id_raw).split("-")[-1])
            cliente = db.query(Cliente).filter(
                Cliente.id == numeric_id,
                Cliente.tenant_id == tenant_id,
            ).first()
    except (ValueError, IndexError):
        pass

    if not cliente:
        # Fallback: intentar por primer cliente registrado de ESTE tenant
        cliente = db.query(Cliente).filter(Cliente.tenant_id == tenant_id).first()

    if not cliente:
        # Auto-crear cliente default por si la BD está completamente limpia
        cliente = Cliente(
            rif="J-00000000-0",
            nombre="Consumidor Final",
            telefono="+58 212 000-0000",
            email="consumidor@koda.com",
            direccion="Caracas, Venezuela",
            es_contribuyente_especial=False,
            tenant_id=tenant_id,
        )
        db.add(cliente)
        db.flush()

    aplica_igtf_solicitado = body.aplica_igtf
    moneda = body.moneda_documento
    metodo_pago = body.metodo_pago
    detalles_in = body.detalles

    if not detalles_in:
        raise HTTPException(status_code=400, detail="La factura debe tener al menos un detalle.")

    try:
        # --- 3. Resolver productos, validar/descontar stock ---
        lineas = []
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

            if not producto or (producto.tenant_id and str(producto.tenant_id) != str(tenant_id)):
                raise HTTPException(status_code=404, detail=f"Producto '{prod_key}' no encontrado en su inventario.")

            if producto.stock < cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente para el producto '{producto.nombre}'. Disponible: {producto.stock}, Solicitado: {cantidad}"
                )

            producto.stock -= cantidad

            lineas.append(LineaFactura(
                producto_id=producto.id,
                cantidad=cantidad,
                precio_unitario=precio_unit,
                es_exento=bool(producto.es_exento),
            ))

        # --- 4. Calcular impuestos, correlativo, persistencia y asientos contables ---
        resultado = procesar_emision_factura(
            db=db,
            current_user=current_user,
            cliente=cliente,
            lineas=lineas,
            metodo_pago=metodo_pago,
            moneda_documento=moneda,
            dias_credito=0,
            vendedor_id=body.vendedor_id,
        )

        now = resultado.venta.fecha

        # --- 5. Generar hash de integridad del documento ---
        hash_integridad = _generate_document_hash(
            numero_factura=resultado.numero_factura,
            numero_control=resultado.numero_control,
            cliente_rif=cliente.rif or "",
            base_imponible=resultado.base_imponible,
            monto_iva=resultado.monto_iva,
            monto_total=resultado.monto_total,
            emitido_por=current_user.email,
            timestamp=now,
        )

        # --- 6. Registrar en el Ledger de Auditoría con usuario + IP real ---
        igtf_note = ""
        if aplica_igtf_solicitado is not None and bool(aplica_igtf_solicitado) != resultado.aplica_igtf:
            igtf_note = (
                f" | Nota: el cliente solicitó aplica_igtf={aplica_igtf_solicitado}, "
                f"el servidor determinó {resultado.aplica_igtf} y prevaleció el valor del servidor."
            )

        log_detalle = (
            f"Factura Fiscal emitida: {resultado.numero_factura} | "
            f"Control: {resultado.numero_control} | "
            f"Cliente: {cliente.nombre} ({cliente.rif}) | "
            f"Total: {moneda} {resultado.monto_total} | "
            f"Hash: {hash_integridad[:16]}...{igtf_note}"
        )
        db.add(AuditoriaLog(
            usuario=f"{current_user.email} (ID:{current_user.id})",
            accion="EMISION_FISCAL",
            modulo="FACTURACION_FISCAL",
            detalle=log_detalle,
            ip=ip_registrada,
            tenant_id=tenant_id,
        ))

        # --- 7. Commit atómico de toda la transacción ---
        db.commit()
        db.refresh(resultado.venta)

    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        # Errores de validación de negocio (p.ej. vendedor_id inválido/ajeno
        # al tenant): son un error del cliente, no una falla del servidor.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error al procesar la factura fiscal. Transacción revertida. Detalle: {str(e)}",
        )

    return {
        "id": resultado.venta.id,
        "numero_factura": resultado.numero_factura,
        "numero_control": resultado.numero_control,
        "hash_integridad": hash_integridad,
        "fecha_emision": now.isoformat(),
        "cliente": {
            "id": cliente.id,
            "nombre": cliente.nombre,
            "rif": cliente.rif,
        },
        "moneda_documento": moneda,
        "base_imponible": float(resultado.base_imponible),
        "monto_iva": float(resultado.monto_iva),
        "monto_igtf": float(resultado.monto_igtf),
        "monto_total": float(resultado.monto_total),
        "tasa_bcv": float(resultado.tasa_bs),
        "emitido_por": current_user.email,
        "ip_origen": ip_registrada,
        "estado": "ACTIVA",
    }
