"""Plain-language decision input: the owner types what they want to change, we turn it into UNCONFIRMED decisions.

POST /businesses/{id}/interpret    -- starts reading the text. Returns at once: "done" for the rule-based parser,
                                      "pending" when an AI is reading (poll the GET below).
GET  /interpretations/{id}         -- poll for the result.
POST /interpretations/{id}/outcome -- what the owner finally kept, edited or added (thesis metric).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, settings
from ..database import get_db
from ..interpret import service

router = APIRouter(tags=["interpret"])


def _out(payload: dict) -> dict:
    """The study hides which coach is active, so the provider is only revealed when that is switched on."""
    if not settings.coach_show_mode():
        payload = {**payload, "provider": None, "fallback": None}
    return payload


def _get(db: Session, interpretation_id: int) -> models.Interpretation:
    row = db.get(models.Interpretation, interpretation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="interpretation not found")
    return row


@router.post("/businesses/{business_id}/interpret", response_model=schemas.InterpretationOut)
def interpret(business_id: int, payload: schemas.InterpretIn, db: Session = Depends(get_db)):
    business = db.get(models.Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    try:
        return _out(service.start(db, business, payload.text, [a.model_dump() for a in payload.answers]))
    except service.BadRequest as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/interpretations/{interpretation_id}", response_model=schemas.InterpretationOut)
def interpretation_progress(interpretation_id: int, db: Session = Depends(get_db)):
    return _out(service.read(db, _get(db, interpretation_id)))


@router.post("/interpretations/{interpretation_id}/outcome", response_model=schemas.InterpretOutcomeOut)
def interpretation_outcome(interpretation_id: int, payload: schemas.InterpretOutcomeIn, db: Session = Depends(get_db)):
    row = _get(db, interpretation_id)
    final = [{**d.to_schema_dict(), "confirmed": d.confirmed} for d in payload.decisions]
    summary = service.log_outcome(db, row, final, payload.scenario_id)
    return {k: v for k, v in summary.items()}
