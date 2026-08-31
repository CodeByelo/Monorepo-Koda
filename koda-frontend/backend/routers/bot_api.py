"""
API de servicio (server-to-server) para el bot de Telegram.

El bot de Telegram vive en un backend COMPLETAMENTE SEPARADO
(`KODA_Remaster/sistema-corporativo/backend`), con su propio JWT y su
propia tabla `telegram_sessions` — no comparte sesión de usuario con este
ERP. Ambos backends comparten la MISMA base de datos Postgres (producción),
pero no comparten código Python ni autenticación de usuario.

En vez de federar login entre los dos sistemas (decisión deliberadamente
diferida), este router expone un conjunto MÍNIMO y EXPLÍCITO de endpoints
protegidos por una clave compartida fija (`X-Bot-Api-Key`, ver
`backend.core.security.verify_bot_api_key`), NUNCA por `get_current_user`
(JWT de usuario): es un límite de confianza distinto a propósito.

Como no hay sesión de usuario de la cual inferir el tenant, CADA endpoint
exige un `tenant_id` explícito en la petición y lo aplica a TODAS sus
consultas — tanto de forma manual (filtros `.tenant_id == tenant_id`) como
mediante el mecanismo global de aislamiento por tenant que ya usa el resto
de la aplicación (`current_tenant_id_var` / `with_loader_criteria` en
`backend.core.database`), para que nunca haya fuga entre tenants.

Diferencia deliberada con el formulario web de facturación
(`routers/facturacion.py`): el bot NUNCA acepta un precio unitario
enviado por el cliente. Un comando de Telegram no debe poder introducir
un precio negociado arbitrario sin que un humano lo revise antes en el
ERP — el precio siempre se toma de `Producto.precio_usd`.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core.database import get_db, current_tenant_id_var
from backend.core.security import verify_bot_api_key
from backend.utils.idempotency import require_idempotency
from backend.models.operations import Cliente, Producto
from backend.models.erp_extended import Almacen, AuditoriaLog, StockPorAlmacen, Vendedor
from backend.services.facturacion_service import LineaFactura, procesar_emision_factura
from backend.utils.helpers import resolver_almacen_venta, descontar_stock_almacen
from backend.services.analitica_inventario import (
    calcular_matriz_abc,
    calcular_rentabilidad,
    calcular_stock_critico,
)
from backend.utils.helpers import get_almacen_principal_id, to_float

router = APIRouter(
    prefix="/bot",
    tags=["Bot API (service-to-service)"],
    dependencies=[Depends(verify_bot_api_key)],
)


# ==========================================
# Helpers internos
# ==========================================

@dataclass
class _BotServiceIdentity:
    """Sustituto mínimo de `Profile` para invocar `procesar_emision_factura`,
    que solo necesita `.tenant_id` y `.id` (este último usado como
    `Venta.creado_por`, una FK nullable a `profiles.id`). Una venta creada
    por el bot no tiene un Profile humano detrás, así que `id=None` — es un
    hecho conocido (venta de origen bot), no un dato faltante."""
    tenant_id: "uuid.UUID"
    id: None = None


def _parse_tenant_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="tenant_id inválido: debe ser un UUID.")


def _set_tenant_scope(db: Session, tenant_id: uuid.UUID) -> None:
    """
    Aplica el mismo mecanismo de aislamiento por tenant que usa
    `get_current_user` (`services/auth.py`) para peticiones JWT normales,
    pero derivado del `tenant_id` explícito de la petición del bot en vez de
    un token. Esto activa, además del filtrado manual explícito de cada
    query en este router, el filtro global `with_loader_criteria` y el
    `before_insert`/`before_update` de `backend.core.database` como segunda
    capa de defensa contra fuga entre tenants.

    El `SELECT set_config(...)` (usado para RLS en Postgres/Supabase) se
    omite en SQLite -- no existe esa función ahí y no es necesaria en local.
    """
    current_tenant_id_var.set(tenant_id)
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        from sqlalchemy import text
        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant_id)},
        )


def _get_or_create_cliente_generico(db: Session, tenant_id: uuid.UUID) -> Cliente:
    """Mismo patrón de "Consumidor Final" ya usado en
    `routers/facturacion.py::emitir_factura_fiscal` y
    `routers/sales.py::registrar_venta_y_cxc`: si no hay cliente_rif o no se
    encuentra, usar el primer cliente del tenant y, si no existe ninguno,
    crear el consumidor final genérico."""
    cliente = db.query(Cliente).filter(Cliente.tenant_id == tenant_id).first()
    if cliente:
        return cliente

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
    return cliente


# ==========================================
# POST /bot/venta
# ==========================================

class BotLineaVenta(BaseModel):
    sku: str
    cantidad: float = Field(gt=0)


class BotVentaRequest(BaseModel):
    tenant_id: str
    vendedor_id: int
    cliente_rif: Optional[str] = None
    lineas: List[BotLineaVenta]
    metodo_pago: str
    moneda_documento: Optional[str] = None


@router.post("/venta", status_code=status.HTTP_201_CREATED)
@require_idempotency
def crear_venta_bot(
    request: Request,
    body: BotVentaRequest,
    db: Session = Depends(get_db),
):
    """
    Crea una venta/factura real a nombre de un vendedor, invocada por el
    bot de Telegram del otro backend. Reutiliza EXACTAMENTE el mismo motor
    de facturación (`facturacion_service.procesar_emision_factura`) que
    `/v1/facturacion/emitir` (web) y `/ventas/facturar`, para que impuestos,
    correlativo fiscal y asientos contables nunca diverjan entre puntos de
    entrada.

    IDEMPOTENCIA (X-Idempotency-Key):
    Protegido con `@require_idempotency`. El llamador (backend del bot de
    Telegram) DEBE enviar obligatoriamente el encabezado `X-Idempotency-Key`
    con un UUID válido y estable por cada mensaje/comando de compra para evitar
    la duplicación de facturas, deducción doble de stock y asientos contables
    ante reintentos de red. Si el encabezado falta o no es un UUID válido,
    el endpoint responderá con HTTP 400.

    IMPORTANTE (deliberado): a diferencia del formulario web, aquí NUNCA se
    acepta un precio unitario enviado por el cliente de la API. El precio
    de cada línea se toma siempre de `Producto.precio_usd` — un comando de
    Telegram no debe poder introducir un precio negociado arbitrario sin
    revisión humana previa en el ERP.
    """
    tenant_id = _parse_tenant_id(body.tenant_id)
    _set_tenant_scope(db, tenant_id)

    if not body.lineas:
        raise HTTPException(status_code=400, detail="La venta debe tener al menos una línea.")

    try:
        # --- 1. Vendedor (obligatorio, aislado por tenant) ---
        vendedor = db.query(Vendedor).filter(
            Vendedor.id == body.vendedor_id,
            Vendedor.tenant_id == tenant_id,
        ).first()
        if not vendedor:
            raise HTTPException(
                status_code=404,
                detail=f"El vendedor {body.vendedor_id} no existe o no pertenece a este tenant.",
            )

        # --- 2. Cliente (mismo patrón "Consumidor Final" que facturacion.py/sales.py) ---
        cliente = None
        if body.cliente_rif:
            cliente = db.query(Cliente).filter(
                Cliente.rif == body.cliente_rif,
                Cliente.tenant_id == tenant_id,
            ).first()
        if not cliente:
            cliente = _get_or_create_cliente_generico(db, tenant_id)

        # --- 3. Resolver cada SKU contra el catálogo de ESTE tenant, bloqueando fila ---
        skus = [linea.sku for linea in body.lineas]
        productos = db.query(Producto).filter(
            Producto.sku.in_(skus),
            Producto.tenant_id == tenant_id,
        ).with_for_update().all()
        productos_por_sku = {p.sku: p for p in productos}
        almacen_venta_id = resolver_almacen_venta(db, tenant_id)

        lineas_factura: List[LineaFactura] = []
        for linea in body.lineas:
            producto = productos_por_sku.get(linea.sku)
            if not producto:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto con SKU '{linea.sku}' no encontrado en el inventario de este tenant.",
                )

            try:
                cantidad = Decimal(str(linea.cantidad))
            except InvalidOperation:
                raise HTTPException(status_code=400, detail=f"Cantidad inválida para el SKU '{linea.sku}'.")

            if cantidad <= 0:
                raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

            if producto.stock < cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente para '{producto.nombre}' (SKU {producto.sku}). "
                        f"Disponible: {producto.stock}, Solicitado: {cantidad}"
                    ),
                )

            producto.stock -= cantidad
            descontar_stock_almacen(db, tenant_id, producto.id, almacen_venta_id, cantidad)

            lineas_factura.append(LineaFactura(
                producto_id=producto.id,
                cantidad=cantidad,
                # Precio SIEMPRE tomado del catálogo real, nunca del cliente de la API.
                precio_unitario=Decimal(str(producto.precio_usd)),
                es_exento=bool(producto.es_exento),
            ))

        # --- 4. Calcular impuestos, correlativo, persistencia y asientos contables ---
        bot_identity = _BotServiceIdentity(tenant_id=tenant_id)
        resultado = procesar_emision_factura(
            db=db,
            current_user=bot_identity,
            cliente=cliente,
            lineas=lineas_factura,
            metodo_pago=body.metodo_pago,
            moneda_documento=body.moneda_documento,
            dias_credito=0,
            vendedor_id=vendedor.id,
            almacen_id=almacen_venta_id,
        )

        # --- 5. Auditoría (mismo ledger que el resto del sistema) ---
        db.add(AuditoriaLog(
            tenant_id=tenant_id,
            usuario="BOT_TELEGRAM (service-to-service)",
            accion="EMISION_VENTA_BOT",
            modulo="BOT_API",
            detalle=(
                f"Venta creada vía bot de Telegram: {resultado.numero_factura} | "
                f"Vendedor: {vendedor.nombre} (ID {vendedor.id}) | "
                f"Cliente: {cliente.nombre} ({cliente.rif}) | "
                f"Total: {resultado.monto_total} {body.moneda_documento or ''}"
            ),
            ip="internal-service:telegram-bot",
        ))

        # --- 6. Commit atómico (mismo límite transaccional que facturacion.py/sales.py) ---
        db.commit()
        db.refresh(resultado.venta)

    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        # p.ej. vendedor_id inválido/ajeno al tenant detectado dentro del propio servicio.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error al procesar la venta del bot. Transacción revertida. Detalle: {str(e)}",
        )

    return {
        "numero_factura": resultado.numero_factura,
        "numero_control": resultado.numero_control,
        "fecha_emision": resultado.venta.fecha.isoformat(),
        "cliente": {"id": cliente.id, "nombre": cliente.nombre, "rif": cliente.rif},
        "vendedor": {"id": vendedor.id, "nombre": vendedor.nombre},
        "moneda_documento": body.moneda_documento,
        "metodo_pago": body.metodo_pago,
        "subtotal_gravado": float(resultado.subtotal_gravado),
        "subtotal_exento": float(resultado.subtotal_exento),
        "base_imponible": float(resultado.base_imponible),
        "monto_iva": float(resultado.monto_iva),
        "monto_igtf": float(resultado.monto_igtf),
        "aplica_igtf": resultado.aplica_igtf,
        "retencion_iva": float(resultado.retencion_iva),
        "monto_total": float(resultado.monto_total),
        "comision_usd": float(resultado.comision_usd),
        "tasa_bcv": float(resultado.tasa_bs),
        "estado": "ACTIVA",
    }


# ==========================================
# GET /bot/stock
# ==========================================

@router.get("/stock")
def consultar_stock_bot(
    tenant_id: str,
    sku: str,
    db: Session = Depends(get_db),
):
    """Stock real (suma de StockPorAlmacen) de un producto, por SKU, aislado
    por tenant."""
    tid = _parse_tenant_id(tenant_id)
    _set_tenant_scope(db, tid)

    producto = db.query(Producto).filter(
        Producto.sku == sku,
        Producto.tenant_id == tid,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail=f"Producto con SKU '{sku}' no encontrado en este tenant.")

    total_stock = db.query(StockPorAlmacen).filter(
        StockPorAlmacen.producto_id == producto.id,
        StockPorAlmacen.tenant_id == tid,
    ).all()
    stock_total = sum(to_float(s.cantidad) for s in total_stock)
    minimo = to_float(producto.stock_minimo)

    # Desglose por almacén (mismo criterio de "principal" que
    # GET /inventario/kardex/{producto_id}/almacenes en operaciones/inventario.py):
    # se agrega como campo NUEVO ("por_almacen") sin tocar ninguno de los
    # campos existentes, para no romper a quien ya consume este endpoint.
    principal_id = get_almacen_principal_id(db, tid)
    cantidad_por_almacen = {s.almacen_id: s.cantidad for s in total_stock}
    almacenes = db.query(Almacen).filter(
        Almacen.tenant_id == tid,
        Almacen.activo == True,  # noqa: E712
    ).order_by(Almacen.id.asc()).all()
    por_almacen = [
        {
            "almacen_id": a.id,
            "nombre": a.nombre,
            "cantidad": to_float(cantidad_por_almacen.get(a.id, 0)),
            "es_principal": a.id == principal_id,
        }
        for a in almacenes
    ]

    return {
        "sku": producto.sku,
        "nombre": producto.nombre,
        "stock_total": stock_total,
        "stock_minimo": minimo,
        "bajo_minimo": stock_total <= minimo,
        "precio_usd": to_float(producto.precio_usd),
        "por_almacen": por_almacen,
    }


# ==========================================
# GET /bot/productos/buscar
# ==========================================

@router.get("/productos/buscar")
def buscar_productos_bot(
    tenant_id: str,
    q: str,
    db: Session = Depends(get_db),
):
    """
    Búsqueda de productos por nombre (ILIKE, parcial) para el flujo de venta
    conversacional del bot (/comprar). Usa Producto.stock DIRECTO (el mismo
    campo que valida y descuenta /bot/venta al emitir la factura) para que el
    número mostrado aquí coincida exactamente con lo que se va a validar al
    confirmar — a propósito NO usa StockPorAlmacen (que es una fuente
    distinta, usada solo por /bot/stock para otro caso de uso).
    """
    tid = _parse_tenant_id(tenant_id)
    _set_tenant_scope(db, tid)

    query = (q or "").strip()
    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Escribe al menos 2 caracteres para buscar.")

    productos = (
        db.query(Producto)
        .filter(Producto.tenant_id == tid, Producto.nombre.ilike(f"%{query}%"))
        .order_by(Producto.nombre.asc())
        .limit(8)
        .all()
    )

    return {
        "resultados": [
            {
                "sku": p.sku,
                "nombre": p.nombre,
                "precio_usd": to_float(p.precio_usd),
                "stock": to_float(p.stock),
            }
            for p in productos
        ]
    }


# ==========================================
# GET /bot/alertas
# ==========================================

@router.get("/alertas")
def consultar_alertas_bot(
    tenant_id: str,
    db: Session = Depends(get_db),
):
    """
    Agrega, para el tenant dado, tres categorías de alerta proactiva
    (para que el bot arme un único mensaje de Telegram):
      - STOCK_CRITICO: productos en o bajo su stock_minimo real.
      - BAJA_ROTACION: cuadrante "Perros" de la matriz ABC (baja rotación,
        bajo margen) — mismo cálculo que `/reportes/matriz-abc`.
      - EN_PERDIDA: productos con margen neto negativo — mismo cálculo que
        `/reportes/rentabilidad`.

    Todo el cálculo reutiliza `backend.services.analitica_inventario`,
    compartido con los endpoints REST del dashboard web, para que la
    definición de cada alerta nunca diverja entre el bot y el ERP.
    """
    tid = _parse_tenant_id(tenant_id)
    _set_tenant_scope(db, tid)

    alertas = []

    for item in calcular_stock_critico(db, tid):
        alertas.append({
            "categoria": "STOCK_CRITICO",
            "sku": item.producto.sku,
            "nombre": item.producto.nombre,
            "detalle": {
                "stock": item.disponible,
                "minimo": item.minimo,
                "sugerido_reponer": max(0.0, item.minimo - item.disponible),
                "estado": "AGOTADO" if item.disponible <= 0 else "BAJO",
            },
        })

    for c in calcular_matriz_abc(db, tid):
        if c.cuadrante != "dogs":
            continue
        alertas.append({
            "categoria": "BAJA_ROTACION",
            "sku": c.producto.sku,
            "nombre": c.producto.nombre,
            "detalle": {
                "rotacion_30d": c.rotacion,
                "rentabilidad_pct": round(c.rentabilidad, 1),
            },
        })

    for r in calcular_rentabilidad(db, tid):
        if not r.is_loss:
            continue
        alertas.append({
            "categoria": "EN_PERDIDA",
            "sku": r.producto.sku,
            "nombre": r.producto.nombre,
            "detalle": {
                "margen_neto_usd": round(r.margen_neto, 2),
                "margen_neto_pct": round(r.margen_neto_pct, 1),
            },
        })

    return {
        "tenant_id": str(tid),
        "total_alertas": len(alertas),
        "alertas": alertas,
    }
