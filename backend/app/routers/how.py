"""Read-only pages for trust and sharing: the plain summary (no coach, no AI) and "how we worked it out"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import how, lookup, models, schemas, today
from ..database import get_db

router = APIRouter(tags=["how"])


def _business(db: Session, business_id: int) -> models.Business:
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    if business.baseline is None:
        raise HTTPException(status_code=422, detail="business has no baseline snapshot")
    return business


@router.get("/businesses/{business_id}/summary", response_model=schemas.TodayOut)
def get_summary(business_id: int, db: Session = Depends(get_db)):
    """The same numbers as Today, for the share page, without the coach note: no AI job is started and no note is stored."""
    return today.build_today(db, _business(db, business_id), with_note=False)


@router.get("/businesses/{business_id}/how", response_model=schemas.HowOut)
def get_how(business_id: int, db: Session = Depends(get_db)):
    return how.build_how(db, _business(db, business_id))
