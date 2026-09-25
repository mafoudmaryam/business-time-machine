"""Create/get a business and its baseline snapshot."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.get("", response_model=list[schemas.BusinessOut])
def list_businesses(db: Session = Depends(get_db)):
    return db.query(models.Business).order_by(models.Business.id).all()


@router.post("", response_model=schemas.BusinessOut, status_code=201)
def create_business(payload: schemas.BusinessCreate, db: Session = Depends(get_db)):
    business = models.Business(name=payload.name)
    db.add(business)
    db.flush()

    snapshot = models.BusinessSnapshot(business_id=business.id, **payload.baseline.model_dump())
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
