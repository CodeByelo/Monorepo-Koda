from fastapi import APIRouter, Depends
from backend.core.security import get_current_user

router = APIRouter(
    prefix="/pagos",
    tags=["Pagos"],
    dependencies=[Depends(get_current_user)]
)
