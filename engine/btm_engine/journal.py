"""The journal: what really happened in a month, set against what the engine expected.

Plain arithmetic on two things the engine already knows: the owner's real figure for a month, and the p10 / p50 / p90 the
engine stored for that month. No model, no randomness, no AI. The owner's figure is their own input, so nothing here asks
them to confirm it.

    position: "below" when the real figure is under the bad case (p10), "above" when it is over the good case (p90),
              otherwise "inside" (the edges count as inside).
"""
from __future__ import annotations

import math
from typing import Any, Optional

METRICS = ("profit", "cash", "visits")
POSITIONS = ("below", "inside", "above")


def months_between(from_year: int, from_month: int, to_year: int, to_month: int) -> int:
    """How many calendar months from one month to another (0 for the same month, negative if it is earlier)."""
    return (to_year * 12 + to_month) - (from_year * 12 + from_month)


def compare_month(actual: float, p10: float, p50: float, p90: float) -> dict[str, Any]:
    """One real figure against the expected range. Raises ValueError for numbers that are not finite or a range out of order."""
    for name, value in (("actual", actual), ("p10", p10), ("p50", p50), ("p90", p90)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{name} must be a number")
    if not p10 <= p50 <= p90:
        raise ValueError("the expected range must run from the bad case up to the good case")
    position = "below" if actual < p10 else "above" if actual > p90 else "inside"
    difference = actual - p50
    percent: Optional[float] = None if p50 == 0 else 100.0 * difference / abs(p50)
    return {
        "actual": actual, "expected_low": p10, "expected": p50, "expected_high": p90,
        "difference": difference,                 # real minus most likely: positive means more than expected
        "percent_difference": percent,            # None when the most likely figure is exactly 0
        "position": position,
    }


def accuracy_summary(comparisons: list[dict[str, Any]]) -> dict[str, Any]:
    """How the expected ranges did over several months of ONE metric (the list of `compare_month` results)."""
    n = len(comparisons)
    out: dict[str, Any] = {
        "months": n, "inside": 0, "below": 0, "above": 0,
        "mean_difference": None, "mean_abs_percent_difference": None,
    }
    if n == 0:
        return out
    for c in comparisons:
        out[c["position"]] += 1
    out["mean_difference"] = sum(c["difference"] for c in comparisons) / n
    pct = [abs(c["percent_difference"]) for c in comparisons if c["percent_difference"] is not None]
    out["mean_abs_percent_difference"] = sum(pct) / len(pct) if pct else None
    return out
