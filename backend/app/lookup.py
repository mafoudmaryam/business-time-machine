"""Finding things that have not been deleted.

Deleting is a soft delete: the row stays, with `deleted_at` set, and every lookup the API does for the owner goes
through here so a deleted business, scenario or run behaves exactly like one that never existed (404). Things inside a
deleted business count as deleted too. (The coach and the engine bridge read rows directly on purpose: an old run keeps
explaining itself even if a scenario it used was deleted.)
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from . import models


def business(db: Session, business_id: Optional[int]) -> Optional[models.Business]:
    row = db.get(models.Business, business_id) if business_id is not None else None
    return row if row is not None and row.deleted_at is None else None


def scenario(db: Session, scenario_id: Optional[int]) -> Optional[models.Scenario]:
    row = db.get(models.Scenario, scenario_id) if scenario_id is not None else None
    if row is None or row.deleted_at is not None or row.business.deleted_at is not None:
        return None
    return row


def run(db: Session, run_id: Optional[int]) -> Optional[models.SimulationRun]:
    row = db.get(models.SimulationRun, run_id) if run_id is not None else None
    if row is None or row.deleted_at is not None or row.business.deleted_at is not None:
        return None
    return row


def plan(db: Session, plan_id: Optional[int]) -> Optional[models.StartupPlan]:
    row = db.get(models.StartupPlan, plan_id) if plan_id is not None else None
    return row if row is not None and row.deleted_at is None else None


def free_scenario_name(db: Session, business_id: int, name: str, keep_id: Optional[int] = None) -> None:
    """Names are unique per business, deleted scenarios included. Before a scenario takes `name`, any DELETED scenario
    holding it is renamed "name (deleted #id)" so the unique rule cannot trip over something the owner cannot see."""
    holders = (db.query(models.Scenario)
               .filter(models.Scenario.business_id == business_id, models.Scenario.name == name,
                       models.Scenario.deleted_at.isnot(None)))
    for old in holders:
        if old.id != keep_id:
            old.name = f"{old.name} (deleted #{old.id})"
    db.flush()
