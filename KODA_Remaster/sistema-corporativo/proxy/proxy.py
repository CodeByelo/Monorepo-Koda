import http.server
import http.client
import gzip
import sys
import threading
from pathlib import Path

PORT = 80

# Mapeo de Host a servicios internos de Docker (desarrollo local)
ROUTING_TABLE = {
    "gestor.localhost": ("frontend", 3000),
    "api.localhost": ("backend", 8000),
    "facturacion.localhost": ("facturacion", 5174),
    "api-facturacion.localhost": ("facturacion-backend", 8000),
    "desarrollador.localhost": ("desarrollador", 5175),
}

# Enrutamiento por ruta URL para acceso externo (Tailscale, dominio público, etc.)
# El primer prefijo que coincida gana. Más específicos primero.
PATH_ROUTING = [
    ("/api-facturacion", ("facturacion-backend", 8000)),
    ("/telegram-api", ("backend", 8000)),
    ("/api/security", ("backend", 8000)),
    ("/api/v1", ("backend", 8000)),
    ("/api/public", ("backend", 8000)),
    ("/facturacion", ("facturacion", 5174)),
    ("/ventas", ("facturacion", 5174)),
    ("/compras", ("facturacion", 5174)),
    ("/inventario", ("facturacion", 5174)),
    ("/cobranzas", ("facturacion", 5174)),
    ("/pagos", ("facturacion", 5174)),
    ("/tesoreria", ("facturacion", 5174)),
    ("/fiscal", ("facturacion", 5174)),
    ("/contabilidad", ("facturacion", 5174)),
    ("/reportes", ("facturacion", 5174)),
    ("/alertas", ("facturacion", 5174)),
    ("/dev/api", ("backend", 8000)),
    ("/dev", ("desarrollador", 5175)),
]

# Tipos de contenido que se pueden comprimir con gzip
COMPRESSIBLE_TYPES = {
    "text/html", "text/css", "text/plain", "text/javascript",
    "application/javascript", "application/json", "application/xml",
    "image/svg+xml", "application/x-javascript",
}

class ReverseProxyHandler(http.server.BaseHTTPRequestHandler):
    # Log messages to stdout
    def log_message(self, format, *args):
        sys.stdout.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))
        sys.stdout.flush()

    def handle_websocket(self, target_host, target_port, path):
        import socket
        import select

        print(f"[PROXY] Upgrading connection to WebSocket for {target_host}:{target_port}{path}", flush=True)
        try:
            # Connect to the backend service
            backend_sock = socket.create_connection((target_host, target_port), timeout=10)

            # Build and send raw handshake headers
            request_lines = [f"{self.command} {path} HTTP/1.1"]
            for key, val in self.headers.items():
                if key.lower() not in ("host", "connection"):
                    request_lines.append(f"{key}: {val}")
            request_lines.append(f"Host: {target_host}:{target_port}")
            request_lines.append("Connection: Upgrade")
            request_lines.append("\r\n")

            backend_sock.sendall(("\r\n".join(request_lines)).encode("utf-8"))

            # Put both sockets in non-blocking mode
            self.connection.setblocking(False)
            backend_sock.setblocking(False)

            # Bidirectional forwarding tunnel
            sockets = [self.connection, backend_sock]
            closed = False
            while not closed:
                r, _, _ = select.select(sockets, [], [], 30)
                if not r:
                    continue
                for sock in r:
                    try:
                        data = sock.recv(65536)
                        if not data:
                            closed = True
                            break
                        if sock is self.connection:
                            backend_sock.sendall(data)
                        else:
                            self.connection.sendall(data)
                    except (ConnectionResetError, socket.error):
                        closed = True
                        break
        except Exception as e:
            print(f"[PROXY] WebSocket proxy error: {e}", flush=True)
        finally:
            try:
                backend_sock.close()
            except:
                pass

    def handle_request(self):
        host = self.headers.get("Host", "").split(":")[0]
        path_to_send = self.path
        print(f"[PROXY] Request: {self.command} {host} {self.path}", flush=True)
        if host not in ROUTING_TABLE:
            # Buscar en el enrutamiento por ruta
            target_host, target_port = ("frontend", 3000)
            for path_prefix, (h, p) in PATH_ROUTING:
                if self.path.startswith(path_prefix):
                    target_host, target_port = h, p
                    if path_prefix == "/api/dev":
                        path_to_send = self.path[4:]  # Remove /api but keep /dev
                    elif path_prefix == "/api/public":
                        path_to_send = self.path[4:]  # Remove /api but keep /public
                    elif path_prefix == "/telegram-api":
                        path_to_send = "/webhook/telegram" + self.path[13:]  # Replace /telegram-api with /webhook/telegram (length 13)
                    elif path_prefix == "/api/security":
                        path_to_send = self.path[4:]  # Remove /api (e.g. /api/security/logs -> /security/logs)
                    elif path_prefix == "/api-facturacion":
                        path_to_send = self.path[16:]  # Remove /api-facturacion
                    elif path_prefix == "/dev/api":
                        path_to_send = self.path[8:]  # Remove /dev/api (e.g. /dev/api/auth/login -> /auth/login)
                    elif path_prefix == "/facturacion":
                        path_without_query = self.path.split("?")[0]
                        if path_without_query == "/facturacion":
                            query_part = "?" + self.path.split("?")[1] if "?" in self.path else ""
                            self.send_response(302)
                            self.send_header('Location', '/facturacion/' + query_part)
                            self.end_headers()
                            return
                    elif path_prefix == "/dev" and self.path == "/dev":
                        # Vite requires the trailing slash for base paths
                        path_to_send = "/dev/"
                    elif path_prefix in ["/ventas", "/compras", "/inventario", "/cobranzas", "/pagos", "/tesoreria", "/fiscal", "/contabilidad", "/reportes", "/alertas"]:
                        # Serve the Vite SPA index for these routes
                        path_to_send = "/facturacion/"
                    break
        else:
            target_host, target_port = ROUTING_TABLE[host]

        # Check if this is a WebSocket upgrade request
        is_websocket = self.headers.get("Upgrade", "").lower() == "websocket"
        if is_websocket:
            self.handle_websocket(target_host, target_port, path_to_send)
            return

        # Leer cuerpo de la petición si existe
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        # Comprobar si el cliente acepta gzip
        client_accepts_gzip = 'gzip' in self.headers.get('Accept-Encoding', '')

        # Copiar headers y reescribir Host
        # Indicar al backend que aceptamos gzip solo si el cliente lo acepta
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'connection', 'accept-encoding')}
        headers['Host'] = f"{target_host}:{target_port}"
        headers['Connection'] = 'close'
        if client_accepts_gzip:
            headers['Accept-Encoding'] = 'gzip'

        try:
            conn = http.client.HTTPConnection(target_host, target_port, timeout=300)
            conn.request(self.command, path_to_send, body, headers)
            res = conn.getresponse()

            # Leer cuerpo de la respuesta
            res_data = res.read()
            conn.close()
            content_type = ''
            for k, v in res.getheaders():
                if k.lower() == 'content-type':
                    content_type = v.split(';')[0].strip()
                    break

            backend_content_encoding = res.getheader('Content-Encoding', '')

            # Comprimir si aplica
            should_compress = (
                client_accepts_gzip
                and not backend_content_encoding
                and content_type in COMPRESSIBLE_TYPES
                and len(res_data) > 1024  # solo comprimir si > 1KB
            )

            if should_compress:
                res_data = gzip.compress(res_data, compresslevel=6)

            # Enviar respuesta al cliente
            self.send_response(res.status)
            for k, v in res.getheaders():
                if k.lower() not in ('transfer-encoding', 'connection', 'content-length', 'content-encoding'):
                    self.send_header(k, v)

            if should_compress:
                self.send_header('Content-Encoding', 'gzip')
            elif backend_content_encoding:
                self.send_header('Content-Encoding', backend_content_encoding)

            # Cache para assets estáticos del frontend (desactivado en desarrollo)
            if any(self.path.endswith(ext) for ext in ('.js', '.css', '.woff', '.woff2', '.png', '.jpg', '.webp', '.svg', '.ico')):
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')

            self.send_header('Content-Length', str(len(res_data)))
            self.send_header('Connection', 'close')
            self.end_headers()

            self.wfile.write(res_data)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f"Bad Gateway (Koda Local Proxy): {e}".encode())

    def do_GET(self): self.handle_request()
    def do_POST(self): self.handle_request()
    def do_PUT(self): self.handle_request()
    def do_DELETE(self): self.handle_request()
    def do_PATCH(self): self.handle_request()
    def do_OPTIONS(self): self.handle_request()
    def do_HEAD(self): self.handle_request()


class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    """Servidor HTTP con soporte multi-hilo para manejar conexiones concurrentes."""
    pass


def run():
    server_address = ('', PORT)
    httpd = ThreadedHTTPServer(server_address, ReverseProxyHandler)
    print(f"Koda Threaded Proxy running on port {PORT} (multi-thread + gzip enabled)...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    run()
