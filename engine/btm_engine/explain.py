"""Explaining a scenario: where the profit difference comes from, and when things happen.

Everything here is plain arithmetic on the engine's own central run (every uncertain
parameter at its middle value, no noise), so the AI coach can talk about the results
without ever computing a number itself.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from .decisions import Decision, build_timeline
from .model import simulate
from .montecarlo import deterministic_draws
from .params import BusinessBaseline, IndustryTemplate

DRIVER_LABELS = {
    "price": "price per sale",
    "visits": "number of visits",
    "ingredients": "ingredient costs",
    "staff": "staff costs",
    "fixed": "marketing and fixed costs",
    "investment": "investment and loan payments",
}


def _central(base: BusinessBaseline, tpl: IndustryTemplate, decisions: list[Decision],
             horizon: int) -> dict[str, np.ndarray]:
    """The central run, plus the monthly effective price and the one-off cash outflows."""
    tl = build_timeline(base, decisions, horizon)
    out = simulate(base, tpl, tl, deterministic_draws(base, tpl))
    run = {k: v[0] for k, v in out.items()}
    run["ticket"] = tl["price"] * tl["ticket_mult"]
    run["outflow"] = tl["investment"] + tl["loan_payment"]
    run["net_profit"] = run["profit"] - run["outflow"]
    return run


def profit_breakdown(base: BusinessBaseline, tpl: IndustryTemplate, decisions: list[Decision],
                     horizon: int = 24) -> dict[str, Any]:
    """Split the total profit difference (scenario minus "change nothing") into drivers.

    "Profit" here is profit after investment and loan payments, i.e. what the owner's
    cash actually gains. The price and visits drivers use the midpoint rule, so the
    six drivers add up exactly to `total` with nothing left over.
    """
    s = _central(base, tpl, decisions, horizon)
    b = _central(base, tpl, [], horizon)
    d_ticket = s["ticket"] - b["ticket"]
    d_visits = s["visits"] - b["visits"]
    drivers = {
        "price": float((d_ticket * (s["visits"] + b["visits"]) / 2).sum()),
        "visits": float((d_visits * (s["ticket"] + b["ticket"]) / 2).sum()),
        "ingredients": float(-(s["cogs"] - b["cogs"]).sum()),
        "staff": float(-(s["labour"] - b["labour"]).sum()),
        "fixed": float(-((s["fixed_costs"] + s["marketing"]) - (b["fixed_costs"] + b["marketing"])).sum()),
        "investment": float(-(s["outflow"] - b["outflow"]).sum()),
    }
    return {
        "total": float(s["net_profit"].sum() - b["net_profit"].sum()),
        "scenario_profit": float(s["net_profit"].sum()),
        "baseline_profit": float(b["net_profit"].sum()),
        "drivers": drivers,
    }


def _first_true(mask: np.ndarray) -> int | None:
    idx = np.flatnonzero(mask)
    return int(idx[0]) + 1 if idx.size else None


def key_moments(base: BusinessBaseline, tpl: IndustryTemplate, decisions: list[Decision],
                horizon: int = 24) -> dict[str, Any]:
    """Months (1-based) where something notable happens in the central run."""
    s = _central(base, tpl, decisions, horizon)
    b = _central(base, tpl, [], horizon)

    full_month = _first_true(s["service_quality"] < 0.995)

    # Biggest one-month fall in regulars (customers[t+1] - customers[t]); month t+1 is where it shows.
    falls = np.diff(s["customers"], prepend=s["customers"][0])
    drop_month = int(np.argmin(falls)) + 1 if falls.min() < -1.0 else None

    low_idx = int(np.argmin(s["cash"]))
    lowest_cash = {"month": low_idx + 1, "amount": float(s["cash"][low_idx])}

    gap = np.cumsum(s["net_profit"] - b["net_profit"])
    crossover = None
    sign = 0
    for t, g in enumerate(gap):
        cur = 1 if g > 0.5 else -1 if g < -0.5 else 0
        if cur != 0 and sign != 0 and cur != sign:
            crossover = {"month": t + 1, "direction": "overtakes" if cur > 0 else "falls_behind"}
            break
        if cur != 0 and sign == 0:
            sign = cur
    return {
        "full_month": full_month,
        "regulars_drop_month": drop_month,
        "regulars_drop_amount": float(-falls.min()) if drop_month else 0.0,
        "lowest_cash": lowest_cash,
        "crossover": crossover,
        "ahead_at_end": bool(gap[-1] > 0),
        "customers_start": float(s["customers"][0]),
        "customers_end": float(s["customers"][-1]),
        "customers_end_baseline": float(b["customers"][-1]),
    }


# ---------- facts for the coach ----------

def round_display(x: float) -> float:
    """Three significant figures: 41234 -> 41200, 4183 -> 4180, 0.4567 -> 0.457."""
    if x == 0 or not math.isfinite(x):
        return 0.0
    digits = 2 - int(math.floor(math.log10(abs(x))))
    r = round(x, digits)
    return float(int(r)) if digits <= 0 else float(r)


def describe_decision(d: Decision, currency: str = "") -> str:
    """One plain-English line, used in the facts so the coach names decisions the same way each time."""
    money = lambda v: f"{v:,.0f} {currency}".strip()  # noqa: E731
    when = f"from month {d.start_month}"
    if d.type == "price":
        if d.unit == "absolute":
            return f"Set the average price to {money(d.value)} {when}"
        return f"{'Raise' if d.value >= 0 else 'Cut'} prices by {abs(d.value):g}% {when}"
    if d.type == "hiring":
        return f"{'Hire' if d.value >= 0 else 'Let go of'} {abs(d.value):g} full-time staff {when}"
    if d.type == "marketing":
        if d.unit == "percent":
            return f"{'Increase' if d.value >= 0 else 'Decrease'} marketing spend by {abs(d.value):g}% {when}"
        return f"Set marketing spend to {money(d.value)} per month {when}"
    if d.type == "hours":
        return f"Open {d.value:g} days per month {when}"
    if d.type == "menu":
        return f"Change the menu so the average sale is {d.value:+g}% {when}"
    if d.type == "investment":
        text = f"Invest {money(d.value)} {when}"
        if d.extra.get("loan_months"):
            text += f", paid back over {int(d.extra['loan_months'])} months"
        if d.extra.get("capacity_pct"):
            text += f", adding {d.extra['capacity_pct']:g}% capacity"
        return text
    return f"{d.type} change {when}"


def _tenths(p: float) -> int:
    return int(round(p * 10))


def build_facts(base: BusinessBaseline, tpl: IndustryTemplate, scenarios: dict[str, list[Decision]],
                summaries: dict[str, dict], horizon: int, currency: str = "USD") -> dict[str, Any]:
    """The only numbers the coach may use. `summaries` are the Monte Carlo summaries of the
    stored run (per scenario name); "baseline" is optional. Numbers are rounded for display."""
    r = round_display
    base_moments = key_moments(base, tpl, [], horizon)
    scen_facts = []
    for name, decs in scenarios.items():
        br = profit_breakdown(base, tpl, decs, horizon)
        mo = key_moments(base, tpl, decs, horizon)
        sm = summaries.get(name, {})
        scen_facts.append({
            "name": name,
            "decisions": [describe_decision(d, currency) for d in decs],
            "profit_total": r(br["scenario_profit"]),
            "profit_change": r(br["total"]),
            "drivers": [{"key": k, "label": DRIVER_LABELS[k], "amount": r(v)} for k, v in br["drivers"].items()],
            "moments": {
                "full_month": mo["full_month"],
                "regulars_drop_month": mo["regulars_drop_month"],
                "regulars_drop_amount": r(mo["regulars_drop_amount"]),
                "lowest_cash_month": mo["lowest_cash"]["month"],
                "lowest_cash_amount": r(mo["lowest_cash"]["amount"]),
                "crossover_month": mo["crossover"]["month"] if mo["crossover"] else None,
                "crossover_direction": mo["crossover"]["direction"] if mo["crossover"] else None,
                "ahead_at_end": mo["ahead_at_end"],
            },
            "regulars_end": r(mo["customers_end"]),
            "regulars_end_if_nothing_changes": r(mo["customers_end_baseline"]),
            "regulars_change_percent": r(100 * (mo["customers_end"] / mo["customers_end_baseline"] - 1))
            if mo["customers_end_baseline"] else 0.0,
            "profit_change_percent": r(100 * br["total"] / abs(br["baseline_profit"])) if br["baseline_profit"] else 0.0,
            "futures": {  # Monte Carlo, "X of 10 futures"
                "beats_change_nothing_of_10": _tenths(sm["prob_beats_baseline_profit"])
                if "prob_beats_baseline_profit" in sm else None,
                "cash_runs_out_of_10": _tenths(sm.get("prob_cash_negative", 0.0)),
                "profit_bad_case": r(sm.get("total_profit_p10", 0.0)),
                "profit_most_likely": r(sm.get("total_profit_p50", 0.0)),
                "profit_good_case": r(sm.get("total_profit_p90", 0.0)),
                "profit_change_most_likely": r(sm.get("profit_vs_baseline_p50", 0.0)),
            },
        })
    b_sm = summaries.get("baseline", {})
    return {
        "business": {
            "industry": tpl.display_name, "customers_word": tpl.customer_noun, "staff_word": tpl.staff_noun,
            "currency": currency, "months": horizon, "years": round(horizon / 12, 1),
            "regulars_today": r(base.customers), "cash_today": r(base.cash),
        },
        "if_you_change_nothing": {
            "profit_total": r(profit_breakdown(base, tpl, [], horizon)["scenario_profit"]),
            "full_month": base_moments["full_month"],
            "lowest_cash_month": base_moments["lowest_cash"]["month"],
            "lowest_cash_amount": r(base_moments["lowest_cash"]["amount"]),
            "profit_most_likely": r(b_sm.get("total_profit_p50", 0.0)),
            "cash_runs_out_of_10": _tenths(b_sm.get("prob_cash_negative", 0.0)),
        },
        "scenarios": scen_facts,
    }
