"""The Today page: how the business looks if nothing changes, and where its numbers came from.

The run behind it is a normal stored simulation run (kind "today", baseline only, 12 months, 1,000 futures,
a seed that depends only on the business), so it is reproducible and the coach's usual logging applies.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy.orm import Session

from . import engine_bridge, models, schemas
from .coach import today as today_note
from .interpret.months import calendar_of

TODAY_HORIZON = 12
TODAY_ITERATIONS = 1000
MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# field -> (plain label, unit). Customer words come from the industry (regulars / guests / customers).
_UNITS = {
    "customers": "count", "walk_in_visits": "count", "visits_per_regular": "number", "fixed_costs": "money",
    "marketing": "money", "cash": "money", "staff_fte": "count", "wage_per_fte": "money", "cogs_ratio": "percent",
    "churn_rate": "percent", "seats": "count", "open_days": "days", "avg_ticket": "money",
}
_IMPORTANT = ("cash", "fixed_costs", "staff_fte", "marketing")


def _labels(customer_noun: str, staff_noun: str) -> dict[str, str]:
    regulars = customer_noun.capitalize() if customer_noun == "regulars" else f"Regular {customer_noun}"
    return {
        "customers": regulars,
        "walk_in_visits": f"Walk-in {customer_noun} each month",
        "visits_per_regular": "Visits per regular each month",
        "fixed_costs": "Rent and other fixed bills each month",
        "marketing": "Marketing each month",
        "cash": "Cash in the bank",
        "staff_fte": "Staff (full-time people)",
        "wage_per_fte": "Pay per full-time person each month",
        "cogs_ratio": "Ingredient costs (share of sales)",
        "churn_rate": "Regulars who stop coming each month",
        "seats": "Seats",
        "open_days": "Days open each month",
        "avg_ticket": "Average spend per customer",
    }


MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
              "November", "December"]


def labels_from(start: dt.date, horizon: int, long: bool = False) -> list[str]:
    """'Nov 2026' (or 'November 2026') for each simulation month; month 1 is the month after `start`."""
    names = MONTH_LONG if long else MONTH_SHORT
    out = []
    for m in range(1, horizon + 1):
        year, month = calendar_of(m, start)
        out.append(f"{names[month - 1]} {year}")
    return out


def month_labels(run: models.SimulationRun) -> list[str]:
    """'Nov 2026' ... for each simulation month. Month 1 is the month after the run was made."""
    return labels_from(run.created_at.date(), run.horizon)


def assumptions_for(business: models.Business) -> list[schemas.AssumptionOut]:
    """The numbers the app filled in for this owner (empty if they typed every one)."""
    snapshot = business.baseline
    if snapshot is None or not snapshot.assumed_fields:
        return []
    tpl = engine_bridge.get_template(business.industry)
    labels = _labels(tpl.customer_noun, tpl.staff_noun)
    seen: set[str] = set()
    out = []
    for item in snapshot.assumed_fields:
        field = item["field"]
        if field in seen or field not in _UNITS:
            continue
        seen.add(field)
        value = float(getattr(snapshot, field))
        out.append(schemas.AssumptionOut(
            field=field, label=labels[field], value=value, unit=_UNITS[field], rule=item["rule"],
            important=field in _IMPORTANT,
        ))
    out.sort(key=lambda a: (not a.important, _IMPORTANT.index(a.field) if a.field in _IMPORTANT else 99))
    return out


def get_today_run(db: Session, business: models.Business, now: Optional[dt.datetime] = None) -> models.SimulationRun:
    """The latest 'today' run, if it is still current: made this calendar month, after the latest numbers.
    Otherwise a new one (so month 1 is always the month after now, and edits show up at once)."""
    now = now or dt.datetime.utcnow()
    snapshot = business.baseline
    run = (db.query(models.SimulationRun)
           .filter_by(business_id=business.id, kind="today").order_by(models.SimulationRun.id.desc()).first())
    if (run is not None and run.created_at >= snapshot.created_at
            and (run.created_at.year, run.created_at.month) == (now.year, now.month)):
        return run
    return engine_bridge.run_simulation(db, business, [], TODAY_HORIZON, TODAY_ITERATIONS, 1000 + business.id,
                                        kind="today")


def build_today(db: Session, business: models.Business, with_note: bool = True) -> schemas.TodayOut:
    """The Today payload. With `with_note=False` (the plain summary for the share page) no coach note is started: no AI job, no row."""
    run = get_today_run(db, business)
    facts = engine_bridge.build_today_run_facts(db, run)
    t = facts["today"]
    labels = month_labels(run)
    baseline = next(r for r in run.results if r.scenario_name == "baseline")

    note = None
    if with_note:
        try:
            note = schemas.TodayNoteOut(**today_note.start_note(db, run, facts))
        except today_note.CoachDisabled:
            pass

    snapshot = business.baseline
    return schemas.TodayOut(
        business_id=business.id, name=business.name, industry=business.industry, currency=business.currency,
        is_sample=business.is_sample, setup_source=business.setup_source, run_id=run.id, horizon=run.horizon, engine_version=run.engine_version,
        seed=run.seed, iterations=run.iterations, month_labels=labels,
        tiles=schemas.TodayTilesOut(
            profit_a_month=t["profit_a_month"], profit_a_month_bad_case=t["profit_a_month_bad_case"],
            profit_a_month_good_case=t["profit_a_month_good_case"], cash_now=t["cash_now"],
            months_of_bills_covered=t["months_of_bills_covered"], cash_runs_out_of_10=t["cash_runs_out_of_10"],
            lowest_cash_amount=t["lowest_cash_amount"], lowest_cash_month=t["lowest_cash_month"],
            lowest_cash_month_label=labels[t["lowest_cash_month"] - 1],
        ),
        profit=schemas.Band(**baseline.bands["profit"]), cash=schemas.Band(**baseline.bands["cash"]),
        note=note, assumptions=assumptions_for(business), assumed_by_app=bool(snapshot.assumed_fields),
    )
