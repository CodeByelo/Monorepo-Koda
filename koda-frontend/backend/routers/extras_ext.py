"""Endpoints para pantallas ERP sin router dedicado (principal, billing, RRHH, inventario avanzado)."""
from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

from backend.core.database import get_db
from backend.models.operations import Venta, Cliente, Producto, Proveedor
from backend.models.core import TasaCambio, Profile
from backend.models.hr import Empleado, Nomina
from backend.models.accounting import AsientoContable, AsientoDetalle
from backend.models.fiscal import INPCIndice
from backend.schemas.hr import PaginatedEmpleadoResponse
from backend.schemas.accounting import PaginatedLibroDiarioResponse
from backend.models.erp_extended import (
    CuentaBancaria, CuentaPorCobrar, Compra, NotaCredito, AnticipoCliente,
    Almacen, TransferenciaInventario, RequisicionCompra, LoteProducto, ConteoFisico,
    CentroCosto, Vendedor, TransferenciaTesoreria, PrestamoUVC, PresupuestoPartida,
    RetencionIVA, FondoCajaChica, GastoCajaChica, ColocacionInversion, AuditoriaLog,
    MovimientoBancario, StockPorAlmacen,
)
from backend.utils.helpers import (
    to_float, tasa_actual, ventas_periodo, margen_bruto_pct,
    TASA_CAMBIO_FALLBACK_DEFAULT,
)
from backend.core.security import get_current_user
from backend.services.contabilidad import ContabilidadService

router = APIRouter(tags=["Extras ERP"], dependencies=[Depends(get_current_user)])


def _fmt_money(v: float, prefix: str = "$") -> str:
    return f"{prefix}{v:,.2f}"


@router.get("/principal/dashboard")
def principal_dashboard(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    liquidez = db.query(func.sum(CuentaBancaria.saldo_actual_usd)).filter(
        CuentaBancaria.tenant_id == current_user.tenant_id
    ).scalar() or 0
    cxc = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado != "PAGADA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).scalar() or 0
    valor_inv = db.query(func.sum(Producto.stock * Producto.costo_usd)).filter(
        Producto.tenant_id == current_user.tenant_id
    ).scalar() or 0
    ventas_mes = ventas_periodo(
        db, current_user.tenant_id, datetime.now(timezone.utc).strftime("%Y-%m")
    ).all()
    utilidad = sum(to_float(v.subtotal) for v in ventas_mes) * 0.25
    tasa = tasa_actual(db, current_user.tenant_id)

    # ── Resumen 7 días reales ──────────────────────────────────────────────────
    desde_7d = datetime.now(timezone.utc) - timedelta(days=7)
    ventas_7d = db.query(Venta).filter(
        Venta.fecha >= desde_7d, Venta.estado == "ACTIVA", Venta.tenant_id == current_user.tenant_id
    ).all()
    ingresos_7d = sum(to_float(v.total) for v in ventas_7d)
    max_ingreso = max(ingresos_7d, 1)

    from backend.models.operations import AjusteInventario
    compras_7d = db.query(AjusteInventario).filter(
        AjusteInventario.fecha_solicitud >= desde_7d,
        AjusteInventario.estado == "APROBADO",
        AjusteInventario.tenant_id == current_user.tenant_id
    ).all()
    egresos_7d = sum(to_float(getattr(aj, 'costo_total', None) or 0) for aj in compras_7d)

    # ── Alertas reales ────────────────────────────────────────────────────────
    criticos = db.query(Producto).filter(
        Producto.stock <= Producto.stock_minimo, Producto.tenant_id == current_user.tenant_id
    ).count() if hasattr(Producto, 'stock_minimo') else 0
    mora_count = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.estado == "VENCIDA", CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).count()
    mora_monto = db.query(func.sum(CuentaPorCobrar.monto_total_usd - CuentaPorCobrar.monto_pagado_usd)).filter(
        CuentaPorCobrar.estado == "VENCIDA",
        CuentaPorCobrar.tenant_id == current_user.tenant_id
    ).scalar() or 0

    # ── Últimas transacciones reales ──────────────────────────────────────────
    from backend.models.erp_extended import CuentaPorCobrar as CPC
    from backend.models.operations import Cliente
    ultimas_ventas = db.query(Venta).filter(
        Venta.estado == "ACTIVA", Venta.tenant_id == current_user.tenant_id
    ).order_by(Venta.fecha.desc()).limit(3).all()
    ultimas_txs = []
    # Fix N+1: solo cargamos los clientes de esas 3 ventas, no toda la tabla
    venta_cliente_ids = [v.cliente_id for v in ultimas_ventas if v.cliente_id]
    if venta_cliente_ids:
        clientes_map = {c.id: c.nombre for c in db.query(Cliente).filter(
            Cliente.id.in_(venta_cliente_ids), Cliente.tenant_id == current_user.tenant_id
        ).all()}
    else:
        clientes_map = {}
    for v in ultimas_ventas:
        nombre_cliente = clientes_map.get(v.cliente_id, "Consumidor Final")
        ultimas_txs.append({
            "text": f"Factura {v.numero_factura}",
            "sub": f"{nombre_cliente} · ${to_float(v.total):.2f}",
            "tipo": "ingreso"
        })

    return {
        "tasa_bcv": tasa,
        "kpis": [
            {"label": "Liquidez Inmediata", "value": _fmt_money(to_float(liquidez)), "desc": "Bancos y Caja"},
            {"label": "Cuentas por Cobrar", "value": _fmt_money(to_float(cxc)), "desc": "Cartera Total Activa"},
            {"label": "Valor del Inventario", "value": _fmt_money(to_float(valor_inv)), "desc": "Costo Promedio Ponderado"},
            {"label": "Utilidad Neta (Mes)", "value": _fmt_money(utilidad), "desc": "P&G Consolidado"},
        ],
        "resumen_operaciones": {
            "ingresos": ingresos_7d,
            "ingresos_pct": min(round((ingresos_7d / max(ingresos_7d + egresos_7d, 1)) * 100), 100),
            "egresos": egresos_7d,
            "egresos_pct": min(round((egresos_7d / max(ingresos_7d + egresos_7d, 1)) * 100), 100),
        },
        "alertas": {
            "criticos_count": criticos,
            "mora_count": mora_count,
            "mora_monto": to_float(mora_monto),
        },
        "ultimas_txs": ultimas_txs,
    }


@router.get("/ventas/pos/contexto")
def pos_contexto(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    productos = db.query(Producto).filter(
        (Producto.tenant_id == current_user.tenant_id) | (Producto.tenant_id.is_(None))
    ).order_by(Producto.nombre.asc()).limit(100).all()
    ventas_recientes = db.query(Venta).filter(
        Venta.estado == "ACTIVA", Venta.tenant_id == current_user.tenant_id
    ).order_by(Venta.fecha.desc()).limit(10).all()
    tasa = tasa_actual(db, current_user.tenant_id)

    # Calcular ventas de hoy de forma compatible con PostgreSQL y SQLite
    hoy_inicio = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    ventas_hoy = db.query(Venta).filter(
        Venta.estado == "ACTIVA",
        Venta.tenant_id == current_user.tenant_id,
        Venta.fecha >= hoy_inicio
    ).all()
    total_hoy = sum(to_float(v.total_usd or v.total or 0) for v in ventas_hoy)
    count_hoy = len(ventas_hoy)
    
    return {
        "tasa_bcv": tasa,
        "total_hoy": total_hoy,
        "count_hoy": count_hoy,
        "productos": [
            {
                "id": p.id,
                "sku": p.sku,
                "nombre": p.nombre,
                "precio": to_float(p.precio_usd),
                "precio_detal": to_float(p.precio_detal) if p.precio_detal is not None else None,
                "precio_mayor": to_float(p.precio_mayor) if p.precio_mayor is not None else None,
                "precio_gran_mayor": to_float(p.precio_gran_mayor) if p.precio_gran_mayor is not None else None,
                "stock": p.stock,
            }
            for p in productos
        ],
        "tickets_recientes": [
            {
                "id": v.numero_factura,
                "venta_id": v.id,
                "client": v.cliente.nombre if v.cliente else "Consumidor Final",
                "time": v.fecha.strftime("%H:%M"),
                "total_usd": to_float(v.total_usd or v.total or 0),
                "total_bs": to_float(v.total_usd or v.total or 0) * (to_float(v.tasa_cambio_bs) if to_float(v.tasa_cambio_bs) > 0 else (to_float(tasa) if to_float(tasa) > 0 else 1.0)),
                "total": _fmt_money(to_float(v.total_usd or v.total or 0)),
                "method": v.metodo_pago,
                "status": "EMITIDO",
            }
            for v in ventas_recientes
        ],
    }


@router.get("/ventas/notas-credito")
def listar_notas_credito(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    notas = db.query(NotaCredito).filter(NotaCredito.tenant_id == current_user.tenant_id).order_by(NotaCredito.fecha.desc()).all()
    clientes = {c.id: c for c in db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()}
    ventas = {v.id: v for v in db.query(Venta).filter(Venta.tenant_id == current_user.tenant_id).all()}
    return [
        {
            "id": n.numero,
            "cliente": clientes[n.cliente_id].nombre if n.cliente_id in clientes else "",
            "monto": to_float(n.monto),
            "motivo": n.motivo,
            "estado": n.estado,
            "fecha": n.fecha.strftime("%d/%m/%Y"),
            "invoice": ventas[n.venta_id].numero_factura if n.venta_id in ventas else "-",
            "tipo": n.tipo,  # Retornar el tipo de nota ("CREDITO" o "DEBITO")
        }
        for n in notas
    ]


# Tope defensivo de monto por nota: no hay razón de negocio para que una sola
# nota de crédito/débito supere este monto; evita entradas absurdas (typos con
# decimales corridos, montos negativos, etc.) además de la validación puntual
# contra el saldo de la factura relacionada que se hace en crear_nota_credito.
NOTA_CREDITO_MONTO_MAXIMO = Decimal("1000000")


class NotaCreditoCreate(BaseModel):
    numero_factura: str
    monto: Decimal = Field(..., ge=0, le=NOTA_CREDITO_MONTO_MAXIMO, decimal_places=2)
    motivo: str
    tipo: str = "CREDITO"  # CREDITO o DEBITO


@router.post("/ventas/notas-credito")
def crear_nota_credito(payload: NotaCreditoCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    try:
        venta = db.query(Venta).filter(
            Venta.numero_factura == payload.numero_factura,
            Venta.tenant_id == current_user.tenant_id
        ).first()
        if not venta:
            raise HTTPException(status_code=404, detail=f"Factura {payload.numero_factura} no encontrada en su organización.")

        clientes = db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()
        if not clientes:
            raise HTTPException(status_code=400, detail="Debe registrar al menos un cliente en el sistema.")

        cxc = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.venta_id == venta.id,
            CuentaPorCobrar.tenant_id == current_user.tenant_id
        ).first()
        if cxc:
            cliente_id = cxc.cliente_id
        else:
            cliente_id = clientes[0].id

        tipo_str_check = payload.tipo.upper() if payload.tipo else "CREDITO"
        if "DEBIT" not in tipo_str_check:
            # Nota de crédito: no puede exceder el saldo pendiente real de la
            # factura relacionada. Antes esto se "clamp"eaba silenciosamente al
            # aplicar el monto a la CxC (el exceso simplemente desaparecía del
            # balance por cobrar); ahora se rechaza explícitamente para que el
            # usuario corrija el monto.
            if cxc:
                saldo_pendiente = Decimal(str(cxc.monto_total)) - Decimal(str(cxc.monto_pagado))
            else:
                # Sin CxC asociada (ya liquidada/eliminada o nunca generada):
                # el tope de referencia es el total facturado.
                saldo_pendiente = Decimal(str(venta.total_usd))

            if saldo_pendiente < 0:
                saldo_pendiente = Decimal("0")

            if payload.monto > saldo_pendiente:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El monto de la nota de crédito (${payload.monto:.2f}) excede el saldo "
                        f"pendiente de la factura {payload.numero_factura} (${saldo_pendiente:.2f})."
                    ),
                )

        cant_notas = db.query(NotaCredito).filter(NotaCredito.tenant_id == current_user.tenant_id).count()
        tipo_str = payload.tipo.upper() if payload.tipo else "CREDITO"
        # Determinar prefijo según tipo de nota
        prefijo = "ND" if "DEBIT" in tipo_str else "NC"
        nuevo_numero = f"{prefijo}-{str(cant_notas + 1).zfill(8)}"

        tasa_bs = Decimal(str(tasa_actual(db, current_user.tenant_id)))
        nota = NotaCredito(
            numero=nuevo_numero,
            venta_id=venta.id,
            cliente_id=cliente_id,
            monto_usd=payload.monto,
            tasa_cambio_bs=tasa_bs,
            motivo=payload.motivo,
            tipo="DEBITO" if "DEBIT" in tipo_str else "CREDITO",
            estado="EMITIDA",
            fecha=datetime.now(timezone.utc),
            tenant_id=current_user.tenant_id
        )
        db.add(nota)

        if cxc:
            if "DEBIT" in tipo_str:
                # Nota de débito incrementa el monto original por cobrar
                cxc.monto_total = Decimal(str(cxc.monto_total)) + payload.monto
                if cxc.estado == "PAGADA":
                    cxc.estado = "PENDIENTE"
            else:
                # Nota de crédito incrementa el monto ya pagado (disminuye saldo restante)
                cxc.monto_pagado = Decimal(str(cxc.monto_pagado)) + payload.monto
                if cxc.monto_pagado >= cxc.monto_total:
                    cxc.monto_pagado = cxc.monto_total
                    cxc.estado = "PAGADA"

        # Generar Asiento Contable Automático de Nota de Crédito / Débito
        ContabilidadService.generar_asiento_nota_credito(
            monto=payload.monto,
            tipo=nota.tipo,
            tasa_cambio_bs=tasa_bs,
            referencia=nota.numero,
            concepto=f"{'Nota de Crédito' if nota.tipo == 'CREDITO' else 'Nota de Débito'} {nota.numero} - Factura {payload.numero_factura} - {payload.motivo}",
            fecha=datetime.now(timezone.utc),
            db=db,
            tenant_id=current_user.tenant_id,
        )

        db.commit()
        db.refresh(nota)

        cliente_nombre = next((c.nombre for c in clientes if c.id == cliente_id), "")

        return {
            "id": nota.numero,
            "cliente": cliente_nombre,
            "monto": to_float(nota.monto),
            "motivo": nota.motivo,
            "estado": nota.estado,
            "fecha": nota.fecha.strftime("%d/%m/%Y"),
            "tipo": nota.tipo,
        }
    except HTTPException:
        db.rollback()
        raise


class AlmacenCreate(BaseModel):
    codigo: str
    nombre: str
    responsable: Optional[str] = None
    direccion: Optional[str] = None
    tipo: Optional[str] = "ALMACEN"  # 'LOCAL' o 'ALMACEN'


@router.get("/inventario/almacenes")
def listar_almacenes(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    items = db.query(Almacen).filter(Almacen.activo == True, Almacen.tenant_id == current_user.tenant_id).all()
    return [
        {
            "id": a.id,
            "codigo": a.codigo,
            "nombre": a.nombre,
            "responsable": a.responsable or "Sin asignar",
            "direccion": a.direccion or "Dirección no especificada",
            "tipo": a.tipo,
            "activo": a.activo
        }
        for a in items
    ]


@router.post("/inventario/almacenes")
def crear_almacen(payload: AlmacenCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    existing = db.query(Almacen).filter(
        Almacen.codigo == payload.codigo.upper(), Almacen.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="El código de almacén ya está registrado.")

    tipo_normalizado = (payload.tipo or "ALMACEN").upper()
    if tipo_normalizado not in ("LOCAL", "ALMACEN"):
        raise HTTPException(status_code=400, detail="El tipo debe ser 'LOCAL' o 'ALMACEN'.")
    if tipo_normalizado == "LOCAL":
        otro_local = db.query(Almacen).filter(
            Almacen.tenant_id == current_user.tenant_id,
            Almacen.activo == True,  # noqa: E712
            Almacen.tipo == "LOCAL",
        ).first()
        if otro_local:
            raise HTTPException(
                status_code=400,
                detail=f"Ya existe un Local activo ('{otro_local.nombre}'). Cambia primero su tipo a Almacén antes de marcar otro como Local.",
            )

    nuevo = Almacen(
        codigo=payload.codigo.upper(),
        nombre=payload.nombre,
        responsable=payload.responsable,
        direccion=payload.direccion,
        tipo=tipo_normalizado,
        activo=True,
        tenant_id=current_user.tenant_id
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/inventario/almacenes/{almacen_id}")
def actualizar_almacen(almacen_id: int, payload: AlmacenCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    a = db.query(Almacen).filter(Almacen.id == almacen_id, Almacen.tenant_id == current_user.tenant_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Almacén no encontrado.")

    tipo_normalizado = (payload.tipo or "ALMACEN").upper()
    if tipo_normalizado not in ("LOCAL", "ALMACEN"):
        raise HTTPException(status_code=400, detail="El tipo debe ser 'LOCAL' o 'ALMACEN'.")
    if tipo_normalizado == "LOCAL":
        otro_local = db.query(Almacen).filter(
            Almacen.tenant_id == current_user.tenant_id,
            Almacen.activo == True,  # noqa: E712
            Almacen.tipo == "LOCAL",
            Almacen.id != almacen_id,
        ).first()
        if otro_local:
            raise HTTPException(
                status_code=400,
                detail=f"Ya existe un Local activo ('{otro_local.nombre}'). Cambia primero su tipo a Almacén antes de marcar otro como Local.",
            )

    a.codigo = payload.codigo.upper()
    a.nombre = payload.nombre
    a.responsable = payload.responsable
    a.direccion = payload.direccion
    a.tipo = tipo_normalizado
    db.commit()
    return {"ok": True}


@router.get("/inventario/almacenes/resumen")
def resumen_almacenes(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """
    Resumen REAL por almacén (productos distintos con existencia y valor a
    costo), agregado desde StockPorAlmacen. Reemplaza el reparto porcentual
    fabricado (60/25/15) que antes vivía en el frontend.
    """
    items = db.query(Almacen).filter(Almacen.activo == True, Almacen.tenant_id == current_user.tenant_id).all()

    agregados = db.query(
        StockPorAlmacen.almacen_id,
        func.count(func.distinct(StockPorAlmacen.producto_id)).label("productos"),
        func.sum(StockPorAlmacen.cantidad * Producto.costo_usd).label("valor")
    ).join(
        Producto, Producto.id == StockPorAlmacen.producto_id
    ).filter(
        StockPorAlmacen.cantidad > 0,
        StockPorAlmacen.tenant_id == current_user.tenant_id
    ).group_by(StockPorAlmacen.almacen_id).all()
    resumen_map = {a.almacen_id: a for a in agregados}

    return [
        {
            "id": a.id,
            "codigo": a.codigo,
            "nombre": a.nombre,
            "responsable": a.responsable or "Sin asignar",
            "direccion": a.direccion or "Dirección no especificada",
            "tipo": a.tipo,
            "activo": a.activo,
            "productos": int(resumen_map[a.id].productos) if a.id in resumen_map else 0,
            "valor_usd": to_float(resumen_map[a.id].valor) if a.id in resumen_map else 0.0,
        }
        for a in items
    ]


@router.get("/inventario/criticos")
def inventario_criticos(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """
    Productos en o bajo su stock_minimo REAL (configurable por producto),
    comparado contra la existencia sumada de todos sus almacenes
    (StockPorAlmacen), no contra el umbral fijo de 10 unidades ni el total
    global de Producto.stock.

    El cálculo vive en `backend.services.analitica_inventario.calcular_stock_critico`,
    compartido con la API de servicio del bot de Telegram (`routers/bot_api.py`),
    para que ambos consumidores nunca diverjan en la definición de "stock crítico".
    """
    from backend.services.analitica_inventario import calcular_stock_critico

    criticos = calcular_stock_critico(db, current_user.tenant_id)

    return [
        {
            "sku": item.producto.sku,
            "nombre": item.producto.nombre,
            "stock": item.disponible,
            "minimo": item.minimo,
            "sugerido": max(0.0, item.minimo - item.disponible),
            "costo_usd": to_float(item.producto.costo_usd),
            "estado": "AGOTADO" if item.disponible <= 0 else "BAJO",
        }
        for item in criticos
    ]


@router.get("/inventario/existencias")
def inventario_existencias(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    prods = db.query(Producto).filter(Producto.tenant_id == current_user.tenant_id).all()
    return [{"sku": p.sku, "nombre": p.nombre, "stock": p.stock, "valor": to_float(p.stock * p.costo_usd)} for p in prods]


@router.get("/inventario/lotes")
def inventario_lotes(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    lotes = db.query(LoteProducto).filter(LoteProducto.tenant_id == current_user.tenant_id).order_by(LoteProducto.fecha_vencimiento).all()
    prods = {p.id: p for p in db.query(Producto).filter(Producto.tenant_id == current_user.tenant_id).all()}
    return [
        {
            "lote": l.lote,
            "producto": prods[l.producto_id].nombre if l.producto_id in prods else "",
            "cantidad": to_float(l.cantidad),
            "vence": l.fecha_vencimiento.strftime("%d/%m/%Y") if l.fecha_vencimiento else "-",
        }
        for l in lotes
    ]


class ConteoCreate(BaseModel):
    almacen_id: int
    producto_id: int
    cantidad_fisica: float

@router.get("/inventario/conteos")
def inventario_conteos(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    conteos = db.query(ConteoFisico).filter(
        ConteoFisico.tenant_id == current_user.tenant_id
    ).order_by(ConteoFisico.fecha.desc()).limit(50).all()
    res = []
    for c in conteos:
        almacen = db.query(Almacen).filter(Almacen.id == c.almacen_id, Almacen.tenant_id == current_user.tenant_id).first()
        producto = db.query(Producto).filter(Producto.id == c.producto_id, Producto.tenant_id == current_user.tenant_id).first()
        res.append({
            "id": c.id,
            "almacen_id": c.almacen_id,
            "producto_id": c.producto_id,
            "cantidad_sistema": float(c.cantidad_sistema),
            "cantidad_fisica": float(c.cantidad_fisica),
            "diferencia": float(c.diferencia),
            "estado": c.estado,
            "fecha": c.fecha.isoformat(),
            "almacen": almacen.nombre if almacen else "Almacén Principal",
            "responsable": almacen.responsable if (almacen and hasattr(almacen, 'responsable') and almacen.responsable) else "Admin",
            "producto": producto.nombre if producto else "Producto"
        })
    return res

@router.post("/inventario/conteos")
def crear_conteo(body: ConteoCreate, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    producto = db.query(Producto).filter(Producto.id == body.producto_id, Producto.tenant_id == current_user.tenant_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    almacen = db.query(Almacen).filter(Almacen.id == body.almacen_id, Almacen.tenant_id == current_user.tenant_id).first()
    if not almacen:
        raise HTTPException(status_code=404, detail="Almacén no encontrado")

    cantidad_sistema = float(producto.stock)
    diferencia = body.cantidad_fisica - cantidad_sistema

    nuevo_conteo = ConteoFisico(
        almacen_id=body.almacen_id,
        producto_id=body.producto_id,
        cantidad_sistema=Decimal(str(cantidad_sistema)),
        cantidad_fisica=Decimal(str(body.cantidad_fisica)),
        diferencia=Decimal(str(diferencia)),
        estado="PENDIENTE",
        tenant_id=current_user.tenant_id
    )
    db.add(nuevo_conteo)
    db.commit()
    db.refresh(nuevo_conteo)
    return {
        "id": nuevo_conteo.id,
        "almacen_id": nuevo_conteo.almacen_id,
        "producto_id": nuevo_conteo.producto_id,
        "cantidad_sistema": float(nuevo_conteo.cantidad_sistema),
        "cantidad_fisica": float(nuevo_conteo.cantidad_fisica),
        "diferencia": float(nuevo_conteo.diferencia),
        "estado": nuevo_conteo.estado,
        "fecha": nuevo_conteo.fecha.isoformat()
    }

@router.post("/inventario/conteos/{conteo_id}/cerrar")
def cerrar_conteo(conteo_id: int, db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    # Bloqueamos la fila del conteo para evitar cierres concurrentes del
    # mismo conteo (mismo patrón que recibir_transferencia).
    conteo = db.query(ConteoFisico).filter(
        ConteoFisico.id == conteo_id, ConteoFisico.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if not conteo:
        raise HTTPException(status_code=404, detail="Conteo no encontrado")
    if conteo.estado == "CERRADO":
        raise HTTPException(status_code=400, detail="El conteo ya está cerrado")

    # Bloqueamos también la fila del producto antes de mutar su stock.
    producto = db.query(Producto).filter(
        Producto.id == conteo.producto_id, Producto.tenant_id == current_user.tenant_id
    ).with_for_update().first()
    if producto:
        producto.stock = conteo.cantidad_fisica

        # Reflejar la conciliación en StockPorAlmacen del almacén contado,
        # aplicando la misma diferencia (delta) que ya se usó para el stock
        # global, en vez de dejar la tabla por-almacén sin actualizar.
        almacen_stock = db.query(StockPorAlmacen).filter(
            StockPorAlmacen.producto_id == conteo.producto_id,
            StockPorAlmacen.almacen_id == conteo.almacen_id,
            StockPorAlmacen.tenant_id == current_user.tenant_id
        ).with_for_update().first()

        if almacen_stock:
            almacen_stock.cantidad = max(almacen_stock.cantidad + conteo.diferencia, Decimal("0.00"))
        else:
            almacen_stock = StockPorAlmacen(
                producto_id=conteo.producto_id,
                almacen_id=conteo.almacen_id,
                cantidad=max(conteo.diferencia, Decimal("0.00")),
                tenant_id=current_user.tenant_id
            )
            db.add(almacen_stock)

    conteo.estado = "CERRADO"
    db.commit()
    return {"message": "Conteo conciliado y stock actualizado correctamente"}


class CentroCostoCreate(BaseModel):
    codigo: str
    nombre: str
    responsable: Optional[str] = None
    presupuesto: Optional[float] = None

class CentroCostoUpdate(BaseModel):
    nombre: Optional[str] = None
    responsable: Optional[str] = None
    presupuesto: Optional[float] = None
    activo: Optional[bool] = None

@router.get("/contabilidad/centros-costo/exportar")
def exportar_centros_costo(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Exporta los centros de costo en formato CSV compatible con Excel."""
    import io
    import csv
    from fastapi.responses import StreamingResponse
    from backend.models.erp_extended import CentroCosto

    centros = db.query(CentroCosto).filter(
        CentroCosto.tenant_id == current_user.tenant_id
    ).order_by(CentroCosto.codigo).all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    
    # Escribir cabecera
    writer.writerow(["ID", "CODIGO", "NOMBRE DESCRIPTIVO", "RESPONSABLE ASIGNADO", "PRESUPUESTO ASIGNADO (USD)"])
    
    # Escribir filas
    for cc in centros:
        presupuesto = float(cc.presupuesto) if cc.presupuesto else 0.0
        writer.writerow([
            cc.id,
            cc.codigo or "",
            cc.nombre or "",
            cc.responsable or "Gerencia General",
            f"{presupuesto:.2f}"
        ])
        
    output.seek(0)
    filename = "Matriz-Centros-Costo.csv"
    
    # Codificar en UTF-8 con BOM para que Excel en español lo lea perfectamente
    content = "\ufeff" + output.getvalue()
    
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/contabilidad/centros-costo")
def centros_costo(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(CentroCosto).filter(
        CentroCosto.activo == True,
        CentroCosto.tenant_id == current_user.tenant_id
    ).all()

@router.post("/contabilidad/centros-costo")
def crear_centro_costo(body: CentroCostoCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    existing = db.query(CentroCosto).filter(
        CentroCosto.codigo == body.codigo,
        CentroCosto.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        raise HTTPException(400, detail=f"Ya existe un centro de costo con el código {body.codigo}")
    
    centro = CentroCosto(
        codigo=body.codigo,
        nombre=body.nombre,
        responsable=body.responsable,
        presupuesto=body.presupuesto,
        activo=True,
        tenant_id=current_user.tenant_id
    )
    db.add(centro)
    db.commit()
    db.refresh(centro)
    return centro

@router.put("/contabilidad/centros-costo/{id}")
def actualizar_centro_costo(id: int, body: CentroCostoUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    centro = db.query(CentroCosto).filter(
        CentroCosto.id == id,
        CentroCosto.tenant_id == current_user.tenant_id
    ).first()
    if not centro:
        raise HTTPException(404, detail="Centro de costo no encontrado")
    
    if body.nombre is not None:
        centro.nombre = body.nombre
    if body.responsable is not None:
        centro.responsable = body.responsable
    if body.presupuesto is not None:
        centro.presupuesto = body.presupuesto
    if body.activo is not None:
        centro.activo = body.activo
        
    db.commit()
    db.refresh(centro)
    return centro

@router.delete("/contabilidad/centros-costo/{id}")
def eliminar_centro_costo(id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    centro = db.query(CentroCosto).filter(
        CentroCosto.id == id,
        CentroCosto.tenant_id == current_user.tenant_id
    ).first()
    if not centro:
        raise HTTPException(404, detail="Centro de costo no encontrado")
        
    used = db.query(AsientoDetalle).join(AsientoContable).filter(
        AsientoDetalle.centro_costo == centro.codigo,
        AsientoContable.tenant_id == current_user.tenant_id
    ).first()
    if used:
        raise HTTPException(400, detail="No se puede eliminar el centro de costo porque tiene transacciones registradas.")
        
    db.delete(centro)
    db.commit()
    return {"ok": True}


# ==========================================
# VENDEDORES (selector de facturación/POS + configuración de comisión)
# ==========================================

class VendedorComisionUpdate(BaseModel):
    porcentaje_comision: Decimal = Field(..., ge=0, le=100)


class VendedorCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=150)
    codigo: Optional[str] = Field(None, max_length=20)
    meta_mensual_usd: Optional[Decimal] = Field(Decimal("0.00"), ge=0)
    porcentaje_comision: Optional[Decimal] = Field(Decimal("5.00"), ge=0, le=100)


@router.post("/vendedores", status_code=status.HTTP_201_CREATED)
def crear_vendedor(
    body: VendedorCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Crea un nuevo vendedor para el tenant actual."""
    tenant_id = current_user.tenant_id
    
    # Generar código automático si no se proporcionó
    codigo = (body.codigo or "").strip().upper()
    if not codigo:
        count = db.query(Vendedor).filter(Vendedor.tenant_id == tenant_id).count()
        codigo = f"VEN-{str(count + 1).zfill(3)}"

    # Validar duplicados de código en el tenant
    existe = db.query(Vendedor).filter(
        Vendedor.tenant_id == tenant_id,
        Vendedor.codigo == codigo
    ).first()
    if existe:
        raise HTTPException(400, detail=f"El código de vendedor '{codigo}' ya existe.")

    nuevo_vendedor = Vendedor(
        nombre=body.nombre.strip(),
        codigo=codigo,
        activo=True,
        meta_mensual_usd=body.meta_mensual_usd or Decimal("0.00"),
        porcentaje_comision=body.porcentaje_comision if body.porcentaje_comision is not None else Decimal("5.00"),
        tenant_id=tenant_id
    )
    db.add(nuevo_vendedor)
    db.commit()
    db.refresh(nuevo_vendedor)
    return nuevo_vendedor


@router.get("/vendedores")
def listar_vendedores(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Lista los vendedores activos del tenant actual, para los selectores
    opcionales de vendedor en Facturación Fiscal y POS."""
    return db.query(Vendedor).filter(
        Vendedor.tenant_id == current_user.tenant_id,
        Vendedor.activo == True
    ).order_by(Vendedor.nombre).all()


@router.get("/vendedores/{vendedor_id}")
def obtener_vendedor(
    vendedor_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Obtiene el detalle de un vendedor específico del tenant."""
    vendedor = db.query(Vendedor).filter(
        Vendedor.id == vendedor_id,
        Vendedor.tenant_id == current_user.tenant_id,
    ).first()
    if not vendedor:
        raise HTTPException(404, detail="Vendedor no encontrado.")
    return vendedor


@router.get("/vendedores/{vendedor_id}/facturas")
def obtener_facturas_vendedor(
    vendedor_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Obtiene el historial de facturas emitidas por un vendedor del tenant,
    junto con el estado de cobro y comisión calculada."""
    vendedor = db.query(Vendedor).filter(
        Vendedor.id == vendedor_id,
        Vendedor.tenant_id == current_user.tenant_id,
    ).first()
    if not vendedor:
        raise HTTPException(404, detail="Vendedor no encontrado.")

    ventas = db.query(Venta).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.vendedor_id == vendedor_id,
    ).order_by(Venta.fecha.desc()).all()

    resultado = []
    for v in ventas:
        cxc = v.cuenta_por_cobrar
        estado_pago = "PAGADO"
        if cxc:
            if cxc.saldo_pendiente_usd > 0 and cxc.saldo_pendiente_usd < cxc.monto_total_usd:
                estado_pago = "PARCIAL"
            elif cxc.saldo_pendiente_usd > 0:
                estado_pago = "PENDIENTE"

        resultado.append({
            "id": v.id,
            "numero_factura": v.numero_factura,
            "fecha": v.fecha.strftime("%d/%m/%Y") if v.fecha else "-",
            "cliente_nombre": v.cliente.nombre if v.cliente else "Cliente General",
            "cliente_rif": v.cliente.rif_cedula if v.cliente else "-",
            "monto_total_usd": float(v.total_usd or 0),
            "metodo_pago": v.metodo_pago,
            "estado": v.estado,
            "estado_pago": estado_pago,
            "comision_usd": float(v.comision_usd or 0),
        })

    return {
        "vendedor": {
            "id": vendedor.id,
            "nombre": vendedor.nombre,
            "codigo": vendedor.codigo,
            "porcentaje_comision": float(vendedor.porcentaje_comision or 0),
            "meta_mensual_usd": float(vendedor.meta_mensual_usd or 0),
        },
        "total_facturado_usd": sum(item["monto_total_usd"] for item in resultado),
        "total_comision_usd": sum(item["comision_usd"] for item in resultado),
        "facturas": resultado
    }



class VendedorUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=150)
    codigo: Optional[str] = Field(None, max_length=20)
    meta_mensual_usd: Optional[Decimal] = Field(None, ge=0)
    porcentaje_comision: Optional[Decimal] = Field(None, ge=0, le=100)
    activo: Optional[bool] = None


@router.put("/vendedores/{vendedor_id}")
def actualizar_vendedor_completo(
    vendedor_id: int,
    body: VendedorUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Actualiza los datos completos de un vendedor (nombre, código, meta, comisión, estado)."""
    vendedor = db.query(Vendedor).filter(
        Vendedor.id == vendedor_id,
        Vendedor.tenant_id == current_user.tenant_id,
    ).first()
    if not vendedor:
        raise HTTPException(404, detail="Vendedor no encontrado.")

    if body.nombre is not None:
        vendedor.nombre = body.nombre.strip()
    if body.codigo is not None:
        nuevo_codigo = body.codigo.strip().upper()
        # Validar duplicados si cambió el código
        existe = db.query(Vendedor).filter(
            Vendedor.tenant_id == current_user.tenant_id,
            Vendedor.codigo == nuevo_codigo,
            Vendedor.id != vendedor_id
        ).first()
        if existe:
            raise HTTPException(400, detail=f"El código '{nuevo_codigo}' ya pertenece a otro vendedor.")
        vendedor.codigo = nuevo_codigo
    if body.meta_mensual_usd is not None:
        vendedor.meta_mensual_usd = body.meta_mensual_usd
    if body.porcentaje_comision is not None:
        vendedor.porcentaje_comision = body.porcentaje_comision
    if body.activo is not None:
        vendedor.activo = body.activo

    db.commit()
    db.refresh(vendedor)
    return vendedor


@router.patch("/vendedores/{vendedor_id}")
def actualizar_comision_vendedor(
    vendedor_id: int,
    body: VendedorComisionUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Actualiza el porcentaje de comisión de un vendedor (tenant-scoped).
    Usado por el botón "Configurar Comisiones" del reporte de Fuerza de Ventas."""
    vendedor = db.query(Vendedor).filter(
        Vendedor.id == vendedor_id,
        Vendedor.tenant_id == current_user.tenant_id,
    ).first()
    if not vendedor:
        raise HTTPException(404, detail="Vendedor no encontrado.")

    vendedor.porcentaje_comision = body.porcentaje_comision
    db.commit()
    db.refresh(vendedor)
    return vendedor


@router.delete("/vendedores/{vendedor_id}")
def eliminar_vendedor(
    vendedor_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Desactiva o elimina un vendedor del tenant actual."""
    vendedor = db.query(Vendedor).filter(
        Vendedor.id == vendedor_id,
        Vendedor.tenant_id == current_user.tenant_id,
    ).first()
    if not vendedor:
        raise HTTPException(404, detail="Vendedor no encontrado.")

    # Soft-delete por defecto para no romper el histórico contable de facturas emitidas
    vendedor.activo = False
    db.commit()
    return {"message": "Vendedor desactivado exitosamente.", "id": vendedor_id}



@router.get("/contabilidad/libro-diario", response_model=PaginatedLibroDiarioResponse)
def libro_diario(limit: int = 50, offset: int = 0, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from backend.models.accounting import AsientoDetalle
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    total_records = db.query(AsientoContable).filter(AsientoContable.tenant_id == current_user.tenant_id).count()
    asientos = db.query(AsientoContable).filter(AsientoContable.tenant_id == current_user.tenant_id).order_by(AsientoContable.fecha.desc()).offset(offset).limit(limit).all()
    data = []
    for a in asientos:
        lines = []
        for d in a.detalles:
            lines.append({
                "account": d.cuenta_codigo,
                "name": d.cuenta_nombre,
                "debit": float(d.debe_usd),
                "credit": float(d.haber_usd)
            })
        data.append({
            "id": a.id,
            "fecha": a.fecha.strftime("%d/%m/%Y"),
            "concepto": a.concepto,
            "referencia": a.referencia,
            "debe": to_float(a.total_debe),
            "haber": to_float(a.total_haber),
            "lines": lines
        })
    return {
        "total_records": total_records,
        "limit": limit,
        "offset": offset,
        "data": data
    }


@router.get("/contabilidad/ajuste-inflacion")
def ajuste_inflacion(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    productos = db.query(Producto).filter(
        Producto.stock > 0,
        Producto.tenant_id == current_user.tenant_id
    ).all()
    tasa = Decimal(str(tasa_actual(db, current_user.tenant_id)))
    
    # Obtener el INPC de cierre (Mayo 2026 = 124.0)
    inpc_cierre_obj = db.query(INPCIndice).filter(INPCIndice.anio == 2026, INPCIndice.mes == 5).first()
    inpc_cierre = Decimal(str(inpc_cierre_obj.indice)) if inpc_cierre_obj else Decimal("124.0000")
    
    # Mapeo de meses de adquisición simulados para los productos
    meses_origen = {
        0: (2025, 10, "Octubre 2025"),
        1: (2025, 12, "Diciembre 2025"),
        2: (2026, 3, "Marzo 2026")
    }
    
    items = []
    total_historico = Decimal("0.00")
    total_reexp = Decimal("0.00")
    total_axi = Decimal("0.00")
    
    for p in productos:
        anio, mes, mes_label = meses_origen[p.id % 3]
        inpc_origen_obj = db.query(INPCIndice).filter(INPCIndice.anio == anio, INPCIndice.mes == mes).first()
        inpc_origen = Decimal(str(inpc_origen_obj.indice)) if inpc_origen_obj else Decimal("100.0000")
        
        factor = (inpc_cierre / inpc_origen).quantize(Decimal("0.0001"))
        historico = (Decimal(str(p.stock)) * Decimal(str(p.costo_usd)) * tasa).quantize(Decimal("0.01"))
        reexp = (historico * factor).quantize(Decimal("0.01"))
        axi = (reexp - historico).quantize(Decimal("0.01"))
        
        total_historico += historico
        total_reexp += reexp
        total_axi += axi
        
        items.append({
            "name": p.nombre,
            "date": mes_label,
            "history": f"Bs. {to_float(historico):,.2f}",
            "index": f"{to_float(inpc_origen):,.2f}",
            "factor": f"{to_float(factor):.4f}",
            "reexp": f"Bs. {to_float(reexp):,.2f}",
            "axi": f"Bs. {to_float(axi):,.2f}",
            "raw_axi": to_float(axi)
        })
        
    indices_db = db.query(INPCIndice).order_by(INPCIndice.anio.desc(), INPCIndice.mes.desc()).all()
    indices_list = [
        {"periodo": f"{idx.anio}-{str(idx.mes).zfill(2)}", "indice": to_float(idx.indice)}
        for idx in indices_db
    ]
    
    # Calcular inflación acumulada (cierre / origen_base - 1) * 100
    inpc_base_obj = db.query(INPCIndice).filter(INPCIndice.anio == 2025, INPCIndice.mes == 10).first()
    inpc_base = Decimal(str(inpc_base_obj.indice)) if inpc_base_obj else Decimal("100.0")
    inflacion_acum = to_float(((inpc_cierre / inpc_base) - Decimal("1")) * Decimal("100"))
    
    return {
        "inflacion_acumulada": round(inflacion_acum, 2),
        "periodo": "2026-05",
        "items": items,
        "indices": indices_list,
        "totales": {
            "historico": to_float(total_historico),
            "reexpresado": to_float(total_reexp),
            "axi": to_float(total_axi)
        }
    }


@router.post("/contabilidad/ajuste-inflacion/ejecutar")
def ejecutar_ajuste_inflacion(body: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    periodo = body.get("periodo", "2026-05")
    # Calcular los montos reales del ajuste (pasando current_user)
    data = ajuste_inflacion(db, current_user)
    total_axi = Decimal(str(data["totales"]["axi"]))
    
    if total_axi <= 0:
         raise HTTPException(status_code=400, detail="El monto del ajuste por inflación debe ser mayor a cero.")
         
    tasa_val = tasa_actual(db, current_user.tenant_id)
    if not tasa_val or tasa_val <= 0:
        raise HTTPException(
            status_code=400,
            detail="Configura primero una tasa de cambio BCV antes de ejecutar el ajuste por inflación."
        )

    # Crear asiento contable de Ajuste por Inflación
    asiento = AsientoContable(
        concepto=f"Ajuste por Inflación de Inventario (DPC-10) - Período {periodo}",
        referencia=f"AXI-{periodo.replace('-', '')}",
        total_debe=total_axi,
        total_haber=total_axi,
        tasa_cambio_bs=Decimal(str(tasa_val)),
        tenant_id=current_user.tenant_id,
        detalles=[
            AsientoDetalle(
                cuenta_codigo="1.1.03", 
                cuenta_nombre="Inventario de Mercancía (Reexpresado)", 
                debe=total_axi, 
                haber=Decimal("0.00")
            ),
            AsientoDetalle(
                cuenta_codigo="5.1.02", 
                cuenta_nombre="Resultado por Exposición a la Inflación (REI)", 
                debe=Decimal("0.00"), 
                haber=total_axi
            )
        ]
    )
    db.add(asiento)
    db.commit()
    return {"ok": True, "asiento_id": asiento.id, "monto_ves": to_float(total_axi)}


@router.get("/rrhh/dashboard")
def rrhh_dashboard(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    empleados = db.query(Empleado).filter(Empleado.activo == 1, Empleado.tenant_id == current_user.tenant_id).count()
    nominas = db.query(Nomina).filter(Nomina.tenant_id == current_user.tenant_id).count()
    masa = db.query(func.sum(Empleado.salario_base_usd)).filter(
        Empleado.activo == 1, Empleado.tenant_id == current_user.tenant_id
    ).scalar() or 0
    return {
        "empleados_activos": empleados,
        "nominas_emitidas": nominas,
        "masa_salarial_usd": to_float(masa),
        "metricas": [
            {"t": "Empleados Activos", "v": str(empleados), "desc": "En planilla", "c": "text-[#0b5156]"},
            {"t": "Masa Salarial", "v": _fmt_money(to_float(masa)), "desc": "USD mensual base", "c": "text-slate-800"},
        ],
    }


@router.get("/rrhh/empleados", response_model=PaginatedEmpleadoResponse)
def listar_empleados(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    total_records = db.query(Empleado).filter(Empleado.tenant_id == current_user.tenant_id).count()
    empleados = db.query(Empleado).filter(
        Empleado.tenant_id == current_user.tenant_id
    ).offset(offset).limit(limit).all()

    return {
        "total_records": total_records,
        "limit": limit,
        "offset": offset,
        "data": empleados
    }


@router.get("/fiscal/obligaciones")
def obligaciones_fiscales(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    from backend.models.erp_extended import DeclaracionIVA, DeclaracionISLR, Empresa
    from datetime import datetime

    perfil = db.query(Empresa).filter(Empresa.tenant_id == current_user.tenant_id).first()
    rif = perfil.rif if perfil and perfil.rif else "J-00000000-0"
    digito = int(rif[-1]) if rif[-1].isdigit() else 0
    especial = False
    if hasattr(perfil, "tipo_contribuyente"):
        especial = perfil.tipo_contribuyente == "ESPECIAL"
        
    now = datetime.now()
    y, m = now.year, now.month
    
    dia_iva = 10 + digito if especial else 15
    dia_islr = 15 + digito if especial else 20
    
    # Check if IVA is finalized
    periodo_iva = f"{y}-{m-1:02d}"
    iva_dec = db.query(DeclaracionIVA).filter(
        DeclaracionIVA.periodo == periodo_iva, DeclaracionIVA.tenant_id == current_user.tenant_id
    ).first()
    iva_status = "AL DÍA" if (iva_dec and iva_dec.estado == "FINALIZADA") else "PENDIENTE"

    # Check if ISLR is finalized
    periodo_islr = f"{y}"
    islr_dec = db.query(DeclaracionISLR).filter(
        DeclaracionISLR.ejercicio == periodo_islr, DeclaracionISLR.tenant_id == current_user.tenant_id
    ).first()
    islr_status = "AL DÍA" if (islr_dec and islr_dec.estado == "FINALIZADA") else "PENDIENTE"
    
    # obligations list
    obligaciones = [
        {
            "nombre": "IVA Mensual",
            "vence": f"{dia_iva}/{m:02d}/{y}",
            "estado": iva_status
        },
        {
            "nombre": "ISLR Retenciones",
            "vence": f"{dia_islr}/{m:02d}/{y}",
            "estado": islr_status
        },
        {
            "nombre": "IGTF",
            "vence": f"15/{m:02d}/{y}" if now.day <= 15 else f"30/{m:02d}/{y}",
            "estado": "PENDIENTE"
        },
        {
            "nombre": "ARC Anual",
            "vence": f"31/01/{y+1}",
            "estado": "PENDIENTE"
        }
    ]
    
    return {
        "obligaciones": obligaciones
    }


@router.get("/fiscal/conceptos-islr")
def conceptos_islr():
    return {
        "conceptos": [
            {"codigo": "001", "nombre": "HONORARIOS PROFESIONALES", "pj": "5.0%", "pn": "3.0%", "sust": "83.33 UT", "base": "100%"},
            {"codigo": "002", "nombre": "COMISIONES Y CORRETAJES", "pj": "5.0%", "pn": "3.0%", "sust": "0.00 UT", "base": "100%"},
            {"codigo": "003", "nombre": "SERVICIOS TÉCNICOS CONTRACTUALES", "pj": "2.0%", "pn": "1.0%", "sust": "0.00 UT", "base": "100%"},
            {"codigo": "004", "nombre": "ARRENDAMIENTO DE BIENES MUEBLES", "pj": "5.0%", "pn": "3.0%", "sust": "0.00 UT", "base": "100%"},
            {"codigo": "005", "nombre": "ARRENDAMIENTO DE BIENES INMUEBLES", "pj": "5.0%", "pn": "3.0%", "sust": "83.33 UT", "base": "100%"},
            {"codigo": "006", "nombre": "FLETES Y TRANSPORTES", "pj": "3.0%", "pn": "1.0%", "sust": "0.00 UT", "base": "100%"}
        ]
    }


import re

@router.get("/contabilidad/auditoria-ia")
def auditoria_ia(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # 1. Reglas de Negocio Contables / Tributarias (Auditoría Forense Estática)
    alertas = []
    
    # Alerta 1: RIFs inválidos
    from backend.models.operations import Cliente, Proveedor
    clientes = db.query(Cliente).filter(Cliente.tenant_id == current_user.tenant_id).all()
    for c in clientes:
        if not re.match(r'^[VEJPG]-\d{8}-\d$', c.rif):
            alertas.append({
                "gravedad": "ALTA",
                "tipo": "Fiscal",
                "mensaje": f"El cliente {c.nombre} tiene un RIF con formato inválido ({c.rif}). Debe ser V-XXXXXXXX-X o J-XXXXXXXX-X."
            })
            
    proveedores = db.query(Proveedor).filter(Proveedor.tenant_id == current_user.tenant_id).all()
    for p in proveedores:
        if not re.match(r'^[VEJPG]-\d{8}-\d$', p.rif):
            alertas.append({
                "gravedad": "ALTA",
                "tipo": "Fiscal",
                "mensaje": f"El proveedor {p.nombre} tiene un RIF con formato inválido ({p.rif}). Debe ser J-XXXXXXXX-X o similar."
            })
            
    # Alerta 2: Transacciones en USD sin IGTF
    from backend.models.operations import Venta
    ventas_dudosas = db.query(Venta).filter(
        Venta.tenant_id == current_user.tenant_id,
        Venta.metodo_pago.in_(["Divisa", "Efectivo USD", "Efectivo"]),
        Venta.igtf_usd == 0
    ).all()
    for v in ventas_dudosas:
        alertas.append({
            "gravedad": "MEDIA",
            "tipo": "Tributario",
            "mensaje": f"La venta {v.numero_factura} fue cobrada en divisas pero registra 0.00 de IGTF (Evasión potencial del 3% de IGTF)."
        })
        
    # Alerta 3: Descuadres de diario
    from backend.models.accounting import AsientoContable
    asientos_descuadrados = db.query(AsientoContable).filter(
        AsientoContable.tenant_id == current_user.tenant_id,
        AsientoContable.total_debe_usd != AsientoContable.total_haber_usd
    ).all()
    for a in asientos_descuadrados:
        alertas.append({
            "gravedad": "CRÍTICA",
            "tipo": "Contable",
            "mensaje": f"El asiento {a.referencia} ('{a.concepto}') está descuadrado: Debe (Bs. {a.total_debe:.2f}) != Haber (Bs. {a.total_haber:.2f})."
        })
        
    return {
        "alertas": alertas,
        "total_alertas": len(alertas),
        "status": "OK"
    }


@router.get("/contabilidad/libro-diario/exportar-txt")
def exportar_diario_txt(db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    import io
    asientos = db.query(AsientoContable).filter(
        AsientoContable.tenant_id == current_user.tenant_id
    ).order_by(AsientoContable.fecha.asc()).all()
    
    txt_content = "FECHA|REFERENCIA|CODIGO_CUENTA|NOMBRE_CUENTA|CONCEPTO|DEBE_USD|HABER_USD\r\n"
    for a in asientos:
        fecha_str = a.fecha.strftime("%d/%m/%Y") if a.fecha else ""
        for d in a.detalles:
            debe = f"{float(d.debe_usd):.2f}"
            haber = f"{float(d.haber_usd):.2f}"
            txt_content += f"{fecha_str}|{a.referencia}|{d.cuenta_codigo}|{d.cuenta_nombre}|{a.concepto}|{debe}|{haber}\r\n"
            
    return StreamingResponse(
        io.BytesIO(txt_content.encode('utf-8')),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=libro_diario_legal.txt"}
    )