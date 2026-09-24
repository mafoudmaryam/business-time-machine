"""Validation levels 1-3 from the model spec, as automated tests."""
import numpy as np
import pytest

from btm_engine import (CafeBaseline, CafeTemplate, Decision, run_deterministic, run_scenarios,
                        one_at_a_time)

BASE = CafeBaseline()
TPL = CafeTemplate()


def det(decisions=(), horizon=24, base=BASE, tpl=TPL):
    return run_deterministic(base, tpl, list(decisions), horizon)


# ---------- Level 1: verification against the hand calculation in spec section 6 ----------

def test_baseline_month1_matches_hand_calculation():
    out = det(horizon=1)
    assert out["revenue"][0] == pytest.approx(6.50 * (6 * 900 + 2500))          # 51,350
    assert out["cogs"][0] == pytest.approx(0.30 * 51_350)
    assert out["labour"][0] == pytest.approx(5 * 3_000)
    assert out["profit"][0] == pytest.approx(51_350 * 0.7 - 15_000 - 15_000 - 400)  # 5,545
    assert out["cash"][0] == pytest.approx(25_000 + 5_545)
    assert out["service_quality"][0] == pytest.approx(1.0)                      # 7,900 < 9,000 capacity


def test_baseline_is_steady_state():
    """With no decisions, no noise and flat seasonality the café does not drift."""
    out = det(horizon=36)
    np.testing.assert_allclose(out["customers"], 900, rtol=1e-9)
    np.testing.assert_allclose(out["revenue"], 51_350, rtol=1e-9)
    np.testing.assert_allclose(out["awareness"], TPL.awareness0, rtol=1e-9)
    np.testing.assert_allclose(np.diff(out["cash"]), 5_545, rtol=1e-9)


def test_runs_are_reproducible_with_same_seed():
    a = run_scenarios(BASE, TPL, {}, horizon=12, iterations=200, seed=7)
    b = run_scenarios(BASE, TPL, {}, horizon=12, iterations=200, seed=7)
    assert a.to_dict() == b.to_dict()


# ---------- Level 2: extreme-condition tests ----------

@pytest.mark.parametrize("decisions", [
    [Decision("price", 1, 900, "percent")],          # price x10
    [Decision("price", 1, -99, "percent")],          # price near zero
    [Decision("hiring", 1, -5, "fte")],              # no staff
    [Decision("marketing", 1, 0, "per_month")],
    [Decision("hours", 1, 1, "days")],
])
def test_extreme_conditions_stay_physical(decisions):
    res = run_scenarios(BASE, TPL, {"x": decisions}, horizon=24, iterations=300, seed=1, keep_raw=True)
    raw = res.scenarios["x"].raw
    for m, arr in raw.items():
        assert np.isfinite(arr).all(), m
    assert (raw["customers"] >= 0).all()
    assert (raw["visits"] <= raw["demand_visits"] + 1e-9).all()
    assert ((raw["churn_rate"] >= 0) & (raw["churn_rate"] <= 1)).all()
    assert ((raw["service_quality"] >= 0) & (raw["service_quality"] <= 1)).all()
    # cash changes by exactly profit when there is no investment
    np.testing.assert_allclose(np.diff(raw["cash"], axis=1), raw["profit"][:, 1:], rtol=1e-9, atol=1e-6)


def test_zero_staff_means_zero_revenue():
    out = det([Decision("hiring", 1, -5, "fte")])
    assert out["revenue"].max() == 0
    assert out["service_quality"].max() == 0


def test_churn_is_capped_at_one():
    base = CafeBaseline(churn_rate=1.0)
    tpl = CafeTemplate(churn_range=(1.0, 1.0), word_of_mouth=(0.0, 0.0))
    out = det(base=base, tpl=tpl, horizon=6)
    # n0 keeps the steady state, so check the dynamics directly: churn is capped at 1
    assert out["churn_rate"].max() <= 1.0


# ---------- Level 3: behaviour tests (direction of effects) ----------

def test_price_rise_raises_ticket_but_cuts_visits_and_customers():
    base_out = det()
    out = det([Decision("price", 3, 10, "percent")])
    assert (out["visits"][2:] < base_out["visits"][2:]).all()
    assert out["customers"][-1] < base_out["customers"][-1]
    assert out["revenue"][2] > base_out["revenue"][2]     # month 3: elasticity -0.81 is inelastic, revenue up
    np.testing.assert_allclose(out["revenue"][:2], base_out["revenue"][:2])


def test_hiring_raises_labour_cost_and_capacity():
    out = det([Decision("hiring", 6, 1, "fte")])
    assert out["labour"][5] == pytest.approx(6 * 3_000)
    assert out["profit"][5] < det()["profit"][5]            # at baseline there is spare capacity


def test_understaffing_lowers_quality_and_raises_churn():
    out = det([Decision("hiring", 1, -1.5, "fte")])          # capacity 6,300 < demand 7,900
    assert out["service_quality"][0] < 1
    assert out["churn_rate"][0] > BASE.churn_rate
    assert out["customers"][-1] < 900


def test_more_marketing_grows_awareness_and_customers():
    out = det([Decision("marketing", 1, 1_200, "per_month")])
    assert out["awareness"][-1] > TPL.awareness0
    assert out["customers"][-1] > 900


def test_investment_with_loan_spreads_cash_outflow():
    out = det([Decision("investment", 1, 9_000, "amount", {"loan_months": 12, "capacity_pct": 10})])
    base_out = det()
    diff = base_out["cash"] - out["cash"]
    assert diff[11] == pytest.approx(9_000)                  # fully repaid after 12 months, 0% rate
    assert diff[0] == pytest.approx(750)


def test_monte_carlo_bands_are_ordered_and_risk_is_reported():
    res = run_scenarios(BASE, TPL, {"price+10": [Decision("price", 3, 10, "percent")]},
                        horizon=24, iterations=500, seed=3)
    for s in res.scenarios.values():
        for m, b in s.bands.items():
            assert (np.array(b["p10"]) <= np.array(b["p50"]) + 1e-9).all(), m
            assert (np.array(b["p50"]) <= np.array(b["p90"]) + 1e-9).all(), m
    summ = res.scenarios["price+10"].summary
    assert 0 <= summ["prob_cash_negative"] <= 1
    assert 0 <= summ["prob_beats_baseline_profit"] <= 1


def test_sensitivity_ranks_parameters():
    rows = one_at_a_time(BASE, TPL, [Decision("price", 1, 10, "percent")], horizon=12)
    swings = [r["swing"] for r in rows]
    assert swings == sorted(swings, reverse=True)
    assert rows[0]["swing"] > 0


def test_invalid_decision_rejected():
    with pytest.raises(ValueError):
        det([Decision("teleport", 1, 1)])
    with pytest.raises(ValueError):
        det([Decision("price", 30, 10, "percent")], horizon=24)


def test_long_run_price_elasticity_matches_template():
    """After customers settle, visits respond to price with elasticity ≈ ε (no double counting).
    Word of mouth shifts the steady state slightly, so allow a small tolerance."""
    horizon = 60
    base_v = det(horizon=horizon)["visits"][-1]
    up_v = det([Decision("price", 1, 1, "percent")], horizon=horizon)["visits"][-1]
    implied = np.log(up_v / base_v) / np.log(1.01)
    assert implied == pytest.approx(TPL.elasticity[1], abs=0.15)
