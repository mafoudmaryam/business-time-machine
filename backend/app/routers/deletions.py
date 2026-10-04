"""Delete (and undo) businesses, scenarios and runs.

Nothing is erased here: delete sets `deleted_at`, restore clears it, and every owner-facing lookup ignores deleted
rows (see lookup.py). The front end shows "Undo" for a few seconds, and "Undo" is just restore. Rows are only removed
for good by `app.purge` (scripts/purge_deleted.py), and even then the AI logs stay.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import lookup, models, schemas
from ..database import get_db

router = APIRouter(tags=["delete"])


def _now() -> dt.datetime:
    return dt.datetime.utcnow()


def _live_runs(db: Session, **filters) -> int:
    return (db.query(models.SimulationRun)
            .filter_by(**filters).filter(models.SimulationRun.deleted_at.is_(None))
            .filter(models.SimulationRun.kind != "today").count())


# ---------- scenarios ----------

@router.get("/scenarios/{scenario_id}/impact", response_model=schemas.ScenarioImpact)
def scenario_impact(scenario_id: int, db: Session = Depends(get_db)):
    scenario = lookup.scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    runs = (db.query(models.SimulationResult.simulation_run_id)
            .join(models.SimulationRun, models.SimulationRun.id == models.SimulationResult.simulation_run_id)
            .filter(models.SimulationResult.scenario_id == scenario_id, models.SimulationRun.deleted_at.is_(None))
            .distinct().count())
    return schemas.ScenarioImpact(decisions=len(scenario.decisions), runs=runs)


@router.delete("/scenarios/{scenario_id}", response_model=schemas.DeletedOut)
def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    """Hides the scenario and its steps. Runs that already used it stay in the history with their saved results."""
    scenario = lookup.scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    scenario.deleted_at = _now()
    db.commit()
    return schemas.DeletedOut(id=scenario.id, kind="scenario", name=scenario.name, deleted_at=scenario.deleted_at)


@router.post("/scenarios/{scenario_id}/restore", response_model=schemas.ScenarioOut)
def restore_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.get(models.Scenario, scenario_id)
    if scenario is None or scenario.business.deleted_at is not None:
        raise HTTPException(status_code=404, detail="scenario not found")
    if scenario.deleted_at is None:
        return scenario
    name = scenario.name
    suffix = f" (deleted #{scenario.id})"          # added by create_scenario when the name was reused
    if name.endswith(suffix):
        name = name[: -len(suffix)]
    clash = (db.query(models.Scenario)
             .filter(models.Scenario.business_id == scenario.business_id, models.Scenario.name == name,
                     models.Scenario.id != scenario.id, models.Scenario.deleted_at.is_(None)).first())
    if clash is not None:
        raise HTTPException(status_code=409, detail=f"a scenario called '{name}' exists now, so this one cannot come back as it was")
    lookup.free_scenario_name(db, scenario.business_id, name, keep_id=scenario.id)
    scenario.name = name
    scenario.deleted_at = None
    db.commit()
    db.refresh(scenario)
    return scenario


# ---------- runs ----------

@router.delete("/simulation_runs/{run_id}", response_model=schemas.DeletedOut)
def delete_run(run_id: int, db: Session = Depends(get_db)):
    """Hides the run (and its coach notes) from the history. The AI logs about it are kept."""
    run = lookup.run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="simulation run not found")
    run.deleted_at = _now()
    db.commit()
    names = [r.scenario_name for r in run.results if r.scenario_name != "baseline"]
    return schemas.DeletedOut(id=run.id, kind="run", name=", ".join(names) or "baseline only", deleted_at=run.deleted_at)


@router.post("/simulation_runs/{run_id}/restore", response_model=schemas.SimulationRunSummaryOut)
def restore_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(models.SimulationRun, run_id)
    if run is None or run.business.deleted_at is not None:
        raise HTTPException(status_code=404, detail="simulation run not found")
    run.deleted_at = None
    db.commit()
    return schemas.SimulationRunSummaryOut(
        id=run.id, business_id=run.business_id, engine_version=run.engine_version, seed=run.seed,
        iterations=run.iterations, horizon=run.horizon, created_at=run.created_at,
        scenario_names=[r.scenario_name for r in run.results],
    )


# ---------- businesses ----------

@router.get("/businesses/{business_id}/impact", response_model=schemas.BusinessImpact)
def business_impact(business_id: int, db: Session = Depends(get_db)):
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    scenarios = (db.query(models.Scenario)
                 .filter_by(business_id=business_id).filter(models.Scenario.deleted_at.is_(None)).count())
    return schemas.BusinessImpact(scenarios=scenarios, runs=_live_runs(db, business_id=business_id))


@router.delete("/businesses/{business_id}", response_model=schemas.DeletedOut)
def delete_business(business_id: int, db: Session = Depends(get_db)):
    """Hides the business with all its scenarios and runs. Everything comes back with restore."""
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    business.deleted_at = _now()
    db.commit()
    return schemas.DeletedOut(id=business.id, kind="business", name=business.name, deleted_at=business.deleted_at)


@router.post("/businesses/{business_id}/restore", response_model=schemas.BusinessOut)
def restore_business(business_id: int, db: Session = Depends(get_db)):
    business = db.get(models.Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    business.deleted_at = None
    db.commit()
    db.refresh(business)
    return business
