"""Quick start: four answers -> a full baseline (btm_engine/quickstart.py), and the Today facts."""
from __future__ import annotations

import json
import math

import numpy as np
import pytest

from btm_engine import (build_today_facts, month_one_summary, quick_baseline, run_deterministic, run_scenarios,
                        sample_assumed)
from btm_engine.templates import list_industries

TEMPLATES = list_industries()
IDS = [t.id for t in TEMPLATES]


def typical_answers(tpl):
    """Answers that describe exactly the template's own default business."""
    t0 = tpl.default_baseline
    visits = t0.customers * t0.visits_per_regular + t0.walk_in_visits
    return dict(customers_per_day=visits / t0.open_days, avg_spend=t0.avg_ticket,
                monthly_rent=t0.fixed_costs * 0.75, staff=t0.staff_fte)   # rent x 4/3 = default fixed costs


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_typical_answers_give_back_the_industry_defaults(tpl):
    t0 = tpl.default_baseline
    q = quick_baseline(tpl, **typical_answers(tpl))
    b = q.baseline
    assert b.customers == pytest.approx(t0.customers, abs=0.1)
    assert b.walk_in_visits == pytest.approx(t0.walk_in_visits, abs=0.1)
    assert b.visits_per_regular == t0.visits_per_regular
    assert b.avg_ticket == t0.avg_ticket
    assert b.staff_fte == t0.staff_fte
    assert b.fixed_costs == pytest.approx(t0.fixed_costs, rel=1e-6)
    assert b.marketing == pytest.approx(t0.marketing, rel=0.01)       # 3 significant figures
    assert month_one_summary(b, tpl)["profit"] == pytest.approx(month_one_summary(t0, tpl)["profit"], rel=0.01)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_visits_in_equal_visits_out(tpl):
    """Customers a day x opening days is exactly regulars' visits plus walk-in visits."""
    q = quick_baseline(tpl, customers_per_day=120, avg_spend=9, monthly_rent=3000, staff=3)
    b = q.baseline
    assert b.customers * b.visits_per_regular + b.walk_in_visits == pytest.approx(120 * b.open_days, abs=0.2)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_regulars_share_matches_the_template(tpl):
    t0 = tpl.default_baseline
    want = t0.customers * t0.visits_per_regular / (t0.customers * t0.visits_per_regular + t0.walk_in_visits)
    b = quick_baseline(tpl, 200, 7, 4000, 4).baseline
    got = b.customers * b.visits_per_regular / (b.customers * b.visits_per_regular + b.walk_in_visits)
    assert got == pytest.approx(want, abs=0.001)


def test_fixed_costs_are_rent_plus_a_third():
    q = quick_baseline(TEMPLATES[0], 150, 6.5, 3000, 4)
    assert q.baseline.fixed_costs == pytest.approx(4000.0)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_cash_is_two_months_of_costs(tpl):
    b = quick_baseline(tpl, 150, 8, 3500, 4).baseline
    costs = month_one_summary(b, tpl)["costs"]
    assert b.cash == pytest.approx(2 * costs, rel=0.01)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_quick_business_does_not_drift(tpl):
    """Like every baseline: with nothing decided and no noise, the business stays where the owner says it is."""
    staff = math.ceil(90 * 28 / tpl.visits_per_fte) + 1          # enough people for 90 customers a day
    q = quick_baseline(tpl, 90, 11, 2500, staff)
    assert q.warnings == []
    b = q.baseline
    out = run_deterministic(b, tpl, [], 24)
    np.testing.assert_allclose(out["customers"], b.customers, rtol=1e-9)
    np.testing.assert_allclose(out["revenue"], out["revenue"][0], rtol=1e-9)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_too_few_staff_for_the_customers_gives_a_warning_not_an_error(tpl):
    q = quick_baseline(tpl, 600, 9, 3000, 1)
    assert len(q.warnings) == 1
    assert "1 person" in q.warnings[0] and "600" in q.warnings[0]
    assert "FTE" not in q.warnings[0]


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_typical_answers_give_no_warning(tpl):
    assert quick_baseline(tpl, **typical_answers(tpl)).warnings == []


def test_bigger_business_means_proportionally_more_sales():
    tpl = TEMPLATES[0]
    small = month_one_summary(quick_baseline(tpl, 100, 6, 3000, 4).baseline, tpl)["sales"]
    big = month_one_summary(quick_baseline(tpl, 200, 6, 3000, 4).baseline, tpl)["sales"]
    assert big == pytest.approx(2 * small, rel=1e-3)


def test_assumed_list_names_real_fields_and_has_plain_rules():
    tpl = TEMPLATES[0]
    fields = set(tpl.default_baseline.to_dict())
    q = quick_baseline(tpl, 150, 6.5, 3000, 4)
    assert {a["field"] for a in q.assumed} <= fields
    by_field = {a["field"]: a["rule"] for a in q.assumed}
    assert "one third" in by_field["fixed_costs"]
    assert "two months" in by_field["cash"]
    assert "full-time" in by_field["staff_fte"]
    assert all(a["rule"] and a["rule"][0].islower() for a in q.assumed)


def test_sample_assumed_covers_every_field():
    for tpl in TEMPLATES:
        assert {a["field"] for a in sample_assumed(tpl)} == set(tpl.default_baseline.to_dict())


@pytest.mark.parametrize("kwargs", [
    dict(customers_per_day=0), dict(customers_per_day=-5), dict(customers_per_day=1e9),
    dict(avg_spend=0), dict(avg_spend=-1), dict(monthly_rent=-1), dict(staff=0), dict(staff=-2), dict(staff=10_000),
    dict(customers_per_day=float("nan")), dict(avg_spend=float("inf")), dict(staff=True),
])
def test_bad_answers_are_rejected(kwargs):
    answers = dict(customers_per_day=100, avg_spend=8, monthly_rent=3000, staff=3) | kwargs
    with pytest.raises(ValueError):
        quick_baseline(TEMPLATES[0], **answers)


def test_zero_rent_is_allowed():
    q = quick_baseline(TEMPLATES[0], 100, 8, 0, 3)
    assert q.baseline.fixed_costs == 0


# ---------- Today facts ----------

def _today(tpl, currency="USD", **answers):
    b = quick_baseline(tpl, **(dict(customers_per_day=150, avg_spend=7, monthly_rent=3000, staff=4) | answers)).baseline
    run = run_scenarios(b, tpl, {}, horizon=12, iterations=300, seed=7)
    base = run.scenarios["baseline"]
    return b, base, build_today_facts(b, tpl, base.summary, base.bands, 12, currency)


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_today_facts_have_the_expected_numbers(tpl):
    b, base, facts = _today(tpl)
    t = facts["today"]
    assert facts["scenarios"] == []
    assert t["profit_a_month_bad_case"] <= t["profit_a_month"] <= t["profit_a_month_good_case"]
    assert t["cash_now"] == pytest.approx(b.cash, rel=0.01)
    assert t["sales_a_month"] - t["costs_a_month"] == pytest.approx(month_one_summary(b, tpl)["profit"], rel=0.02, abs=5)
    assert 0 <= t["cash_runs_out_of_10"] <= 10
    assert 1 <= t["lowest_cash_month"] <= 12
    assert t["months_of_bills_covered"] == pytest.approx(b.cash / month_one_summary(b, tpl)["costs"], abs=0.51)
    assert facts["business"]["industry"] == tpl.display_name


def test_today_facts_are_json_and_rounded():
    _, _, facts = _today(TEMPLATES[0])
    text = json.dumps(facts)
    assert "NaN" not in text and "Infinity" not in text
    for v in facts["today"].values():
        assert math.isfinite(v)
        # three significant figures at most (whole counts excepted)
        assert v == float(f"{v:.3g}") or float(v).is_integer()


def test_today_facts_show_a_loss_when_costs_beat_sales():
    _, _, facts = _today(TEMPLATES[0], customers_per_day=20, avg_spend=5, monthly_rent=6000, staff=6)
    assert facts["today"]["profit_a_month"] < 0
