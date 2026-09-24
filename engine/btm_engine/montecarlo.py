"""Monte Carlo layer (spec section 5): sampling, common random numbers,
percentile bands and risk flags."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .decisions import Decision, build_timeline
from .model import METRICS, simulate
from .params import CafeBaseline, CafeTemplate, Draws

ENGINE_VERSION = "0.1.0"
BAND_METRICS = ("revenue", "profit", "cash", "customers", "visits", "service_quality")


def _lhs_uniform(rng: np.random.Generator, n: int) -> np.ndarray:
    """Latin hypercube sample on (0, 1): one point in each of n equal strata."""
    return (rng.permutation(n) + rng.random(n)) / n


def _tri_ppf(u: np.ndarray, lo: float, mode: float, hi: float) -> np.ndarray:
    if hi == lo:
        return np.full_like(u, lo)
    fc = (mode - lo) / (hi - lo)
    left = lo + np.sqrt(u * (hi - lo) * (mode - lo))
    right = hi - np.sqrt((1 - u) * (hi - lo) * (hi - mode))
    return np.where(u < fc, left, right)


def churn_bounds(base: CafeBaseline, tpl: CafeTemplate) -> tuple[float, float, float]:
    lo, hi = tpl.churn_range
    mode = base.churn_rate
    return min(lo, mode), mode, max(hi, mode)


def sample_draws(base: CafeBaseline, tpl: CafeTemplate, n: int, horizon: int, seed: int) -> Draws:
    rng = np.random.default_rng(seed)
    return Draws(
        elasticity=_tri_ppf(_lhs_uniform(rng, n), *tpl.elasticity),
        short_run_share=_tri_ppf(_lhs_uniform(rng, n), *tpl.short_run_share),
        churn0=_tri_ppf(_lhs_uniform(rng, n), *churn_bounds(base, tpl)),
        marketing_curvature=tpl.marketing_curvature[0]
        + _lhs_uniform(rng, n) * (tpl.marketing_curvature[1] - tpl.marketing_curvature[0]),
        word_of_mouth=tpl.word_of_mouth[0] + _lhs_uniform(rng, n) * (tpl.word_of_mouth[1] - tpl.word_of_mouth[0]),
        noise=np.clip(rng.normal(1.0, tpl.demand_noise_sd, size=(n, horizon)), 0.0, None),
    )


def deterministic_draws(base: CafeBaseline, tpl: CafeTemplate) -> Draws:
    """A single run with every uncertain parameter at its central value and no noise.
    This is the version to rebuild in a spreadsheet for verification."""
    m = tpl.mode_values()
    return Draws(
        elasticity=np.array([m["elasticity"]]),
        short_run_share=np.array([m["short_run_share"]]),
        churn0=np.array([base.churn_rate]),
        marketing_curvature=np.array([m["marketing_curvature"]]),
        word_of_mouth=np.array([m["word_of_mouth"]]),
        noise=None,
    )


@dataclass
class ScenarioResult:
    name: str
    decisions: list[Decision]
    bands: dict[str, dict[str, list[float]]]      # metric -> {"p10": [...], "p50": [...], "p90": [...]}
    summary: dict[str, float]
    raw: dict[str, np.ndarray] = field(repr=False, default_factory=dict)


@dataclass
class RunResult:
    engine_version: str
    seed: int
    iterations: int
    horizon: int
    scenarios: dict[str, ScenarioResult]

    def to_dict(self) -> dict:
        """JSON-ready form for the API / simulation_results table."""
        return {
            "engine_version": self.engine_version, "seed": self.seed,
            "iterations": self.iterations, "horizon": self.horizon,
            "scenarios": {
                k: {"decisions": [d.__dict__ for d in s.decisions], "bands": s.bands, "summary": s.summary}
                for k, s in self.scenarios.items()
            },
        }


def _bands(x: np.ndarray) -> dict[str, list[float]]:
    p10, p50, p90 = np.percentile(x, [10, 50, 90], axis=0)
    return {"p10": p10.round(2).tolist(), "p50": p50.round(2).tolist(), "p90": p90.round(2).tolist()}


def _summary(out: dict[str, np.ndarray], baseline_out: dict[str, np.ndarray] | None) -> dict[str, float]:
    total_profit = out["profit"].sum(axis=1)
    end_cash = out["cash"][:, -1]
    neg = out["cash"] < 0
    ever_neg = neg.any(axis=1)
    p_neg_by_month = neg.mean(axis=0)
    first_risky = next((i + 1 for i, p in enumerate(p_neg_by_month) if p >= 0.10), None)
    s = {
        "total_profit_p10": float(np.percentile(total_profit, 10)),
        "total_profit_p50": float(np.percentile(total_profit, 50)),
        "total_profit_p90": float(np.percentile(total_profit, 90)),
        "end_cash_p50": float(np.percentile(end_cash, 50)),
        "min_cash_p10": float(np.percentile(out["cash"].min(axis=1), 10)),
        "prob_cash_negative": float(ever_neg.mean()),
        "first_month_cash_risk_10pct": first_risky,
        "end_customers_p50": float(np.percentile(out["customers"][:, -1], 50)),
        "avg_service_quality_p50": float(np.percentile(out["service_quality"].mean(axis=1), 50)),
    }
    if baseline_out is not None:
        # Common random numbers: run i of every scenario used the same draws,
        # so this compares like with like.
        s["prob_beats_baseline_profit"] = float((total_profit > baseline_out["profit"].sum(axis=1)).mean())
        s["profit_vs_baseline_p50"] = float(np.percentile(total_profit - baseline_out["profit"].sum(axis=1), 50))
    return s


def run_scenarios(base: CafeBaseline, tpl: CafeTemplate, scenarios: dict[str, list[Decision]],
                  horizon: int = 24, iterations: int = 1000, seed: int = 42,
                  keep_raw: bool = False) -> RunResult:
    """Run a baseline plus each scenario on the same random draws.

    `scenarios` should not include "baseline"; it is added automatically.
    """
    if not 1 <= horizon <= 60:
        raise ValueError("horizon must be between 1 and 60 months")
    draws = sample_draws(base, tpl, iterations, horizon, seed)
    all_scen = {"baseline": []} | dict(scenarios)
    raw_by_name = {name: simulate(base, tpl, build_timeline(base, decs, horizon), draws)
                   for name, decs in all_scen.items()}
    base_out = raw_by_name["baseline"]
    results = {}
    for name, decs in all_scen.items():
        out = raw_by_name[name]
        results[name] = ScenarioResult(
            name=name, decisions=list(decs),
            bands={m: _bands(out[m]) for m in BAND_METRICS},
            summary=_summary(out, None if name == "baseline" else base_out),
            raw=out if keep_raw else {},
        )
    return RunResult(ENGINE_VERSION, seed, iterations, horizon, results)


def run_deterministic(base: CafeBaseline, tpl: CafeTemplate, decisions: list[Decision],
                      horizon: int = 24) -> dict[str, np.ndarray]:
    """One run at central parameter values. Returns {metric: array of length T}."""
    out = simulate(base, tpl, build_timeline(base, decisions, horizon), deterministic_draws(base, tpl))
    return {m: out[m][0] for m in METRICS}
