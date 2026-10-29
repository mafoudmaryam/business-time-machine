"""A standalone entered-cost calculator, not a scenario or forecast.

Amounts use integer millionths so a tiny positive contribution cannot be lost to
binary floating-point arithmetic. No business defaults, database or AI imports.
"""
from __future__ import annotations

import re

SCALE = 1_000_000
AMOUNT = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+|\d{1,3}(?:,\d{3})+(?:\.\d*)?)\Z", re.ASCII)


def _amount(text: str, label: str) -> int:
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"Enter {label}.")
    text = text.strip()
    if len(text) > 32 or not AMOUNT.fullmatch(text):
        raise ValueError(f"Use a non-negative amount for {label}, such as 1200.50.")
    whole, _, fraction = text.replace(",", "").partition(".")
    if len(whole) > 12 or len(fraction) > 6:
        raise ValueError(f"For {label}, use up to 12 digits before the decimal and 6 after it.")
    return int(whole or "0") * SCALE + int(fraction.ljust(6, "0") or "0")


def _decimal(value: int, scale: int = SCALE, places: int = 6) -> str:
    whole, fraction = divmod(abs(value), scale)
    tail = str(fraction).zfill(places).rstrip("0")
    return ("-" if value < 0 else "") + str(whole) + (f".{tail}" if tail else "")


def sales_needed(selling_price: str, cost_per_sale: str, monthly_costs: str, opening_days: str = "") -> dict:
    """Return exact decimal strings; large targets never pass through JSON floats.

    Daily targets spread the rounded-up monthly count over opening days and are
    rounded upward to two decimal places. They are averages, not whole daily quotas.
    """
    price = _amount(selling_price, "the selling price")
    cost = _amount(cost_per_sale, "the cost per sale")
    fixed = _amount(monthly_costs, "the monthly costs")
    if not isinstance(opening_days, str):
        raise ValueError("Enter whole opening days from 1 to 31, or leave them blank.")
    days_text = opening_days.strip()
    if days_text and (not re.fullmatch(r"[0-9]{1,2}", days_text) or not 1 <= int(days_text) <= 31):
        raise ValueError("Enter whole opening days from 1 to 31, or leave them blank.")
    days = int(days_text) if days_text else None
    contribution = price - cost
    result = {
        "status": "no_margin" if contribution <= 0 else "target",
        "selling_price": _decimal(price), "cost_per_sale": _decimal(cost), "monthly_costs": _decimal(fixed),
        "contribution_per_sale": _decimal(contribution), "opening_days": days,
        "monthly_sales": None, "daily_average": None, "monthly_revenue": None, "cost_share_percent": None,
    }
    if contribution <= 0:
        return result
    monthly = (fixed + contribution - 1) // contribution
    result.update(
        monthly_sales=str(monthly), monthly_revenue=_decimal(monthly * price),
        cost_share_percent=((cost * 10_000) // price) / 100,
        daily_average=_decimal((monthly * 100 + days - 1) // days, 100, 2) if days else None,
    )
    return result
