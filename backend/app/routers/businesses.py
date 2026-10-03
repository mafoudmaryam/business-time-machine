"""Create/get a business and its baseline snapshot."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import engine_bridge, models, schemas
from ..database import get_db

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.get("", response_model=list[schemas.BusinessOut])
def list_businesses(db: Session = Depends(get_db)):
    return db.query(models.Business).order_by(models.Business.id).all()


@router.post("", response_model=schemas.BusinessOut, status_code=201)
def create_business(payload: schemas.BusinessCreate, db: Session = Depends(get_db)):
    try:
        template = engine_bridge.get_template(payload.industry)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    business = models.Business(name=payload.name, industry=payload.industry, currency=payload.currency,
                               setup_source=payload.setup_source)
    db.add(business)
    db.flush()

    # Start from this industry's defaults, then overlay only the fields the
    # client actually sent -- so a partial override still falls back to the
    # chosen industry's numbers, not always café's.
    baseline_values = template.default_baseline.to_dict()
    if payload.baseline is not None:
        baseline_values.update(payload.baseline.model_dump(exclude_unset=True))
    assumed = [a.model_dump() for a in payload.assumed_fields] if payload.assumed_fields else None
    snapshot = models.BusinessSnapshot(business_id=business.id, assumed_fields=assumed, **baseline_values)
    db.add(snapshot)
    db.commit()
    db.refresh(business)
    return business


@router.get("/{business_id}", response_model=schemas.BusinessOut)
def get_business(business_id: int, db: Session = Depends(get_db)):
    business = db.get(models.Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    return business
