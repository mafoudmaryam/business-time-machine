"""Currency check: money in the coach's text must be written in the business's own currency.

The facts the AI sees carry ready-made amounts ("CN¥168,000"). A small model can still fall back on a dollar sign it
learned somewhere else. This looks for any amount written with a different currency symbol or code and rejects the text
(the caller retries once, then keeps the rule-based version). It reads symbols next to digits, not meaning.
"""
from __future__ import annotations

import re
from typing import Optional

from ..engine_bridge import currency_marks

# Codes with no symbol of their own in the app (written "CHF 4,500"), plus the common ones, so a stray "EUR 5" is caught.
_EXTRA_CODES = {"CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "ZAR", "AED", "SAR", "TRY", "THB", "MYR", "IDR", "RUB", "EGP", "NGN"}


def _own(currency: str) -> tuple[str, str]:
    code = (currency or "").upper()
    return currency_marks().get(code, code), code


def foreign_currency(texts: list[str], currency: str) -> Optional[str]:
    """None when every amount uses this business's currency, otherwise a plain reason."""
    marks = currency_marks()
    own_mark, own_code = _own(currency)
    symbols = sorted({m for m in marks.values()}, key=len, reverse=True)
    codes = set(marks) | _EXTRA_CODES
    sym = "|".join(re.escape(s) for s in symbols)
    cod = "|".join(sorted(codes, key=len, reverse=True))
    before = re.compile(rf"(?<![A-Za-z])({sym}|{cod})\s?-?\d")
    after = re.compile(rf"\d\s?({cod})(?![A-Za-z])")
    for text in texts:
        for rx in (before, after):
            for m in rx.finditer(str(text)):
                used = m.group(1)
                if used in (own_mark, own_code):
                    continue
                return f"writes an amount with {used}, but this business uses {own_mark}"
    return None
