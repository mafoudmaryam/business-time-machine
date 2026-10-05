"""A quick sketch of one change, for the "Try a change" sliders.

The owner moves a slider; this runs the same engine as a full simulation, but with fewer Monte Carlo runs, for ONE
change over 12 months, and packages the numbers the page shows. It is the owner's own input (a slider, not words an AI
read), so it may be shown before they confirm anything. It is never stored and the AI never explains it (golden rule 2).

Same input, same seed -> same answer, so the picture does not jitter while the owner drags.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .decisions import Decision
from .explain import describe_decision
from .montecarlo import ENGINE_VERSION, run_scenarios
from .params import BusinessBaseline, IndustryTemplate

SKETCH_HORIZON = 12
SKETCH_ITERATIONS = 300     # a full run uses 1,000; 300 keeps the answer well under a second

# change type -> (unit the engine uses, lowest and highest amount the sketch accepts, what the amount means)
SKETCH_TYPES: dict[str, tuple[str, float, float, str]] = {
    "price": ("percent", -20.0, 30.0, "percent change in prices"),
    "hours": ("days", 1.0, 31.0, "days open each month"),
    "hiring": ("fte", -5.0, 5.0, "full-time people to add (negative: fewer)"),
    "marketing": ("percent", -50.0, 300.0, "percent change in marketing spend"),
}


def sketch_decision(kind: str, amount: float, start_month: int) -> Decision:
    """The engine decision for one slider position. Raises ValueError with a plain reason."""
    if kind not in SKETCH_TYPES:
        raise ValueError(f"a sketch can try: {', '.join(SKETCH_TYPES)}")
    if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not np.isfinite(amount):
        raise ValueError("the amount must be a number")
    unit, low, high, meaning = SKETCH_TYPES[kind]
    if not low <= amount <= high:
        raise ValueError(f"{meaning}: choose between {low:g} and {high:g}")
    decision = Decision(type=kind, start_month=int(start_month), value=float(amount), unit=unit)
    decision.validate(SKETCH_HORIZON)
    return decision


def _lowest(cash_p50: list[float]) -> tuple[float, int]:
    i = int(np.argmin(cash_p50))
    return float(cash_p50[i]), i + 1


def _path(bands: dict[str, dict[str, list[float]]]) -> dict[str, Any]:
    amount, month = _lowest(bands["cash"]["p50"])
    return {
        "profit": bands["profit"], "cash": bands["cash"], "customers": bands["customers"],
        "lowest_cash_amount": round(amount, 2), "lowest_cash_month": month,
    }


def preview_change(base: BusinessBaseline, tpl: IndustryTemplate, kind: str, amount: float, start_month: int,
                   seed: int, iterations: int = SKETCH_ITERATIONS, currency: str = "") -> dict[str, Any]:
    """Run the sketch. Everything numeric in the answer comes from the engine's own run."""
    decision = sketch_decision(kind, amount, start_month)
    result = run_scenarios(base, tpl, {"change": [decision]}, horizon=SKETCH_HORIZON, iterations=iterations, seed=seed)
    change, nothing = result.scenarios["change"], result.scenarios["baseline"]
    h = SKETCH_HORIZON

    visits_with = float(np.mean(change.bands["visits"]["p50"]))
    visits_without = float(np.mean(nothing.bands["visits"]["p50"]))
    # What the owner keeps each month: the typical (median) 12-month profit, spread over 12 months. The "with the
    # change" figure is "without" plus the typical gain, so the three numbers on the page always add up exactly (the
    # median of the gains is not the same as the gap between two medians, and a page where 5,562 + 534 shows 6,107
    # looks like a mistake).
    without = round(nothing.summary["total_profit_p50"] / h, 2)
    extra = round(change.summary["profit_vs_baseline_p50"] / h, 2)
    out: dict[str, Any] = {
        "engine_version": ENGINE_VERSION, "seed": seed, "iterations": iterations, "horizon": h,
        "sentence": describe_decision(decision, currency),
        "extra_profit_per_month": extra,
        "profit_per_month_with_change": round(without + extra, 2),
        "profit_per_month_without": without,
        "visits_change_per_month": round(visits_with - visits_without, 1),
        "visits_per_month_without": round(visits_without, 1),
        "ahead_of_10": int(round(change.summary["prob_beats_baseline_profit"] * 10)),
        "cash_now": base.cash,
        "change": _path(change.bands),
        "baseline": _path(nothing.bands),
    }
    if kind == "price":
        out["example"] = {"before": round(base.avg_ticket, 2), "after": round(base.avg_ticket * (1 + amount / 100), 2)}
    return out
