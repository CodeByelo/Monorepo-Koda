#  Koda ERP · backend/routers/analytics_router.py
import logging
import uuid
from typing import List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, status
from database.async_db import get_db_connection
from auth.supabase_auth import get_current_user

router = APIRouter(prefix="/api/v1/analytics", tags=["Analíticas de Telemetría"])
logger = logging.getLogger("sistema_corporativo")


class GerenciaTelemetryResponse(BaseModel):
    gerencia_id: int = Field(..., description="ID de la gerencia responsable.")
    volumen_actividad: int = Field(..., description="Cantidad total de eventos capturados en los últimos 30 días.")
    friccion_porcentaje: float = Field(..., description="Porcentaje de eventos warning/critical sobre el total.")
    tiempo_promedio_horas: Optional[float] = Field(None, description="Tiempo promedio de resolución de tickets en horas.")
    estado_salud: str = Field(..., description="Estado de salud operativo: 'Optimo', 'Advertencia' o 'Critico'.")


@router.get(
    "/telemetry/gerencias",
    response_model=List[GerenciaTelemetryResponse],
    summary="Obtener telemetría analítica de salud y fricción por gerencia",
    description="Calcula el volumen, índice de fricción y tiempos promedio de resolución de los últimos 30 días."
)
async def get_gerencias_telemetry(
    current_user: dict = Depends(get_current_user),
    conn = Depends(get_db_connection)
):
    tenant_id_str = current_user.get("tenant_id")
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID de organización/tenant no disponible en el token."
        )

    try:
        tenant_uuid = uuid.UUID(tenant_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El tenant_id en el token no es un UUID válido."
        )

    # Inyectar el contexto de tenant para RLS
    await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", str(tenant_uuid))

    sql = """
        WITH created_events AS (
            SELECT aggregate_id, occurred_at AS created_at, gerencia_id
            FROM koda_event_ledger
            WHERE event_type = 'ticket.creado'
              AND occurred_at >= NOW() - INTERVAL '30 days'
              AND tenant_id = $1::uuid
        ),
        closed_events AS (
            SELECT aggregate_id, occurred_at AS closed_at
            FROM koda_event_ledger
            WHERE event_type = 'ticket.cerrado'
              AND occurred_at >= NOW() - INTERVAL '30 days'
              AND tenant_id = $1::uuid
        ),
        resolutions AS (
            SELECT 
                c.gerencia_id,
                EXTRACT(EPOCH FROM (cl.closed_at - c.created_at)) / 3600.0 AS resolution_hours
            FROM created_events c
            JOIN closed_events cl ON c.aggregate_id = cl.aggregate_id
        ),
        avg_resolutions AS (
            SELECT 
                gerencia_id,
                AVG(resolution_hours) AS avg_resolution_hours
            FROM resolutions
            GROUP BY gerencia_id
        ),
        general_stats AS (
            SELECT 
                gerencia_id,
                COUNT(*) AS total_events,
                COUNT(CASE WHEN severity IN ('warning', 'critical') THEN 1 END) AS friction_events
            FROM koda_event_ledger
            WHERE occurred_at >= NOW() - INTERVAL '30 days'
              AND tenant_id = $1::uuid
            GROUP BY gerencia_id
        )
        SELECT 
            g.gerencia_id,
            g.total_events AS volumen_actividad,
            CASE 
                WHEN g.total_events > 0 THEN (g.friction_events::float / g.total_events::float) * 100.0
                ELSE 0.0
            END AS friccion_porcentaje,
            a.avg_resolution_hours AS tiempo_promedio_horas
        FROM general_stats g
        LEFT JOIN avg_resolutions a ON g.gerencia_id = a.gerencia_id;
    """

    try:
        rows = await conn.fetch(sql, tenant_uuid)
        
        response = []
        for row in rows:
            friccion = float(row["friccion_porcentaje"]) if row["friccion_porcentaje"] is not None else 0.0
            
            # Determinar estado de salud según la fricción
            if friccion <= 10.0:
                estado = "Optimo"
            elif friccion <= 25.0:
                estado = "Advertencia"
            else:
                estado = "Critico"

            response.append(
                GerenciaTelemetryResponse(
                    gerencia_id=row["gerencia_id"],
                    volumen_actividad=row["volumen_actividad"],
                    friccion_porcentaje=round(friccion, 2),
                    tiempo_promedio_horas=round(float(row["tiempo_promedio_horas"]), 2) if row["tiempo_promedio_horas"] is not None else None,
                    estado_salud=estado
                )
            )
            
        return response

    except Exception as e:
        logger.exception("Error al consultar telemetría analítica de gerencias: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del servidor al calcular la telemetría de gerencias."
        )
