"""
Utilidad para extraer la IP real del cliente, aunque use VPN o pase por proxy inverso.

Orden de prioridad (de más a menos confiable):
  1. CF-Connecting-IP   → IP real del cliente según Cloudflare
  2. X-Real-IP          → Header estándar de Nginx / Traefik
  3. X-Forwarded-For    → Primer elemento de la cadena (el cliente original)
  4. request.client.host → IP de la conexión TCP (puede ser el proxy interno)

IMPORTANTE: El header X-Forwarded-For puede ser forjado por el cliente si el
servidor no está detrás de un proxy confiable. Por eso registramos AMBAS:
la IP extraída y la IP de la conexión TCP. Si difieren significativamente,
es señal de intento de enmascaramiento.
"""

from fastapi import Request
from typing import Tuple


def get_real_ip(request: Request) -> Tuple[str, str]:
    """
    Retorna una tupla (ip_cliente_real, ip_conexion_tcp).

    - ip_cliente_real: La IP más probable del usuario final.
    - ip_conexion_tcp: La IP del socket de red (proxy / load balancer).

    Si se registran ambas, un auditor puede detectar discrepancias que
    sugieran uso de proxies anidados o intentos de spoofing de cabeceras.
    """
    tcp_ip: str = request.client.host if request.client else "unknown"
    headers = request.headers

    # 1. Cloudflare coloca la IP real del visitante aquí (no puede ser forjada por el cliente)
    cf_ip = headers.get("cf-connecting-ip", "").strip()
    if cf_ip and _is_valid_ip(cf_ip):
        return cf_ip, tcp_ip

    # 2. Nginx / Traefik con proxy_set_header X-Real-IP
    real_ip = headers.get("x-real-ip", "").strip()
    if real_ip and _is_valid_ip(real_ip):
        return real_ip, tcp_ip

    # 3. Cadena de proxies: tomar el PRIMER elemento (el origen original)
    forwarded_for = headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        # El formato es: "client, proxy1, proxy2"
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip and _is_valid_ip(first_ip):
            return first_ip, tcp_ip

    # 4. Fallback: IP TCP directa
    return tcp_ip, tcp_ip


def get_real_ip_str(request: Request) -> str:
    """Versión simplificada que devuelve solo la IP real como string."""
    real_ip, _ = get_real_ip(request)
    return real_ip


def _is_valid_ip(ip: str) -> bool:
    """Validación básica de que la cadena parece una IP (v4 o v6)."""
    if not ip or ip.lower() in ("unknown", "undefined", "null", ""):
        return False
    # IPv6 tiene ':', IPv4 tiene '.'
    return "." in ip or ":" in ip
