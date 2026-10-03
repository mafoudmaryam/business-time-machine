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


# The three suggestion chips. Each one ALWAYS gets a good answer from the facts, with no AI.
CHIP_QUESTIONS = ["Will my cash run out?", "Why does this happen?", "What should I watch for?"]
CANT_ANSWER = "I can't answer that one yet. Try one of these:"


def _norm(question: str) -> str:
    return " ".join(question.lower().replace("?", " ").split())


def is_chip(question: str) -> bool:
    return _norm(question) in {_norm(c) for c in CHIP_QUESTIONS}


def _driver_amount(s: dict, *keys: str) -> float:
    return sum(d["amount"] for d in s["drivers"] if d["key"] in keys)


def _say_cash(facts: dict, s: dict) -> str:
    m, f, cur = s["moments"], s["futures"], facts["business"]["currency"]
    below = " below zero" if m["lowest_cash_amount"] < 0 else ""
    return (f"With {_nice(s['name'])}, your cash is lowest around month {m['lowest_cash_month']}, at about "
            f"{_money(m['lowest_cash_amount'], cur)}{below}. It runs out in {f['cash_runs_out_of_10']} of 10 futures.")


def _say_watch(facts: dict, s: dict) -> str:
    f = s["futures"]
    lines = _watch_out(facts)
    ahead = (f" It comes out ahead of changing nothing in {f['beats_change_nothing_of_10']} of 10 futures."
             if f["beats_change_nothing_of_10"] is not None else "")
    if lines:
        return lines[0] + ahead
    return (f"Nothing worrying stands out with {_nice(s['name'])}. "
            f"Cash runs out in {f['cash_runs_out_of_10']} of 10 futures." + ahead)


def _say_customers(facts: dict, s: dict) -> str:
    words = facts["business"]["customers_word"]
    return (f"With {_nice(s['name'])}, you would end with about {s['regulars_end']:,.0f} {words}, compared with "
            f"{s['regulars_end_if_nothing_changes']:,.0f} if you change nothing.")


def _say_staff(facts: dict, s: dict) -> str:
    b, cur, m = facts["business"], facts["business"]["currency"], s["moments"]
    busy = (f"You get too busy for your team around month {m['full_month']}." if m["full_month"]
            else f"Your team keeps up with demand for the whole {_span(b['months'])}.")
    amount = _driver_amount(s, "staff")
    if round(amount) == 0:
        return f"With {_nice(s['name'])}: {busy} Your staff costs stay about the same."
    return (f"With {_nice(s['name'])}: {busy} Staff costs "
            f"{'save' if amount > 0 else 'take'} about {_money(amount, cur)} "
            f"{'on' if amount > 0 else 'off'} your profit over {_span(b['months'])}.")


def _say_price(facts: dict, s: dict) -> str:
    b, cur = facts["business"], facts["business"]["currency"]
    amount = _driver_amount(s, "price")
    if round(amount) == 0:
        return f"With {_nice(s['name'])}, your prices do not change, so they add nothing to your profit."
    return (f"With {_nice(s['name'])}, prices {'add' if amount > 0 else 'take'} about {_money(amount, cur)} "
            f"{'to' if amount > 0 else 'from'} your profit over {_span(b['months'])}.")


def _say_marketing(facts: dict, s: dict) -> str:
    b, cur = facts["business"], facts["business"]["currency"]
    amount = _driver_amount(s, "fixed")
    if round(amount) == 0:
        return f"With {_nice(s['name'])}, your marketing and running costs stay about the same."
    return (f"With {_nice(s['name'])}, marketing and running costs {'save' if amount > 0 else 'cost'} about "
            f"{_money(amount, cur)} over {_span(b['months'])}.")


def _today_answer(facts: dict, question: str) -> tuple[str, bool]:
    """Answers about the business as it is today (no plan), from facts["today"] only."""
    q, t, cur = _norm(question), facts["today"], facts["business"]["currency"]

    def has(*keys: str) -> bool:
        return any(k in q for k in keys)

    def cash() -> str:
        n = t["cash_runs_out_of_10"]
        below = " below zero" if t["lowest_cash_amount"] < 0 else ""
        return (f"If you change nothing, your cash is lowest around month {t['lowest_cash_month']}, at about "
                f"{_money(t['lowest_cash_amount'], cur)}{below}. It runs out in {n} of 10 futures.")

    def profit() -> str:
        verb = "keep" if t["profit_a_month"] >= 0 else "lose"
        return (f"In a typical month you take in about {_money(t['sales_a_month'], cur)} and spend about "
                f"{_money(t['costs_a_month'], cur)}, so you {verb} about {_money(t['profit_a_month'], cur)}.")

    def watch() -> str:
        if t["cash_runs_out_of_10"] >= 1:
            return f"Keep an eye on your cash: it runs out in {t['cash_runs_out_of_10']} of 10 futures."
        if t["profit_a_month"] < 0:
            return f"You lose about {_money(t['profit_a_month'], cur)} in a typical month, so it is worth looking at your costs."
        return f"Nothing worrying stands out. Your cash runs out in {t['cash_runs_out_of_10']} of 10 futures."

    if q == _norm(CHIP_QUESTIONS[0]) or has("cash", "bank", "run out", "broke", "afford"):
        return cash(), True
    if q == _norm(CHIP_QUESTIONS[1]):
        return profit() + " Try a change to see how it moves.", True
    if q == _norm(CHIP_QUESTIONS[2]) or has("watch", "careful", "worry", "danger", "problem", "risk", "safe"):
        return watch(), True
    if has("profit", "earn", "make", "keep", "lose", "why", "happen", "explain"):
        return profit(), True
    return CANT_ANSWER, False


def answer_with_match(facts: dict, question: str) -> tuple[str, bool]:
    """(answer, understood). Rule-based, from the facts only: it never invents a number. When it cannot tell,
    it says so kindly and the caller offers the suggestion chips."""
    if not facts.get("scenarios") and "today" in facts:
        return _today_answer(facts, question)
    q, b = _norm(question), facts["business"]
    s = _find(facts, question)
    words = b["customers_word"].lower()
    if q == _norm(CHIP_QUESTIONS[0]):
        return _say_cash(facts, s), True
    if q == _norm(CHIP_QUESTIONS[1]):
        return _what_happens(facts) + " " + _why(facts), True
    if q == _norm(CHIP_QUESTIONS[2]):
        return _say_watch(facts, s), True

    def has(*keys: str) -> bool:
        return any(k in q for k in keys)

    if has("cash", "bank", "money left", "run out", "broke", "afford"):
        return _say_cash(facts, s), True
    if has("watch", "careful", "worry", "warning", "danger", "problem", "risk", "safe", "chance", "likely"):
        return _say_watch(facts, s), True
    if has(words, "customer", "regular", "guest", "visit", "diner"):
        return _say_customers(facts, s), True
    if has("staff", "hire", "hiring", "team", "busy", "full", "capacity", b["staff_word"].lower()):
        return _say_staff(facts, s), True
    if has("price", "pricing", "charge"):
        return _say_price(facts, s), True
    if has("marketing", "advert", " ads", "promot"):
        return _say_marketing(facts, s), True
    if has("why", "reason", "explain", "happen", "how come"):
        return _what_happens(facts) + " " + _why(facts), True
    if has("profit", "earn", "make", "worth", "better", "best", "gain", "result"):
        return _what_happens(facts), True
    return CANT_ANSWER, False


def answer(facts: dict, question: str) -> str:
    return answer_with_match(facts, question)[0]
