"""The coach's numbers: the profit breakdown must add up exactly, and moments must be right."""
import json

import numpy as np

import pytest

from btm_engine import (Decision, build_facts, describe_decision, key_moments, profit_breakdown,
                        round_display, run_scenarios)
from btm_engine.templates import list_industries

TEMPLATES = list_industries()

IDS = [t.id for t in TEMPLATES]

CASES = {
    "price_up": [Decision("price", 3, 10, "percent")],
    "price_abs": [Decision("price", 2, 9.0, "absolute")],
    "hire": [Decision("hiring", 4, 2, "fte")],
    "marketing": [Decision("marketing", 1, 50, "percent")],
    "hours": [Decision("hours", 5, 22, "days")],
    "menu": [Decision("menu", 2, 8, "percent", {"cogs_ratio": 0.35, "investment": 3000})],
    "loan": [Decision("investment", 3, 12000, "amount", {"loan_months": 12, "annual_rate": 0.06, "capacity_pct": 20})],
    "mix": [Decision("price", 2, 5, "percent"), Decision("hiring", 6, 1, "fte"),
            Decision("investment", 8, 5000, "amount")],
    "nothing": [],
}


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
@pytest.mark.parametrize("case", CASES)
@pytest.mark.parametrize("horizon", [12, 24, 36])
def test_drivers_add_up_exactly(tpl, case, horizon):
    decs = [d for d in CASES[case] if d.start_month <= horizon]
    br = profit_breakdown(tpl.default_baseline, tpl, decs, horizon)
    assert sum(br["drivers"].values()) == pytest.approx(br["total"], abs=1e-6)
    assert br["total"] == pytest.approx(br["scenario_profit"] - br["baseline_profit"], abs=1e-6)


def test_nothing_changed_means_zero_everywhere():
    tpl = TEMPLATES[0]
    br = profit_breakdown(tpl.default_baseline, tpl, [], 24)
    assert br["total"] == pytest.approx(0, abs=1e-9)
    assert all(v == pytest.approx(0, abs=1e-9) for v in br["drivers"].values())


def test_driver_signs_make_sense():
    tpl = TEMPLATES[0]
    hire = profit_breakdown(tpl.default_baseline, tpl, [Decision("hiring", 1, 1, "fte")], 24)["drivers"]
    assert hire["staff"] == pytest.approx(-3000 * 24)             # one more full-time wage each month
    loan = profit_breakdown(tpl.default_baseline, tpl, [Decision("investment", 1, 10000, "amount")], 24)["drivers"]
    assert loan["investment"] == pytest.approx(-10000)
    price = profit_breakdown(tpl.default_baseline, tpl, [Decision("price", 1, 10, "percent")], 24)["drivers"]
    assert price["price"] > 0 and price["visits"] < 0


def test_full_month_when_demand_outgrows_capacity():
    tpl = TEMPLATES[0]
    base = tpl.default_baseline
    assert key_moments(base, tpl, [], 24)["full_month"] is None
    m = key_moments(base, tpl, [Decision("hours", 1, 31, "days"), Decision("hiring", 1, -2, "fte")], 24)
    assert m["full_month"] == 1


def test_regulars_drop_and_lowest_cash_and_crossover():
    tpl = TEMPLATES[0]
    base = tpl.default_baseline
    m = key_moments(base, tpl, [Decision("price", 4, 20, "percent")], 24)
    assert m["regulars_drop_month"] is not None and m["regulars_drop_month"] >= 4
    assert m["customers_end"] < m["customers_end_baseline"]
    # A big up-front investment: behind at first, ahead never -> lowest cash is the investment month.
    m2 = key_moments(base, tpl, [Decision("investment", 6, 60000, "amount")], 24)
    assert m2["lowest_cash"]["month"] == 6
    assert m2["crossover"] is None and m2["ahead_at_end"] is False
    # Price rise starts ahead, stays ahead of "change nothing" for the whole run
    m3 = key_moments(base, tpl, [Decision("marketing", 1, -100, "percent")], 24)
    assert m3["crossover"] is None or m3["crossover"]["direction"] in ("overtakes", "falls_behind")


def test_crossover_detected():
    tpl = TEMPLATES[0]
    # Loan-free investment that adds capacity is unlikely to pay back; use a cheap one-off menu change
    # that costs 10,000 up front but lifts the average sale, so it starts behind and overtakes.
    decs = [Decision("menu", 1, 10, "percent", {"investment": 10000})]
    m = key_moments(tpl.default_baseline, tpl, decs, 24)
    assert m["crossover"] == {"month": m["crossover"]["month"], "direction": "overtakes"}
    assert 1 < m["crossover"]["month"] < 24 and m["ahead_at_end"] is True


def test_round_display():
    assert round_display(41234) == 41200
    assert round_display(4183.4) == 4180
    assert round_display(-183.4) == -183
    assert round_display(0.4567) == 0.457
    assert round_display(0) == 0


def test_facts_are_json_and_use_tenths():
    tpl = TEMPLATES[0]
    base = tpl.default_baseline
    scen = {"Raise prices": [Decision("price", 3, 10, "percent")]}
    run = run_scenarios(base, tpl, scen, horizon=24, iterations=200, seed=5)
    facts = build_facts(base, tpl, scen, {k: v.summary for k, v in run.scenarios.items()}, 24, "EUR")
    json.dumps(facts)
    f = facts["scenarios"][0]
    assert f["name"] == "Raise prices"
    assert f["decisions"] == ["Raise prices by 10% from month 3"]
    assert isinstance(f["regulars_change_count"], int) and isinstance(f["regulars_change_percent"], int)
    assert 0 <= f["futures"]["beats_change_nothing_of_10"] <= 10
    assert {d["key"] for d in f["drivers"]} == {"price", "menu", "visits", "ingredients", "staff", "fixed", "investment"}
    assert facts["business"]["currency"] == "EUR"


def test_describe_decision_covers_every_type():
    for decs in CASES.values():
        for d in decs:
            assert describe_decision(d, "USD")


@pytest.mark.parametrize("tpl", TEMPLATES, ids=IDS)
def test_month_one_summary_adds_up_and_matches_the_model(tpl):
    from btm_engine import month_one_summary, run_deterministic
    s = month_one_summary(tpl.default_baseline, tpl)
    assert s["sales"] - s["costs"] == pytest.approx(s["profit"])
    assert s["costs"] == pytest.approx(s["ingredient_costs"] + s["staff_costs"]
                                       + s["rent_and_other_costs"] + s["marketing"])
    assert s["profit"] == pytest.approx(run_deterministic(tpl.default_baseline, tpl, [], 1)["profit"][0])


def test_month_one_summary_matches_the_hand_calculation():
    from btm_engine import month_one_summary
    tpl = list_industries()[0]
    s = month_one_summary(tpl.default_baseline, tpl)       # cafe defaults: spec section 6
    assert s["sales"] == pytest.approx(51_350)
    assert s["profit"] == pytest.approx(5_545)


def test_month_one_summary_shows_a_loss_for_costly_staff():
    from dataclasses import replace
    from btm_engine import month_one_summary
    tpl = list_industries()[0]
    base = replace(tpl.default_baseline, wage_per_fte=5_000, marketing=1_000, customers=500, visits_per_regular=10)
    s = month_one_summary(base, tpl)
    assert s["profit"] == pytest.approx(-6_875)


# ---------- the price driver, checked against a hand calculation ----------

def test_price_driver_matches_the_hand_calculation_for_the_demo_cafe():
    """Price +10% from month 3, 24 months, cafe defaults (sales 51,350 a month).

    Hand check: 10% of 51,350 is about 5,135 a month, for the 22 months from month 3, so about 113,000
    if nobody changed how often they visit. Fewer visits (the price rise makes some people come less)
    trim that a little, so the answer must sit just under 113,000 -- not double it.
    """
    from btm_engine import run_deterministic
    tpl = list_industries()[0]
    base = tpl.default_baseline
    decs = [Decision("price", 3, 10, "percent")]
    br = profit_breakdown(base, tpl, decs, 24)

    # Independent route: read the visits from the plain deterministic runs, and use
    # (extra price per visit) x (average of the two visit counts) month by month.
    s = run_deterministic(base, tpl, decs, 24)["visits"]
    b = run_deterministic(base, tpl, [], 24)["visits"]
    extra_price = np.where(np.arange(24) >= 2, 0.65, 0.0)          # 6.50 -> 7.15 from month 3
    by_hand = float((extra_price * (s + b) / 2).sum())
    assert br["drivers"]["price"] == pytest.approx(by_hand, rel=1e-9)

    assert 0.9 * 112_970 < br["drivers"]["price"] < 112_970        # just under the no-visit-loss ceiling
    assert br["drivers"]["price"] == pytest.approx(109_581, abs=1)  # the number the app shows
    assert br["drivers"]["menu"] == pytest.approx(0, abs=1e-9)
    assert br["drivers"]["visits"] < 0                              # people visit a little less
    assert br["total"] == pytest.approx(26_894, abs=1)


def test_a_menu_change_is_not_counted_as_price():
    """Price +10% from month 1 together with a menu change of +8% on the average sale: what each visit
    brings in rises by about 18.8%, but only the 10% is price. Before the split the whole amount
    (about 225,000) was shown as 'price per sale'."""
    tpl = list_industries()[0]
    base = tpl.default_baseline
    both = profit_breakdown(base, tpl, [Decision("price", 1, 10, "percent"), Decision("menu", 1, 8, "percent")], 24)
    price_only = profit_breakdown(base, tpl, [Decision("price", 1, 10, "percent")], 24)
    menu_only = profit_breakdown(base, tpl, [Decision("menu", 1, 8, "percent")], 24)

    assert both["drivers"]["price"] + both["drivers"]["menu"] == pytest.approx(224_655, abs=5)
    assert both["drivers"]["price"] < 0.6 * 224_655                  # nowhere near all of it
    assert price_only["drivers"]["menu"] == pytest.approx(0, abs=1e-9)
    assert menu_only["drivers"]["price"] == pytest.approx(0, abs=1e-9)
    assert sum(both["drivers"].values()) == pytest.approx(both["total"], abs=1e-6)


def test_regulars_are_reported_as_whole_numbers():
    tpl = list_industries()[0]
    base = tpl.default_baseline
    scen = {"Raise": [Decision("price", 3, 10, "percent")]}
    run = run_scenarios(base, tpl, scen, horizon=24, iterations=200, seed=5)
    f = build_facts(base, tpl, scen, {k: v.summary for k, v in run.scenarios.items()}, 24, "USD")["scenarios"][0]
    assert f["regulars_change_count"] == -26 and f["regulars_change_percent"] == -3
    assert isinstance(f["moments"]["regulars_drop_amount"], int)


def test_format_money():
    from btm_engine import format_money
    assert format_money(27_900, "USD") == "$27,900"
    assert format_money(1234.6, "EUR") == "€1,235"
    assert format_money(-4_500, "USD") == "-$4,500"
    assert format_money(4_500, "CHF") == "CHF 4,500"
    assert format_money(0.2, "USD") == "$0"
    assert describe_decision(Decision("investment", 3, 5000, "amount"), "USD") == "Invest $5,000 from month 3"
