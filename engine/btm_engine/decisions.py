"""Decision levers (spec section 4) and how they become month-by-month inputs.

A Decision is exactly what the LLM layer must produce (after JSON-schema
validation) and what the user confirms before a run.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .params import CafeBaseline

DECISION_TYPES = ("price", "hiring", "marketing", "hours", "menu", "investment")


@dataclass(frozen=True)
class Decision:
    type: str
    start_month: int          # 1-based simulation month the change takes effect
    value: float
    unit: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def validate(self, horizon: int) -> None:
        if self.type not in DECISION_TYPES:
            raise ValueError(f"unknown decision type {self.type!r}; allowed: {DECISION_TYPES}")
        if not 1 <= self.start_month <= horizon:
            raise ValueError(f"start_month must be between 1 and {horizon}")
        if self.type == "price" and self.unit == "percent" and self.value <= -100:
            raise ValueError("price cut must be smaller than 100%")
        if self.type == "hours" and not 0 < self.value <= 31:
            raise ValueError("hours value is opening days per month, in (0, 31]")
        if self.type == "investment" and self.value < 0:
            raise ValueError("investment amount must be >= 0")

    @classmethod
    def from_dict(cls, d: dict) -> "Decision":
        known = {"type", "start_month", "value", "unit"}
        extra = {k: v for k, v in d.items() if k not in known and k != "extra"}
        extra.update(d.get("extra", {}) or {})
        return cls(type=d["type"], start_month=int(d["start_month"]), value=float(d["value"]),
                   unit=d.get("unit", ""), extra=extra)


# JSON schema for the LLM's structured output (tool use). Kept here so the API
# layer and the engine validate against the same definition.
DECISIONS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"enum": list(DECISION_TYPES)},
                    "start_month": {"type": "integer", "minimum": 1},
                    "value": {"type": "number"},
                    "unit": {"enum": ["percent", "absolute", "fte", "per_month", "days", "amount"]},
                    "loan_months": {"type": "integer", "minimum": 0},
                    "annual_rate": {"type": "number", "minimum": 0},
                    "capacity_pct": {"type": "number"},
                    "cogs_ratio": {"type": "number", "minimum": 0, "maximum": 1},
                    "investment": {"type": "number", "minimum": 0},
                },
                "required": ["type", "start_month", "value", "unit"],
            },
        },
        "unclear": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["decisions", "unclear"],
}


def _loan_payment(amount: float, months: int, annual_rate: float) -> float:
    r = annual_rate / 12
    if r == 0:
        return amount / months
    return amount * r / (1 - (1 + r) ** -months)


def build_timeline(base: CafeBaseline, decisions: list[Decision], horizon: int) -> dict[str, np.ndarray]:
    """Turn a list of decisions into per-month input arrays of length `horizon`.

    Decisions apply from their start month onward and stack in list order.
    """
    T = horizon
    tl = {
        "price": np.full(T, base.avg_ticket),        # p_t, drives elasticity
        "ticket_mult": np.ones(T),                   # upsell (menu) that does not change p_t
        "staff": np.full(T, base.staff_fte),         # S_t
        "marketing": np.full(T, base.marketing),     # M_t
        "open_days": np.full(T, base.open_days),     # d_t
        "cogs_ratio": np.full(T, base.cogs_ratio),   # c_t
        "capacity_mult": np.ones(T),                 # κ multiplier (equipment)
        "investment": np.zeros(T),                   # I_t, one-off cash outflows
        "loan_payment": np.zeros(T),                 # B_t
    }
    for d in decisions:
        d.validate(T)
        s = d.start_month - 1
        if d.type == "price":
            if d.unit == "absolute":
                tl["price"][s:] = d.value
            else:
                tl["price"][s:] *= 1 + d.value / 100
        elif d.type == "hiring":
            tl["staff"][s:] = np.maximum(tl["staff"][s:] + d.value, 0)
        elif d.type == "marketing":
            if d.unit == "percent":
                tl["marketing"][s:] *= 1 + d.value / 100
            else:
                tl["marketing"][s:] = max(d.value, 0)
        elif d.type == "hours":
            tl["open_days"][s:] = d.value
        elif d.type == "menu":
            tl["ticket_mult"][s:] *= 1 + d.value / 100
            if "cogs_ratio" in d.extra:
                tl["cogs_ratio"][s:] = float(d.extra["cogs_ratio"])
            tl["investment"][s] += float(d.extra.get("investment", 0))
        elif d.type == "investment":
            months = int(d.extra.get("loan_months", 0))
            if months > 0:
                pay = _loan_payment(d.value, months, float(d.extra.get("annual_rate", 0.0)))
                tl["loan_payment"][s:s + months] += pay
            else:
                tl["investment"][s] += d.value
            cap = float(d.extra.get("capacity_pct", 0))
            tl["capacity_mult"][s:] *= 1 + cap / 100
    return tl
