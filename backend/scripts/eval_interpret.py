r"""Run the interpretation evaluation set against one provider and print the accuracy.

Run from the backend folder (PowerShell):

    .\.venv\Scripts\python.exe scripts\eval_interpret.py --provider template
    .\.venv\Scripts\python.exe scripts\eval_interpret.py --provider ollama --model qwen2.5:7b
    .\.venv\Scripts\python.exe scripts\eval_interpret.py --provider ollama --sample 5     # a quick spot check
    .\.venv\Scripts\python.exe scripts\eval_interpret.py --provider anthropic              # needs ANTHROPIC_API_KEY

It writes one CSV row per case to backend\eval_results\. Nothing is saved in the app's database.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import settings  # noqa: E402,F401  (loads backend/.env)
from app.coach.providers import make_provider  # noqa: E402
from app.interpret import evaluation  # noqa: E402


def pick_sample(cases: list[dict], n: int) -> list[dict]:
    """A spread across the kinds of sentence: one from each category in turn, in file order."""
    buckets: dict[str, list[dict]] = {}
    for c in cases:
        buckets.setdefault(c["category"], []).append(c)
    chosen: list[dict] = []
    while len(chosen) < n and any(buckets.values()):
        for name in list(buckets):
            if buckets[name] and len(chosen) < n:
                chosen.append(buckets[name].pop(0))
    return chosen


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--provider", choices=["template", "ollama", "anthropic"], default="template")
    parser.add_argument("--model", help="model name (sets OLLAMA_MODEL or ANTHROPIC_MODEL for this run)")
    parser.add_argument("--sample", type=int, help="only run N cases, spread over the kinds of sentence")
    parser.add_argument("--limit", type=int, help="only run the first N cases")
    parser.add_argument("--cases", type=Path, help="a different cases file")
    parser.add_argument("--out", type=Path, help="CSV path (default: eval_results/interpret_<provider>_<time>.csv)")
    args = parser.parse_args()

    if args.model:
        os.environ["OLLAMA_MODEL" if args.provider == "ollama" else "ANTHROPIC_MODEL"] = args.model
    provider = make_provider(args.provider)
    if args.provider != "template" and provider is None:
        print(f"Cannot use {args.provider}: is ANTHROPIC_API_KEY set?", file=sys.stderr)
        return 2

    data = evaluation.load_cases(args.cases)
    today = dt.date.fromisoformat(data["today"])
    cases = data["cases"]
    if args.sample:
        cases = pick_sample(cases, args.sample)
    elif args.limit:
        cases = cases[:args.limit]

    rows = []
    for i, case in enumerate(cases, 1):
        row = evaluation.run_case(case, today, provider)
        rows.append(row)
        mark = "exact  " if row["exact"] else "partial" if row["partial"] else "WRONG  "
        note = "  (AI failed; rules answered)" if row["fallback"] else ""
        print(f"[{i:>2}/{len(cases)}] {mark} {row['seconds']:>6.1f}s  {case['id']:<10} {case['text'][:60]}{note}", flush=True)

    model = provider.model if provider else ""
    print("\n" + evaluation.format_summary(evaluation.summarize(rows, cases), args.provider, model))

    out = args.out or Path(__file__).resolve().parents[1] / "eval_results" / (
        f"interpret_{args.provider}{'_' + model.replace(':', '-') if model else ''}_{dt.datetime.now():%Y%m%d_%H%M%S}.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nSaved {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
