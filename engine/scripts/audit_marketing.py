"""Audit marketing assumptions; print paired simulation results as CSV.

From the project root: python engine/scripts/audit_marketing.py
No database, AI provider or network is used. Stress cases are hypothetical,
not estimated probabilities of a campaign failing or a business being full.
"""
from __future__ import annotations

import argparse
import csv
from dataclasses import replace
from pathlib import Path
import sys

# Allow the documented command on a fresh checkout without installing the engine.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from btm_engine import Decision, get_template, run_scenarios


def audit_rows(industry="cafe", budgets=(200, 400, 800, 1200, 2000, 4000),
               horizons=(12, 24), seeds=(7, 42, 2026), iterations=2000):
    """Compare each budget with its case's unchanged business on paired draws.

    Each stress case changes ONE assumption. They are not mixed into the default
    Monte Carlo distribution, and their frequencies are not real-world odds.
    """
    if iterations < 1:
        raise ValueError("iterations must be positive")
    tpl = get_template(industry)
    base = tpl.default_baseline
    full_staff = (base.customers * base.visits_per_regular + base.walk_in_visits) / tpl.visits_per_fte
    cases = (
        ("default", base, tpl),
        ("no_extra_response", base, replace(tpl, marketing_curvature=(0.0, 0.0))),
        ("at_capacity", replace(base, staff_fte=full_staff), tpl),
    )
    for case, baseline, template in cases:
        for horizon in horizons:
            for seed in seeds:
                scenarios = {str(budget): [Decision("marketing", 1, budget, "per_month")]
                             for budget in budgets}
                result = run_scenarios(baseline, template, scenarios, horizon=horizon,
                                       iterations=iterations, seed=seed, keep_raw=True)
                unchanged = result.scenarios["baseline"].raw["profit"].sum(axis=1)
                for budget in budgets:
                    scenario = result.scenarios[str(budget)]
                    difference = scenario.raw["profit"].sum(axis=1) - unchanged
                    p10, p50, p90 = np.percentile(difference, [10, 50, 90])
                    yield {
                        "engine_version": result.engine_version,
                        "industry": industry, "case": case, "seed": seed,
                        "iterations": iterations, "horizon_months": horizon,
                        "baseline_marketing_monthly": baseline.marketing,
                        "scenario_marketing_monthly": budget,
                        "staff_fte": round(baseline.staff_fte, 6),
                        "extra_marketing_total": round((budget - baseline.marketing) * horizon, 2),
                        "profit_change_p10": round(float(p10), 2),
                        "profit_change_p50": round(float(p50), 2),
                        "profit_change_p90": round(float(p90), 2),
                        "share_beating_baseline": float((difference > 0).mean()),
                    }


def positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--industry", choices=("cafe", "restaurant", "bakery"), default="cafe")
    parser.add_argument("--iterations", type=positive_int, default=2000)
    args = parser.parse_args()
    rows = iter(audit_rows(industry=args.industry, iterations=args.iterations))
    first = next(rows)
    writer = csv.DictWriter(sys.stdout, fieldnames=list(first), lineterminator="\n")
    writer.writeheader()
    writer.writerow(first)
    writer.writerows(rows)


if __name__ == "__main__":
    main()
