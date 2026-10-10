"""The start-up guide calculator: the worked example, every country mode, edge cases, and the practice-business mapping."""
from __future__ import annotations

import math

import pytest

from btm_engine import AnswerError, build_plan, guide_quick_start, parse_answers, simulator_inputs
from btm_engine.startup import load_data

CAFE_US = dict(business_type="cafe", country="US", budget=200000, premises="fit_out", rent=4000, size="small", menu="simple",
               alcohol="no", people=3, customers_per_day=120, avg_spend=7, timeline="6m")


def ask(**changes) -> dict:
    return build_plan({**CAFE_US, **changes})


def numbers(obj):
    """Every number anywhere in a plan."""
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from numbers(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from numbers(v)


# ---------- the worked example in docs/startup-guide-plan.md (section 4.5) ----------

def test_worked_example_us_cafe_to_the_dollar():
    p = ask()
    r, be, b, s = p["running"], p["break_even"], p["budget"], p["startup"]
    assert r["sales"] == pytest.approx(23_520)
    lines = {l["key"]: l for l in r["lines"]}
    assert lines["ingredients"]["middle"] == pytest.approx(7_620.48, abs=0.01)       # 32.4% of sales (NRA, limited service)
    assert lines["people"]["middle"] == pytest.approx(7_924.80, abs=0.05)            # 3 x $15.24 x 173.33 hours
    assert lines["rent_and_other"]["middle"] == pytest.approx(5_333.33, abs=0.05)    # $4,000 and one third
    assert r["middle"] == pytest.approx(21_062, abs=1)
    assert 23_520 - r["middle"] == pytest.approx(2_458, abs=2)
    assert r["labour_check"]["share_of_sales"][0] == pytest.approx(33.7, abs=0.05)
    assert be["per_day"]["middle"] == pytest.approx(101.4, abs=0.2)
    assert be["per_day_with_cushion"]["middle"] == pytest.approx(111.6, abs=0.2)
    assert (s["low"], s["high"], s["middle"]) == (63_500, 250_000, 156_750)
    assert b["suggested_low"] == pytest.approx(133_036, abs=2)
    assert b["suggested_high"] == pytest.approx(426_372, abs=2)
    assert b["verdict"] == "tight"                                                   # 200,000 covers the low end, not the middle


def test_start_up_total_is_the_sum_of_the_lines_and_every_line_has_a_named_source():
    s = ask()["startup"]
    assert s["low"] == sum(l["low"] for l in s["lines"]) and s["high"] == sum(l["high"] for l in s["lines"])
    assert {l["label"] for l in s["lines"]} >= {"Build-out and renovations", "Equipment (espresso machine, grinders)", "Hiring and training staff"}
    assert all(l["source"]["url"].startswith("https://") and l["source"]["accessed"] for l in s["lines"])
    assert s["one_guide_only"] is True and s["cross_check"]["low"] == 80_000


def test_low_is_never_above_middle_and_middle_never_above_high():
    for answers in (CAFE_US, {**CAFE_US, "rent": None}, {**CAFE_US, "business_type": "bakery"}, {**CAFE_US, "country": "CN", "ingredient_share": 30}):
        p = build_plan(answers)
        for key in ("startup", "running", "buffer"):
            block = p[key]
            if block.get("available"):
                assert block["low"] <= block["middle"] <= block["high"]
        if p["budget"].get("available"):
            assert p["budget"]["suggested_low"] <= p["budget"]["suggested_middle"] <= p["budget"]["suggested_high"]


def test_the_same_answers_always_give_the_same_plan():
    assert build_plan(CAFE_US) == build_plan(dict(CAFE_US))


def test_every_number_in_a_plan_is_finite_and_not_negative():
    for answers in (CAFE_US, {**CAFE_US, "rent": 0}, {**CAFE_US, "country": "UK", "ingredient_share": 28}):
        for x in numbers(build_plan(answers)):
            assert math.isfinite(x) and x >= 0


# ---------- which cost lines apply ----------

def test_ready_to_use_premises_leave_out_building_work_and_say_so():
    s = ask(premises="ready")["startup"]
    assert (s["low"], s["high"]) == (33_500, 100_000)
    assert all(l["id"] != "cafe-us-buildout" for l in s["lines"])
    assert any("ready-to-use" in n for n in s["notes"])


def test_bakery_lines_depend_on_rent_or_own():
    fit = ask(business_type="bakery", premises="fit_out")["startup"]
    ready = ask(business_type="bakery", premises="ready")["startup"]
    own = ask(business_type="bakery", premises="own")["startup"]
    ids = lambda s: {l["id"] for l in s["lines"]}
    assert "bakery-us-construction" in ids(fit) and "bakery-us-deposit" in ids(fit)
    assert "bakery-us-construction" not in ids(ready) and "bakery-us-deposit" in ids(ready)
    assert "bakery-us-construction" not in ids(own) and "bakery-us-deposit" not in ids(own)
    assert (fit["low"], fit["high"]) == (60_000, 87_000)
    assert fit["cross_check"]["low"] == 62_500          # the guide's own total is shown next to the lines, not added


def test_tiny_formats_use_the_one_total_the_guides_give():
    cart = ask(size="tiny")["startup"]
    assert (cart["low"], cart["high"]) == (25_000, 100_000) and len(cart["lines"]) == 1
    home = ask(business_type="bakery", premises="mobile", size="large")      # mobile forces the smallest size
    assert home["format"] == "tiny" and any("smallest size" in w for w in home["warnings"])
    assert (home["startup"]["low"], home["startup"]["high"]) == (15_500, 23_500)


def test_alcohol_gets_a_note_not_an_invented_cost():
    p = ask(alcohol="yes")
    assert any("Alcohol licences are not included" in n for n in p["startup"]["notes"])
    assert p["startup"]["low"] == ask(alcohol="no")["startup"]["low"]


# ---------- countries ----------

def test_us_restaurant_has_running_costs_but_no_start_up_total():
    p = ask(business_type="restaurant", menu="full")
    assert p["startup"]["available"] is False and "reliable published figure" in p["startup"]["reason"]
    lines = {l["key"]: l for l in p["running"]["lines"]}
    assert p["running"]["ingredient_share"] == 32.0                       # full-service median
    assert lines["people"]["per_person"]["middle"] == pytest.approx(17.62 * 173.333333, abs=0.01)   # cooks
    assert p["budget"]["verdict"] == "unknown" and p["budget"]["available"] is False
    assert any(g["id"] == "gap-us-restaurant-startup" for g in p["gaps"])


def test_us_cafe_without_a_rent_uses_the_published_guides_range_and_says_so():
    r = ask(rent=None)["running"]
    assert r["rent_from"] == "guide" and r["low"] < r["high"]
    assert r["rent_guide"]["low"] == 2_000 and r["rent_guide"]["high"] == 12_000


def test_uk_needs_your_own_rent_and_ingredient_share():
    p = ask(country="UK", rent=None, ingredient_share=None)
    assert p["startup"]["available"] is False
    assert p["running"]["available"] is False and set(p["running"]["needs"]) == {"rent", "ingredient_share"}
    p = ask(country="UK", rent=3000, ingredient_share=30)
    assert p["running"]["available"] is True
    assert p["running"]["per_person_monthly"]["middle"] == pytest.approx(12.71 * 173.333333, abs=0.01)   # the legal minimum
    assert "labour_check" in p["running"] and "published" not in p["running"]["labour_check"]            # no UK benchmark
    assert p["currency"] == "GBP" and p["break_even"]["available"] is True
    assert any("reliable published figure" in g["text"] for g in p["gaps"])


def test_china_pay_is_a_range_from_the_statistics_office_and_numbers_are_the_persons():
    p = ask(country="CN", rent=8000, ingredient_share=35, avg_spend=40, customers_per_day=100)
    pp = p["running"]["per_person_monthly"]
    assert pp["low"] == pytest.approx(54_042 / 12, abs=0.01) and pp["high"] == pytest.approx(60_240 / 12, abs=0.01)
    assert p["currency"] == "CNY" and p["running"]["low"] < p["running"]["high"]
    assert p["break_even"]["per_day"]["low"] < p["break_even"]["per_day"]["high"]
    assert p["startup"]["available"] is False


def test_somewhere_else_gets_the_checklist_and_no_numbers_at_all():
    p = ask(country="OTHER")
    assert p["mode"] == "checklist_only"
    for key in ("startup", "running", "break_even"):
        assert p[key]["available"] is False
    assert p["budget"]["verdict"] == "unknown"
    assert [i["id"] for i in p["checklist"]][0] in ("licences", "premises")
    assert len(p["checklist"]) == 9 and p["struggles"]


# ---------- break-even, buffer, verdicts ----------

def test_break_even_uses_the_small_business_administrations_formula_with_a_ten_percent_cushion():
    be = ask(ingredient_share=40)["break_even"]
    fixed = be["fixed_costs"]["low"]
    assert be["each_customer_adds"] == pytest.approx(7 * 0.6)
    assert be["customers_per_month"]["middle"] == pytest.approx(fixed / (7 * 0.6), rel=1e-3)
    assert be["per_day_with_cushion"]["middle"] == pytest.approx(be["per_day"]["middle"] * 1.10, rel=1e-3)
    assert be["cushion_percent"] == 10


def test_break_even_edge_cases_never_divide_by_zero():
    zero = ask(ingredient_share=0)["break_even"]
    assert zero["available"] and zero["each_customer_adds"] == 7
    hopeless = ask(ingredient_share=99.9, avg_spend=0.01)["break_even"]
    assert hopeless["available"] is False or math.isfinite(hopeless["per_day"]["middle"])
    assert ask(avg_spend=None)["break_even"]["available"] is False
    assert "spend" in ask(avg_spend=None)["break_even"]["reason"]


def test_hoped_for_customers_are_compared_with_the_estimates():
    # with your own rent the low, middle and high estimates are the same number
    needed = ask()["break_even"]["per_day_with_cushion"]["middle"]
    assert ask(customers_per_day=needed - 10)["break_even"]["verdict"] == "below_all"
    assert ask(customers_per_day=needed + 10)["break_even"]["verdict"] == "above_all"
    # with the published rent range they differ, so the in-between verdicts appear
    c = ask(rent=None, customers_per_day=100)["break_even"]["per_day_with_cushion"]
    assert c["low"] < c["middle"] < c["high"]
    def verdict(hoped):
        return ask(rent=None, customers_per_day=hoped)["break_even"]["verdict"]
    assert verdict(60) == "below_all" and verdict(400) == "above_all"
    seen = {verdict(n) for n in range(60, 400, 5)}
    assert {"below_all", "above_low", "above_middle", "above_all"} <= seen


def test_budget_verdict_thresholds():
    p = ask()
    low, mid = p["budget"]["suggested_low"], p["budget"]["suggested_middle"]
    assert ask(budget=mid)["budget"]["verdict"] == "enough"
    assert ask(budget=mid - 1)["budget"]["verdict"] == "tight"
    assert ask(budget=low)["budget"]["verdict"] == "tight"
    assert ask(budget=low - 1)["budget"]["verdict"] == "not_enough"
    assert ask(budget=None)["budget"]["verdict"] == "unknown"
    assert "will" not in ask(budget=1)["budget"]["text"].split()    # wording is about the plan, never a promise


def test_without_customers_the_running_costs_are_fixed_costs_only():
    p = ask(customers_per_day=None)
    assert p["running"]["available"] and p["running"]["partial"] and p["running"]["sales"] is None
    assert {l["key"] for l in p["running"]["lines"]} == {"people", "rent_and_other"}
    assert p["buffer"]["partial"] is True


def test_own_premises_and_a_cart_pay_no_rent_unless_told():
    assert ask(premises="own", rent=None)["running"]["rent_from"] == "none"
    assert ask(premises="mobile", rent=None)["running"]["rent_from"] == "none"
    rent_line = next(l for l in ask(rent=0)["running"]["lines"] if l["key"] == "rent_and_other")
    assert rent_line["middle"] == 0 and ask(rent=0)["running"]["available"]


def test_one_person_and_five_hundred_people_both_work():
    assert ask(people=1)["running"]["available"] and ask(people=500)["running"]["available"]
    assert ask(people=500)["running"]["low"] > ask(people=1)["running"]["low"]


# ---------- the checklist and the struggles ----------

def test_checklist_puts_licences_and_premises_first_for_people_opening_soon():
    soon = [i["id"] for i in ask(timeline="3m")["checklist"]]
    later = [i["id"] for i in ask(timeline="exploring")["checklist"]]
    assert soon[:2] == ["premises", "licences"] and later[0] == "premises"
    assert next(i for i in ask(timeline="3m")["checklist"] if i["id"] == "licences")["urgent"]
    assert "urgent" not in next(i for i in ask(timeline="exploring")["checklist"] if i["id"] == "licences")


def test_we_cant_do_this_boxes_point_to_the_right_place_per_country():
    cant = lambda c: next(i for i in ask(country=c, ingredient_share=30)["checklist"] if i["id"] == "licences")["cant"]
    assert "SBA" in cant("US") and "health department" in cant("US")
    assert "free" in cant("UK") and "28 days" in cant("UK")
    assert "食品经营许可" in cant("CN") and "市场监督管理局" in cant("CN")
    assert "tax advice" in next(i for i in ask()["checklist"] if i["id"] == "bookkeeping")["cant"]


def test_official_links_come_with_their_dates_and_only_for_the_right_country():
    licences = lambda c: next(i for i in ask(country=c, ingredient_share=30)["checklist"] if i["id"] == "licences")
    assert {s["id"] for s in licences("US")["where_sources"]} == {"sba-licences", "fda-food-code"}
    assert {s["id"] for s in licences("UK")["where_sources"]} == {"gov-uk-food"}
    assert {s["id"] for s in licences("CN")["where_sources"]} == {"cn-samr-order78"}
    assert licences("OTHER")["where_sources"] == [] and licences("OTHER")["where_kinds"]
    assert all(s["accessed"] for s in licences("US")["where_sources"])


def test_struggles_show_published_numbers_only_where_they_exist():
    us = {s["id"]: s["watch"] for s in ask()["struggles"]}
    assert "30 to 34.1" in us["staffing"] and "32.4" in us["pricing"] and "74.4 to 78.6" in us["survival"]
    uk = {s["id"]: s["watch"] for s in ask(country="UK", ingredient_share=30)["struggles"]}
    assert "34.1" not in uk["staffing"] and "survival" not in uk
    assert {"cash", "rent", "waste", "staffing", "pricing", "slow"} <= set(uk)


def test_the_plan_lists_the_assumptions_it_used():
    ids = {a["id"] for a in ask()["assumptions"]}
    assert {"hours-per-month", "other-fixed-share", "days-open", "contingency", "buffer-months", "marketing-share", "segment-mapping"} <= ids
    assert all(a["rationale"] for a in ask()["assumptions"])


# ---------- answers ----------

@pytest.mark.parametrize("change, message", [
    ({"business_type": "pizzeria"}, "what you would like to open"),
    ({"country": "FR"}, "country"),
    ({"premises": "castle"}, "rent, own"),
    ({"size": "huge"}, "how big"),
    ({"menu": "x"}, "menu"),
    ({"alcohol": "maybe"}, "alcohol"),
    ({"timeline": "never"}, "when you hope to open"),
    ({"people": 0}, "too small"),
    ({"people": None}, "how many people"),
    ({"people": 501}, "too large"),
    ({"customers_per_day": 0}, "too small"),
    ({"avg_spend": -3}, "too small"),
    ({"rent": -1}, "too small"),
    ({"budget": -5}, "too small"),
    ({"ingredient_share": 100}, "too large"),
    ({"avg_spend": "lots"}, "must be a number"),
    ({"avg_spend": float("nan")}, "must be a number"),
    ({"budget": True}, "must be a number"),
    ({"currency": "dollars"}, "three-letter"),
])
def test_bad_answers_are_refused_in_plain_words(change, message):
    with pytest.raises(AnswerError) as err:
        parse_answers({**CAFE_US, **change})
    assert message in str(err.value)


def test_unsure_answers_are_allowed_and_the_currency_follows_the_country():
    a = parse_answers({**CAFE_US, "budget": None, "rent": "", "customers_per_day": None, "avg_spend": None, "country": "CN"})
    assert a["budget"] is None and a["rent"] is None and a["currency"] == "CNY"
    assert parse_answers({**CAFE_US, "currency": "eur"})["currency"] == "EUR"


# ---------- "Try it in the simulator" ----------

def test_practice_business_uses_the_guides_pay_ingredient_share_and_remaining_cash():
    plan = ask()
    inputs = simulator_inputs(plan)
    assert inputs["ready"] and inputs["customers_per_day"] == 120 and inputs["monthly_rent"] == 4000 and inputs["staff"] == 3
    q = guide_quick_start("cafe", inputs)
    b = q.baseline
    assert b.wage_per_fte == pytest.approx(15.24 * 173.333333, abs=0.01)
    assert b.cogs_ratio == pytest.approx(0.324)
    assert b.cash == pytest.approx(200_000 - 156_750, rel=0.01)            # budget minus the middle of the start-up range
    rules = {a["field"]: a["rule"] for a in q.assumed}
    assert "Bureau of Labor Statistics" in rules["wage_per_fte"] and "National Restaurant Association" in rules["cogs_ratio"]
    assert "budget" in rules["cash"]
    assert rules["churn_rate"].startswith("typical share of regulars")       # untouched rules stay as they were


def test_a_budget_below_the_middle_starts_the_practice_business_with_no_cash_and_says_so():
    q = guide_quick_start("cafe", simulator_inputs(ask(budget=100_000)))
    assert q.baseline.cash == 0
    assert any("no cash in the bank" in w for w in q.warnings)


def test_unsure_customers_fall_back_to_the_break_even_number_and_unsure_spend_is_asked_for():
    inputs = simulator_inputs(ask(customers_per_day=None))
    assert inputs["from_break_even"] is True and inputs["customers_per_day"] == math.ceil(
        ask(customers_per_day=None)["break_even"]["per_day_with_cushion"]["middle"])
    assert any("break even" in n for n in inputs["notes"])
    missing = simulator_inputs(ask(avg_spend=None))
    assert missing["ready"] is False and missing["missing"] == ["avg_spend"]
    with pytest.raises(ValueError, match="missing"):
        guide_quick_start("cafe", missing)


def test_uk_practice_business_uses_the_persons_own_ingredient_share_and_the_legal_minimum_pay():
    q = guide_quick_start("cafe", simulator_inputs(ask(country="UK", ingredient_share=28)))
    assert q.baseline.cogs_ratio == pytest.approx(0.28)
    assert q.baseline.wage_per_fte == pytest.approx(12.71 * 173.333333, abs=0.01)
    assert next(a for a in q.assumed if a["field"] == "cogs_ratio")["rule"] == "your own estimate of the ingredient share of sales"


def test_data_version_is_in_every_plan():
    assert ask()["data_version"] == load_data()["version"]
