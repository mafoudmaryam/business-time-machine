"""Run simulations and fetch their results.

POST /businesses/{id}/simulate  -- compare up to 3 scenarios on shared random draws.
POST /scenarios/{id}/simulate   -- shortcut: run one scenario against baseline.
GET  /simulation_runs/{id}      -- fetch all scenarios' bands + summaries from a run.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import engine_bridge, models, schemas, lookup
from ..database import get_db

router = APIRouter(tags=["simulations"])


def _run_and_store(db: Session, business: models.Business, scenarios: list[models.Scenario],
                    horizon: int, iterations: int, seed: int | None) -> models.SimulationRun:
    try:
        return engine_bridge.run_simulation(db, business, scenarios, horizon, iterations, seed)
    except engine_bridge.UnconfirmedDecisionsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _load_scenarios(db: Session, business_id: int, scenario_ids: list[int]) -> list[models.Scenario]:
    scenarios = []
    seen_names: set[str] = set()
    for scenario_id in scenario_ids:
        scenario = lookup.scenario(db, scenario_id)
        if scenario is None or scenario.business_id != business_id:
            raise HTTPException(status_code=404, detail=f"scenario {scenario_id} not found for this business")
        if scenario.name in seen_names:
            raise HTTPException(status_code=422, detail=f"duplicate scenario name {scenario.name!r} in request")
        seen_names.add(scenario.name)
        scenarios.append(scenario)
    return scenarios


@router.get("/businesses/{business_id}/simulation_runs", response_model=list[schemas.SimulationRunSummaryOut])
def list_simulation_runs(business_id: int, db: Session = Depends(get_db)):
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")

    runs = (
        db.query(models.SimulationRun)
        .filter(models.SimulationRun.business_id == business_id)
        .filter(models.SimulationRun.kind != "today")      # the Today page's own run is not a comparison
        .filter(models.SimulationRun.deleted_at.is_(None))
        .order_by(models.SimulationRun.id.desc())
        .all()
    )
    return [
        schemas.SimulationRunSummaryOut(
            id=run.id,
            business_id=run.business_id,
            engine_version=run.engine_version,
            seed=run.seed,
            iterations=run.iterations,
            horizon=run.horizon,
            created_at=run.created_at,
            scenario_names=[r.scenario_name for r in run.results],
        )
        for run in runs
    ]


@router.post("/businesses/{business_id}/simulate", response_model=schemas.SimulationRunOut, status_code=201)
def simulate_business(business_id: int, payload: schemas.SimulateRequest, db: Session = Depends(get_db)):
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    if business.baseline is None:
        raise HTTPException(status_code=422, detail="business has no baseline snapshot")

    scenarios = _load_scenarios(db, business_id, payload.scenario_ids)
    return _run_and_store(db, business, scenarios, payload.horizon, payload.iterations, payload.seed)


@router.post("/scenarios/{scenario_id}/simulate", response_model=schemas.SimulationRunOut, status_code=201)
def simulate_scenario(scenario_id: int, payload: schemas.SingleSimulateRequest, db: Session = Depends(get_db)):
    scenario = lookup.scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")

    business = scenario.business
    if business.baseline is None:
        raise HTTPException(status_code=422, detail="business has no baseline snapshot")

    return _run_and_store(db, business, [scenario], payload.horizon, payload.iterations, payload.seed)


@router.get("/simulation_runs/{run_id}", response_model=schemas.SimulationRunOut)
def get_simulation_run(run_id: int, db: Session = Depends(get_db)):
    run = lookup.run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="simulation run not found")
    return run
