"""The start-up guide's data file: every number has a source, an address and a date, and nothing unread can reach a screen."""
from __future__ import annotations

import copy
import datetime as dt
import re
from importlib import resources

import pytest

from btm_engine import startup
from btm_engine.startup import build_plan, load_data, validate_data

CAFE_US = dict(business_type="cafe", country="US", budget=200000, premises="fit_out", rent=4000, size="small", menu="simple",
               alcohol="no", people=3, customers_per_day=120, avg_spend=7, timeline="6m")


@pytest.fixture()
def data():
    return copy.deepcopy(load_data())


def test_the_file_is_found_through_the_package_and_is_sound():
    assert resources.files("btm_engine").joinpath("data", "startup_ranges.json").is_file()
    assert validate_data(load_data()) == []
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", load_data()["version"])


def test_every_fact_with_a_number_has_a_source_with_name_https_address_type_status_and_date(data):
    checked = 0
    for row in data["rows"]:
        if row["kind"] != "fact" or row.get("low") is None:
            continue
        source = data["sources"][row["source_id"]]
        assert source["name"].strip()
        assert source["url"].startswith("https://")
        assert source["type"] in startup.SOURCE_TYPES
        assert source["status"] in startup.SOURCE_STATUS
        assert dt.date.fromisoformat(source["accessed"]) <= dt.date.today()
        assert row["low"] <= row["high"]
        assert row["basis"]
        checked += 1
    assert checked >= 25   # the file really has sourced numbers in it


def test_every_assumption_gives_its_reason_and_claims_no_source(data):
    assumptions = [r for r in data["rows"] if r["kind"] == "assumption"]
    assert {r["id"] for r in assumptions} >= {"hours-per-month", "other-fixed-share", "days-open", "contingency", "buffer-months"}
    for row in assumptions:
        assert len(row["rationale"]) > 20
        assert "source_id" not in row and "source_url" not in row


def test_vendor_guides_are_named_as_selling_to_restaurants(data):
    vendors = [s for s in data["sources"].values() if s["type"] == "vendor_guide"]
    assert vendors
    assert all(s["sells_to_restaurants"] for s in vendors)
    plan = build_plan(CAFE_US)
    assert "sell to" in plan["selling_note"]
    assert any(l["source"]["sells_to_restaurants"] for l in plan["startup"]["lines"])


def test_no_affiliate_or_tracking_parameters_in_any_address(data):
    for source in data["sources"].values():
        assert "?" not in source["url"] and "ref=" not in source["url"] and "utm_" not in source["url"]
        assert "affiliate" not in source["url"].lower()


def test_every_country_has_a_known_mode_and_the_big_three_are_present(data):
    assert {c["mode"] for c in data["countries"].values()} <= {"full", "own_numbers", "checklist_only"}
    assert data["countries"]["US"]["mode"] == "full"
    assert data["countries"]["UK"]["mode"] == "own_numbers"
    assert data["countries"]["CN"]["mode"] == "own_numbers"
    assert data["countries"]["OTHER"]["mode"] == "checklist_only"


def test_checklist_covers_the_first_year_and_every_item_says_where_to_look(data):
    ids = [i["id"] for i in data["checklist"]]
    assert ids == ["premises", "licences", "equipment", "suppliers", "menu", "staff", "marketing", "bookkeeping", "insurance"]
    for item in data["checklist"]:
        assert item["do"] and item["where_kinds"]


def test_what_we_could_not_source_is_written_down_and_not_present_as_numbers(data):
    gap_ids = {g["id"] for g in data["gaps"]}
    assert {"gap-us-restaurant-startup", "gap-uk-cn-startup", "gap-rent", "gap-cost-shares"} <= gap_ids
    # no US restaurant start-up numbers, no UK or China start-up or rent numbers
    for row in data["rows"]:
        if row["group"] in ("startup_cost", "startup_total", "cross_check", "rent_guide"):
            assert row["country"] == "US" and row["business_types"] in (["cafe"], ["bakery"])


# ---- the validator really does catch a broken file ----

def _problems(data) -> str:
    return "\n".join(validate_data(data))


def test_validator_catches_a_fact_without_a_source(data):
    next(r for r in data["rows"] if r["id"] == "cafe-us-buildout").pop("source_id")
    assert "needs a source" in _problems(data)


def test_validator_catches_a_source_without_https_or_date(data):
    data["sources"]["bls-cooks"]["url"] = "http://www.bls.gov/x"
    data["sources"]["bls-serving"]["accessed"] = None
    text = _problems(data)
    assert "https" in text and "accessed" in text


def test_validator_catches_a_future_date_low_above_high_and_a_missing_currency(data):
    data["sources"]["bls-cooks"]["accessed"] = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    row = next(r for r in data["rows"] if r["id"] == "cafe-us-equipment")
    row["low"], row["high"] = 50, 10
    other = next(r for r in data["rows"] if r["id"] == "cafe-us-pos")
    other["currency"] = None
    text = _problems(data)
    assert "future" in text and "above high" in text and "currency" in text


def test_validator_catches_an_assumption_without_a_reason_or_with_a_source(data):
    a = next(r for r in data["rows"] if r["id"] == "contingency")
    a["rationale"] = ""
    b = next(r for r in data["rows"] if r["id"] == "buffer-months")
    b["source_id"] = "sba-startup"
    text = _problems(data)
    assert "rationale" in text and "must not claim a source" in text


def test_validator_catches_digits_in_texts_and_bad_placeholders(data):
    data["checklist"][0]["do"].append("Budget 5000 for the deposit.")
    data["struggles"][0]["watch"] = "See {{no-such-row}}."
    text = _problems(data)
    assert "contains a digit" in text and "not a row" in text


def test_validator_catches_duplicate_ids_unknown_units_and_vendor_without_the_selling_note(data):
    data["rows"].append(copy.deepcopy(data["rows"][0]))
    data["rows"][1]["unit"] = "per_fortnight"
    data["sources"]["koronapos-coffee"]["sells_to_restaurants"] = False
    text = _problems(data)
    assert "duplicate" in text and "unknown unit" in text and "sells_to_restaurants" in text


# ---- a source nobody has read cannot reach a screen ----

def test_rows_whose_source_needs_a_hand_check_are_ignored_by_the_calculator(data):
    data["sources"]["koronapos-coffee"]["status"] = "needs_hand_check"
    plan = build_plan(CAFE_US, data)
    assert plan["startup"]["available"] is False
    assert "reliable published figure" in plan["startup"]["reason"]
    assert plan["sources"] is not None and all(s["id"] != "koronapos-coffee" for s in plan["sources"])


def test_the_calculator_module_has_no_ai_and_no_randomness():
    source = resources.files("btm_engine").joinpath("startup.py").read_text(encoding="utf-8").lower()
    for banned in ("anthropic", "openai", "ollama", "import random", "numpy", "default_rng"):
        assert banned not in source
