"""Removing soft-deleted things for good, on purpose (scripts/purge_deleted.py). Nothing calls this by itself.

The AI logs (`ai_interactions`) are thesis data and are NEVER deleted. When the run, business or reading a log row
belonged to is purged, the row's link is cleared (so nothing points at a missing row) and the old id is kept as a plain
number in `former_run_id` / `former_business_id` / `former_interpretation_id`.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy.orm import Session

from . import models as m


def _ids(rows) -> list[int]:
    return [r[0] for r in rows]


def purge(db: Session, older_than: dt.timedelta, now: Optional[dt.datetime] = None, dry_run: bool = True) -> dict[str, int]:
    """Hard-delete everything soft-deleted at least `older_than` ago. Returns how many rows of each kind go
    (or would go, with dry_run). Items deleted more recently are left alone."""
    cutoff = (now or dt.datetime.utcnow()) - older_than

    business_ids = _ids(db.query(m.Business.id).filter(m.Business.deleted_at.isnot(None), m.Business.deleted_at <= cutoff))
    scenario_q = db.query(m.Scenario.id).filter(m.Scenario.deleted_at.isnot(None), m.Scenario.deleted_at <= cutoff)
    run_q = db.query(m.SimulationRun.id).filter(m.SimulationRun.deleted_at.isnot(None), m.SimulationRun.deleted_at <= cutoff)
    scenario_ids = set(_ids(scenario_q))
    run_ids = set(_ids(run_q))
    if business_ids:
        scenario_ids |= set(_ids(db.query(m.Scenario.id).filter(m.Scenario.business_id.in_(business_ids))))
        run_ids |= set(_ids(db.query(m.SimulationRun.id).filter(m.SimulationRun.business_id.in_(business_ids))))
    interp_ids = _ids(db.query(m.Interpretation.id).filter(m.Interpretation.business_id.in_(business_ids))) if business_ids else []
    run_list, scenario_list = sorted(run_ids), sorted(scenario_ids)

    journal_q = db.query(m.JournalEntry).filter(
        (m.JournalEntry.deleted_at.isnot(None) & (m.JournalEntry.deleted_at <= cutoff))
        | (m.JournalEntry.business_id.in_(business_ids) if business_ids else False))

    plan_q = db.query(m.StartupPlan).filter(m.StartupPlan.deleted_at.isnot(None), m.StartupPlan.deleted_at <= cutoff)

    def count(query) -> int:
        return query.count()

    ai_run = db.query(m.AiInteraction).filter(m.AiInteraction.simulation_run_id.in_(run_list)) if run_list else None
    ai_biz = db.query(m.AiInteraction).filter(m.AiInteraction.business_id.in_(business_ids)) if business_ids else None
    ai_int = db.query(m.AiInteraction).filter(m.AiInteraction.interpretation_id.in_(interp_ids)) if interp_ids else None

    counts = {
        "businesses": len(business_ids),
        "scenarios": len(scenario_list),
        "decisions": count(db.query(m.Decision).filter(m.Decision.scenario_id.in_(scenario_list))) if scenario_list else 0,
        "runs": len(run_list),
        "run_results": count(db.query(m.SimulationResult).filter(m.SimulationResult.simulation_run_id.in_(run_list))) if run_list else 0,
        "journal_entries": count(journal_q),
        "startup_plans": count(plan_q),
        "coach_results": count(db.query(m.CoachResult).filter(m.CoachResult.simulation_run_id.in_(run_list))) if run_list else 0,
        "ai_logs_kept": len({row.id for q in (ai_run, ai_biz, ai_int) if q is not None for row in q}),
    }
    if dry_run:
        return counts

    # 1. The AI logs keep their ids as plain numbers; their links are cleared.
    if ai_run is not None:
        for row in ai_run:
            row.former_run_id, row.simulation_run_id = row.simulation_run_id, None
    if ai_biz is not None:
        for row in ai_biz:
            row.former_business_id, row.business_id = row.business_id, None
    if ai_int is not None:
        for row in ai_int:
            row.former_interpretation_id, row.interpretation_id = row.interpretation_id, None
    db.flush()

    # 2. Runs and what hangs off them.
    if run_list:
        for model in (m.CoachAnswer, m.CoachResult, m.TodayNote, m.SimulationResult):
            db.query(model).filter(model.simulation_run_id.in_(run_list)).delete(synchronize_session=False)
        db.query(m.SimulationRun).filter(m.SimulationRun.id.in_(run_list)).delete(synchronize_session=False)

    # 3. Scenarios: results kept in surviving runs lose their link (they keep the scenario's name and numbers).
    if scenario_list:
        db.query(m.SimulationResult).filter(m.SimulationResult.scenario_id.in_(scenario_list)).update(
            {m.SimulationResult.scenario_id: None}, synchronize_session=False)
        db.query(m.Scenario).filter(m.Scenario.parent_scenario_id.in_(scenario_list), ~m.Scenario.id.in_(scenario_list)).update(
            {m.Scenario.parent_scenario_id: None}, synchronize_session=False)
        db.query(m.Scenario).filter(m.Scenario.id.in_(scenario_list)).update({m.Scenario.parent_scenario_id: None}, synchronize_session=False)
        db.query(m.Decision).filter(m.Decision.scenario_id.in_(scenario_list)).delete(synchronize_session=False)
        db.query(m.Scenario).filter(m.Scenario.id.in_(scenario_list)).delete(synchronize_session=False)

    # 3b. Start-up plans removed long ago go; plans that pointed at a purged practice business just lose the link.
    for row in plan_q.all():
        db.delete(row)
    db.flush()
    if business_ids:
        db.query(m.StartupPlan).filter(m.StartupPlan.business_id.in_(business_ids)).update(
            {m.StartupPlan.business_id: None}, synchronize_session=False)

    # 4. Journal entries removed long ago, and all entries of purged businesses; then the businesses themselves.
    for row in journal_q.all():
        db.delete(row)
    db.flush()
    if business_ids:
        db.query(m.UiEvent).filter(m.UiEvent.business_id.in_(business_ids)).delete(synchronize_session=False)
        db.query(m.Interpretation).filter(m.Interpretation.business_id.in_(business_ids)).delete(synchronize_session=False)
        db.query(m.BusinessSnapshot).filter(m.BusinessSnapshot.business_id.in_(business_ids)).delete(synchronize_session=False)
        db.query(m.Business).filter(m.Business.id.in_(business_ids)).delete(synchronize_session=False)
    db.commit()
    return counts
