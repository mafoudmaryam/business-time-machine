"""The rule-based coach: plain sentences built straight from the facts. No AI, no cost.

It is the default coach, and the automatic fallback when an AI provider fails.
"""
from __future__ import annotations

from typing import Any

from ..engine_bridge import format_money
from .ideas import drop_repeated_opening, is_repeat


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


def _scenario_sentence(s: dict, b: dict) -> str:
    cur = b["currency"]
    ch = s["profit_change"]
    span = f"{b['months']} months"
    if abs(ch) < 1:
        line = f"{_nice(s['name'])} ends up about the same as changing nothing over {span}."
    else:
        line = (f"With {_nice(s['name'])}, you could make about {_money(ch, cur)} "
                f"{'more' if ch > 0 else 'less'} profit than if you change nothing over {span}.")
    beats = s["futures"]["beats_change_nothing_of_10"]
    if beats is not None:
        line += f" It comes out ahead in {beats} of 10 futures."
    return line


def _verdict(s: dict) -> str:
    ch, beats = s["profit_change"], s["futures"]["beats_change_nothing_of_10"]
    if abs(ch) < 1:
        return "would change very little"
    if ch > 0:
        return "looks like a good move" if beats is not None and beats >= 7 else "could pay off, but not in every future"
    return "would probably cost you money"


def _headline(facts: dict) -> str:
    """A short verdict with no numbers, so it does not repeat the first sentence of the story."""
    best = _best(facts)
    if len(facts["scenarios"]) == 1:
        return f"{_nice(best['name'])} {_verdict(best)}."
    if best["profit_change"] <= 0:
        return "None of these choices beats changing nothing on profit."
    return f"{_nice(best['name'])} looks like your strongest choice."


def _what_happens(facts: dict) -> str:
    b = facts["business"]
    parts = [_scenario_sentence(s, b) for s in facts["scenarios"]]
    s = _best(facts)
    m, words = s["moments"], b["customers_word"]
    count, pct = s["regulars_change_count"], s["regulars_change_percent"]
    if abs(count) >= 1:
        about_pct = f" (about {abs(pct)}%)" if abs(pct) >= 1 else ""
        parts.append(f"You would end with about {abs(count):,} {'more' if count > 0 else 'fewer'} {words} "
                     f"than if you change nothing{about_pct}.")
    if m["crossover_month"]:
        verb = "pulls ahead of" if m["crossover_direction"] == "overtakes" else "falls behind"
        parts.append(f"{_nice(s['name'])} {verb} changing nothing around month {m['crossover_month']}.")
    return " ".join(parts)


def _why(facts: dict) -> str:
    cur, s = facts["business"]["currency"], _best(facts)
    help_, drag = _drivers(s)
    out = []
    if help_:
        out.append(f"The biggest help is {help_['label']}, worth about {_money(help_['amount'], cur)}.")
    if drag:
        out.append(f"The biggest drag is {drag['label']}, costing about {_money(drag['amount'], cur)}.")
    if not out:
        out.append("Nothing moves much, so the result stays close to what you have today.")
    return " ".join(out)


def _watch_out(facts: dict) -> list[str]:
    b, notes = facts["business"], []
    words, staff = b["customers_word"], b["staff_word"]
    for s in facts["scenarios"]:
        m, f, n = s["moments"], s["futures"], _nice(s["name"])
        if f["cash_runs_out_of_10"] >= 1:
            notes.append(f"With {n}, your cash runs out in {f['cash_runs_out_of_10']} of 10 futures, "
                         "so keep a close eye on the bank balance.")
        elif m["lowest_cash_amount"] < 0:
            notes.append(f"With {n}, cash dips below zero around month {m['lowest_cash_month']}.")
        if m["full_month"]:
            notes.append(f"With {n}, you get too busy for your {staff} team around month {m['full_month']}, "
                         "and service could slip.")
        if m["regulars_drop_month"] and m["regulars_drop_amount"] >= 5:
            notes.append(f"With {n}, the biggest drop in {words} comes around month {m['regulars_drop_month']}.")
    if not notes:
        notes.append(f"Nothing alarming shows up, but check in on your {words} and your cash every few months.")
    return notes[:3]


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
            f"You get too busy around month {m['full_month']}, so an extra {staff} could keep service quick.",
            best["name"], [{"type": "hiring", "start_month": max(1, m["full_month"] - 1), "value": 1, "unit": "fte"}]))
    for d in mine:
        if d["type"] == "price" and d["unit"] == "percent" and d["value"] >= 4:
            half = round(d["value"] / 2, 1)
            ideas.append(_idea(
                f"Try a gentler price rise of {half:g}%",
                "A smaller step may keep more of your regulars coming back.",
                "baseline", [{"type": "price", "start_month": d["start_month"], "value": half, "unit": "percent"}]))
        if d["type"] == "investment" and not d.get("loan_months") and d["value"] > 0:
            loan = {"type": "investment", "start_month": d["start_month"], "value": d["value"], "unit": "amount",
                    "loan_months": 24, "annual_rate": 0.06}
            if d.get("capacity_pct"):
                loan["capacity_pct"] = d["capacity_pct"]
            ideas.append(_idea(
                "Spread the cost over a loan",
                "Paying over time keeps more cash in the bank while the investment gets going.",
                "baseline", [loan]))
    fillers = [
        _idea("Make a small price rise", "A small step in prices is easy to try and easy to undo.",
              "baseline", [{"type": "price", "start_month": 2, "value": 3, "unit": "percent"}]),
        _idea("Add a tempting extra to the menu", "Offering one extra item can lift what each guest spends.",
              "baseline", [{"type": "menu", "start_month": 3, "value": 4, "unit": "percent"}]),
        _idea(f"Add one more {staff}", f"An extra {staff} may help you serve more people at busy times.",
              "baseline", [{"type": "hiring", "start_month": 3, "value": 1, "unit": "fte"}]),
    ]
    for f in fillers:
        if len(ideas) >= 3:
            break
        if not is_repeat(ideas, f):        # never two ideas that are nearly the same
            ideas.append(f)
    return ideas[:3]


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
