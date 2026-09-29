"""Grounding check: every number in the coach's text must come from the facts.

We do not try to understand the sentence -- we only pull out the numbers and look
for each one among the facts, allowing for rounding ("about 4,000" for 4,180).
"""
from __future__ import annotations

import re
from typing import Any, Iterable

# 1,234 / 1234.5 / 4.2k / 1.5m, with an optional leading minus sign. Digits glued to letters
# ("q3", "v2") are not numbers.
_NUMBER = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|thousand|m|million)\b)?", re.IGNORECASE)
_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6}

REL_TOLERANCE = 0.06     # a number may be rounded by up to 6%...
ABS_TOLERANCE = 0.5      # ...or by half a unit for small numbers


def extract_numbers(text: str) -> list[float]:
    found = []
    for m in _NUMBER.finditer(text):
        raw = m.group(0).strip()
        scale = 1.0
        for word, factor in _SCALE.items():
            if raw.lower().endswith(word):
                scale = factor
                raw = raw[: -len(word)].strip()
                break
        raw = raw.replace(",", "").rstrip(".")
        try:
            found.append(abs(float(raw)) * scale)
        except ValueError:
            continue
    return found


def _numbers_in(value: Any) -> Iterable[float]:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        yield abs(float(value))
    elif isinstance(value, str):
        yield from extract_numbers(value)
    elif isinstance(value, dict):
        for v in value.values():
            yield from _numbers_in(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            yield from _numbers_in(v)


def allowed_numbers(facts: dict, extra: Iterable[float] = ()) -> set[float]:
    """Every number that appears anywhere in the facts, plus a few that are always fine:
    "of 10 futures", 0, and the time span in months and years."""
    allowed = set(_numbers_in(facts)) | {0.0, 10.0, 12.0}
    months = facts.get("business", {}).get("months")
    if months:
        allowed |= {float(months), months / 12}
    allowed |= {abs(float(x)) for x in extra}
    return allowed


def _matches(x: float, allowed: set[float]) -> bool:
    return any(abs(x - f) <= max(ABS_TOLERANCE, REL_TOLERANCE * f) for f in allowed)


def unmatched_numbers(texts: Iterable[str], allowed: set[float]) -> list[float]:
    """The numbers in `texts` that are not in `allowed`, in order, without repeats."""
    bad: list[float] = []
    for text in texts:
        for x in extract_numbers(text):
            if not _matches(x, allowed) and x not in bad:
                bad.append(x)
    return bad
