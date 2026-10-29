"""Read-only practical calculators: no DB session, saved scenarios or coach calls."""
from fastapi import APIRouter, HTTPException
from .. import engine_bridge, schemas

router = APIRouter(tags=["tools"])


@router.post("/tools/sales_needed", response_model=schemas.SalesNeededOut)
def sales_needed(payload: schemas.SalesNeededIn):
    try:
        return engine_bridge.calculate_sales_needed(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
