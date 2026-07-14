import asyncio
from datetime import datetime, timezone, timedelta
import json
import uuid
import secrets
import hashlib
import logging
from typing import Dict, Set, Optional, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from pydantic import BaseModel

# Try loading database pool and auth elements from local project imports
import database.async_db as async_db
from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user, SECRET_KEY, ALGORITHM
from jose import jwt
from fastapi import UploadFile, File
import shutil
import os

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(tags=["developer"])

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
    role = payload.get("role") or payload.get("rol")
    role_norm = str(role).strip().lower() if role else ""
    if role_norm not in {"desarrollador", "developer", "dev"}:
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
        # Check if table has event_type or just insert event normally
        await conn.execute(
            """
            INSERT INTO security_events (tenant_id, user_id, username, evento, detalles, estado, page, ip_origen)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
            """,
            uuid.UUID(str(tenant_id)) if tenant_id else None,
            uuid.UUID(str(user_id)) if user_id else None,
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
        async with async_db.pool.acquire() as conn:
            # Join with subscription_plans if plan_id exists, otherwise fallback to config JSONB for backward compatibility
            row = await conn.fetchrow(
                """
                SELECT o.config, sp.max_users as plan_max_users, sp.allowed_modules as plan_allowed_modules
                FROM organizations o
                LEFT JOIN subscription_plans sp ON o.plan_id = sp.id
                WHERE o.id = $1::uuid
                """,
                uuid.UUID(tenant_id)
            )

            if row:
                if row["plan_max_users"] is not None and row["plan_allowed_modules"] is not None:
                    max_users = row["plan_max_users"]

                    # Ensure plan_allowed_modules is a list
                    if isinstance(row["plan_allowed_modules"], str):
                        allowed_modules = json.loads(row["plan_allowed_modules"])
                    else:
                        allowed_modules = row["plan_allowed_modules"]
                else:
                    cfg_json = row["config"]
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
        async with async_db.pool.acquire() as conn:
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

    # Extract role to apply exceptions
    role = payload.get("role") or payload.get("rol")
    role_norm = str(role).strip().lower() if role else ""

    # 3. Enforce concurrency limits (tab duplicates) - EXCLUDE DEVELOPERS
    if role_norm not in {"desarrollador", "developer", "dev"}:
        has_dup = any(s.user_id == user_id and s.modulo == modulo for s in manager.active_sessions.values())
        if has_dup:
            await manager.enforce_concurrency_limit(user_id, modulo)
            async with async_db.pool.acquire() as conn:
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
    logger.info("WebSocket connection request received on /dev/ws")
    params = websocket.query_params
    token = params.get("token")

    await websocket.accept()

    if not token:
        logger.warning("WebSocket rejected: no token provided")
        await websocket.close(code=4000)
        return

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role = payload.get("role") or payload.get("rol")
        role_norm = str(role).strip().lower() if role else ""
        if role_norm not in {"desarrollador", "developer", "dev"}:
            logger.warning(f"WebSocket rejected: invalid role '{role}'")
            await websocket.close(code=4003)
            return
    except Exception as e:
        logger.error(f"WebSocket authentication exception: {e}")
        await websocket.close(code=4000)
        return

    logger.info("WebSocket connection authenticated and registered")
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
    plan_id: Optional[int] = None
    max_users: Optional[int] = None
    allowed_modules: Optional[List[str]] = None

@router.post("/dev/tenants")
async def create_tenant(
    payload: TenantCreate,
    current_user: dict = Depends(require_developer)
):
    try:
        config = {}
        if payload.max_users is not None:
            config["max_users"] = payload.max_users
        if payload.allowed_modules is not None:
            config["allowed_modules"] = payload.allowed_modules

        config_str = json.dumps(config)
        import re
        slug = re.sub(r'[^a-z0-9]+', '-', payload.nombre.lower()).strip('-')
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

        async with async_db.pool.acquire() as conn:
            new_id = await conn.fetchval(
                """
                INSERT INTO organizations (name, slug, config, plan_id)
                VALUES ($1, $2, $3::jsonb, $4)
                RETURNING id
                """,
                payload.nombre,
                slug,
                config_str,
                payload.plan_id
            )

            await log_security_event_db(
                conn,
                tenant_id=current_user.get("tenant_id"),
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="tenant_created",
                detalles=f"Tenant '{payload.nombre}' creado con plan_id={payload.plan_id}",
                estado="success",
                ip_origen=None
            )

            return {
                "id": str(new_id),
                "nombre": payload.nombre,
                "plan_id": payload.plan_id,
                "max_users": payload.max_users,
                "allowed_modules": payload.allowed_modules
            }
    except Exception as e:
        logger.error(f"Error creating tenant: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class PlanCreate(BaseModel):
    name: str
    max_users: int
    allowed_modules: List[str]
    price: float = 0.0
    features: List[str] = []
    sort_order: int = 0

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    max_users: Optional[int] = None
    allowed_modules: Optional[List[str]] = None
    price: Optional[float] = None
    is_active: Optional[bool] = None
    features: Optional[List[str]] = None
    sort_order: Optional[int] = None

@router.post("/dev/plans")
async def create_plan(
    payload: PlanCreate,
    current_user: dict = Depends(require_developer)
):
    try:
        allowed_modules_str = json.dumps(payload.allowed_modules)
        features_str = json.dumps(payload.features)
        async with async_db.pool.acquire() as conn:
            new_id = await conn.fetchval(
                """
                INSERT INTO subscription_plans (name, max_users, allowed_modules, price, is_active, features, sort_order)
                VALUES ($1, $2, $3::jsonb, $4, TRUE, $5::jsonb, $6)
                RETURNING id
                """,
                payload.name,
                payload.max_users,
                allowed_modules_str,
                payload.price,
                features_str,
                payload.sort_order
            )

            await log_security_event_db(
                conn,
                tenant_id=None,
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="plan_created",
                detalles=f"Plan '{payload.name}' creado con max_users={payload.max_users}",
                estado="success",
                ip_origen=None
            )

            return {
                "id": new_id,
                "name": payload.name,
                "max_users": payload.max_users,
                "allowed_modules": payload.allowed_modules,
                "price": payload.price,
                "is_active": True,
                "features": payload.features,
                "sort_order": payload.sort_order,
                "image_url": None
            }
    except Exception as e:
        logger.error(f"Error creating plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dev/plans")
async def list_plans(current_user: dict = Depends(require_developer)):
    try:
        async with async_db.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name, max_users, allowed_modules, price, is_active, features, sort_order, image_url FROM subscription_plans ORDER BY sort_order ASC, price ASC"
            )
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "max_users": r["max_users"],
                    "allowed_modules": json.loads(r["allowed_modules"]) if isinstance(r["allowed_modules"], str) else r["allowed_modules"],
                    "price": float(r["price"]) if r["price"] is not None else 0.0,
                    "is_active": r["is_active"],
                    "features": json.loads(r["features"]) if isinstance(r["features"], str) else r["features"],
                    "sort_order": r["sort_order"],
                    "image_url": r["image_url"]
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error listing plans: {e}")
        raise HTTPException(status_code=500, detail="Error fetching plans")

@router.put("/dev/plans/{plan_id}")
async def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    current_user: dict = Depends(require_developer)
):
    try:
        updates = []
        values = []
        idx = 1

        if payload.name is not None:
            updates.append(f"name = ${idx}")
            values.append(payload.name)
            idx += 1
        if payload.max_users is not None:
            updates.append(f"max_users = ${idx}")
            values.append(payload.max_users)
            idx += 1
        if payload.allowed_modules is not None:
            updates.append(f"allowed_modules = ${idx}::jsonb")
            values.append(json.dumps(payload.allowed_modules))
            idx += 1
        if payload.price is not None:
            updates.append(f"price = ${idx}")
            values.append(payload.price)
            idx += 1
        if payload.is_active is not None:
            updates.append(f"is_active = ${idx}")
            values.append(payload.is_active)
            idx += 1
        if payload.features is not None:
            updates.append(f"features = ${idx}::jsonb")
            values.append(json.dumps(payload.features))
            idx += 1
        if payload.sort_order is not None:
            updates.append(f"sort_order = ${idx}")
            values.append(payload.sort_order)
            idx += 1

        if not updates:
            return {"status": "ok", "message": "No changes requested"}

        values.append(plan_id)
        query = f"UPDATE subscription_plans SET {', '.join(updates)} WHERE id = ${idx}"

        async with async_db.pool.acquire() as conn:
            exists = await conn.fetchval("SELECT id FROM subscription_plans WHERE id = $1", plan_id)
            if not exists:
                raise HTTPException(status_code=404, detail="Plan no encontrado")

            await conn.execute(query, *values)

            await log_security_event_db(
                conn,
                tenant_id=None,
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="plan_updated",
                detalles=f"Plan {plan_id} actualizado",
                estado="success",
                ip_origen=None
            )

            return {"status": "success", "message": "Plan actualizado correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/dev/plans/{plan_id}")
async def delete_plan(
    plan_id: int,
    current_user: dict = Depends(require_developer)
):
    try:
        async with async_db.pool.acquire() as conn:
            exists = await conn.fetchval("SELECT name FROM subscription_plans WHERE id = $1", plan_id)
            if not exists:
                raise HTTPException(status_code=404, detail="Plan no encontrado")

            # Soft delete by marking inactive, as plans might be linked to existing tenants
            await conn.execute("UPDATE subscription_plans SET is_active = FALSE WHERE id = $1", plan_id)

            await log_security_event_db(
                conn,
                tenant_id=None,
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="plan_deleted",
                detalles=f"Plan '{exists}' ({plan_id}) desactivado",
                estado="warning",
                ip_origen=None
            )

            return {"status": "success", "message": f"Plan '{exists}' desactivado correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dev/plans/{plan_id}/image")
async def upload_plan_image(
    plan_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_developer)
):
    try:
        # Create uploads directory if it doesn't exist
        uploads_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Generate a unique filename
        ext = file.filename.split(".")[-1]
        unique_filename = f"plan_{plan_id}_{uuid.uuid4().hex[:8]}.{ext}"
        file_path = os.path.join(uploads_dir, unique_filename)
        
        # Save the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        image_url = f"/uploads/{unique_filename}"
        
        # Update the database
        async with async_db.pool.acquire() as conn:
            exists = await conn.fetchval("SELECT id FROM subscription_plans WHERE id = $1", plan_id)
            if not exists:
                raise HTTPException(status_code=404, detail="Plan no encontrado")
                
            await conn.execute("UPDATE subscription_plans SET image_url = $1 WHERE id = $2", image_url, plan_id)
            
            await log_security_event_db(
                conn,
                tenant_id=None,
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="plan_image_uploaded",
                detalles=f"Imagen subida para el plan {plan_id}",
                estado="success",
                ip_origen=None
            )
            
        return {"status": "success", "image_url": image_url, "message": "Imagen subida correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading plan image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/plans")
async def get_public_plans():
    try:
        async with async_db.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name, price, features, image_url FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order ASC, price ASC"
            )
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "price": float(r["price"]) if r["price"] is not None else 0.0,
                    "features": json.loads(r["features"]) if isinstance(r["features"], str) else r["features"],
                    "image_url": r["image_url"]
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error fetching public plans: {e}")
        raise HTTPException(status_code=500, detail="Error fetching public plans")


@router.get("/dev/tenants")
async def list_tenants(
    current_user: dict = Depends(require_developer)
):
    try:
        async with async_db.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT o.id, o.name, o.config, o.created_at, o.plan_id, sp.name as plan_name, sp.max_users as plan_max_users, sp.allowed_modules as plan_allowed_modules
                FROM organizations o
                LEFT JOIN subscription_plans sp ON o.plan_id = sp.id
                ORDER BY o.created_at DESC
                """
            )

            tenants = []
            for r in rows:
                cfg = r["config"]
                if isinstance(cfg, str):
                    cfg = json.loads(cfg)

                # Resolve active limits
                max_users = r["plan_max_users"] if r["plan_max_users"] is not None else ((cfg or {}).get("max_users", 12) if cfg else 12)

                allowed_modules = []
                if r["plan_allowed_modules"] is not None:
                    if isinstance(r["plan_allowed_modules"], str):
                        allowed_modules = json.loads(r["plan_allowed_modules"])
                    else:
                        allowed_modules = r["plan_allowed_modules"]
                else:
                    allowed_modules = (cfg or {}).get("allowed_modules", []) if cfg else []

                tenants.append({
                    "id": str(r["id"]),
                    "nombre": r["name"],
                    "plan_id": r["plan_id"],
                    "plan_name": r["plan_name"],
                    "max_users": max_users,
                    "allowed_modules": allowed_modules,
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None
                })
            return tenants
    except Exception as e:
        logger.error(f"Error listing tenants: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class TenantUpdate(BaseModel):
    nombre: str
    plan_id: Optional[int] = None
    max_users: Optional[int] = None
    allowed_modules: Optional[List[str]] = None

@router.put("/dev/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    current_user: dict = Depends(require_developer)
):
    try:
        config = {}
        if payload.max_users is not None:
            config["max_users"] = payload.max_users
        if payload.allowed_modules is not None:
            config["allowed_modules"] = payload.allowed_modules

        config_str = json.dumps(config)
        async with async_db.pool.acquire() as conn:
            # Check if tenant exists
            exists = await conn.fetchval("SELECT id FROM organizations WHERE id = $1::uuid", uuid.UUID(tenant_id))
            if not exists:
                raise HTTPException(status_code=404, detail="Empresa no encontrada")

            await conn.execute(
                """
                UPDATE organizations
                SET name = $1, config = $2::jsonb, plan_id = $3
                WHERE id = $4::uuid
                """,
                payload.nombre,
                config_str,
                payload.plan_id,
                uuid.UUID(tenant_id)
            )

            await log_security_event_db(
                conn,
                tenant_id=uuid.UUID(tenant_id),
                user_id=current_user.get("sub"),
                username=current_user.get("username") or current_user.get("email"),
                evento="tenant_updated",
                detalles=f"Tenant '{payload.nombre}' actualizado con plan_id={payload.plan_id}",
                estado="success",
                ip_origen=None
            )
            return {"status": "success", "message": "Empresa actualizada"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tenant: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/dev/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    current_user: dict = Depends(require_developer)
):
    try:
        t_uuid = uuid.UUID(tenant_id)
        async with async_db.pool.acquire() as conn:
            async with conn.transaction():
                # Check if tenant exists
                exists = await conn.fetchval("SELECT name FROM organizations WHERE id = $1::uuid", t_uuid)
                if not exists:
                    raise HTTPException(status_code=404, detail="Empresa no encontrada")

                # Delete dependent records
                await conn.execute("DELETE FROM security_events WHERE tenant_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM tickets WHERE tenant_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM documentos WHERE tenant_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM user_organizations WHERE organization_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM app_users WHERE organization_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM profiles WHERE tenant_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM gerencias WHERE tenant_id = $1::uuid", t_uuid)
                await conn.execute("DELETE FROM organizations WHERE id = $1::uuid", t_uuid)

                # Log security event (system-wide context since tenant is deleted)
                await log_security_event_db(
                    conn,
                    tenant_id=None,
                    user_id=current_user.get("sub"),
                    username=current_user.get("username") or current_user.get("email"),
                    evento="tenant_deleted",
                    detalles=f"Tenant '{exists}' ({tenant_id}) eliminado del sistema",
                    estado="warning",
                    ip_origen=None
                )

            return {"status": "success", "message": f"Empresa '{exists}' eliminada correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tenant: {e}")
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

        async with async_db.pool.acquire() as conn:
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
        async with async_db.pool.acquire() as conn:
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


class UserCreatePayload(BaseModel):
    username: str
    nombre: str
    apellido: str
    email: str
    password: str
    rol_id: int
    tenant_id: str
    gerencia_nombre: Optional[str] = "Tecnología"


@router.post("/dev/users")
async def create_company_user(
    payload: UserCreatePayload,
    current_user: dict = Depends(require_developer)
):
    try:
        from auth.security import get_password_hash
        hashed_pw = get_password_hash(payload.password)

        async with async_db.pool.acquire() as conn:
            # Check if username or email already exists
            existing = await conn.fetchrow(
                "SELECT id FROM profiles WHERE username = $1 OR email = $2",
                payload.username, payload.email
            )
            if existing:
                raise HTTPException(status_code=400, detail="Usuario o Email ya registrado")

            # Resolve or create department scoped to the tenant
            tenant_uuid = uuid.UUID(payload.tenant_id) if payload.tenant_id else None
            g_id = await conn.fetchval(
                "SELECT id FROM gerencias WHERE nombre = $1 AND tenant_id = $2::uuid",
                payload.gerencia_nombre, tenant_uuid
            )
            if not g_id:
                g_id = await conn.fetchval(
                    "INSERT INTO gerencias (nombre, tenant_id) VALUES ($1, $2::uuid) RETURNING id",
                    payload.gerencia_nombre, tenant_uuid
                )

            # Insert profile
            user_id = await conn.fetchval(
                """
                INSERT INTO profiles (username, nombre, apellido, email, password_hash, rol_id, gerencia_id, estado, tenant_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid)
                RETURNING id
                """,
                payload.username,
                payload.nombre,
                payload.apellido,
                payload.email,
                hashed_pw,
                payload.rol_id,
                g_id,
                True,
                uuid.UUID(payload.tenant_id) if payload.tenant_id else None
            )

            # Link user to organization membership
            if payload.tenant_id:
                role_name = "member"
                if payload.rol_id == 1:
                    role_name = "owner"
                elif payload.rol_id in {2, 5}:
                    role_name = "admin"

                await conn.execute(
                    """
                    INSERT INTO user_organizations (user_id, organization_id, role)
                    VALUES ($1::uuid, $2::uuid, $3)
                    ON CONFLICT (user_id, organization_id) DO NOTHING
                    """,
                    user_id,
                    uuid.UUID(payload.tenant_id),
                    role_name
                )

            await log_security_event_db(
                conn,
                tenant_id=payload.tenant_id,
                user_id=user_id,
                username=payload.username,
                evento="user_created",
                detalles=f"Usuario '{payload.username}' creado con rol_id={payload.rol_id} bajo tenant_id={payload.tenant_id}",
                estado="success",
                ip_origen=None
            )

            return {
                "id": str(user_id),
                "username": payload.username,
                "email": payload.email,
                "tenant_id": payload.tenant_id
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating company user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dev/users")
async def list_company_users(
    current_user: dict = Depends(require_developer)
):
    try:
        async with async_db.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.username, p.nombre, p.apellido, p.email, p.rol_id, r.nombre_rol as role, p.estado, p.tenant_id, o.name as tenant_nombre
                FROM profiles p
                LEFT JOIN roles r ON p.rol_id = r.id
                LEFT JOIN organizations o ON p.tenant_id = o.id
                ORDER BY p.username
                """
            )
            return [
                {
                    "id": str(r["id"]),
                    "username": r["username"],
                    "nombre": r["nombre"],
                    "apellido": r["apellido"],
                    "email": r["email"],
                    "rol_id": r["rol_id"],
                    "role": r["role"] or "Usuario",
                    "estado": r["estado"],
                    "tenant_id": str(r["tenant_id"]) if r["tenant_id"] else None,
                    "tenant_nombre": r["tenant_nombre"] or "N/A"
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error listing company users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dev/system-metrics")
async def get_system_metrics(
    current_user: dict = Depends(require_developer)
):
    import os
    import httpx
    import redis
    import psutil

    # CPU Metrics
    try:
        # psutil.cpu_percent with interval=None is non-blocking and returns the average since the last call
        # the first time it will return 0.0 or a fast instantaneous reading.
        cpu_percent = psutil.cpu_percent(interval=0.1)
    except Exception:
        cpu_percent = 0.0

    try:
        # getloadavg returns a tuple of (1m, 5m, 15m) load averages
        loadavg = psutil.getloadavg()
        cpu_load_1m = round(loadavg[0], 2)
    except Exception:
        cpu_load_1m = 0.0

    # Memory Info
    try:
        mem = psutil.virtual_memory()
        mem_total_mb = round(mem.total / (1024 * 1024), 2)
        mem_used_mb = round(mem.used / (1024 * 1024), 2)
        mem_used_pct = round(mem.percent, 2)
    except Exception:
        mem_total_mb = 0.0
        mem_used_mb = 0.0
        mem_used_pct = 0.0

    system_metrics = {
        "cpu_percent": cpu_percent,
        "cpu_load": cpu_load_1m,
        "memory_used_percent": mem_used_pct,
        "memory_total_mb": mem_total_mb,
        "memory_used_mb": mem_used_mb
    }

    # DB Status
    db_ok = False
    try:
        async with async_db.pool.acquire() as conn:
            await conn.execute("SELECT 1")
            db_ok = True
    except Exception:
        pass

    # Redis Status
    redis_ok = False
    try:
        r = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"), decode_responses=True)
        if r.ping():
            redis_ok = True
    except Exception:
        pass

    # Ollama Status
    ollama_ok = False

    return {
        "system": system_metrics,
        "services": {
            "database": db_ok,
            "redis": redis_ok,
            "ollama": ollama_ok,
            "loki": True,
            "vector": True
        }
    }


class ProvisionTokenCreate(BaseModel):
    tenant_id: str
    max_users: int
    expires_in_hours: Optional[int] = 48


@router.post("/dev/provision/token")
async def generate_provision_token(
    payload: ProvisionTokenCreate,
    current_user: dict = Depends(require_developer)
):
    try:
        token_plano = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token_plano.encode()).hexdigest()

        expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)

        async with async_db.pool.acquire() as conn:
            # Check if tenant exists
            tenant_exists = await conn.fetchval(
                "SELECT id FROM organizations WHERE id = $1::uuid",
                uuid.UUID(payload.tenant_id)
            )
            if not tenant_exists:
                raise HTTPException(status_code=400, detail="El tenant no existe")

            await conn.execute(
                """
                INSERT INTO provisioning_tokens (tenant_id, token_hash, max_users, expires_at)
                VALUES ($1::uuid, $2, $3, $4)
                """,
                uuid.UUID(payload.tenant_id),
                token_hash,
                payload.max_users,
                expires_at
            )

            return {
                "token": token_plano,
                "expires_at": expires_at.isoformat(),
                "tenant_id": payload.tenant_id
            }
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de tenant_id inválido")
    except Exception as e:
        logger.error(f"Error generando provisioning token: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/dev/users/{user_id}")
async def delete_company_user(
    user_id: str,
    current_user: dict = Depends(require_developer)
):
    try:
        if str(current_user.get("sub")) == user_id:
            raise HTTPException(status_code=400, detail="No puede eliminarse a sí mismo.")

        async with async_db.pool.acquire() as conn:
            exists = await conn.fetchrow("SELECT id FROM profiles WHERE id = $1::uuid", user_id)
            if not exists:
                raise HTTPException(status_code=404, detail="Usuario no encontrado.")

            await conn.execute("DELETE FROM profiles WHERE id = $1::uuid", user_id)
            return {"status": "success", "message": "Usuario eliminado correctamente."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting company user: {e}")
        raise HTTPException(status_code=500, detail=str(e))
