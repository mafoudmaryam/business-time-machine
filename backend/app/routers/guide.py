"""The "I don't have a business yet" start-up guide.

A person answers nine questions and gets a rough start-up plan with ranges, a checklist, and a practice business for the
simulator. Everything numeric comes from the engine (btm_engine.startup) and its data file, where each number has a named
source; no AI is involved anywhere here, and nothing is sent out. The plan is not stored: only the answers are, and the plan
is worked out again each time it is shown. Delete is a soft delete with Undo, like the other things people make.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import engine_bridge, lookup, models, schemas
from ..database import get_db

router = APIRouter(prefix="/guide", tags=["guide"])


def _now() -> dt.datetime:
    return dt.datetime.utcnow()


def _clean(answers: schemas.GuideAnswersIn) -> dict:
    try:
        return engine_bridge.guide_clean_answers(answers.model_dump())
    except engine_bridge.GuideAnswerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _plan_row(db: Session, plan_id: int) -> models.StartupPlan:
    row = lookup.plan(db, plan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="plan not found")
    return row


def _out(row: models.StartupPlan) -> schemas.GuidePlanOut:
    plan = engine_bridge.guide_plan(row.answers)
    return schemas.GuidePlanOut(id=row.id, created_at=row.created_at, business_id=row.business_id,
                                data_version=plan["data_version"], data_changed=row.data_version != plan["data_version"], plan=plan)


@router.get("/options")
def options() -> dict:
    return engine_bridge.guide_options()


@router.get("/plans", response_model=list[schemas.GuidePlanSummary])
def list_plans(db: Session = Depends(get_db)):
    rows = (db.query(models.StartupPlan).filter(models.StartupPlan.deleted_at.is_(None))
            .order_by(models.StartupPlan.id.desc()).all())
    return [schemas.GuidePlanSummary(id=r.id, created_at=r.created_at, country=r.country, business_type=r.business_type,
                                     business_id=r.business_id if lookup.business(db, r.business_id) else None) for r in rows]


@router.post("/plans", response_model=schemas.GuidePlanOut, status_code=201)
def create_plan(answers: schemas.GuideAnswersIn, db: Session = Depends(get_db)):
    clean = _clean(answers)
    row = models.StartupPlan(answers=clean, country=clean["country"], business_type=clean["business_type"],
                             currency=clean["currency"], data_version=engine_bridge.guide_data_version(),
                             engine_version=engine_bridge.engine_version())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/plans/{plan_id}", response_model=schemas.GuidePlanOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    return _out(_plan_row(db, plan_id))


@router.put("/plans/{plan_id}", response_model=schemas.GuidePlanOut)
def change_answers(plan_id: int, answers: schemas.GuideAnswersIn, db: Session = Depends(get_db)):
    """"Change my answers": replaces the answers and works the plan out again."""
    row = _plan_row(db, plan_id)
    clean = _clean(answers)
    row.answers, row.country, row.business_type, row.currency = clean, clean["country"], clean["business_type"], clean["currency"]
    row.data_version, row.updated_at = engine_bridge.guide_data_version(), _now()
    db.commit()
    db.refresh(row)
    return _out(row)


@router.post("/plans/{plan_id}/recalculate", response_model=schemas.GuidePlanOut)
def recalculate(plan_id: int, db: Session = Depends(get_db)):
    """The person has seen that newer data exists: remember that they are now looking at the current version."""
    row = _plan_row(db, plan_id)
    row.data_version, row.updated_at = engine_bridge.guide_data_version(), _now()
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/plans/{plan_id}/simulator", response_model=schemas.GuideSimulatorOut)
def simulator(plan_id: int, db: Session = Depends(get_db)):
    """What "Try it in the simulator" would set up. Read-only: nothing is created. If numbers are missing it says which."""
    row = _plan_row(db, plan_id)
    return engine_bridge.guide_simulator(engine_bridge.guide_plan(row.answers))


@router.post("/plans/{plan_id}/link_business", response_model=schemas.GuidePlanOut)
def link_business(plan_id: int, body: schemas.GuideLinkIn, db: Session = Depends(get_db)):
    """After the practice business has been created through the usual start flow, remember which one it is."""
    row = _plan_row(db, plan_id)
    business = lookup.business(db, body.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    if business.setup_source != "guide":
        raise HTTPException(status_code=422, detail="that business was not made from a start-up plan")
    row.business_id, row.updated_at = business.id, _now()
    db.commit()
    db.refresh(row)
    return _out(row)


_NAMES = {"cafe": "café", "restaurant": "restaurant", "bakery": "bakery"}


@router.delete("/plans/{plan_id}", response_model=schemas.DeletedOut)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    row = _plan_row(db, plan_id)
    row.deleted_at = _now()
    db.commit()
    return schemas.DeletedOut(id=row.id, kind="plan", name=f"start-up plan for a {_NAMES.get(row.business_type, 'business')}",
                              deleted_at=row.deleted_at)


@router.post("/plans/{plan_id}/restore", response_model=schemas.GuidePlanOut)
def restore_plan(plan_id: int, db: Session = Depends(get_db)):
    row = db.get(models.StartupPlan, plan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="plan not found")
    row.deleted_at = None
    db.commit()
    db.refresh(row)
    return _out(row)
