"""The shared middle step. Both the rule-based parser and the AI produce Drafts (words, mostly as the
owner said them); `resolve.py` then turns Drafts into validated decisions and questions with plain code.

The AI therefore never picks a simulation month, never converts a unit and never does arithmetic.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Context:
    """What the interpreter knows about the business. `today` is injectable so tests are stable."""

    industry: str = "cafe"
    industry_name: str = "café"
    staff_noun: str = "barista"
    customer_noun: str = "regulars"
    currency: str = "USD"
    marketing: float = 400.0      # the business's current monthly marketing spend
    open_days: float = 28.0
    today: dt.date = field(default_factory=dt.date.today)


@dataclass
class Draft:
    type: str                          # price | hiring | marketing | hours | menu | investment
    quote: str = ""                    # the owner's exact words this came from
    value: Optional[float] = None      # None = missing or vague
    unit: str = ""                     # percent | absolute | fte | per_month | days | amount
    when_text: str = ""                # timing words, read later by months.parse_when
    extras: dict = field(default_factory=dict)      # loan_months, annual_rate (ratio), capacity_pct
    missing: list[str] = field(default_factory=list)   # amount | rate | loan_months
    ask: str = ""                      # a more specific question for a missing amount
    noun: str = ""                     # the owner's word for staff ("baker")
    meaning: str = ""                  # marketing money: "extra" (on top of today's spend) | "total"
    permanent: bool = False            # the owner said the change should stay after a stop date


@dataclass
class ParseResult:
    drafts: list[Draft] = field(default_factory=list)
    out_of_scope: list[str] = field(default_factory=list)      # exact words that cannot be simulated
    not_understood: list[str] = field(default_factory=list)    # exact words with no decision in them
