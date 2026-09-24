"""Glue between the database and btm_engine.

This is the only file that imports btm_engine. It turns stored rows into the
engine's dataclasses, calls the engine, and turns the result back into rows.
"""
from __future__ import annotations

import random
from typing import Optional

from jsonschema import ValidationError, validate as jsonschema_validate
from sqlalchemy.orm import Session

from btm_engine import CafeBaseline, CafeTemplate, DECISIONS_JSON_SCHEMA, Decision as EngineDecision, run_scenarios

from . import models

SEED_MAX = 2_000_000_000


class UnconfirmedDecisionsError(Exception):
    """Raised when a simulation is requested but some decision isn't confirmed yet."""


def validate_decisions_payload(decision_dicts: list[dict]) -> None:
    """Raise ValueError if the decisions don't match btm_engine.DECISIONS_JSON_SCHEMA."""
    payload = {"decisions": decision_dicts, "unclear": []}
    try:
        jsonschema_validate(payload, DECISIONS_JSON_SCHEMA)
    except ValidationError as exc:
        raise ValueError(exc.message) from exc


def to_baseline(snapshot: models.BusinessSnapshot) -> CafeBaseline:
    return CafeBaseline(
        customers=snapshot.customers,
        cash=snapshot.cash,
        staff_fte=snapshot.staff_fte,
        avg_ticket=snapshot.avg_ticket,
        visits_per_regular=snapshot.visits_per_regular,
        walk_in_visits=snapshot.walk_in_visits,
        cogs_ratio=snapshot.cogs_ratio,
        wage_per_fte=snapshot.wage_per_fte,
        fixed_costs=snapshot.fixed_costs,
        marketing=snapshot.marketing,
        churn_rate=snapshot.churn_rate,
        seats=snapshot.seats,
        open_days=snapshot.open_days,
    )


def to_engine_decisions(decisions: list[models.Decision]) -> list[EngineDecision]:
    return [
        EngineDecision(type=d.type, start_month=d.start_month, value=d.value,
                        unit=d.unit, extra=dict(d.extra or {}))
        for d in decisions
    ]


def run_simulation(
    db: Session,
    business: models.Business,
    scenarios: list[models.Scenario],
    horizon: int,
    iterations: int,
    seed: Optional[int],
) -> models.SimulationRun:
    """Run baseline + the given scenarios in one engine call (shared random draws),
    then persist the results. Raises UnconfirmedDecisionsError (-> HTTP 409) if any
    decision in the requested scenarios hasn't been confirmed."""
    unconfirmed_scenarios = sorted({s.name for s in scenarios if any(not d.confirmed for d in s.decisions)})
    if unconfirmed_scenarios:
        raise UnconfirmedDecisionsError(
            f"scenario(s) have unconfirmed decisions: {', '.join(unconfirmed_scenarios)}"
        )

    baseline_snapshot = business.baseline
    base = to_baseline(baseline_snapshot)
    tpl = CafeTemplate()

    if seed is None:
        seed = random.randint(1, SEED_MAX)

    scenario_map = {s.name: to_engine_decisions(s.decisions) for s in scenarios}
    result = run_scenarios(base, tpl, scenario_map, horizon=horizon, iterations=iterations, seed=seed)

    name_to_id = {s.name: s.id for s in scenarios}

    run_row = models.SimulationRun(
        business_id=business.id,
        engine_version=result.engine_version,
        seed=result.seed,
        iterations=result.iterations,
        horizon=result.horizon,
    )
    db.add(run_row)
    db.flush()

    for name, scenario_result in result.scenarios.items():
        db.add(models.SimulationResult(
            simulation_run_id=run_row.id,
            scenario_id=name_to_id.get(name),  # None for the auto-added "baseline"
            scenario_name=name,
            bands=scenario_result.bands,
            summary=scenario_result.summary,
        ))

    db.commit()
    db.refresh(run_row)
    return run_row
