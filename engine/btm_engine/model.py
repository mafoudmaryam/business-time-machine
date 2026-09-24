"""Core monthly model (spec section 3), vectorised over Monte Carlo runs.

Every state variable is an array of shape (N,), one entry per run, so 1,000
runs cost about as much as one Python loop over the months.
"""
from __future__ import annotations

import numpy as np

from .params import CafeBaseline, CafeTemplate, Draws

METRICS = (
    "customers", "visits", "demand_visits", "revenue", "cogs", "labour", "fixed_costs",
    "marketing", "profit", "cash", "churn_rate", "new_customers", "service_quality", "awareness",
)


def calibrate(base: CafeBaseline, tpl: CafeTemplate, draws: Draws) -> dict[str, np.ndarray]:
    """Pick n0 and α per run so that, with no decisions, no seasonality and no noise,
    the café stays exactly where the owner says it is today (a steady state).

    Any movement in a scenario therefore comes from the decisions, not from the
    model drifting on its own.
    """
    A0 = tpl.awareness0
    C0 = base.customers
    # Steady state for customers: new regulars = churned regulars at t=0.
    n0 = np.maximum(C0 * (draws.churn0 - draws.word_of_mouth) / A0, 0.0)
    # Steady state for awareness: inflow = decay at A0.
    alpha = tpl.awareness_decay * A0 / ((base.marketing + tpl.marketing_ref) ** draws.marketing_curvature * (1 - A0))
    return {"n0": n0, "alpha": alpha}


def simulate(base: CafeBaseline, tpl: CafeTemplate, timeline: dict[str, np.ndarray],
             draws: Draws) -> dict[str, np.ndarray]:
    """Run the model. Returns {metric: array of shape (N, T)}."""
    base.validate()
    T = len(timeline["price"])
    N = draws.n
    cal = calibrate(base, tpl, draws)

    eps = np.asarray(draws.elasticity, dtype=float)
    phi = np.asarray(draws.short_run_share, dtype=float)
    eta = -eps * (1 - phi)          # price sensitivity of churn, derived
    delta0 = np.asarray(draws.churn0, dtype=float)
    gamma = np.asarray(draws.marketing_curvature, dtype=float)
    beta = np.asarray(draws.word_of_mouth, dtype=float)
    noise = np.ones((N, T)) if draws.noise is None else np.asarray(draws.noise, dtype=float)

    p0 = base.avg_ticket
    d0 = base.open_days
    C = np.full(N, base.customers, dtype=float)
    K = np.full(N, base.cash, dtype=float)
    A = np.full(N, tpl.awareness0, dtype=float)

    out = {m: np.empty((N, T)) for m in METRICS}

    for t in range(T):
        s = tpl.season(t)
        p = timeline["price"][t]
        S = timeline["staff"][t]
        M = timeline["marketing"][t]
        c = timeline["cogs_ratio"][t]
        day_ratio = timeline["open_days"][t] / d0

        # 1. Price effect on demand. Walk-ins react fully and at once; regulars react
        #    partly through visit frequency now (φ) and partly through churn later (1-φ).
        ratio = p / p0
        D_walk = ratio ** eps
        D_reg = ratio ** (eps * phi)
        # 2. Demand, capacity, service quality
        walk_ins = base.walk_in_visits * day_ratio
        v_dem = s * noise[:, t] * (base.visits_per_regular * C * D_reg + walk_ins * D_walk)
        capacity = tpl.visits_per_fte * day_ratio * timeline["capacity_mult"][t] * S
        V = np.minimum(v_dem, capacity)
        Q = np.where(v_dem > 0, np.minimum(1.0, capacity / np.maximum(v_dem, 1e-9)), 1.0)
        # 4. New regulars (uses awareness at the start of the month). Price does not
        #    enter here, so the price effect is not counted twice.
        new = s * (cal["n0"] * A + beta * Q * C)
        # 5. Churn
        churn = np.clip(delta0 * ratio ** eta * (1 + tpl.service_penalty * (1 - Q)), 0.0, 1.0)
        # 7. Profit and loss
        R = p * timeline["ticket_mult"][t] * V
        cogs = c * R
        labour = base.wage_per_fte * S * day_ratio
        fixed = base.fixed_costs * (1 - tpl.utilities_share + tpl.utilities_share * day_ratio)
        profit = R - cogs - labour - fixed - M
        # 8. Cash (end of month)
        K = K + profit - timeline["investment"][t] - timeline["loan_payment"][t]

        out["customers"][:, t] = C
        out["visits"][:, t] = V
        out["demand_visits"][:, t] = v_dem
        out["revenue"][:, t] = R
        out["cogs"][:, t] = cogs
        out["labour"][:, t] = labour
        out["fixed_costs"][:, t] = fixed
        out["marketing"][:, t] = M
        out["profit"][:, t] = profit
        out["cash"][:, t] = K
        out["churn_rate"][:, t] = churn
        out["new_customers"][:, t] = new
        out["service_quality"][:, t] = Q
        out["awareness"][:, t] = A

        # 3. Awareness and 6. customer stock for next month
        A = (1 - tpl.awareness_decay) * A + cal["alpha"] * (M + tpl.marketing_ref) ** gamma * (1 - A)
        A = np.clip(A, 0.0, 1.0)
        C = np.maximum(C * (1 - churn) + new, 0.0)

    return out
