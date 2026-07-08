"""
KODA ERP - Servicio de Facturación Inteligente
Cálculo de impuestos venezolanos + Costo de Reposición + Hash de Integridad
"""

from __future__ import annotations
import hashlib
import logging
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from enum import Enum

logger = logging.getLogger("koda.facturacion")

IGTF_RATE = Decimal("0.03")

class MetodoPago(str, Enum):
    EFECTIVO_USD    = "EFECTIVO_USD"
    EFECTIVO_EUR    = "EFECTIVO_EUR"
    ZELLE           = "ZELLE"
    DIVISA_EXTRANJERA = "DIVISA_EXTRANJERA"
    TRANSFERENCIA_VES = "TRANSFERENCIA_VES"
    PAGO_MOVIL      = "PAGO_MOVIL"

METODOS_CON_IGTF = {
    MetodoPago.EFECTIVO_USD,
    MetodoPago.EFECTIVO_EUR,
    MetodoPago.ZELLE,
    MetodoPago.DIVISA_EXTRANJERA,
}

# Alícuotas IVA Venezuela
IVA_GENERAL  = Decimal("0.16")
IVA_REDUCIDO = Decimal("0.08")
IVA_ADICIONAL = Decimal("0.31")
IVA_EXENTO   = Decimal("0.00")

ALICUOTA_MAP = {
    0:  IVA_EXENTO,
    8:  IVA_REDUCIDO,
    16: IVA_GENERAL,
    31: IVA_ADICIONAL,
}

# Tasas de retención ISLR (simplificadas - expandir según actividad)
ISLR_RATES = {
    "servicios_profesionales": Decimal("0.05"),
    "honorarios":              Decimal("0.03"),
    "comisiones":              Decimal("0.03"),
    "fletes":                  Decimal("0.01"),
    "default":                 Decimal("0.02"),
}

def q(value: Decimal, decimals: int = 6) -> Decimal:
    """Redondea con precisión fiscal."""
    places = Decimal(10) ** -decimals
    return value.quantize(places, rounding=ROUND_HALF_UP)


@dataclass
class ItemFactura:
    descripcion:      str
    cantidad:         Decimal
    precio_unitario:  Decimal          # en moneda de la factura
    alicuota_iva_pct: int = 16         # 0, 8, 16, 31
    descuento_pct:    Decimal = Decimal("0")
    producto_id:      Optional[str] = None
    costo_reposicion: Optional[Decimal] = None  # último costo compra (USD)

    @property
    def precio_neto(self) -> Decimal:
        return q(self.precio_unitario * (1 - self.descuento_pct / 100))

    @property
    def base_imponible(self) -> Decimal:
        return q(self.precio_neto * self.cantidad)

    @property
    def alicuota(self) -> Decimal:
        return ALICUOTA_MAP.get(self.alicuota_iva_pct, IVA_GENERAL)

    @property
    def monto_iva(self) -> Decimal:
        return q(self.base_imponible * self.alicuota)

    @property
    def total_linea(self) -> Decimal:
        return q(self.base_imponible + self.monto_iva)

    @property
    def alerta_margen(self) -> bool:
        """True si el precio de venta no cubre el costo de reposición."""
        if self.costo_reposicion and self.costo_reposicion > 0:
            return self.precio_unitario < self.costo_reposicion
        return False

    @property
    def margen_utilidad_pct(self) -> Optional[Decimal]:
        if self.costo_reposicion and self.costo_reposicion > 0:
            return q(
                (self.precio_unitario - self.costo_reposicion) / self.costo_reposicion * 100,
                decimals=2
            )
        return None


@dataclass
class ResultadoImpuestos:
    subtotal:        Decimal = Decimal("0")
    total_exento:    Decimal = Decimal("0")
    base_16:         Decimal = Decimal("0")
    iva_16:          Decimal = Decimal("0")
    base_8:          Decimal = Decimal("0")
    iva_8:           Decimal = Decimal("0")
    base_31:         Decimal = Decimal("0")
    iva_31:          Decimal = Decimal("0")
    total_iva:       Decimal = Decimal("0")
    retencion_iva:   Decimal = Decimal("0")   # 75% del IVA si agente retenedor
    retencion_islr:  Decimal = Decimal("0")
    igtf:            Decimal = Decimal("0")
    total:           Decimal = Decimal("0")
    total_ves:       Optional[Decimal] = None
    alertas_margen:  list[str] = field(default_factory=list)


def calcular_impuestos(
    items:               list[ItemFactura],
    metodo_pago:         MetodoPago,
    es_agente_retencion: bool = False,
    tasa_retencion_islr: Optional[Decimal] = None,
    tasa_bcv:            Optional[Decimal] = None,   # para convertir a VES
) -> ResultadoImpuestos:
    """
    Calcula todos los impuestos venezolanos para una factura.
    
    - IVA por alícuota (0/8/16/31%)
    - Retención IVA (75%) si el cliente es agente de retención
    - Retención ISLR si aplica
    - IGTF (3%) si el método de pago es en divisa extranjera
    """
    r = ResultadoImpuestos()

    for idx, item in enumerate(items, 1):
        r.subtotal += item.base_imponible

        if item.alicuota_iva_pct == 0:
            r.total_exento += item.base_imponible
        elif item.alicuota_iva_pct == 8:
            r.base_8 += item.base_imponible
            r.iva_8  += item.monto_iva
        elif item.alicuota_iva_pct == 16:
            r.base_16 += item.base_imponible
            r.iva_16  += item.monto_iva
        elif item.alicuota_iva_pct == 31:
            r.base_31 += item.base_imponible
            r.iva_31  += item.monto_iva

        if item.alerta_margen:
            msg = (
                f"⚠️  Línea {idx} '{item.descripcion}': precio {item.precio_unitario} "
                f"< costo reposición {item.costo_reposicion} "
                f"(margen: {item.margen_utilidad_pct}%)"
            )
            r.alertas_margen.append(msg)
            logger.warning(msg)

    r.total_iva = q(r.iva_8 + r.iva_16 + r.iva_31)

    # Retención IVA: 75% del IVA si el comprador es agente de retención
    if es_agente_retencion:
        r.retencion_iva = q(r.total_iva * Decimal("0.75"))

    # Retención ISLR
    if tasa_retencion_islr:
        r.retencion_islr = q(r.subtotal * tasa_retencion_islr)

    # Subtotal antes de IGTF
    base_para_igtf = q(r.subtotal + r.total_iva - r.retencion_iva - r.retencion_islr)

    # IGTF (3%) solo en métodos de pago en divisa extranjera
    if metodo_pago in METODOS_CON_IGTF:
        r.igtf = q(base_para_igtf * IGTF_RATE)

    r.total = q(base_para_igtf + r.igtf)

    # Conversión a VES
    if tasa_bcv and tasa_bcv > 0:
        r.total_ves = q(r.total * tasa_bcv)

    # Redondear todos los subtotales
    for attr in ("subtotal","total_exento","base_16","iva_16","base_8","iva_8","base_31","iva_31"):
        setattr(r, attr, q(getattr(r, attr)))

    return r


def generar_hash_factura(
    numero:       int | str,
    tercero_id:   str,
    fecha:        str,       # ISO: "2026-04-22"
    total:        Decimal,
    creado_por:   str,
) -> str:
    """
    SHA-256 inmutable de los campos críticos de la factura.
    Se genera al emitir y no debe cambiar nunca.
    """
    payload = f"{numero}|{tercero_id}|{fecha}|{total}|{creado_por}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def verificar_hash(factura_data: dict, hash_almacenado: str) -> bool:
    """Verifica la integridad de una factura comparando su hash."""
    recalculado = generar_hash_factura(
        numero=factura_data["numero"],
        tercero_id=factura_data["tercero_id"],
        fecha=str(factura_data["fecha_emision"]),
        total=Decimal(str(factura_data["total"])),
        creado_por=factura_data["creado_por"],
    )
    return recalculado == hash_almacenado
