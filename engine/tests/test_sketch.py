"""The "Try a change" sketch: one slider position -> one engine decision -> a quick 12-month answer."""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pytest

from btm_engine import SKETCH_HORIZON, SKETCH_ITERATIONS, SKETCH_TYPES, preview_change, sketch_decision
from btm_engine.templates import list_industries

TEMPLATES = list_industries()
IDS = [t.id for t in TEMPLATES]


def sketch(tpl, kind="price", amount=7, start=1, seed=11, **kw):
    return preview_change(tpl.default_baseline, tpl, kind, amount, start, seed=seed, currency="USD", **kw)


# ---------- the slider position becomes an engine decision ----------

class TestDecision:
    @pytest.mark.parametrize("kind,amount,unit", [("price", 7, "percent"), ("hours", 24, "days"), ("hiring", 1, "fte"),
                                                  ("marketing", 50, "percent")])
    def test_each_kind_uses_the_engines_own_unit(self, kind, amount, unit):
        d = sketch_decision(kind, amount, 3)
        assert (d.type, d.value, d.unit, d.start_month) == (kind, float(amount), unit, 3)

    @pytest.mark.parametrize("kind,low,high", [(k, v[1], v[2]) for k, v in SKETCH_TYPES.items()])
    def test_the_edges_of_each_range_are_allowed_and_just_outside_is_not(self, kind, low, high):
        sketch_decision(kind, low, 1)
        sketch_decision(kind, high, 1)
        with pytest.raises(ValueError):
            sketch_decision(kind, low - 0.01, 1)
        with pytest.raises(ValueError):
            sketch_decision(kind, high + 0.01, 1)

    @pytest.mark.parametrize("start", [0, -1, 13, 36])
    def test_the_start_month_must_be_inside_the_12_months(self, start):
        with pytest.raises(ValueError):
            sketch_decision("price", 5, start)

    @pytest.mark.parametrize("bad", [float("nan"), float("inf"), True, "7", None])
    def test_nonsense_amounts_are_refused(self, bad):
        with pytest.raises(ValueError):
            sketch_decision("price", bad, 1)

    def test_unknown_kinds_are_refused_with_the_list(self):
        with pytest.raises(ValueError, match="price"):
            sketch_decision("menu", 5, 1)       # the menu is not a sketch type (it needs a cost share too)
        with pytest.raises(ValueError):
            sketch_decision("investment", 5000, 1)


# ---------- the answer ----------

@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
class TestAnswer:
    def test_shape_and_ranges(self, tpl):
        r = sketch(tpl)
        assert r["horizon"] == SKETCH_HORIZON == 12 and r["iterations"] == SKETCH_ITERATIONS
        assert 0 <= r["ahead_of_10"] <= 10
        for path in (r["change"], r["baseline"]):
            for metric in ("profit", "cash", "customers"):
                band = path[metric]
                assert len(band["p50"]) == 12
                assert np.all(np.array(band["p10"]) <= np.array(band["p50"]) + 1e-9)
                assert np.all(np.array(band["p50"]) <= np.array(band["p90"]) + 1e-9)
            assert 1 <= path["lowest_cash_month"] <= 12
            assert path["lowest_cash_amount"] == pytest.approx(min(path["cash"]["p50"]), abs=0.01)
        assert r["cash_now"] == tpl.default_baseline.cash

    def test_same_input_gives_the_same_answer(self, tpl):
        assert json.dumps(sketch(tpl), sort_keys=True) == json.dumps(sketch(tpl), sort_keys=True)

    def test_a_different_seed_gives_a_different_but_close_answer(self, tpl):
        a, b = sketch(tpl, seed=1), sketch(tpl, seed=2)
        assert a != b
        assert a["extra_profit_per_month"] == pytest.approx(b["extra_profit_per_month"], rel=0.5, abs=400)

    def test_no_change_means_no_extra_profit_and_no_fewer_visits(self, tpl):
        r = sketch(tpl, amount=0)
        assert r["extra_profit_per_month"] == 0 and r["visits_change_per_month"] == 0
        assert r["change"]["profit"] == r["baseline"]["profit"]

    def test_a_price_rise_means_fewer_visits(self, tpl):
        assert sketch(tpl, amount=10)["visits_change_per_month"] < 0

    def test_a_bigger_rise_loses_more_visits(self, tpl):
        assert sketch(tpl, amount=15)["visits_change_per_month"] < sketch(tpl, amount=3)["visits_change_per_month"]

    def test_with_minus_the_without_is_the_extra(self, tpl):
        r = sketch(tpl)
        assert r["profit_per_month_with_change"] - r["profit_per_month_without"] == pytest.approx(r["extra_profit_per_month"], abs=0.02)

    def test_a_cut_in_prices_earns_less_than_a_rise(self, tpl):
        assert sketch(tpl, amount=-10)["extra_profit_per_month"] < sketch(tpl, amount=10)["extra_profit_per_month"]

    def test_the_example_price_only_for_price_changes(self, tpl):
        r = sketch(tpl, amount=10)
        assert r["example"]["after"] == pytest.approx(r["example"]["before"] * 1.10, abs=0.01)
        assert "example" not in sketch(tpl, kind="hiring", amount=1)

    def test_the_change_only_starts_when_asked(self, tpl):
        late = sketch(tpl, amount=10, start=9)
        early = sketch(tpl, amount=10, start=1)
        assert late["change"]["profit"]["p50"][:8] == late["baseline"]["profit"]["p50"][:8]   # nothing changes before month 9
        assert abs(late["extra_profit_per_month"]) < abs(early["extra_profit_per_month"])

    def test_the_sentence_names_the_change(self, tpl):
        assert sketch(tpl, amount=7)["sentence"] == "Raise prices by 7% from month 1"
        assert sketch(tpl, amount=-5)["sentence"] == "Cut prices by 5% from month 1"

    def test_it_is_quick(self, tpl):
        start = time.perf_counter()
        for kind, amount in (("price", 10), ("hours", 24), ("hiring", 1), ("marketing", 50)):
            sketch(tpl, kind=kind, amount=amount)
        assert (time.perf_counter() - start) / 4 < 1.0

    def test_it_leaves_the_business_untouched(self, tpl):
        before = tpl.default_baseline.to_dict()
        sketch(tpl)
        assert tpl.default_baseline.to_dict() == before

    def test_all_numbers_are_plain_json(self, tpl):
        text = json.dumps(sketch(tpl))
        assert "NaN" not in text and "Infinity" not in text


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
class TestOtherKinds:
    def test_hiring_adds_staff_cost(self, tpl):
        assert sketch(tpl, kind="hiring", amount=1)["extra_profit_per_month"] < sketch(tpl, kind="hiring", amount=0)["extra_profit_per_month"]

    def test_fewer_open_days_lose_visits(self, tpl):
        r = sketch(tpl, kind="hours", amount=tpl.default_baseline.open_days - 6)
        assert r["visits_change_per_month"] < 0

    def test_more_marketing_costs_money_now(self, tpl):
        r = sketch(tpl, kind="marketing", amount=100)
        assert math.isfinite(r["extra_profit_per_month"])
        assert r["sentence"].startswith("Increase marketing spend by 100%")

    def test_hours_sentence(self, tpl):
        assert sketch(tpl, kind="hours", amount=24)["sentence"] == "Open 24 days per month from month 1"
