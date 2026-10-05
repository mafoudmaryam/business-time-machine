"""'How we worked it out': which numbers are the owner's own and which we assumed.

Everything here is read from the stored business (its latest snapshot and `assumed_fields`) and from the stored Today run.
Nothing is calculated except reading the four quick-start answers back from the numbers, which the engine does
(`btm_engine.quickstart.answers_from_baseline`). The AI writes nothing on this page.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import engine_bridge, models, schemas
from .today import _UNITS, _labels, assumptions_for, get_today_run

# The order the owner would expect to read them in.
ORDER = ["avg_ticket", "customers", "visits_per_regular", "walk_in_visits", "churn_rate", "seats", "staff_fte", "wage_per_fte",
         "cogs_ratio", "fixed_costs", "marketing", "open_days", "cash"]

# For a quick-start business these were worked out from the owner's four answers, so they are shown as those answers.
_CUSTOMER_PARTS = {"customers", "walk_in_visits", "visits_per_regular", "open_days"}


def _item(key: str, label: str, value: float, unit: str) -> schemas.HowItem:
    return schemas.HowItem(key=key, label=label, value=value, unit=unit)


def told_by_owner(business: models.Business) -> list[schemas.HowItem]:
    snapshot = business.baseline
    tpl = engine_bridge.get_template(business.industry)
    labels = _labels(tpl.customer_noun, tpl.staff_noun)
    assumed = {a["field"] for a in (snapshot.assumed_fields or [])}
    items: list[schemas.HowItem] = []
    handled: set[str] = set()

    if business.setup_source == "quick" and snapshot.assumed_fields:
        answers = engine_bridge.quick_answers(snapshot)
        if _CUSTOMER_PARTS <= assumed:                       # still the numbers the four answers made
            items.append(_item("customers_per_day", "Customers on a normal day", answers["customers_per_day"], "count"))
            handled |= {"customers", "walk_in_visits", "visits_per_regular"}
        if "avg_ticket" not in assumed:
            items.append(_item("avg_spend", "Average spend per customer", answers["avg_spend"], "money"))
            handled.add("avg_ticket")
        if "fixed_costs" in assumed:
            items.append(_item("monthly_rent", "Monthly rent", answers["monthly_rent"], "money"))
            handled.add("fixed_costs")
        if "staff_fte" in assumed:
            items.append(_item("staff", "People who work there", answers["staff"], "count"))
            handled.add("staff_fte")

    # Anything else that is not marked as assumed is the owner's own number (typed in the full setup, or changed later).
    for field in ORDER:
        if field in assumed or field in handled:
            continue
        if business.setup_source == "quick" and field == "open_days" and _CUSTOMER_PARTS <= assumed:
            continue
        items.append(_item(field, labels[field], float(getattr(snapshot, field)), _UNITS[field]))
    return items


def build_how(db: Session, business: models.Business) -> schemas.HowOut:
    run = get_today_run(db, business)
    return schemas.HowOut(
        business_id=business.id, name=business.name, industry=business.industry, currency=business.currency,
        is_sample=business.is_sample, setup_source=business.setup_source,
        told=told_by_owner(business), assumed=assumptions_for(business),
        run=schemas.HowRun(iterations=run.iterations, horizon=run.horizon, engine_version=run.engine_version, seed=run.seed),
    )
