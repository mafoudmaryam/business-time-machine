"""What we tell the language model. It only ever sees the facts JSON, never raw engine internals."""
from __future__ import annotations

import copy
import json
import unicodedata

from .. import engine_bridge
from .money import facts_for_prompt

COACH_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "what_happens": {"type": "string"},
        "why": {"type": "string"},
        "watch_out": {"type": "array", "items": {"type": "string"}},
        "ideas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "why": {"type": "string"},
                    "builds_on": {"type": "string"},
                    "decisions": {"type": "array", "items": engine_bridge.DECISION_ITEM_SCHEMA},
                },
                "required": ["title", "why", "builds_on", "decisions"],
            },
        },
    },
    "required": ["headline", "what_happens", "why", "watch_out", "ideas"],
}

# Used to check the reply. Ideas are only checked for shape here; each idea's decisions are validated
# one by one afterwards (with DECISIONS_JSON_SCHEMA), so one bad idea is dropped instead of failing everything.
COACH_REPLY_SCHEMA = copy.deepcopy(COACH_SCHEMA)
COACH_REPLY_SCHEMA["properties"]["ideas"]["items"]["properties"]["decisions"] = {"type": "array"}

ASK_SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
}

_STYLE = """You are a warm, encouraging mentor for the owner of a small {industry}. You are talking to a
busy owner who is not a finance expert.

HARD RULES
- Use ONLY numbers that appear in the FACTS. Never calculate, add up, average or convert anything yourself.
  If you want to mention a number that is not in the FACTS, describe it in words instead.
- Copy money exactly as it is written in the FACTS, for example $27,900 (never add a currency code or change the format).
- Describe changes in {customers_word} with the count ("about 27 fewer {customers_word}") or the whole percent
  from the FACTS. Never write decimals like 3.01%.
- Talk about uncertainty as "in X of 10 futures" using the *_of_10 numbers. Never promise anything:
  use words like "could", "likely", "may". This is not financial advice, but do not repeat that here.
- Plain, friendly words. Never use these words: FTE, COGS, churn, baseline, percentile, p10, p50, p90,
  Monte Carlo, elasticity. Say "if you change nothing" instead of "baseline".
- Use the business's own words: call customers "{customers_word}" and staff "{staff_word}".
- Warm, encouraging and simple. Talk to the owner as "you" and "your". Short sentences: about 15 words at most.
  The whole note must stay under 200 words. No jargon, no headings."""

COACH_INSTRUCTIONS = """

Write the coach note as JSON with these fields:
- headline: ONE friendly sentence of at most 12 words, WITHOUT numbers, that agrees with the "verdict" in the FACTS
  (for example: "Nice! Raising prices looks like a good move.").
- what_happens must not repeat the headline: start it with the numbers.
- what_happens: at most 2 short sentences on WHAT happens over the {months} months (profit vs. if you change nothing,
  {customers_word}, and the key months from the facts).
- why: at most 2 short sentences on WHY, using the drivers (biggest help and biggest drag).
- watch_out: a list with at most ONE short sentence about a REAL risk to WATCH OUT for (cash running low, getting too busy,
  {customers_word} leaving).
- ideas: exactly 2 IDEAS TO TRY, about two DIFFERENT areas (price; menu or marketing; staff, opening days or equipment),
  and not about a lever the scenario already changes. Each has:
    title: short and friendly, max 6 words
    why: one sentence on why it might help; no numbers except ones in its own decisions or in the FACTS
    builds_on: the exact name of one scenario from the FACTS to add this on top of, or "baseline" to start
               from "if you change nothing"
    decisions: 1 or 2 decisions. Units: price -> percent (or absolute); hiring -> fte; marketing -> percent or
               per_month; hours -> days; menu -> percent; investment -> amount. start_month must be between
               1 and {months}. Percent values are plain numbers: "value": 10 means +10% (never 1.1). Use negative values to cut.
               A decision looks like {{"type":"hiring","start_month":6,"value":1,"unit":"fte"}}.
Only suggest ideas that are different from what the scenarios already do."""

ASK_INSTRUCTIONS = """

Answer the owner's QUESTION in at most 4 short sentences, using only the FACTS.
If the FACTS do not contain the answer, say honestly that you cannot tell from these results and suggest
running a new simulation to find out. Reply as JSON: {{"answer": "..."}}."""


def _ascii(text: str) -> str:
    """Small local models garble accents ("Café" -> "caf?"), so the prompt uses plain letters."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def _fill(text: str, facts: dict) -> str:
    b = facts["business"]
    return text.format(industry=_ascii(b["industry"]).lower(), currency=b["currency"], customers_word=b["customers_word"],
                       staff_word=b["staff_word"], months=b["months"])


def coach_prompt(facts: dict) -> tuple[str, str]:
    system = _fill(_STYLE, facts) + _fill(COACH_INSTRUCTIONS, facts)
    user = "FACTS:\n" + _ascii(json.dumps(facts_for_prompt(facts), ensure_ascii=False))
    return system, user


def ask_prompt(facts: dict, question: str) -> tuple[str, str]:
    system = _fill(_STYLE, facts) + _fill(ASK_INSTRUCTIONS, facts)
    user = "FACTS:\n" + _ascii(json.dumps(facts_for_prompt(facts), ensure_ascii=False)) + "\n\nQUESTION: " + _ascii(question)
    return system, user


def retry_note(unmatched: list[float]) -> str:
    shown = ", ".join(f"{x:g}" for x in unmatched[:8])
    return (f"\n\nYour previous answer used numbers that are not in the FACTS: {shown}. "
            "Write it again using only numbers from the FACTS (or describe them in words).")
