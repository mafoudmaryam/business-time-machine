"""Scoring for the interpretation evaluation set (used by scripts/eval_interpret.py and the tests).

An expected case says which decisions an ideal reader would produce, which questions it would ask, and whether it
should politely refuse. `score` compares one real result with that.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from pathlib import Path
from typing import Any, Optional

from .. import engine_bridge
from ..coach.providers import Provider
from .draft import Context
from .service import interpret_now

DEFAULT_CASES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "interpret_cases.json"
VALUE_TOLERANCE = 0.01          # relative, so -9.0909 matches -9.09091


def load_cases(path: Optional[Path] = None) -> dict[str, Any]:
    return json.loads(Path(path or DEFAULT_CASES).read_text(encoding="utf-8"))


def context_for_case(case: dict, today: dt.date) -> Context:
    """A business with the industry's own default numbers, in dollars."""
    tpl = engine_bridge.get_template(case["industry"])
    base = tpl.default_baseline
    return Context(industry=tpl.id, industry_name=tpl.display_name.lower(), staff_noun=tpl.staff_noun,
                   customer_noun=tpl.customer_noun, currency="USD", marketing=base.marketing,
                   open_days=base.open_days, today=today)


def _key(d: dict) -> tuple:
    return (int(d["start_month"]), d["type"], d["unit"])


def _same(expected: dict, got: dict) -> bool:
    if _key(expected) != _key(got):
        return False
    a, b = float(expected["value"]), float(got["value"])
    return abs(a - b) <= max(0.005, VALUE_TOLERANCE * abs(a))


def score(case: dict, result: dict) -> dict[str, Any]:
    expected = sorted(case["decisions"], key=_key)
    got = sorted(result["decisions"], key=_key)
    remaining = list(got)
    matched = 0
    for e in expected:
        hit = next((g for g in remaining if _same(e, g)), None)
        if hit is not None:
            remaining.remove(hit)
            matched += 1
    decisions_ok = matched == len(expected) and not remaining
    questions_ok = sorted(q["slot"] for q in result["questions"]) == sorted(case["questions"])
    refused = result["out_of_scope"] is not None
    refusal_ok = refused == bool(case["refusal"])
    exact = decisions_ok and questions_ok and refusal_ok
    partial = not exact and (
        matched > 0 or (bool(case["questions"]) and questions_ok) or (case["refusal"] and refusal_ok))
    return {"exact": exact, "partial": partial, "decisions_ok": decisions_ok, "questions_ok": questions_ok,
            "refusal_ok": refusal_ok, "matched": matched, "expected_decisions": len(expected)}


def run_case(case: dict, today: dt.date, provider: Optional[Provider]) -> dict[str, Any]:
    ctx = context_for_case(case, today)
    started = time.monotonic()
    result = interpret_now(case["text"], [], ctx, provider)
    seconds = time.monotonic() - started
    row = {"id": case["id"], "category": case["category"], "industry": case["industry"], "text": case["text"],
           "provider_used": result["provider"], "model": result.get("model") or "", "fallback": result["fallback"],
           "seconds": round(seconds, 2)}
    row.update(score(case, result))
    row["expected"] = json.dumps({"decisions": case["decisions"], "questions": case["questions"],
                                  "refusal": case["refusal"]}, ensure_ascii=False)
    row["got"] = json.dumps({
        "decisions": [{k: d[k] for k in ("type", "start_month", "value", "unit")} for d in result["decisions"]],
        "questions": [q["slot"] for q in result["questions"]],
        "refusal": result["out_of_scope"] is not None}, ensure_ascii=False)
    return row


def _rate(n: int, d: int) -> str:
    return f"{n}/{d} ({100 * n / d:.0f}%)" if d else "n/a"


def summarize(rows: list[dict], cases: list[dict]) -> dict[str, Any]:
    by_id = {c["id"]: c for c in cases}
    n = len(rows)
    ask = [r for r in rows if by_id[r["id"]]["questions"]]
    refuse = [r for r in rows if by_id[r["id"]]["refusal"]]
    pure_refuse = [r for r in refuse if not by_id[r["id"]]["decisions"]]
    categories: dict[str, dict[str, int]] = {}
    for r in rows:
        c = categories.setdefault(r["category"], {"n": 0, "exact": 0})
        c["n"] += 1
        c["exact"] += int(r["exact"])
    return {
        "cases": n,
        "exact": sum(r["exact"] for r in rows),
        "partial": sum(r["partial"] for r in rows),
        "wrong": sum(not r["exact"] and not r["partial"] for r in rows),
        "questions_expected": len(ask),
        "questions_correct": sum(r["questions_ok"] and r["decisions_ok"] for r in ask),
        "refusals_expected": len(refuse),
        "refusals_correct": sum(r["refusal_ok"] and (r["decisions_ok"] or r not in pure_refuse) for r in refuse),
        "avg_seconds": round(sum(r["seconds"] for r in rows) / n, 2) if n else 0.0,
        "fell_back": sum(bool(r["fallback"]) for r in rows),
        "categories": categories,
    }


def format_summary(s: dict, provider: str, model: str) -> str:
    n = s["cases"]
    lines = [f"Provider: {provider}{' (' + model + ')' if model else ''}   cases: {n}", "",
             f"  Exact match        {_rate(s['exact'], n)}",
             f"  Partial match      {_rate(s['partial'], n)}",
             f"  Wrong              {_rate(s['wrong'], n)}",
             f"  Correct question   {_rate(s['questions_correct'], s['questions_expected'])}   (right questions, no invented values)",
             f"  Correct refusal    {_rate(s['refusals_correct'], s['refusals_expected'])}",
             f"  Average time       {s['avg_seconds']} s per case",
             f"  AI failed, rules answered instead: {s['fell_back']} of {n}", "", "  Exact match by kind of sentence:"]
    for name, c in s["categories"].items():
        lines.append(f"    {name:<13}{_rate(c['exact'], c['n'])}")
    return "\n".join(lines)
