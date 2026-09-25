"""Cross-industry validation: every template's baseline must be a sane steady
state with a plausible margin, and the model's core behaviors (price direction,
long-run elasticity, waste) must hold for each of them."""
from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from btm_engine import Decision, run_deterministic
from btm_engine.templates import list_industries

TEMPLATES = list_industries()
IDS = [t.id for t in TEMPLATES]


def det(tpl, decisions=(), horizon=24):
    return run_deterministic(tpl.default_baseline, tpl, list(decisions), horizon)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_baseline_is_steady_state_with_plausible_margin(tpl):
    """No decisions, no noise: the business should not drift, and its central
    margin should be a believable 5-15%, not a loss or an implausible windfall."""
    out = det(tpl, horizon=36)
    np.testing.assert_allclose(out["customers"], tpl.default_baseline.customers, rtol=1e-9)
    np.testing.assert_allclose(out["revenue"], out["revenue"][0], rtol=1e-9)
    np.testing.assert_allclose(np.diff(out["cash"]), out["profit"][0], rtol=1e-9)

    revenue, profit = out["revenue"][0], out["profit"][0]
    margin = profit / revenue
    assert 0.05 <= margin <= 0.15, f"{tpl.id}: margin {margin:.1%} outside the plausible 5-15% band"


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_price_rise_cuts_visits_and_customers(tpl):
    base_out = det(tpl)
    out = det(tpl, [Decision("price", 3, 10, "percent")])
    assert (out["visits"][2:] < base_out["visits"][2:]).all()
    assert out["customers"][-1] < base_out["customers"][-1]


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_long_run_price_elasticity_matches_template(tpl):
    """After customers settle, visits respond to price with elasticity ~ the
    template's central elasticity (allowing some slack for word-of-mouth)."""
    horizon = 60
    base_v = det(tpl, horizon=horizon)["visits"][-1]
    up_v = det(tpl, [Decision("price", 1, 1, "percent")], horizon=horizon)["visits"][-1]
    implied = np.log(up_v / base_v) / np.log(1.01)
    assert implied == pytest.approx(tpl.elasticity[1], abs=0.15)


def test_waste_increases_cogs_only_for_bakery():
    for tpl in TEMPLATES:
        with_waste = det(tpl)["cogs"][0]
        without_waste = det(replace(tpl, waste_rate=(0.0, 0.0, 0.0)))["cogs"][0]
        if tpl.id == "bakery":
            assert with_waste > without_waste
        else:
            np.testing.assert_allclose(with_waste, without_waste, rtol=1e-9)
