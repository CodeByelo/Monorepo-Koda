import uuid
import logging
import hashlib
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Literal
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user
from routers.ledger_router import event_buffer, KodaEventInternal, AggregateType, EventSeverity, EventMetadata

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/api/v1/facturacion", tags=["Facturación"])

class FacturaDetalleCreate(BaseModel):
    producto_id: str
    descripcion: str | None = None
    cantidad: Decimal = Field(..., gt=0)
    precio_unitario: Decimal = Field(..., ge=0)

class FacturaCreate(BaseModel):
    cliente_id: uuid.UUID
    moneda_documento: Literal['VED', 'USD', 'EUR']
    aplica_igtf: bool
    detalles: List[FacturaDetalleCreate]

class FacturaResponse(BaseModel):
    factura_id: uuid.UUID
    numero_factura: str
    numero_control: str
    hash_integridad: str | None = None
    base_imponible: float
    monto_iva: float
    monto_igtf: float
    monto_total: float
    tasa_cambio_historica: float
    status: str = "emitida"

@router.post(
    "/emitir",
    response_model=FacturaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Emitir Factura Fiscal",
    description="Calcula impuestos, consulta tasa BCV asíncronamente, realiza inserciones transaccionales y encola el evento en el Ledger."
)
async def emitir_factura(
    body: FacturaCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    user_id_str = current_user.get("sub")
    tenant_id_str = current_user.get("tenant_id")
    
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token no contiene un tenant_id válido."
        )
        
    try:
        actor_id = uuid.UUID(user_id_str) if user_id_str else None
        tenant_id = uuid.UUID(tenant_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ID de usuario o inquilino no es un UUID válido."
        )

    # 1. Obtener la tasa del BCV asíncronamente
    tasa_bcv_exacta = Decimal("1.000000")
    if body.moneda_documento in ("USD", "EUR"):
        try:
            row = await conn.fetchrow(
                """
                SELECT tasa 
                FROM tasas_bcv 
                WHERE moneda = $1 AND fecha_valor = CURRENT_DATE
                """,
                body.moneda_documento
            )
            if not row:
                row = await conn.fetchrow(
                    """
                    SELECT tasa 
                    FROM tasas_bcv 
                    WHERE moneda = $1 
                    ORDER BY fecha_valor DESC 
                    LIMIT 1
                    """,
                    body.moneda_documento
                )
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No se encontró tasa de cambio histórica registrada para la divisa: {body.moneda_documento}"
                )
            tasa_bcv_exacta = Decimal(str(row["tasa"]))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error al obtener tasa BCV: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error al obtener la tasa de cambio del BCV: {str(e)}"
            )

    # 2. Matemática Exacta (Usa Decimal)
    TWO_PLACES = Decimal("0.01")
    base_imponible = Decimal("0.00")
    
    detalles_procesados = []
    for item in body.detalles:
        total_linea = (item.cantidad * item.precio_unitario).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        base_imponible += total_linea
        detalles_procesados.append({
            "producto_id": item.producto_id,
            "descripcion": item.descripcion or f"Producto {item.producto_id}",
            "cantidad": item.cantidad,
            "precio_unitario": item.precio_unitario,
            "total_linea": total_linea
        })

    monto_iva = (base_imponible * Decimal("0.16")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    
    monto_igtf = Decimal("0.00")
    if body.aplica_igtf and body.moneda_documento in ("USD", "EUR"):
        monto_igtf = ((base_imponible + monto_iva) * Decimal("0.03")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    monto_total = base_imponible + monto_iva + monto_igtf

    # 3. Transacción Segura de Base de Datos
    factura_id = uuid.uuid4()
    numero_factura = None
    numero_control = None
    hash_integridad = None
    asiento_id = None  # ID del asiento contable generado automáticamente

    # Obtener el ID de gerencia
    gerencia_id = current_user.get("gerencia_id")
    if not gerencia_id:
        try:
            gerencia_id = await conn.fetchval("SELECT id FROM gerencias LIMIT 1")
        except Exception:
            gerencia_id = None
    if not gerencia_id:
        gerencia_id = 1

    try:
        async with conn.transaction():
            # Configurar tenant en RLS
            await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_id))

            # Obtener número de factura desde correlativos_fiscales
            try:
                row_corr = await conn.fetchrow(
                    """
                    SELECT prefijo, siguiente_numero 
                    FROM correlativos_fiscales 
                    WHERE tipo_documento = 'FACTURA' 
                    FOR UPDATE
                    """
                )
                if not row_corr:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Servicio de correlativos fiscales no disponible"
                    )

                prefijo = row_corr["prefijo"]
                siguiente = row_corr["siguiente_numero"]
                numero_factura = f"{prefijo}{str(siguiente).zfill(8)}"
                numero_control = f"00-{str(siguiente).zfill(8)}"

                await conn.execute(
                    """
                    UPDATE correlativos_fiscales 
                    SET siguiente_numero = siguiente_numero + 1 
                    WHERE tipo_documento = 'FACTURA'
                    """
                )
            except HTTPException:
                raise
            except Exception as e_corr:
                logger.error(f"Error al obtener correlativo fiscal: {e_corr}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Servicio de correlativos fiscales no disponible"
                )

            creado_por = actor_id if actor_id else uuid.UUID(int=0)
            fecha_emision = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            hash_string = f"{numero_factura}|{body.cliente_id}|{fecha_emision}|{monto_total}|{creado_por}"
            hash_integridad = hashlib.sha256(hash_string.encode('utf-8')).hexdigest()

            # Insertar cabecera de la factura
            await conn.execute(
                """
                INSERT INTO facturas (
                    id, tenant_id, cliente_id, moneda_documento, aplica_igtf, 
                    tasa_cambio_historica, base_imponible, monto_iva, monto_igtf, 
                    monto_total, numero_factura, creado_por, numero_control, hash_integridad
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                """,
                factura_id,
                tenant_id,
                body.cliente_id,
                body.moneda_documento,
                body.aplica_igtf,
                tasa_bcv_exacta,
                base_imponible,
                monto_iva,
                monto_igtf,
                monto_total,
                numero_factura,
                creado_por,
                numero_control,
                hash_integridad
            )

            # Insertar los detalles
            for item in detalles_procesados:
                await conn.execute(
                    """
                    INSERT INTO factura_items (
                        tenant_id, factura_id, producto_id, descripcion, 
                        cantidad, precio_unitario, total_linea
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    tenant_id,
                    factura_id,
                    item["producto_id"],
                    item["descripcion"],
                    item["cantidad"],
                    item["precio_unitario"],
                    item["total_linea"]
                )

            # ─────────────────────────────────────────────────────────────────
            # PUENTE CONTABLE: Asiento de Partida Doble (Order-to-Cash)
            # Matriz de Integración SENIAT / PCGE Venezuela:
            #   DÉBITO  1.2.02.01 Cuentas por Cobrar Clientes  → monto_total
            #   CRÉDITO 5.1.01.01 Ingresos por Ventas          → base_imponible
            #   CRÉDITO 2.1.02.01 IVA Débito Fiscal por Pagar  → monto_iva      (si > 0)
            #   CRÉDITO 2.1.03.01 IGTF por Pagar               → monto_igtf     (si > 0)
            # Garantía ACID: si este bloque falla, la factura hace rollback completo.
            # ─────────────────────────────────────────────────────────────────
            concepto_asiento = f"Factura de Venta {numero_factura} — Emisión automática"
            asiento_row = await conn.fetchrow(
                """
                INSERT INTO asientos_contables (
                    tenant_id, fecha, concepto, referencia,
                    total_debe_usd, total_haber_usd,
                    tasa_cambio_bs, estado
                ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
                RETURNING id
                """,
                tenant_id,
                fecha_emision,
                concepto_asiento,
                numero_factura,
                float(monto_total),
                float(monto_total),     # DÉBITO = CRÉDITO siempre
                float(tasa_bcv_exacta),
                "ACTIVO"
            )
            asiento_id = asiento_row["id"]
            logger.info(
                "Asiento contable generado: id=%s | factura=%s | total=%.2f",
                asiento_id, numero_factura, float(monto_total)
            )

            # Líneas del asiento (Partida Doble balanceada)
            lineas_asiento = [
                # Línea 1 — DÉBITO: CxC Clientes (monto_total completo)
                (tenant_id, asiento_id, "1.2.02.01", "Cuentas por Cobrar Clientes",
                 float(monto_total), 0.0),
                # Línea 2 — CRÉDITO: Ingresos por Ventas
                (tenant_id, asiento_id, "5.1.01.01", "Ingresos por Ventas",
                 0.0, float(base_imponible)),
            ]
            if monto_iva > Decimal("0"):
                lineas_asiento.append(
                    # Línea 3 — CRÉDITO: IVA Débito Fiscal
                    (tenant_id, asiento_id, "2.1.02.01", "IVA Débito Fiscal por Pagar",
                     0.0, float(monto_iva))
                )
            if monto_igtf > Decimal("0"):
                lineas_asiento.append(
                    # Línea 4 — CRÉDITO: IGTF (solo en divisas extranjeras)
                    (tenant_id, asiento_id, "2.1.03.01", "IGTF por Pagar (3%)",
                     0.0, float(monto_igtf))
                )

            await conn.executemany(
                """
                INSERT INTO asiento_detalles (
                    tenant_id, asiento_id, cuenta_codigo, cuenta_nombre,
                    debe_usd, haber_usd
                ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                lineas_asiento
            )
            logger.info(
                "Asiento_detalles insertados: %d líneas para asiento_id=%s",
                len(lineas_asiento), asiento_id
            )
            # ─────────────────────────────────────────────────────────────────

    except Exception as e_db:
        logger.exception("Error en transacción de emisión de factura")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error de base de datos al emitir factura: {str(e_db)}"
        )

    # 4. Inyección de Telemetría (El Búnker)
    try:
        internal_event = KodaEventInternal(
            event_type="factura.emitida",
            aggregate_type=AggregateType.factura,
            aggregate_id=str(factura_id),
            gerencia_id=gerencia_id,
            payload={
                "numero_factura": numero_factura,
                "numero_control": numero_control,
                "base_imponible": float(base_imponible),
                "monto_iva": float(monto_iva),
                "monto_igtf": float(monto_igtf),
                "monto_total": float(monto_total),
                "tasa_bcv_aplicada": float(tasa_bcv_exacta),
                "asiento_contable_id": asiento_id,       # ← Trazabilidad Order-to-Cash
            },
            severity=EventSeverity.info,
            actor_id=actor_id,
            tenant_id=tenant_id,
            metadata=EventMetadata(
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent")
            )
        )
        internal_event.idempotency_key = internal_event.compute_idempotency_key()
        await event_buffer.enqueue(internal_event)
    except Exception as e_event:
        logger.error(f"Error al encolar evento de auditoría factura.emitida: {e_event}")

    return FacturaResponse(
        factura_id=factura_id,
        numero_factura=numero_factura,
        numero_control=numero_control,
        hash_integridad=hash_integridad,
        base_imponible=float(base_imponible),
        monto_iva=float(monto_iva),
        monto_igtf=float(monto_igtf),
        monto_total=float(monto_total),
        tasa_cambio_historica=float(tasa_bcv_exacta)
    )
