"""Claim consistency check: does the AI's risk talk agree with the engine's facts?

The grounding check only proves that the numbers in a text exist in the facts. It cannot tell that a sentence is
true: an AI can write "your cash could run out in the first month" when the facts say it runs out in 0 of 10
futures. This module looks for the few claims that matter most to an owner (running out of cash, losing money,
danger, "it's safe") and compares them with the engine's numbers. It is deliberately small and rule-based:
it reads phrases, not meaning, and when a claim contradicts the facts the AI text is rejected.
"""
from __future__ import annotations

import re
from typing import Optional

from .summary import build_summary

_CASH = re.compile(
    r"\b(?:run(?:s|ning)? out of (?:cash|money)|out of (?:cash|money)|not enough (?:cash|money)"
    r"|cash\b[^.]{0,20}?\b(?:run|runs|running) out"
    r"|(?:run|runs|running) out in \d+ of 10"
    r"|cash (?:could |may |might |will |would |can )?(?:dip|drop|fall|go|goes|sink) (?:below|negative|under)"
    r"|below zero|go(?:es|ing)? under|go(?:es)? bust|bankrupt|broke)\b", re.IGNORECASE)
_LOSS = re.compile(
    r"\b(?:lose|loses|lost|losing) (?:some |a lot of |much |all |any )?(?:of )?(?:your |the )?(?:money|cash|profit)"
    r"|\bmake a loss|\bat a loss|\bmaking a loss|\bmoney[- ]losing\b", re.IGNORECASE)
_DANGER = re.compile(r"\b(?:danger\w*|at risk|high risk|serious risk|big risk|real risk)\b", re.IGNORECASE)
_SAFE = re.compile(
    r"\b(?:no risk|risk[- ]free|no danger|nothing to worry|not risky|no cause for concern|safe|safely)\b", re.IGNORECASE)
_NEGATOR = re.compile(r"\b(?:not|never|no|unlikely|without|hardly|isn't|won't|wouldn't|doesn't|don't|can't|cannot)\b|n't\b",
                      re.IGNORECASE)
_ZERO_OF_TEN = re.compile(r"\b0 of 10\b|\bnone of the 10\b", re.IGNORECASE)
_N_OF_TEN = re.compile(r"\b(\d+) of 10\b", re.IGNORECASE)


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def _negated(sentence: str, match: re.Match) -> bool:
    """"cash will not run out", "no risk of running out", "runs out in 0 of 10 futures": the claim is a safe one."""
    before = sentence[max(0, match.start() - 40):match.start()]
    after = sentence[match.end():match.end() + 30]
    inside = "" if match.group(0).lower().startswith("not enough") else match.group(0)   # "cash will NOT run out"
    return (bool(_NEGATOR.search(before)) or bool(_NEGATOR.search(inside))
            or bool(_ZERO_OF_TEN.search(match.group(0) + " " + after)))


class Facts:
    """The engine numbers the claims are checked against."""

    def __init__(self, facts: dict):
        self.scenarios = facts.get("scenarios", [])
        nothing = facts.get("if_you_change_nothing", {})
        self.cash_out_counts = [s["futures"]["cash_runs_out_of_10"] for s in self.scenarios]
        self.cash_risk_in_plans = any(c >= 1 for c in self.cash_out_counts) or any(
            s["moments"]["lowest_cash_amount"] < 0 for s in self.scenarios)
        # the do-nothing case counts as support for a claim ("if you change nothing your cash runs out")
        self.cash_risk_anywhere = self.cash_risk_in_plans or nothing.get("cash_runs_out_of_10", 0) >= 1 or \
            nothing.get("lowest_cash_amount", 0) < 0
        self.loss_in_plans = any(
            s["profit_total"] < 0 or s["futures"]["profit_most_likely"] < 0 for s in self.scenarios)
        self.loss_anywhere = self.loss_in_plans or nothing.get("profit_total", 0) < 0 or \
            nothing.get("profit_most_likely", 0) < 0 or any(
            s["futures"]["profit_bad_case"] < 0 or s["profit_change"] < 0 for s in self.scenarios)
        self.has_risk = bool(self.scenarios) and (build_summary(facts)["has_risk"] or self.cash_risk_in_plans
                                                  or self.loss_in_plans)


def check(texts: list[str], facts: dict) -> Optional[str]:
    """None when the AI's risk claims agree with the facts, otherwise a short plain reason for rejecting the text."""
    if not facts.get("scenarios"):
        return None
    f = Facts(facts)
    for text in texts:
        for sentence in _sentences(str(text)):
            for m in _CASH.finditer(sentence):
                if _negated(sentence, m):
                    if f.cash_risk_in_plans:
                        return f"says cash will not run out, but the facts show it runs out in {max(f.cash_out_counts)} of 10 futures"
                    continue
                if not f.cash_risk_anywhere:
                    return "says cash could run out, but the facts show it runs out in 0 of 10 futures and never goes below zero"
                n = _N_OF_TEN.search(sentence[m.end():m.end() + 40])
                if n and int(n.group(1)) not in set(f.cash_out_counts) | {0}:
                    return f"says cash runs out in {n.group(1)} of 10 futures, but the facts say {sorted(set(f.cash_out_counts))}"
            for m in _LOSS.finditer(sentence):
                if _negated(sentence, m):
                    if f.loss_in_plans:
                        return "says you will not lose money, but the facts show a loss"
                    continue
                if not f.loss_anywhere:
                    return "says you could lose money, but the facts show a profit in every scenario, even in the bad case"
            if _DANGER.search(sentence) and not f.has_risk:
                return "warns of danger, but the facts show no risk flag"
            for m in _SAFE.finditer(sentence):
                if f.has_risk and not _negated_safe_is_risky(sentence, m):
                    return "says it is safe or risk-free, but the facts show a risk"
    return None


def _negated_safe_is_risky(sentence: str, match: re.Match) -> bool:
    """"not safe" / "isn't safe" agrees with a risky fact, so it is not a contradiction."""
    return bool(_NEGATOR.search(sentence[max(0, match.start() - 12):match.start()])) and match.group(0).lower() in ("safe", "safely")
