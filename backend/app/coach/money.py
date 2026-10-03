"""Money in the coach's text: formatted like the owner sees it in the app ($27,900).

The facts sent to the AI carry ready-made money strings, so the AI copies them instead of
inventing its own format ("27,900 USD"). The grounding check still uses the plain numbers.
"""
from __future__ import annotations

from typing import Any

from ..engine_bridge import format_money
from .summary import build_summary

# Facts keys that hold an amount of money.
MONEY_KEYS = {
    "profit_total", "profit_change", "amount", "lowest_cash_amount", "cash_today",
    "profit_bad_case", "profit_most_likely", "profit_good_case", "profit_change_most_likely",
    # Today page
    "sales_a_month", "costs_a_month", "profit_a_month", "profit_a_month_bad_case", "profit_a_month_good_case",
    "profit_year_most_likely", "cash_now", "profit_bad_case_year",
}


def facts_for_prompt(facts: dict) -> dict:
    """A copy of the facts where every money amount is a string such as "$27,900" and the bare currency code is left out."""
    currency = facts["business"]["currency"]

    def walk(value: Any, key: str | None = None) -> Any:
        if isinstance(value, dict):
            return {k: walk(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [walk(v, key) for v in value]
        if key in MONEY_KEYS and isinstance(value, (int, float)) and not isinstance(value, bool):
            return format_money(value, currency)
        return value

    out = walk(facts)
    out["business"].pop("currency", None)     # amounts already carry their symbol; no code to copy
    if facts.get("scenarios") and "if_you_change_nothing" in facts:
        out["verdict"] = build_summary(facts)["verdict"]["label"]   # decided by rules; the headline must agree
    return out
