"""Drafts -> validated decisions, questions and notes. Plain code, the same for the rule-based parser and the AI.

  * timing words become simulation months (months.py), and "for the summer" becomes a start + a reversing end
  * anything missing or vague becomes a QUESTION, never a made-up value
  * every decision is checked against DECISIONS_JSON_SCHEMA and the engine's own rules
  * every decision gets a plain sentence in the business's own words and currency
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from .. import engine_bridge
from .draft import Context, Draft, ParseResult
from .months import MAX_MONTH, month_label, month_one_note, parse_when, when_label

ENGINE_KEYS = ("loan_months", "annual_rate", "capacity_pct", "cogs_ratio", "investment")

CAN_DO = ["Change your prices", "Hire or let go of staff", "Spend more or less on marketing",
          "Change how many days you're open", "Change the menu", "Buy equipment or make an investment"]

WHEN_OPTIONS = ["Next month", "In 3 months", "In 6 months"]
HINTS = {
    "when": "e.g. next month, March, in 3 months",
    ("amount", "price"): "e.g. 10%", ("amount", "menu"): "e.g. 5%", ("amount", "hours"): "e.g. 6 days a week",
    ("amount", "marketing"): "e.g. 20%, or $300 a month", ("amount", "investment"): "e.g. $8,000",
    ("amount", "hiring"): "e.g. 1", "rate": "e.g. 6% (or 0% if none)", "loan_months": "e.g. 24 months",
}
DEFAULT_ASK = {
    "price": "By how much do you want to change prices?",
    "marketing": "How much do you want to change your marketing spending?",
    "hours": "How many days a month do you want to be open?",
    "menu": "By roughly how much will the average sale per visit change (in %)?",
    "investment": "How much will this cost?",
    "hiring": "How many people, counted as full-time?",
}


def _money(value: float, ctx: Context) -> str:
    return engine_bridge.format_money(value, ctx.currency)


def _plural(noun: str, n: float) -> str:
    return noun if abs(n) == 1 or noun.endswith("staff") else noun + "s"


# ---------- reversing a temporary change ----------

def reverse_of(flat: dict) -> Optional[dict]:
    """The decision that switches a temporary change back off, or None when that cannot be done exactly."""
    if flat["type"] == "hiring":
        return {"type": "hiring", "start_month": flat["start_month"], "value": -flat["value"], "unit": "fte"}
    if flat["type"] in ("price", "marketing") and flat["unit"] == "percent" and flat["value"] > -100:
        undo = (1 / (1 + flat["value"] / 100) - 1) * 100
        return {"type": flat["type"], "start_month": flat["start_month"], "value": round(undo, 4), "unit": "percent"}
    return None


# ---------- sentences ----------

def sentence_for(flat: dict, draft: Draft, ctx: Context) -> str:
    t, v = flat["type"], flat["value"]
    if t == "price":
        if flat["unit"] == "absolute":
            return f"Set the average sale to {_money(v, ctx)}"
        return f"Raise prices {v:g}%" if v >= 0 else f"Cut prices {abs(v):g}%"
    if t == "hiring":
        noun = draft.noun or ctx.staff_noun
        verb = "Hire" if v >= 0 else "Let go of"
        n = abs(v)
        if draft.extras.get("part_time"):
            count = n * 2
            return f"{verb} {count:g} part-time {_plural(noun, count)} (counts as {n:g} full-time)"
        if n % 1:
            return f"{verb} {n:g} full-time-equivalent {_plural(noun, n)} (a part-time job counts as 0.5)"
        return f"{verb} {n:g} {_plural(noun, n)}"
    if t == "marketing":
        if flat["unit"] == "percent":
            return f"Increase marketing spend {v:g}%" if v >= 0 else f"Cut marketing spend {abs(v):g}%"
        if v == 0:
            return f"Stop marketing spend (set it to {_money(0, ctx)} a month)"
        if draft.meaning == "extra" and "extra_amount" in draft.extras:
            return (f"Spend {_money(draft.extras['extra_amount'], ctx)} more a month on marketing "
                    f"({_money(v, ctx)} in total, on top of your {_money(ctx.marketing, ctx)} now)")
        return f"Set marketing spend to {_money(v, ctx)} a month"
    if t == "hours":
        if "per_week" in draft.extras:
            return f"Open {draft.extras['per_week']:g} days a week (about {v:g} days a month)"
        return f"Open {v:g} days a month"
    if t == "menu":
        return f"Change the menu so the average sale goes {'up' if v >= 0 else 'down'} {abs(v):g}%"
    if t == "investment":
        text = f"Invest {_money(v, ctx)}"
        if flat.get("loan_months"):
            text += f", paid back over {int(flat['loan_months'])} months"
            if "annual_rate" in flat:
                text += f" at {flat['annual_rate'] * 100:g}% interest"
        if flat.get("capacity_pct"):
            text += f", adding {flat['capacity_pct']:g}% capacity"
        return text
    return f"{t} change"


# ---------- questions ----------

def _question(index: int, slot: str, text: str, about: str, options: Optional[list[str]] = None,
              hint: str = "") -> dict:
    return {"id": f"{index}:{slot}", "slot": slot, "text": text, "about": about, "options": options, "hint": hint}


def _amount_question(index: int, d: Draft) -> dict:
    return _question(index, "amount", d.ask or DEFAULT_ASK.get(d.type, "How much?"), d.quote,
                     hint=HINTS.get(("amount", d.type), ""))


def verify_quote(quote: str, text: str) -> str:
    """The words a decision came from, only if they really are in the owner's text (otherwise nothing)."""
    def norm(s: str) -> str:
        return re.sub(r"\s+", " ", s).strip().lower()
    quote = quote.strip()
    return quote if quote and norm(quote) in norm(text) else ""


# ---------- the main step ----------

def resolve(parsed: ParseResult, ctx: Context, text: str) -> dict[str, Any]:
    decisions: list[dict] = []
    questions: list[dict] = []
    notes: list[str] = []

    for i, d in enumerate(parsed.drafts):
        quote = verify_quote(d.quote, text)
        asked: list[dict] = []
        for slot in d.missing:
            if slot == "amount":
                asked.append(_amount_question(i, d))
            elif slot == "loan_months":
                asked.append(_question(i, "loan_months", "Over how many months would you pay it back?", d.quote,
                                       hint=HINTS["loan_months"]))
            elif slot == "rate":
                asked.append(_question(i, "rate", "What yearly interest rate would the loan have? (0% if none)",
                                       d.quote, hint=HINTS["rate"]))
        when = parse_when(d.when_text, ctx.today)
        for n in when.notes:
            if n not in notes:
                notes.append(n)
        if when.problem:
            asked.append(_question(i, "when", when.problem, d.quote, WHEN_OPTIONS, HINTS["when"]))
        elif when.start is None:
            asked.append(_question(i, "when", "When do you want this to start?", d.quote, WHEN_OPTIONS, HINTS["when"]))
        if asked or d.value is None:
            questions.extend(asked or [_amount_question(i, d)])
            continue

        flat: dict[str, Any] = {"type": d.type, "start_month": when.start, "value": float(d.value), "unit": d.unit}
        flat.update({k: v for k, v in d.extras.items() if k in ENGINE_KEYS and v is not None})
        try:
            flat = engine_bridge.clean_idea_decisions([flat], MAX_MONTH)[0]
        except ValueError as exc:
            questions.append(_question(i, "amount", f"That doesn't look right ({_plain_error(str(exc))}). "
                                                    f"Could you say it another way?", d.quote))
            continue

        sentence = sentence_for(flat, d, ctx)
        stops = when.end_after is not None and not d.permanent
        if not stops:
            label = when_label(when.start, None, ctx.today)
            decisions.append({**flat, "source_quote": quote, "sentence": f"{sentence}, from {label}",
                              "when_label": label, "group": None, "role": None, "group_sentence": None})
            continue

        end = reverse_of(flat)
        if end is None:
            questions.append(_question(
                i, "permanent",
                f"I can't switch “{sentence}” back off automatically after {month_label(when.end_after - 1, ctx.today)}. "
                f"Should it stay in place?", d.quote, ["Yes, keep it going"]))
            continue
        end["start_month"] = when.end_after
        label = when_label(when.start, when.end_after, ctx.today)
        group, group_sentence = uuid.uuid4().hex[:8], f"{sentence}, {label}"
        decisions.append({**flat, "source_quote": quote, "sentence": group_sentence, "when_label": label,
                          "group": group, "role": "start", "group_sentence": group_sentence})
        decisions.append({**end, "source_quote": quote,
                          "sentence": f"Back to normal from {month_label(when.end_after, ctx.today)} (month {when.end_after})",
                          "when_label": label, "group": group, "role": "end", "group_sentence": group_sentence})

    scope = None
    skipped = parsed.out_of_scope + parsed.not_understood
    if skipped or (not decisions and not questions):
        if parsed.out_of_scope or (not skipped):
            what = "; ".join(f"“{q}”" for q in parsed.out_of_scope)
            message = (f"I can't simulate that yet: {what}." if what else
                       "I couldn't find a decision in that.")
        else:
            message = "I couldn't turn this into a decision: " + "; ".join(f"“{q}”" for q in skipped) + "."
        if parsed.out_of_scope and parsed.not_understood:
            message += " I also couldn't turn this into a decision: " + "; ".join(f"“{q}”" for q in parsed.not_understood) + "."
        scope = {"message": message, "can_do": CAN_DO, "quotes": skipped}

    return {"decisions": decisions, "questions": questions, "out_of_scope": scope, "notes": notes,
            "month_one": month_one_note(ctx.today)}


def _plain_error(message: str) -> str:
    return message.rstrip(".")[:80]
