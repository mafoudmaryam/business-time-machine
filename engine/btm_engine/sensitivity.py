"""One-at-a-time sensitivity analysis (spec section 7, level 4).

Moves each parameter ±20% from its central value in the deterministic model and
reports the swing in total profit. The result feeds a tornado chart.
"""
from __future__ import annotations

from dataclasses import replace

import numpy as np

from .decisions import Decision, build_timeline
from .model import simulate
from .params import CafeBaseline, CafeTemplate
from .montecarlo import deterministic_draws

DRAW_PARAMS = ("elasticity", "short_run_share", "churn0", "marketing_curvature", "word_of_mouth")
BASELINE_PARAMS = ("visits_per_regular", "walk_in_visits", "cogs_ratio", "wage_per_fte", "fixed_costs")


def one_at_a_time(base: CafeBaseline, tpl: CafeTemplate, decisions: list[Decision],
                  horizon: int = 24, swing: float = 0.20, metric: str = "profit") -> list[dict]:
    def total(b: CafeBaseline, draws) -> float:
        out = simulate(b, tpl, build_timeline(b, decisions, horizon), draws)
        return float(out[metric][0].sum()) if metric != "cash" else float(out["cash"][0, -1])

    central_draws = deterministic_draws(base, tpl)
    ref = total(base, central_draws)
    rows = []
    for name in DRAW_PARAMS:
        vals = []
        for f in (1 - swing, 1 + swing):
            d = deterministic_draws(base, tpl)
            setattr(d, name, np.asarray(getattr(d, name)) * f)
            vals.append(total(base, d))
        rows.append({"parameter": name, "low": vals[0], "high": vals[1], "swing": abs(vals[1] - vals[0])})
    for name in BASELINE_PARAMS:
        vals = [total(replace(base, **{name: getattr(base, name) * f}), central_draws)
                for f in (1 - swing, 1 + swing)]
        rows.append({"parameter": name, "low": vals[0], "high": vals[1], "swing": abs(vals[1] - vals[0])})
    rows.sort(key=lambda r: r["swing"], reverse=True)
    for r in rows:
        r["reference"] = ref
    return rows
