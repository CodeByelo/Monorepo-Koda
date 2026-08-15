"""Shared tenant subscription/limits helpers.

Centralizes the plan -> config fallback resolution already used ad-hoc in
routers/users_router.py (create_employee) and routers/developer_router.py
(get_tenant_limits), so new subscription/max_users enforcement checks don't
re-query `organizations` from scratch.
"""
import json
import logging
from typing import Optional, Tuple

logger = logging.getLogger("sistema_corporativo")


async def get_active_user_count_and_limit(conn, tenant_id) -> Optional[Tuple[int, int]]:
    """Resolves (active_users, max_users) for a tenant.

    Mirrors the resolution logic in users_router.create_employee:
    subscription_plans.max_users takes precedence, falling back to
    organizations.config->>'max_users' (default 12) for backward
    compatibility with tenants not yet on a plan.

    Returns None if the organization doesn't exist.
    """
    row = await conn.fetchrow(
        """
        SELECT sp.max_users as plan_max_users, o.config,
               COALESCE(v.user_count, 0) as active_users
        FROM organizations o
        LEFT JOIN subscription_plans sp ON o.plan_id = sp.id
        LEFT JOIN tenant_user_counts v ON o.id = v.tenant_id
        WHERE o.id = $1::uuid
        """,
        str(tenant_id),
    )
    if not row:
        return None

    max_users = row["plan_max_users"]
    if max_users is None:
        cfg = row["config"]
        if isinstance(cfg, str):
            try:
                cfg = json.loads(cfg)
            except Exception:
                cfg = {}
        max_users = (cfg or {}).get("max_users", 12) if cfg else 12

    return int(row["active_users"]), int(max_users)
