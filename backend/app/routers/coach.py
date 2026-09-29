"""The AI coach: a friendly explanation of a finished simulation run.

GET  /coach/status               -- is the coach on, and (if allowed) which mode.
POST /simulation_runs/{id}/coach -- headline, story, watch-outs and tested ideas (cached per run).
POST /simulation_runs/{id}/ask   -- answer a question from the run's facts only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..coach import service
from ..database import get_db

router = APIRouter(tags=["coach"])


def _get_run(db: Session, run_id: int) -> models.SimulationRun:
    run = db.get(models.SimulationRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="simulation run not found")
    return run


@router.get("/coach/status", response_model=schemas.CoachStatusOut)
def coach_status():
    return service.status()


@router.post("/simulation_runs/{run_id}/coach", response_model=schemas.CoachOut)
def coach(run_id: int, regenerate: bool = False, db: Session = Depends(get_db)):
    run = _get_run(db, run_id)
    try:
        return service.get_coach(db, run, regenerate=regenerate)
    except service.CoachDisabled:
        raise HTTPException(status_code=404, detail="the coach is switched off")


@router.post("/simulation_runs/{run_id}/ask", response_model=schemas.AskOut)
def ask(run_id: int, payload: schemas.AskIn, db: Session = Depends(get_db)):
    run = _get_run(db, run_id)
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="please type a question")
    try:
        return service.ask(db, run, question)
    except service.CoachDisabled:
        raise HTTPException(status_code=404, detail="the coach is switched off")
