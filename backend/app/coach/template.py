"""The rule-based coach: plain sentences built straight from the facts. No AI, no cost.

It is the default coach, and the automatic fallback when an AI provider fails.
"""
from __future__ import annotations

from typing import Any

from ..engine_bridge import format_money
from .ideas import choose_diverse, drop_repeated_opening
from .summary import build_summary, decide_verdict, driver_label


def _money(x: float, currency: str) -> str:
    """The amount as the owner sees it in the app ($27,900). The sign is said in words, so it is dropped."""
    return format_money(abs(x), currency)


def _best(facts: dict) -> dict:
    return max(facts["scenarios"], key=lambda s: s["profit_change"])


def _nice(name: str) -> str:
    return f"“{name}”"


def _drivers(s: dict) -> tuple[dict | None, dict | None]:
    ordered = sorted(s["drivers"], key=lambda d: d["amount"])
    worst, best = ordered[0], ordered[-1]
    return (best if best["amount"] > 0 else None), (worst if worst["amount"] < 0 else None)


def _span(months: int) -> str:
    if months % 12 == 0:
        years = months // 12
        return f"{years} year" + ("" if years == 1 else "s")
    return f"{months} months"


HEADLINES = {
    "good": "Nice! This looks like a good move for you.",
    "try": "This could pay off, so it is worth a try.",
    "risky": "This could work, but it is a risky one.",
    "no": "This one probably will not pay off for you.",
}


def _headline(facts: dict) -> str:
    """A short, friendly verdict (12 words at most) with no numbers, so it never repeats the story."""
    best = _best(facts)
    verdict = decide_verdict(best, facts["if_you_change_nothing"].get("cash_runs_out_of_10", 0))
    if len(facts["scenarios"]) == 1:
        return HEADLINES[verdict]
    if verdict == "no":
        return "None of these looks worth it, sorry."
    if len(best["name"].split()) <= 6:
        return f"{_nice(best['name'])} is your best bet" + (", but risky." if verdict == "risky" else ".")
    return "One of these is your best bet."


def _what_happens(facts: dict) -> str:
    """Two short sentences about the scenario that matters most."""
    b, s = facts["business"], _best(facts)
    cur, words = b["currency"], b["customers_word"]
    ch, span = s["profit_change"], _span(b["months"])
    if abs(ch) < 1:
        first = f"Over {span}, you would end up about where you are now."
    else:
        first = (f"Over {span}, you could earn about {_money(ch, cur)} "
                 f"{'more' if ch > 0 else 'less'} than if you change nothing.")
    beats, count = s["futures"]["beats_change_nothing_of_10"], s["regulars_change_count"]
    people = f"about {abs(count):,} {'more' if count > 0 else 'fewer'} {words}" if abs(count) >= 1 else None
    if beats is not None and people:
        second = f"It comes out ahead in {beats} of 10 futures, with {people}."
    elif beats is not None:
        second = f"It comes out ahead in {beats} of 10 futures."
    elif people:
        second = f"You would end with {people}."
    else:
        return first
    return f"{first} {second}"


def _why(facts: dict) -> str:
    """Up to two short sentences: your biggest boost and your biggest drag."""
    cur, s = facts["business"]["currency"], _best(facts)
    help_, drag = _drivers(s)
    out = []
    if help_:
        out.append(f"Your biggest boost is {driver_label(help_['key'], help_['amount']).lower()}, "
                   f"worth about {_money(help_['amount'], cur)}.")
    if drag:
        out.append(f"Your biggest drag is {driver_label(drag['key'], drag['amount']).lower()}, "
                   f"costing about {_money(drag['amount'], cur)}.")
    if not out:
        out.append("Nothing moves much, so you stay close to where you are today.")
    return " ".join(out)


def _watch_out(facts: dict) -> list[str]:
    """One short warning line, and only when there is a real risk. Otherwise nothing."""
    summary = build_summary(facts)
    if not summary["has_risk"]:
        return []
    s, b = _best(facts), facts["business"]
    m, f, flag = s["moments"], s["futures"], summary["risk_flags"][0]
    if flag == "cash":
        if f["cash_runs_out_of_10"] >= 1:
            return [f"Your cash could run out in {f['cash_runs_out_of_10']} of 10 futures, so watch it closely."]
        return [f"Your cash could dip below zero around month {m['lowest_cash_month']}."]
    if flag == "busy":
        return [f"You may get too busy around month {m['full_month']}, so service could slip."]
    if flag == "regulars":
        return [f"You could lose about {abs(s['regulars_change_count']):,} {b['customers_word']}, so keep them happy."]
    return ["This one could swing either way, so start small."]


def _idea(title: str, why: str, builds_on: str, decisions: list[dict]) -> dict:
    return {"title": title, "why": why, "builds_on": builds_on, "decisions": decisions}


def _ideas(facts: dict, raw: dict[str, list[dict]]) -> list[dict]:
    """Rule-based ideas. Each rule adds one idea; the engine tests every one of them afterwards."""
    staff = facts["business"]["staff_word"]
    best = _best(facts)
    mine = raw.get(best["name"], [])
    m = best["moments"]
    ideas: list[dict] = []

    if m["full_month"] and not any(d["type"] == "hiring" for d in mine):
        ideas.append(_idea(
            f"Add one more {staff}",
            f"You get busy around month {m['full_month']}. An extra {staff} keeps service quick.",
            best["name"], [{"type": "hiring", "start_month": max(1, m["full_month"] - 1), "value": 1, "unit": "fte"}]))
    for d in mine:
        if d["type"] == "price" and d["unit"] == "percent" and d["value"] >= 4:
            half = round(d["value"] / 2, 1)
            ideas.append(_idea(
                f"Try a gentler {half:g}% price rise",
                "A smaller step may keep more regulars coming.",
                "baseline", [{"type": "price", "start_month": d["start_month"], "value": half, "unit": "percent"}]))
        if d["type"] == "investment" and not d.get("loan_months") and d["value"] > 0:
            loan = {"type": "investment", "start_month": d["start_month"], "value": d["value"], "unit": "amount",
                    "loan_months": 24, "annual_rate": 0.06}
            if d.get("capacity_pct"):
                loan["capacity_pct"] = d["capacity_pct"]
            ideas.append(_idea(
                "Spread the cost with a loan",
                "Paying over time keeps more cash in your bank.",
                "baseline", [loan]))
    fillers = [
        _idea("Nudge your prices up", "A small step is easy to try and easy to undo.",
              "baseline", [{"type": "price", "start_month": 2, "value": 3, "unit": "percent"}]),
        _idea("Add a tempting menu extra", "One extra item can lift what each guest spends.",
              "baseline", [{"type": "menu", "start_month": 3, "value": 4, "unit": "percent"}]),
        _idea("Spend a little more on marketing", "More people may hear about you.",
              "baseline", [{"type": "marketing", "start_month": 2, "value": 20, "unit": "percent"}]),
        _idea(f"Add one more {staff}", f"An extra {staff} helps you serve more people.",
              "baseline", [{"type": "hiring", "start_month": 3, "value": 1, "unit": "fte"}]),
    ]
    # One idea per area (price / menu or marketing / costs or hours), never two of the same kind, preferring
    # areas the owner's scenarios do not already use.
    used_types = {d["type"] for decs in raw.values() for d in decs}
    return choose_diverse(ideas + fillers, used_types, 3)


def build_coach(facts: dict, raw_decisions: dict[str, list[dict]]) -> dict[str, Any]:
    headline = _headline(facts)
    return {
        "headline": headline,
        "what_happens": drop_repeated_opening(headline, _what_happens(facts)),
        "why": _why(facts),
        "watch_out": _watch_out(facts),
        "ideas": _ideas(facts, raw_decisions),
    }


def _find(facts: dict, question: str) -> dict:
    q = question.lower()
    for s in facts["scenarios"]:
        if s["name"].lower() in q:
            return s
    return _best(facts)


def answer(facts: dict, question: str) -> str:
    """Keyword-based answers from the facts. Honest when it cannot tell."""
    q, b = question.lower(), facts["business"]
    s, cur, words = _find(facts, question), b["currency"], b["customers_word"]
    m, f = s["moments"], s["futures"]
    if any(w in q for w in ("cash", "bank", "money left", "run out", "broke")):
        below = " below zero" if m["lowest_cash_amount"] < 0 else ""
        return (f"With {_nice(s['name'])}, your cash is lowest around month {m['lowest_cash_month']}, at about "
                f"{_money(m['lowest_cash_amount'], cur)}{below}. It runs out in {f['cash_runs_out_of_10']} of 10 futures.")
    if any(w in q for w in (words, "customer", "regular", "guest", "visit")):
        return (f"With {_nice(s['name'])}, you would end with about {s['regulars_end']:,.0f} {words}, compared with "
                f"{s['regulars_end_if_nothing_changes']:,.0f} if you change nothing.")
    if any(w in q for w in ("busy", "full", "capacity", "staff", "hire")):
        if m["full_month"]:
            return f"With {_nice(s['name'])}, you get too busy for your team around month {m['full_month']}."
        return f"With {_nice(s['name'])}, your team keeps up with demand for the whole {b['months']} months."
    if any(w in q for w in ("risk", "safe", "worry", "chance", "likely", "future")):
        return (f"With {_nice(s['name'])}, it comes out ahead of changing nothing in "
                f"{f['beats_change_nothing_of_10']} of 10 futures, and cash runs out in {f['cash_runs_out_of_10']} of 10.")
    if any(w in q for w in ("profit", "earn", "make", "worth", "better", "best", "why")):
        return _what_happens(facts) + " " + _why(facts)
    return ("I can only answer from the results of this simulation, and I can't tell from these results. "
            "You could run a new simulation to find out.")
