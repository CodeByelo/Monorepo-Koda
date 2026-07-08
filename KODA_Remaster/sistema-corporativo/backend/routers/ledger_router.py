from __future__ import annotations
import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator

# Importar la autenticación real de Supabase y el context manager de la base de datos
from auth.supabase_auth import get_current_user
from database.async_db import db_session

logger = logging.getLogger("sistema_corporativo")

router = APIRouter(prefix="/api/v1/ledger", tags=["Ledger Inmutable"])


# ============================================================
# ENUMS — Espejo exacto de los ENUM de PostgreSQL
# ============================================================

class AggregateType(str, Enum):
    ticket     = "ticket"
    documento  = "documento"
    usuario    = "usuario"
    gerencia   = "gerencia"
    egreso     = "egreso"
    contrato   = "contrato"
    sesion     = "sesion"
    factura    = "factura"
    empleado   = "empleado"
    nomina     = "nomina"


class EventSeverity(str, Enum):
    info     = "info"
    warning  = "warning"
    critical = "critical"
    audit    = "audit"


# ============================================================
# MODELOS PYDANTIC
# ============================================================

class EventMetadata(BaseModel):
    """Contexto técnico capturado automáticamente por el endpoint."""
    ip_address:  str | None = None
    user_agent:  str | None = None
    session_id:  UUID | None = None
    request_id:  str | None = None  # Para correlación de logs


class KodaEventCreate(BaseModel):
    """
    Contrato de entrada para registrar un evento en el Ledger.
    Los campos de contexto técnico se inyectan en el backend,
    el caller solo provee el hecho de negocio.
    """
    event_type:     str = Field(
        ...,
        min_length=3,
        max_length=128,
        pattern=r'^[a-z_]+\.[a-z_]+$',  # Formato: 'ticket.cerrado', 'usuario.bloqueado'
        examples=["ticket.asignado", "ticket.cerrado", "gerencia.friccion_detectada"]
    )
    aggregate_type: AggregateType
    aggregate_id:   str = Field(
        ...,
        description="ID del agregado afectado. Acepta UUIDs y IDs numéricos (en formato string)."
    )
    gerencia_id:    int = Field(
        ...,
        description="ID de la gerencia responsable (entero de gerencias.id)."
    )
    payload:        dict[str, Any] = Field(default_factory=dict)
    severity:       EventSeverity = EventSeverity.info
    occurred_at:    datetime | None = Field(
        default=None,
        description="Si es None, se usa el timestamp del servidor. Proveer solo cuando el evento ocurrió offline."
    )

    @field_validator("payload")
    @classmethod
    def payload_no_debe_tener_datos_sensibles(cls, v: dict) -> dict:
        """
        Previene que contraseñas, tokens o claves secretas
        queden grabadas en el ledger de auditoría.
        """
        forbidden_keys = {"password", "token", "secret", "clave", "pin", "cvv"}
        found = forbidden_keys.intersection(set(v.keys()))
        if found:
            raise ValueError(
                f"El payload del evento contiene campos prohibidos: {found}. "
                f"El Ledger es de acceso auditable y no debe contener secretos."
            )
        return v

    @model_validator(mode="after")
    def normalizar_occurred_at(self) -> KodaEventCreate:
        if self.occurred_at is None:
            self.occurred_at = datetime.now(timezone.utc)
        elif self.occurred_at.tzinfo is None:
            # Forzar UTC si vino sin timezone
            self.occurred_at = self.occurred_at.replace(tzinfo=timezone.utc)
        return self


class KodaEventInternal(KodaEventCreate):
    """
    Versión enriquecida del evento con los campos que genera el backend.
    Nunca expuesta al caller externo.
    """
    event_id:       UUID = Field(default_factory=uuid4)
    actor_id:       UUID | None = None
    tenant_id:      UUID
    metadata:       EventMetadata = Field(default_factory=EventMetadata)
    recorded_at:    datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    idempotency_key: str | None = None

    def compute_idempotency_key(self) -> str:
        """
        Huella digital del evento para deduplicación.
        Combina el tipo, el agregado, el actor y el timestamp.
        """
        raw = f"{self.event_type}:{self.aggregate_id}:{self.actor_id}:{self.occurred_at.isoformat()}"
        return hashlib.sha256(raw.encode()).hexdigest()


class KodaEventResponse(BaseModel):
    """Respuesta mínima al caller. Nunca devolver el payload completo."""
    event_id:       UUID
    accepted_at:    datetime
    status:         str = "accepted"


# ============================================================
# BUFFER ASÍNCRONO — El corazón del fire-and-forget
# ============================================================

async def ensure_current_partition_exists(conn):
    """
    Ejecuta en startup. Crea la partición del trimestre actual
    y la del siguiente de forma dinámica si no existen.
    """
    from datetime import date
    today = date.today()
    
    # Quarter actual
    q_start_month = ((today.month - 1) // 3) * 3 + 1
    q_start_date = date(today.year, q_start_month, 1)
    
    # Quarter siguiente
    if q_start_month == 10:
        next_q_start_date = date(today.year + 1, 1, 1)
    else:
        next_q_start_date = date(today.year, q_start_month + 3, 1)
        
    # Quarter subsiguiente
    if next_q_start_date.month == 10:
        next_next_q_start_date = date(next_q_start_date.year + 1, 1, 1)
    else:
        next_next_q_start_date = date(next_q_start_date.year, next_q_start_date.month + 3, 1)
        
    intervals = [
        (q_start_date, next_q_start_date),
        (next_q_start_date, next_next_q_start_date)
    ]
    
    for start, end in intervals:
        q_num = ((start.month - 1) // 3) + 1
        partition_name = f"koda_event_ledger_{start.year}_q{q_num}"
        
        sql = f"""
            CREATE TABLE IF NOT EXISTS {partition_name}
            PARTITION OF koda_event_ledger
            FOR VALUES FROM ('{start.isoformat()}') TO ('{end.isoformat()}');
        """
        try:
            await conn.execute(sql)
            logger.info("EventBuffer: Partición garantizada: %s", partition_name)
        except Exception as e:
            logger.error("EventBuffer: Error al crear partición %s: %s", partition_name, e)


class EventBuffer:
    """
    Buffer en memoria que acumula eventos y los escribe en lotes.
    Evita que cada evento genere un round-trip individual a la DB.
    
    Estrategia de flush:
      - Cada MAX_BUFFER_SIZE eventos acumulados, O
      - Cada FLUSH_INTERVAL_SECONDS segundos (lo que ocurra primero)
    """
    MAX_BUFFER_SIZE    = 100    # Flush al acumular 100 eventos
    FLUSH_INTERVAL_SEC = 5.0    # Flush cada 5 segundos como máximo

    def __init__(self):
        self._queue: asyncio.Queue[KodaEventInternal] = asyncio.Queue(maxsize=10_000)
        self._flush_task: asyncio.Task | None = None

    async def start(self):
        """Lanzar el worker de flush. Llamar desde el startup de FastAPI."""
        try:
            async with db_session() as conn:
                await ensure_current_partition_exists(conn)
        except Exception as e:
            logger.error("EventBuffer: Fallo al verificar/crear particiones iniciales en start: %s", e)

        self._flush_task = asyncio.create_task(self._flush_worker())
        logger.info("EventBuffer: worker de flush iniciado.")

    async def stop(self):
        """Drenar el buffer y detener el worker. Llamar desde el shutdown de FastAPI."""
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Flush final antes de cerrar
        await self._flush_pending()
        logger.info("EventBuffer: flush final completado. Worker detenido.")

    async def enqueue(self, event: KodaEventInternal) -> None:
        """
        Encolar el evento. Si la queue está llena (>10,000 pendientes),
        loguear como crítico pero NO bloquear al caller.
        """
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.critical(
                "EventBuffer SATURADO. Evento descartado: %s | aggregate_id=%s",
                event.event_type, event.aggregate_id
            )

    async def _flush_worker(self):
        """Worker que vive en background durante toda la vida de la aplicación."""
        while True:
            try:
                await asyncio.sleep(self.FLUSH_INTERVAL_SEC)
                await self._flush_pending()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("EventBuffer: error en flush worker: %s", e)

    async def _flush_pending(self):
        """Drenar la queue y hacer un INSERT batch único."""
        events: list[KodaEventInternal] = []
        while not self._queue.empty() and len(events) < self.MAX_BUFFER_SIZE:
            try:
                events.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break

        if not events:
            return

        try:
            async with db_session() as conn:
                await conn.executemany(
                    """
                    INSERT INTO koda_event_ledger (
                        event_id, event_type, event_version,
                        aggregate_type, aggregate_id,
                        gerencia_id, actor_id, tenant_id,
                        payload, metadata, severity,
                        occurred_at, recorded_at, idempotency_key
                    ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
                    )
                    ON CONFLICT (idempotency_key, occurred_at) DO NOTHING
                    """,
                    [
                        (
                            e.event_id, e.event_type, 1,
                            e.aggregate_type.value, e.aggregate_id,
                            e.gerencia_id, e.actor_id, e.tenant_id,
                            json.dumps(e.payload), json.dumps(e.metadata.model_dump()),
                            e.severity.value,
                            e.occurred_at, e.recorded_at, e.idempotency_key
                        )
                        for e in events
                    ]
                )
            logger.info("EventBuffer: %d eventos escritos en batch.", len(events))
        except Exception as e:
            logger.error("EventBuffer: fallo en batch insert. Re-encolando %d eventos. Error: %s", len(events), e)
            # Re-encolar en caso de fallo de DB para no perder eventos
            for event in events:
                await self.enqueue(event)


# Instancia global del buffer (singleton)
event_buffer = EventBuffer()


# ============================================================
# ENDPOINT PRINCIPAL
# ============================================================

@router.post(
    "/events",
    response_model=KodaEventResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Registrar evento en el Ledger Inmutable",
    description=(
        "Acepta un evento de negocio y lo encola para escritura asíncrona. "
        "El código 202 (Accepted) garantiza que el evento fue recibido pero "
        "no necesariamente persistido aún — esto es por diseño."
    )
)
async def register_event(
    body:    KodaEventCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> KodaEventResponse:
    
    # Extraer de forma segura el actor_id (sub) y el tenant_id del token JWT de Supabase
    user_id_str = current_user.get("sub")
    tenant_id_str = current_user.get("tenant_id")
    
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token no contiene un tenant_id válido."
        )
        
    try:
        actor_id = UUID(user_id_str) if user_id_str else None
        tenant_id = UUID(tenant_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ID de usuario o inquilino en el token no es un UUID válido."
        )

    # Enriquecer el evento con contexto del backend
    internal_event = KodaEventInternal(
        **body.model_dump(),
        actor_id=actor_id,
        tenant_id=tenant_id,
        metadata=EventMetadata(
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    internal_event.idempotency_key = internal_event.compute_idempotency_key()

    # FIRE-AND-FORGET: encolar sin esperar confirmación de DB
    import threading
    logger.info(f"Endpoint event_buffer ID: {id(event_buffer)}")
    logger.info(f"Endpoint thread ID: {threading.get_ident()}")
    try:
        logger.info(f"Endpoint event loop ID: {id(asyncio.get_running_loop())}")
    except RuntimeError:
        logger.info("Endpoint event loop ID: No running loop")
    logger.info(f"Endpoint queue size before enqueue: {event_buffer._queue.qsize()}")
    await event_buffer.enqueue(internal_event)
    logger.info(f"Endpoint queue size after enqueue: {event_buffer._queue.qsize()}")
 
    return KodaEventResponse(
        event_id=internal_event.event_id,
        accepted_at=internal_event.recorded_at
    )


# ============================================================
# BÚNKER DE AUDITORÍA EXTERNA — ENDPOINTS DE SOLO LECTURA
# ============================================================

auditoria_router = APIRouter(prefix="/api/v1/auditoria", tags=["Búnker de Auditoría"])


class EventoForense(BaseModel):
    event_id: UUID
    event_type: str
    actor_id: UUID | None
    occurred_at: datetime
    payload: dict[str, Any]


class LineaTiempoForenseResponse(BaseModel):
    total_records: int
    limit: int
    offset: int
    data: list[EventoForense]


@auditoria_router.get(
    "/forense/{aggregate_id}",
    response_model=LineaTiempoForenseResponse,
    summary="Obtener trazabilidad forense histórica de un agregado",
    description="Devuelve la línea de tiempo cronológica inalterable de eventos para un aggregate_id y tenant específico."
)
async def get_forensic_timeline(
    aggregate_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
) -> LineaTiempoForenseResponse:
    # 1. Validar autenticación y rol (Auditoría o Administrativo Master)
    role_norm = str(current_user.get("role", "")).strip().lower()
    if role_norm not in {"ceo", "administrador", "admin", "desarrollador", "dev", "developer", "auditor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: Se requieren privilegios de Auditoría o Administrativo Master."
        )

    tenant_id_str = current_user.get("tenant_id")
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de sesión no contiene un tenant_id válido."
        )

    try:
        tenant_id = UUID(tenant_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant ID no válido."
        )

    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    # 2. Consultar el ledger inmutable con paginación
    async with db_session() as conn:
        query = """
            SELECT event_id, event_type, actor_id, occurred_at, payload, count(*) OVER()::integer as total_records
            FROM koda_event_ledger
            WHERE aggregate_id = $1
              AND tenant_id = $2::uuid
            ORDER BY occurred_at ASC
            LIMIT $3 OFFSET $4
        """
        rows = await conn.fetch(query, aggregate_id, tenant_id, limit, offset)

        total_records = 0
        if rows:
            total_records = rows[0]["total_records"]
        elif offset > 0:
            count_query = """
                SELECT COUNT(*)::integer
                FROM koda_event_ledger
                WHERE aggregate_id = $1
                  AND tenant_id = $2::uuid
            """
            total_records = await conn.fetchval(count_query, aggregate_id, tenant_id)

    # 3. Mapear al modelo de respuesta
    events = []
    for r in rows:
        payload_val = r["payload"]
        if isinstance(payload_val, str):
            try:
                payload_val = json.loads(payload_val)
            except Exception:
                payload_val = {}
        elif not isinstance(payload_val, dict):
            payload_val = {}

        events.append(
            EventoForense(
                event_id=r["event_id"],
                event_type=r["event_type"],
                actor_id=r["actor_id"],
                occurred_at=r["occurred_at"],
                payload=payload_val
            )
        )

    return LineaTiempoForenseResponse(
        total_records=total_records,
        limit=limit,
        offset=offset,
        data=events
    )
