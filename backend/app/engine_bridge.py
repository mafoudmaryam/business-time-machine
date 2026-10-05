"""Glue between the database and btm_engine.

This is the only file that imports btm_engine. It turns stored rows into the
engine's dataclasses, calls the engine, and turns the result back into rows.
"""
from __future__ import annotations

import random
from typing import Optional

from jsonschema import ValidationError, validate as jsonschema_validate
from sqlalchemy.orm import Session

from btm_engine import (BusinessBaseline, DECISIONS_JSON_SCHEMA, Decision as EngineDecision,
                        answers_from_baseline, build_facts, build_today_facts, describe_decision, format_money, get_template, list_industries,
                        month_one_summary, preview_change, quick_baseline, run_scenarios, sample_assumed)

from btm_engine.journal import accuracy_summary, compare_month, months_between

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


def to_baseline(snapshot: models.BusinessSnapshot) -> BusinessBaseline:
    return BusinessBaseline(
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
    kind: str = "compare",
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
    tpl = get_template(business.industry)

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
        kind=kind,
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


# ---------- coach support ----------

_EXTRA_KEYS = ("loan_months", "annual_rate", "capacity_pct", "cogs_ratio", "investment")
DECISION_ITEM_SCHEMA = DECISIONS_JSON_SCHEMA["properties"]["decisions"]["items"]


def decision_to_flat(d: EngineDecision) -> dict:
    """The flat shape used by DECISIONS_JSON_SCHEMA and the scenario API."""
    return {"type": d.type, "start_month": d.start_month, "value": d.value, "unit": d.unit, **d.extra}


def clean_idea_decisions(decision_dicts: list[dict], horizon: int) -> list[dict]:
    """Validate an AI-written list of decisions against DECISIONS_JSON_SCHEMA and the engine's
    own rules. Returns the cleaned flat dicts (unknown keys dropped); raises ValueError if invalid."""
    if not decision_dicts:
        raise ValueError("an idea needs at least one decision")
    cleaned = []
    for d in decision_dicts:
        if not isinstance(d, dict):
            raise ValueError("decision must be an object")
        keep = {k: d[k] for k in ("type", "start_month", "value", "unit", *_EXTRA_KEYS) if k in d and d[k] is not None}
        cleaned.append(keep)
    validate_decisions_payload(cleaned)
    for d in cleaned:
        EngineDecision.from_dict(d).validate(horizon)
    return cleaned


def _baseline_at_run_time(business: models.Business, run: models.SimulationRun) -> models.BusinessSnapshot:
    older = [s for s in business.snapshots if s.created_at <= run.created_at]
    return (older or business.snapshots)[-1]


def _run_decisions(db: Session, run: models.SimulationRun) -> dict[str, list[EngineDecision]]:
    """Scenario name -> engine decisions, for the non-baseline scenarios of a stored run."""
    out: dict[str, list[EngineDecision]] = {}
    for result in run.results:
        if result.scenario_name == "baseline":
            continue
        scenario = db.get(models.Scenario, result.scenario_id) if result.scenario_id else None
        out[result.scenario_name] = to_engine_decisions(scenario.decisions) if scenario else []
    return out


def build_run_facts(db: Session, run: models.SimulationRun) -> tuple[dict, dict[str, list[dict]]]:
    """The coach's facts for a stored run, plus each scenario's raw decisions (flat dicts).
    The Today page's own run has no plans: its facts are the 'today' facts."""
    if run.kind == "today":
        return build_today_run_facts(db, run), {}
    business = run.business
    base = to_baseline(_baseline_at_run_time(business, run))
    tpl = get_template(business.industry)
    decisions = _run_decisions(db, run)
    summaries = {r.scenario_name: r.summary for r in run.results}
    facts = build_facts(base, tpl, decisions, summaries, run.horizon, business.currency)
    raw = {name: [decision_to_flat(d) for d in decs] for name, decs in decisions.items()}
    return facts, raw


def simulate_ideas(db: Session, run: models.SimulationRun, ideas: list[dict]) -> list[dict]:
    """Simulate each idea (its parent scenario's decisions + the idea's own) on the SAME seed,
    iterations and horizon as the run. Returns one engine-number dict per idea, in order.
    An idea's `builds_on` is a scenario name from the run, or "baseline" for a standalone idea."""
    business = run.business
    base = to_baseline(_baseline_at_run_time(business, run))
    tpl = get_template(business.industry)
    parents = _run_decisions(db, run)
    scenario_map = {}
    for i, idea in enumerate(ideas):
        parent = parents.get(idea["builds_on"], [])
        scenario_map[f"idea {i + 1}"] = list(parent) + [EngineDecision.from_dict(d) for d in idea["decisions"]]
    result = run_scenarios(base, tpl, scenario_map, horizon=run.horizon, iterations=run.iterations, seed=run.seed)
    out = []
    for i in range(len(ideas)):
        sm = result.scenarios[f"idea {i + 1}"].summary
        out.append({
            "profit_change_most_likely": round(sm["profit_vs_baseline_p50"]),
            "beats_change_nothing_of_10": int(round(sm["prob_beats_baseline_profit"] * 10)),
            "cash_runs_out_of_10": int(round(sm["prob_cash_negative"] * 10)),
            "profit_bad_case": round(sm["total_profit_p10"]),
            "profit_most_likely": round(sm["total_profit_p50"]),
            "profit_good_case": round(sm["total_profit_p90"]),
        })
    return out


def describe_flat_decisions(decision_dicts: list[dict], currency: str) -> list[str]:
    return [describe_decision(EngineDecision.from_dict(d), currency) for d in decision_dicts]


def preview_starting_month(industry: str, baseline: BusinessBaseline) -> dict:
    """The engine's month 1 for numbers that have not been saved yet (the setup wizard)."""
    return month_one_summary(baseline, get_template(industry))


# ---------- quick start, sample business, Today ----------

def quick_start(industry: str, customers_per_day: float, avg_spend: float, monthly_rent: float, staff: float) -> dict:
    """Four answers -> a full baseline, what was assumed, warnings, and the engine's month 1 for it.
    Raises ValueError (plain reason) for answers that make no sense."""
    tpl = get_template(industry)
    q = quick_baseline(tpl, customers_per_day, avg_spend, monthly_rent, staff)
    return {
        "baseline": q.baseline.to_dict(), "assumed": q.assumed, "warnings": q.warnings,
        "preview": month_one_summary(q.baseline, tpl),
    }


def sample_start(industry: str) -> tuple[dict, list[dict]]:
    """The industry's typical numbers, and the 'assumed' list that says so."""
    tpl = get_template(industry)
    return tpl.default_baseline.to_dict(), sample_assumed(tpl)


def build_today_run_facts(db: Session, run: models.SimulationRun) -> dict:
    """The coach's facts for a 'today' run: how the business looks if nothing changes."""
    business = run.business
    base = to_baseline(_baseline_at_run_time(business, run))
    tpl = get_template(business.industry)
    baseline = next(r for r in run.results if r.scenario_name == "baseline")
    return build_today_facts(base, tpl, baseline.summary, baseline.bands, run.horizon, business.currency)


BASELINE_FIELDS = tuple(BusinessBaseline().to_dict())


def check_baseline(values: dict) -> None:
    """Raise ValueError (plain reason) if these numbers do not make a valid business."""
    BusinessBaseline(**values).validate()


def sketch_change(business: models.Business, kind: str, amount: float, start_month: int) -> dict:
    """The quick "just a sketch" for one change. Read-only. The seed depends only on the business, so the same slider
    position always gives the same picture. Raises ValueError (plain reason) for an amount or month that makes no sense."""
    return preview_change(to_baseline(business.baseline), get_template(business.industry), kind, amount, start_month,
                          seed=1000 + business.id, currency=business.currency)


def quick_answers(snapshot: models.BusinessSnapshot) -> dict:
    """The four answers behind a quick-start business, read back from its numbers ("what you told us")."""
    return answers_from_baseline(to_baseline(snapshot))
