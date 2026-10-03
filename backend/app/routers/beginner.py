"""Endpoints for the beginner journey: config, sample business, Today, editing assumed numbers, UI events."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import engine_bridge, models, schemas, settings, today
from ..coach import today as today_note
from ..database import get_db

router = APIRouter(tags=["beginner"])

MAX_EVENT_PAYLOAD_CHARS = 2000


@router.get("/config", response_model=schemas.ConfigOut)
def get_config():
    enabled = settings.coach_enabled()
    return schemas.ConfigOut(
        coach_enabled=enabled,
        coach_mode=settings.coach_provider() if enabled and settings.coach_show_mode() else None,
    )


def _business(db: Session, business_id: int) -> models.Business:
    business = db.get(models.Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    if business.baseline is None:
        raise HTTPException(status_code=422, detail="business has no baseline snapshot")
    return business


@router.post("/sample_business", response_model=schemas.BusinessOut, status_code=201)
def create_sample_business(payload: schemas.SampleBusinessIn, db: Session = Depends(get_db)):
    """One click: an example café / restaurant / bakery with the industry's typical numbers."""
    try:
        template = engine_bridge.get_template(payload.industry)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    values, assumed = engine_bridge.sample_start(payload.industry)
    business = models.Business(name=f"Sample {template.display_name.lower()}", industry=payload.industry,
                               currency=payload.currency, setup_source="sample", is_sample=True)
    db.add(business)
    db.flush()
    db.add(models.BusinessSnapshot(business_id=business.id, assumed_fields=assumed, **values))
    db.commit()
    db.refresh(business)
    return business


@router.get("/businesses/{business_id}/today", response_model=schemas.TodayOut)
def get_today(business_id: int, db: Session = Depends(get_db)):
    return today.build_today(db, _business(db, business_id))


@router.get("/businesses/{business_id}/today/note", response_model=schemas.TodayNoteOut)
def get_today_note(business_id: int, db: Session = Depends(get_db)):
    """Poll this while `ai_status` is "pending"."""
    business = _business(db, business_id)
    run = today.get_today_run(db, business)
    try:
        note = today_note.read_note(db, run)
    except today_note.CoachDisabled:
        raise HTTPException(status_code=404, detail="the coach is switched off")
    if note is None:
        raise HTTPException(status_code=404, detail="no note yet")
    return note


@router.patch("/businesses/{business_id}/baseline", response_model=schemas.BusinessOut)
def change_numbers(business_id: int, payload: schemas.BaselinePatch, db: Session = Depends(get_db)):
    """The owner corrects some numbers (for example an assumed one). Makes a new snapshot; older runs keep
    the numbers they were made with. A number the owner has changed is no longer 'assumed'."""
    business = _business(db, business_id)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="nothing to change")
    old = business.baseline
    values = {c: getattr(old, c) for c in engine_bridge.BASELINE_FIELDS}
    values.update(changes)
    try:
        engine_bridge.check_baseline(values)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    left = [a for a in (old.assumed_fields or []) if a["field"] not in changes]
    db.add(models.BusinessSnapshot(business_id=business.id, assumed_fields=left or None, **values))
    db.commit()
    db.refresh(business)
    return business


@router.post("/events", response_model=schemas.EventsOut, status_code=201)
def log_events(payload: schemas.EventsIn, db: Session = Depends(get_db)):
    """Things the person did in the app, for the study. Small, structured, no free text."""
    business = db.get(models.Business, payload.business_id) if payload.business_id is not None else None
    participant = business.participant_code if business is not None else None
    for event in payload.events:
        if event.payload is not None and len(str(event.payload)) > MAX_EVENT_PAYLOAD_CHARS:
            raise HTTPException(status_code=422, detail="event payload is too large")
    for event in payload.events:
        db.add(models.UiEvent(session_id=payload.session_id, business_id=business.id if business else None,
                              participant_code=participant, screen=event.screen, name=event.name,
                              payload=event.payload))
    db.commit()
    return schemas.EventsOut(stored=len(payload.events))
