"""The journal: the owner's real figures for a month, set against what the Today forecast said.

Everything here is plain code. The owner's figures are their own input (no AI reads them, nothing to confirm), the expected
range is read from a stored Today run, the comparison is arithmetic in `btm_engine.journal`, and the sentences are
templates. No AI writes anything on this page, so the grounding check has nothing to check; if AI wording is ever added,
it must pass `coach.grounding` and `coach.consistency` and this template text must stay as the fallback.

Which forecast counts as "what we expected" for a month? The latest stored Today run made BEFORE that month began and
covering it (a run made in October covers November as its month 1). A run made during the month itself, or later, is never
used: it would be hindsight. If there is none, the month is saved but not compared, and the page says so.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy.orm import Session

from . import engine_bridge, models, schemas
from .today import MONTH_LONG

METRICS = ("profit", "cash", "visits")
DUE_LOOK_BACK = 3          # months that ended, offered as "How did X really go?"


def now() -> dt.datetime:          # one place to replace in tests
    return dt.datetime.utcnow()


def parse_month(month: str) -> tuple[int, int]:
    year, mon = month.split("-")
    return int(year), int(mon)


def month_key(year: int, mon: int) -> str:
    return f"{year:04d}-{mon:02d}"


def month_label(month: str) -> str:
    year, mon = parse_month(month)
    return f"{MONTH_LONG[mon - 1]} {year}"


def is_future(month: str, at: Optional[dt.datetime] = None) -> bool:
    """True for a month that has not started yet. The current month is allowed (an owner may fill it in at the end)."""
    at = at or now()
    return parse_month(month) > (at.year, at.month)


def prediction_for(db: Session, business: models.Business, month: str) -> Optional[tuple[models.SimulationRun, int]]:
    """(the Today run to compare with, the index of this month inside its arrays), or None."""
    year, mon = parse_month(month)
    runs = (db.query(models.SimulationRun)
            .filter_by(business_id=business.id, kind="today")
            .filter(models.SimulationRun.deleted_at.is_(None))
            .order_by(models.SimulationRun.created_at.desc(), models.SimulationRun.id.desc()))
    for run in runs:
        idx = engine_bridge.months_between(run.created_at.year, run.created_at.month, year, mon)
        if 1 <= idx <= run.horizon:
            return run, idx - 1
    return None


# ---------- sentences (templates) ----------

_WHERE = {"inside": "so it landed inside the range we showed", "below": "so it came in below the range",
          "above": "so it came in better than the range"}


def _comparison_sentence(metric: str, c: dict, currency: str) -> str:
    money = lambda v: engine_bridge.format_money(v, currency)  # noqa: E731
    whole = lambda v: f"{round(v):,}"  # noqa: E731
    where = _WHERE[c["position"]]
    if metric == "profit":
        verb = "You made about" if c["actual"] >= 0 else "You lost about"
        return (f"{verb} {money(abs(c['actual']))}. We expected {money(c['expected_low'])} to {money(c['expected_high'])}, "
                f"most likely {money(c['expected'])}, {where}.")
    if metric == "cash":
        return (f"You ended the month with about {money(c['actual'])} in the bank. We expected {money(c['expected_low'])} to "
                f"{money(c['expected_high'])}, most likely {money(c['expected'])}, {where}.")
    return (f"You had about {whole(c['actual'])} customer visits. We expected {whole(c['expected_low'])} to "
            f"{whole(c['expected_high'])}, most likely {whole(c['expected'])}, {where}.")


def compare_entry(db: Session, business: models.Business, entry: models.JournalEntry) -> schemas.JournalMonthOut:
    actuals = {"profit": entry.actual_profit, "cash": entry.actual_cash, "visits": entry.actual_visits}
    out = schemas.JournalEntryOut(
        id=entry.id, business_id=entry.business_id, month=entry.month, month_label=month_label(entry.month),
        actual_profit=entry.actual_profit, actual_cash=entry.actual_cash, actual_visits=entry.actual_visits,
        note=entry.note, created_at=entry.created_at)
    found = prediction_for(db, business, entry.month)
    if found is None:
        return schemas.JournalMonthOut(
            entry=out, has_prediction=False, comparisons=[],
            summary=f"We had no forecast for {month_label(entry.month)}, so there is nothing to compare it with. "
                    f"Your figures are saved.")
    run, idx = found
    baseline = next(r for r in run.results if r.scenario_name == "baseline")
    comparisons = []
    for metric in METRICS:
        band = baseline.bands[metric]
        c = engine_bridge.compare_month(actuals[metric], band["p10"][idx], band["p50"][idx], band["p90"][idx])
        comparisons.append(schemas.JournalComparisonOut(
            metric=metric, sentence=_comparison_sentence(metric, c, business.currency),
            **{k: c[k] for k in ("actual", "expected_low", "expected", "expected_high", "difference",
                                 "percent_difference", "position")}))
    return schemas.JournalMonthOut(entry=out, has_prediction=True, prediction_run_id=run.id, comparisons=comparisons,
                                   summary=comparisons[0].sentence)


def live_entries(db: Session, business_id: int) -> list[models.JournalEntry]:
    return (db.query(models.JournalEntry)
            .filter_by(business_id=business_id).filter(models.JournalEntry.deleted_at.is_(None))
            .order_by(models.JournalEntry.month.desc()).all())


def due_months(db: Session, business: models.Business, at: Optional[dt.datetime] = None) -> list[schemas.JournalDueOut]:
    """Months that have ended, that we made a forecast for, and that the owner has not written down (or removed)."""
    at = at or now()
    taken = {m for (m,) in db.query(models.JournalEntry.month).filter_by(business_id=business.id)}   # deleted ones too
    first = (business.created_at.year, business.created_at.month)
    out = []
    year, mon = at.year, at.month
    for _ in range(DUE_LOOK_BACK):
        mon -= 1
        if mon == 0:
            year, mon = year - 1, 12
        key = month_key(year, mon)
        if (year, mon) < first or key in taken:
            continue
        if prediction_for(db, business, key) is not None:
            out.append(schemas.JournalDueOut(month=key, month_label=month_label(key)))
    return out


def accuracy_of(months: list[schemas.JournalMonthOut]) -> list[schemas.JournalAccuracyOut]:
    out = []
    for metric in METRICS:
        rows = [c.model_dump() for m in months for c in m.comparisons if c.metric == metric]
        if rows:
            out.append(schemas.JournalAccuracyOut(metric=metric, **engine_bridge.accuracy_summary(rows)))
    return out


def forecast_of(db: Session, business: models.Business) -> Optional[schemas.JournalForecast]:
    """The profit band for the chart, month by month. Read-only: never starts a run.

    It runs from the earliest month the owner wrote down that we had a forecast for (or the start of the latest forecast,
    if that is earlier) to the end of the latest forecast. Each month shows the band that applied to it, the same one the
    comparison used, so a dot always sits against the forecast it was judged by."""
    latest = (db.query(models.SimulationRun).filter_by(business_id=business.id, kind="today")
              .filter(models.SimulationRun.deleted_at.is_(None))
              .order_by(models.SimulationRun.created_at.desc(), models.SimulationRun.id.desc()).first())
    if latest is None:
        return None
    first = (latest.created_at.year, latest.created_at.month + 1)
    if first[1] == 13:
        first = (first[0] + 1, 1)
    last = latest.created_at.year * 12 + latest.created_at.month + latest.horizon
    for entry in live_entries(db, business.id):
        if prediction_for(db, business, entry.month) is not None:
            first = min(first, parse_month(entry.month))
    months = []
    index = first[0] * 12 + first[1] - 1
    while index <= last - 1 and len(months) < 36:
        key = month_key(index // 12, index % 12 + 1)
        found = prediction_for(db, business, key)
        if found is not None:
            run, i = found
            band = next(r for r in run.results if r.scenario_name == "baseline").bands["profit"]
            months.append(schemas.JournalForecastMonth(
                month=key, month_label=month_label(key), p10=band["p10"][i], p50=band["p50"][i], p90=band["p90"][i]))
        index += 1
    return schemas.JournalForecast(run_id=latest.id, months=months)


def build_journal(db: Session, business: models.Business) -> schemas.JournalOut:
    months = [compare_entry(db, business, e) for e in live_entries(db, business.id)]
    return schemas.JournalOut(
        business_id=business.id, currency=business.currency, is_sample=business.is_sample, entries=months,
        due=due_months(db, business), accuracy=accuracy_of(months), forecast=forecast_of(db, business))


def accuracy_report(db: Session, include_samples: bool = False) -> schemas.JournalAccuracyReport:
    """Every compared month across all businesses (the thesis table), with the run's seed so each row can be reproduced."""
    rows, by_metric = [], {m: [] for m in METRICS}
    entries = (db.query(models.JournalEntry).join(models.Business)
               .filter(models.JournalEntry.deleted_at.is_(None), models.Business.deleted_at.is_(None))
               .order_by(models.JournalEntry.business_id, models.JournalEntry.month))
    for entry in entries:
        business = entry.business
        if business.is_sample and not include_samples:
            continue
        compared = compare_entry(db, business, entry)
        if not compared.has_prediction:
            continue
        run = db.get(models.SimulationRun, compared.prediction_run_id)
        for c in compared.comparisons:
            by_metric[c.metric].append(c.model_dump())
            rows.append(schemas.JournalAccuracyRow(
                business_id=business.id, month=entry.month, metric=c.metric, actual=c.actual,
                expected_low=c.expected_low, expected=c.expected, expected_high=c.expected_high,
                difference=c.difference, percent_difference=c.percent_difference, position=c.position,
                engine_version=run.engine_version, seed=run.seed, iterations=run.iterations))
    totals = [schemas.JournalAccuracyOut(metric=m, **engine_bridge.accuracy_summary(by_metric[m]))
              for m in METRICS if by_metric[m]]
    return schemas.JournalAccuracyReport(rows=rows, totals=totals)
