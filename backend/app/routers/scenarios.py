"""Create/get a scenario with its decisions."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import engine_bridge, models, schemas, lookup
from ..database import get_db

router = APIRouter(tags=["scenarios"])


@router.get("/businesses/{business_id}/scenarios", response_model=list[schemas.ScenarioOut])
def list_scenarios(business_id: int, db: Session = Depends(get_db)):
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    return (
        db.query(models.Scenario)
        .filter(models.Scenario.business_id == business_id)
        .filter(models.Scenario.deleted_at.is_(None))
        .order_by(models.Scenario.id)
        .all()
    )


@router.post("/businesses/{business_id}/scenarios", response_model=schemas.ScenarioOut, status_code=201)
def create_scenario(business_id: int, payload: schemas.ScenarioCreate, db: Session = Depends(get_db)):
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")

    if payload.name.strip().lower() == "baseline":
        raise HTTPException(status_code=422, detail="scenario name 'baseline' is reserved by the engine")

    if payload.parent_scenario_id is not None:
        parent = lookup.scenario(db, payload.parent_scenario_id)
        if parent is None or parent.business_id != business_id:
            raise HTTPException(status_code=422, detail="parent_scenario_id must be a scenario of this business")

    try:
        engine_bridge.validate_decisions_payload([d.to_schema_dict() for d in payload.decisions])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"invalid decisions: {exc}") from exc

    # A deleted scenario still holds its name (names are unique per business). Move it out of the way so the
    # owner can reuse the name; "Undo" would then need the old name back, which restore() checks.
    lookup.free_scenario_name(db, business_id, payload.name)
    scenario = models.Scenario(
        business_id=business_id, name=payload.name, parent_scenario_id=payload.parent_scenario_id,
    )
    try:
        db.add(scenario)
        db.flush()

        for d in payload.decisions:
            db.add(models.Decision(
                scenario_id=scenario.id, type=d.type, start_month=d.start_month, value=d.value,
                unit=d.unit, extra=d.extra_dict(), source=d.source, confirmed=d.confirmed,
                confirmed_via=d.confirmed_via if d.confirmed else None,
            ))

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="a scenario with this name already exists for this business") from exc

    db.refresh(scenario)
    return scenario


@router.get("/scenarios/{scenario_id}", response_model=schemas.ScenarioOut)
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = lookup.scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    return scenario


@router.post("/scenarios/{scenario_id}/confirm", response_model=schemas.ScenarioOut)
def confirm_scenario(scenario_id: int, db: Session = Depends(get_db)):
    """The owner has reviewed the scenario's decisions (the "Looks right" button): mark them all confirmed.
    Nothing is simulated until this has happened (golden rule 2); simulate still refuses unconfirmed decisions."""
    scenario = lookup.scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    for decision in scenario.decisions:
        if not decision.confirmed:
            decision.confirmed_via = "looks_right"
        decision.confirmed = True
    db.commit()
    db.refresh(scenario)
    return scenario
