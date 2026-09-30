"""The skimmable part of the coach card: verdict badge, number tiles, "why" bars, risk check.

Everything here is decided by fixed rules from the engine's facts. The AI never chooses the
verdict, the numbers, or the bars.
"""
from __future__ import annotations

MAX_BARS = 4

VERDICT_LABELS = {
    "good": "Good idea",
    "try": "Worth a try",
    "risky": "Risky",
    "no": "Not worth it",
}


def pick_focus(facts: dict) -> dict:
    """The scenario the card is about: the one with the biggest profit gain."""
    return max(facts["scenarios"], key=lambda s: s["profit_change"])


def decide_verdict(scenario: dict, nothing_cash_risk: int = 0) -> str:
    """One of good / try / risky / no. Rules, in this order:

    1. Loses money (profit change <= 0) and beats "change nothing" in 4 or fewer of 10 futures -> no
    2. Loses money otherwise -> risky
    3. Cash is much more likely to run out than if you change nothing (2+ more futures, or 3+ of 10
       and at least 1 more) -> risky
    4. Beats "change nothing" in 8+ of 10 futures -> good
    5. Beats it in 6-7 of 10 futures -> try
    6. Otherwise (a coin flip) -> risky
    """
    change = scenario["profit_change"]
    beats = scenario["futures"]["beats_change_nothing_of_10"]
    beats = 0 if beats is None else beats
    cash = scenario["futures"]["cash_runs_out_of_10"]
    extra_cash = cash - nothing_cash_risk

    if change <= 0:
        return "no" if beats <= 4 else "risky"
    if extra_cash >= 2 or (cash >= 3 and extra_cash >= 1):
        return "risky"
    if beats >= 8:
        return "good"
    if beats >= 6:
        return "try"
    return "risky"


def risk_flags(scenario: dict, nothing: dict, verdict: str) -> list[str]:
    """Real risks worth a warning line, most serious first. Empty when there is nothing to warn about."""
    m, f = scenario["moments"], scenario["futures"]
    flags: list[str] = []
    if f["cash_runs_out_of_10"] > nothing.get("cash_runs_out_of_10", 0) or (
            m["lowest_cash_amount"] < 0 and nothing.get("lowest_cash_amount", 0) >= 0):
        flags.append("cash")
    if m["full_month"] and not nothing.get("full_month"):
        flags.append("busy")
    if scenario["regulars_change_percent"] <= -5:
        flags.append("regulars")
    if not flags and verdict in ("risky", "no"):
        flags.append("swing")
    return flags


def driver_label(key: str, amount: float) -> str:
    """Plain words for a profit driver, with the direction built in."""
    helps = amount >= 0
    return {
        "price": "Higher prices" if helps else "Lower prices",
        "menu": "Menu" if helps else "Menu costs",
        "visits": "More visits" if helps else "Fewer visits",
        "ingredients": "Ingredients",
        "staff": "Staff",
        "fixed": "Marketing and running costs",
        "investment": "Investment",
    }.get(key, key.capitalize())


def build_bars(scenario: dict) -> list[dict]:
    """Up to four biggest profit drivers, largest first, each with its plain label and amount."""
    drivers = [d for d in scenario["drivers"] if round(d["amount"]) != 0]
    drivers.sort(key=lambda d: abs(d["amount"]), reverse=True)
    return [{"key": d["key"], "label": driver_label(d["key"], d["amount"]), "amount": d["amount"]}
            for d in drivers[:MAX_BARS]]


def build_tiles(facts: dict, focus: dict) -> list[dict]:
    """The three "now -> later" tiles. `later` is the end of the period with this plan; `now` is today
    (a typical month for profit, the cash pile and the regulars you have today)."""
    business = facts["business"]
    return [
        {"key": "profit", "now": focus["monthly_profit_now"], "later": focus["monthly_profit_end"]},
        {"key": "cash", "now": business["cash_today"], "later": focus["cash_end"]},
        {"key": "customers", "now": business["regulars_today"], "later": focus["regulars_end"]},
    ]


def build_summary(facts: dict) -> dict:
    """Everything the skimmable card needs. Numbers come straight from the facts."""
    focus = pick_focus(facts)
    nothing = facts["if_you_change_nothing"]
    key = decide_verdict(focus, nothing.get("cash_runs_out_of_10", 0))
    flags = risk_flags(focus, nothing, key)
    return {
        "tiles": build_tiles(facts, focus),
        "customers_word": facts["business"]["customers_word"],
        "scenario": focus["name"],
        "verdict": {"key": key, "label": VERDICT_LABELS[key]},
        "months": facts["business"]["months"],
        "profit_change": focus["profit_change"],
        "better_of_10": focus["futures"]["beats_change_nothing_of_10"],
        "regulars_change_count": focus["regulars_change_count"],
        "regulars_change_percent": focus["regulars_change_percent"],
        "bars": build_bars(focus),
        "risk_flags": flags,
        "has_risk": bool(flags),
    }
