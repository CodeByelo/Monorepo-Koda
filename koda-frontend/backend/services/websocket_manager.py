from fastapi import WebSocket
from typing import Dict
import asyncio
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Mapea user_id a la conexión activa
        self.active_connections: Dict[str, WebSocket] = {}

    async def broadcast_session_update(self):
        """Emite la lista actualizada de sesiones a todos los clientes conectados."""
        sessions = self.get_active_sessions()
        message = {"event": "session_update", "sessions": sessions}
        for connection in self.active_connections.values():
            try:
                await connection.send_json(message)
            except Exception:
                pass

    async def connect(self, websocket: WebSocket, user_id: str):
        self.active_connections[user_id] = websocket
        logger.info(f"Usuario {user_id} conectado vía WebSocket.")
        await self.broadcast_session_update()

    async def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"Usuario {user_id} desconectado del WebSocket.")
            await self.broadcast_session_update()

    async def force_disconnect_user(self, user_id: str, reason: str = "Sesión revocada por el administrador."):
        """
        Envía un mensaje especial de expulsión y cierra la conexión.
        El frontend debe capturar el evento "kick" y destruir el JWT local.
        """
        if user_id in self.active_connections:
            websocket = self.active_connections[user_id]
            try:
                await websocket.send_json({"event": "kick", "reason": reason})
                await websocket.close(code=1008) # Policy Violation / Kicked
                logger.warning(f"Usuario {user_id} fue expulsado por la fuerza.")
            except Exception as e:
                logger.error(f"Error al intentar expulsar al usuario {user_id}: {e}")
            finally:
                await self.disconnect(user_id)
                return True
        return False

    def get_active_sessions(self) -> list[str]:
        return list(self.active_connections.keys())

# Instancia singleton para toda la aplicación
ws_manager = ConnectionManager()
