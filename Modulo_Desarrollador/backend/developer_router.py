import asyncio
from datetime import datetime, timezone, timedelta
import json
import uuid
import logging
from typing import Dict, Set, Optional, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from pydantic import BaseModel

# Try loading database pool and auth elements from local project imports
from database.async_db import pool, get_db_connection
from auth.supabase_auth import get_current_user, SECRET_KEY, ALGORITHM
from jose import jwt

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/api", tags=["developer"])

class ActiveSession:
    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        tenant_id: str,
        user_id: str,
        username: str,
        ip: str,
        device: str,
        modulo: str
    ):
        self.session_id = session_id
        self.websocket = websocket
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.username = username
        self.ip = ip
        self.device = device
        self.modulo = modulo
        self.connected_at = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "username": self.username,
            "ip": self.ip,
            "device": self.device,
            "modulo": self.modulo,
            "connected_at": self.connected_at.isoformat()
        }

class ConnectionManager:
    def __init__(self):
        self.active_sessions: Dict[str, ActiveSession] = {}
        self.developer_connections: Set[WebSocket] = set()
        self.blocked_users: Dict[str, datetime] = {}
        self.lock = asyncio.Lock()

    async def register_session(self, session: ActiveSession):
        async with self.lock:
            self.active_sessions[session.session_id] = session
        await self.broadcast_active_sessions()

    async def unregister_session(self, session_id: str):
        async with self.lock:
            if session_id in self.active_sessions:
                del self.active_sessions[session_id]
        await self.broadcast_active_sessions()

    async def register_developer(self, websocket: WebSocket):
        self.developer_connections.add(websocket)
        try:
            await websocket.send_json({
                "type": "active_sessions",
                "data": self.get_active_sessions_list()
            })
        except Exception:
            self.developer_connections.discard(websocket)

    def unregister_developer(self, websocket: WebSocket):
        self.developer_connections.discard(websocket)

    def get_active_sessions_list(self) -> List[dict]:
        return [s.to_dict() for s in self.active_sessions.values()]

    async def broadcast_active_sessions(self):
        if not self.developer_connections:
            return
        payload = {
            "type": "active_sessions",
            "data": self.get_active_sessions_list()
        }
        disconnected = set()
        for dev_ws in self.developer_connections:
            try:
                await dev_ws.send_json(payload)
            except Exception:
                disconnected.add(dev_ws)
        for dev_ws in disconnected:
            self.developer_connections.discard(dev_ws)

    async def broadcast_abuse_alert(self, message: str, event_type: str, details: dict):
        if not self.developer_connections:
            return
        payload = {
            "type": "abuse_alert",
            "data": {
                "message": message,
                "event_type": event_type,
                "details": details,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
        disconnected = set()
        for dev_ws in self.developer_connections:
            try:
                await dev_ws.send_json(payload)
            except Exception:
                disconnected.add(dev_ws)
        for dev_ws in disconnected:
            self.developer_connections.discard(dev_ws)

    def block_user(self, user_id: str, duration_seconds: int = 120):
        self.blocked_users[user_id] = datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)

    def is_user_blocked(self, user_id: str) -> bool:
        if user_id not in self.blocked_users:
            return False
        expiry = self.blocked_users[user_id]
        if datetime.now(timezone.utc) > expiry:
            del self.blocked_users[user_id]
            return False
        return True

    def get_active_users_count(self, tenant_id: str) -> int:
        active_users = {s.user_id for s in self.active_sessions.values() if s.tenant_id == tenant_id}
        return len(active_users)

    def would_exceed_license_limit(self, tenant_id: str, user_id: str, max_users: int) -> bool:
        active_users = {s.user_id for s in self.active_sessions.values() if s.tenant_id == tenant_id}
        if user_id in active_users:
            return False
        return len(active_users) >= max_users

    async def enforce_concurrency_limit(self, user_id: str, modulo: str):
        old_sessions = [
            s for s in self.active_sessions.values()
            if s.user_id == user_id and s.modulo == modulo
        ]
        for old_sess in old_sessions:
            try:
                await old_sess.websocket.send_json({
                    "type": "force_close",
                    "reason": "duplicate_session",
                    "message": f"Se ha abierto otra pestaña de {modulo}. Esta sesión ha sido cerrada automáticamente para evitar abuso."
                })
                await old_sess.websocket.close(code=4001)
            except Exception:
                pass
            if old_sess.session_id in self.active_sessions:
                del self.active_sessions[old_sess.session_id]

manager = ConnectionManager()

# RBAC Verification
async def require_developer(payload: dict = Depends(get_current_user)):
    role = payload.get("role")
    if role != "Desarrollador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: Se requiere rol Desarrollador"
        )
    return payload

async def log_security_event_db(
    conn,
    tenant_id: Optional[str],
    user_id: Optional[str],
    username: str,
    evento: str,
    detalles: str,
    estado: str,
    ip_origen: Optional[str]
):
    try:
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
            """,
            uuid.UUID(tenant_id) if tenant_id else None,
            uuid.UUID(user_id) if user_id else None,
            username or "anon",
            evento,
            detalles,
            estado,
            "/websocket",
            ip_origen
        )
    except Exception as e:
        logger.error(f"Error logging security event to DB: {e}")

async def get_tenant_limits(tenant_id: str) -> tuple[int, List[str]]:
    max_users = 12
    allowed_modules = ["all"]
    if not tenant_id:
        return max_users, allowed_modules
    try:
        async with pool.acquire() as conn:
            cfg_json = await conn.fetchval(
                "SELECT config FROM organizations WHERE id = $1::uuid",
                uuid.UUID(tenant_id)
            )
            if cfg_json:
                if isinstance(cfg_json, str):
                    cfg = json.loads(cfg_json)
                else:
                    cfg = cfg_json
                max_users = cfg.get("max_users", 12)
                allowed_modules = cfg.get("allowed_modules", ["all"])
    except Exception as e:
        logger.error(f"Error fetching tenant limits: {e}")
    return max_users, allowed_modules

@router.websocket("/session/connect")
async def session_connect(websocket: WebSocket):
    params = websocket.query_params
    token = params.get("token")
    modulo = params.get("modulo", "unknown")
    device = params.get("device", "unknown")
    
    await websocket.accept()
    
    if not token:
        await websocket.close(code=4000)
        return
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        username = payload.get("username") or payload.get("email") or "anon"
    except Exception:
        await websocket.close(code=4000)
        return
        
    if not user_id or not tenant_id:
        await websocket.close(code=4000)
        return

    # Extract client IP address
    client_ip = "unknown"
    if websocket.client:
        client_ip = websocket.client.host
    headers = dict(websocket.headers)
    cf_ip = headers.get("cf-connecting-ip")
    real_ip = headers.get("x-real-ip")
    xff = headers.get("x-forwarded-for")
    if cf_ip:
        client_ip = cf_ip
    elif real_ip:
        client_ip = real_ip
    elif xff:
        client_ip = xff.split(",")[0].strip()

    # 1. Enforce blocklist (manual kicks)
    if manager.is_user_blocked(user_id):
        await websocket.send_json({
            "type": "force_close",
            "reason": "manual_disconnect",
            "message": "Su acceso está deshabilitado temporalmente debido a una desconexión forzada por el administrador. Intente en 2 minutos."
        })
        await websocket.close(code=4003)
        return

    # 2. Enforce license limit
    max_users, allowed_modules = await get_tenant_limits(tenant_id)
    if manager.would_exceed_license_limit(tenant_id, user_id, max_users):
        async with pool.acquire() as conn:
            await log_security_event_db(
                conn,
                tenant_id=tenant_id,
                user_id=user_id,
                username=username,
                evento="intento de conexión bloqueado por límite de licencia",
                detalles=f"Usuario bloqueado en módulo {modulo}. Límite del Tenant ({max_users} usuarios concurrentes) superado.",
                estado="warning",
                ip_origen=client_ip
            )
        await manager.broadcast_abuse_alert(
            message=f"Usuario {username} bloqueado: Límite del Tenant de {max_users} usuarios excedido.",
            event_type="intento de conexión bloqueado por límite de licencia",
            details={
                "tenant_id": tenant_id,
                "user_id": user_id,
                "username": username,
                "modulo": modulo,
                "ip": client_ip,
                "device": device
            }
        )
        await websocket.send_json({
            "type": "force_close",
            "reason": "license_limit_exceeded",
            "message": f"Acceso denegado: El Tenant ha alcanzado su límite de licencias permitidas ({max_users} usuarios concurrentes)."
        })
        await websocket.close(code=4002)
        return

    # 3. Enforce concurrency limits (tab duplicates)
    has_dup = any(s.user_id == user_id and s.modulo == modulo for s in manager.active_sessions.values())
    if has_dup:
        await manager.enforce_concurrency_limit(user_id, modulo)
        async with pool.acquire() as conn:
            await log_security_event_db(
                conn,
                tenant_id=tenant_id,
                user_id=user_id,
                username=username,
                evento="cierre forzado por duplicidad",
                detalles=f"Cierre de sesión antigua por apertura duplicada del módulo {modulo}",
                estado="warning",
                ip_origen=client_ip
            )
        await manager.broadcast_abuse_alert(
            message=f"Sesión duplicada cerrada para {username} en {modulo}",
            event_type="cierre forzado por duplicidad",
            details={
                "tenant_id": tenant_id,
                "user_id": user_id,
                "username": username,
                "modulo": modulo,
                "ip": client_ip,
                "device": device
            }
        )

    # Register new session
    session_id = str(uuid.uuid4())
    session = ActiveSession(
        session_id=session_id,
        websocket=websocket,
        tenant_id=tenant_id,
        user_id=user_id,
        username=username,
        ip=client_ip,
        device=device,
        modulo=modulo
    )
    
    await manager.register_session(session)
    
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await manager.unregister_session(session_id)

@router.websocket("/dev/ws")
async def dev_ws_connect(websocket: WebSocket):
    params = websocket.query_params
    token = params.get("token")
    
    await websocket.accept()
    
    if not token:
        await websocket.close(code=4000)
        return
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role = payload.get("role")
        if role != "Desarrollador":
            await websocket.close(code=4003)
            return
    except Exception:
        await websocket.close(code=4000)
        return
        
    await manager.register_developer(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.unregister_developer(websocket)

# REST Endpoints
class TenantCreate(BaseModel):
    nombre: str
    max_users: int
    allowed_modules: List[str]

@router.post("/dev/tenants")
async def create_tenant(
    payload: TenantCreate,
    current_user: dict = Depends(require_developer)
):
    try:
        config = {
            "max_users": payload.max_users,
            "allowed_modules": payload.allowed_modules
        }
        config_str = json.dumps(config)
        
        async with pool.acquire() as conn:
            new_id = await conn.fetchval(
                """
                INSERT INTO organizations (nombre, config)
                VALUES ($1, $2::jsonb)
                RETURNING id
                """,
                payload.nombre,
                config_str
            )
            
            await log_security_event_db(
                conn,
                tenant_id=current_user.get("tenant_id"),
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="tenant_created",
                detalles=f"Tenant '{payload.nombre}' creado con max_users={payload.max_users}",
                estado="success",
                ip_origen=None
            )
            
            return {
                "id": str(new_id),
                "nombre": payload.nombre,
                "max_users": payload.max_users,
                "allowed_modules": payload.allowed_modules
            }
    except Exception as e:
        logger.error(f"Error creating tenant: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dev/tenants")
async def list_tenants(
    current_user: dict = Depends(require_developer)
):
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, nombre, config, created_at FROM organizations ORDER BY created_at DESC"
            )
            
            tenants = []
            for r in rows:
                cfg = r["config"]
                if isinstance(cfg, str):
                    cfg = json.loads(cfg)
                tenants.append({
                    "id": str(r["id"]),
                    "nombre": r["nombre"],
                    "max_users": (cfg or {}).get("max_users", 12) if cfg else 12,
                    "allowed_modules": (cfg or {}).get("allowed_modules", []) if cfg else [],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None
                })
            return tenants
    except Exception as e:
        logger.error(f"Error listing tenants: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class DisconnectPayload(BaseModel):
    session_id: str

@router.post("/dev/disconnect")
async def disconnect_session(
    payload: DisconnectPayload,
    current_user: dict = Depends(require_developer)
):
    session = None
    async with manager.lock:
        session = manager.active_sessions.get(payload.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        
        # Block user for 2 minutes to prevent immediate auto-reconnect loops
        manager.block_user(session.user_id, duration_seconds=120)
        
        # Close active WebSocket connection
        try:
            await session.websocket.send_json({
                "type": "force_close",
                "reason": "manual_disconnect",
                "message": "Su sesión ha sido terminada manualmente por un desarrollador."
            })
            await session.websocket.close(code=4003)
        except Exception:
            pass
        
        del manager.active_sessions[payload.session_id]
        
        async with pool.acquire() as conn:
            await log_security_event_db(
                conn,
                tenant_id=session.tenant_id,
                user_id=session.user_id,
                username=session.username,
                evento="cierre forzado manual",
                detalles=f"Desconexión manual de la sesión {session.session_id} en el módulo {session.modulo} por desarrollador",
                estado="warning",
                ip_origen=session.ip
            )
            
    await manager.broadcast_abuse_alert(
        message=f"Desarrollador desconectó manualmente a {session.username} de {session.modulo}",
        event_type="cierre forzado manual",
        details=session.to_dict()
    )
    await manager.broadcast_active_sessions()
    
    return {"status": "ok", "message": f"Sesión {payload.session_id} desconectada"}

@router.get("/dev/security-events/critical")
async def get_critical_security_events(
    current_user: dict = Depends(require_developer)
):
    try:
        async with pool.acquire() as conn:
            try:
                await conn.execute("RESET app.current_tenant_id")
            except Exception:
                pass
                
            rows = await conn.fetch(
                """
                SELECT id, tenant_id, user_id, username, evento, detalles, estado, ip_origen as ip_address, created_at
                FROM security_events
                WHERE evento IN ('cierre forzado por duplicidad', 'intento de conexión bloqueado por límite de licencia', 'cierre forzado manual')
                ORDER BY created_at DESC
                LIMIT 50
                """
            )
            
            return [
                {
                    "id": r["id"],
                    "tenant_id": str(r["tenant_id"]) if r["tenant_id"] else None,
                    "user_id": str(r["user_id"]) if r["user_id"] else None,
                    "username": r["username"],
                    "evento": r["evento"],
                    "detalles": r["detalles"],
                    "estado": r["estado"],
                    "ip_address": r["ip_address"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error fetching critical security events: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- SUBSCRIPTION PLANS CRUD ---

class PlanCreate(BaseModel):
    name: str
    price_usd: float
    features: List[str]
    is_active: bool = True
    sort_order: int = 0

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    price_usd: Optional[float] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

@router.get("/dev/plans")
async def list_all_plans(current_user: dict = Depends(require_developer)):
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM subscription_plans ORDER BY sort_order ASC, created_at DESC")
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Error listing plans: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dev/plans")
async def create_plan(payload: PlanCreate, current_user: dict = Depends(require_developer)):
    try:
        features_json = json.dumps(payload.features)
        async with pool.acquire() as conn:
            new_id = await conn.fetchval(
                """
                INSERT INTO subscription_plans (name, price_usd, features, is_active, sort_order)
                VALUES ($1, $2, $3::jsonb, $4, $5)
                RETURNING id
                """,
                payload.name, payload.price_usd, features_json, payload.is_active, payload.sort_order
            )
            return {"id": str(new_id), "status": "created"}
    except Exception as e:
        logger.error(f"Error creating plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/dev/plans/{plan_id}")
async def update_plan(plan_id: str, payload: PlanUpdate, current_user: dict = Depends(require_developer)):
    try:
        async with pool.acquire() as conn:
            # Construct dynamic update query
            updates = []
            values = []
            idx = 1
            if payload.name is not None:
                updates.append(f"name = ${idx}")
                values.append(payload.name)
                idx += 1
            if payload.price_usd is not None:
                updates.append(f"price_usd = ${idx}")
                values.append(payload.price_usd)
                idx += 1
            if payload.features is not None:
                updates.append(f"features = ${idx}::jsonb")
                values.append(json.dumps(payload.features))
                idx += 1
            if payload.is_active is not None:
                updates.append(f"is_active = ${idx}")
                values.append(payload.is_active)
                idx += 1
            if payload.sort_order is not None:
                updates.append(f"sort_order = ${idx}")
                values.append(payload.sort_order)
                idx += 1
                
            if not updates:
                return {"status": "ok", "message": "No changes requested"}
                
            updates.append(f"updated_at = timezone('utc', now())")
            query = f"UPDATE subscription_plans SET {', '.join(updates)} WHERE id = ${idx}"
            values.append(uuid.UUID(plan_id))
            
            await conn.execute(query, *values)
            return {"status": "ok", "message": "Plan updated"}
    except Exception as e:
        logger.error(f"Error updating plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/dev/plans/{plan_id}")
async def delete_plan(plan_id: str, current_user: dict = Depends(require_developer)):
    try:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM subscription_plans WHERE id = $1", uuid.UUID(plan_id))
            return {"status": "ok", "message": "Plan deleted"}
    except Exception as e:
        logger.error(f"Error deleting plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/plans")
async def get_active_plans():
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC, created_at ASC")
            plans = []
            for r in rows:
                p = dict(r)
                if isinstance(p["features"], str):
                    p["features"] = json.loads(p["features"])
                plans.append(p)
            return plans
    except Exception as e:
        logger.error(f"Error listing public plans: {e}")
        raise HTTPException(status_code=500, detail=str(e))
