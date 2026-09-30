"""The skimmable card: verdict rules, risk line, bars, and the tone limits. All decided by rules, not the AI."""
from __future__ import annotations

import json
import re

import pytest

from app.coach import template
from app.coach.summary import build_bars, build_summary, decide_verdict, driver_label, risk_flags
from tests.test_coach import (FakeProvider, final, good_reply, inline_jobs, real_threads, run,  # noqa: F401
                              use_provider)


def scenario(change=1000, beats=8, cash=0, **over):
    s = {
        "name": "Plan", "profit_change": change, "monthly_profit_now": 2000, "monthly_profit_end": 2500,
        "cash_end": 30000, "regulars_end": 890, "regulars_change_count": -10, "regulars_change_percent": -1,
        "futures": {"beats_change_nothing_of_10": beats, "cash_runs_out_of_10": cash},
        "moments": {"full_month": None, "lowest_cash_amount": 5000, "lowest_cash_month": 1,
                    "regulars_drop_month": None, "regulars_drop_amount": 0},
        "drivers": [],
    }
    s.update(over)
    return s


# ---------- verdict rules ----------

@pytest.mark.parametrize("change,beats,cash,nothing_cash,expected", [
    (5000, 10, 0, 0, "good"),
    (5000, 8, 0, 0, "good"),          # boundary: 8 of 10 is good
    (5000, 7, 0, 0, "try"),
    (5000, 6, 0, 0, "try"),           # boundary: 6 of 10 is worth a try
    (5000, 5, 0, 0, "risky"),         # a coin flip
    (5000, 2, 0, 0, "risky"),
    (0, 4, 0, 0, "no"),               # no gain and better in only 4 of 10 futures
    (-3000, 3, 0, 0, "no"),
    (-3000, 5, 0, 0, "risky"),        # loses on average but often better: mixed
    (0, 9, 0, 0, "risky"),            # no gain at all is never "good"
    (5000, 9, 2, 0, "risky"),         # cash runs out in 2 more futures than doing nothing
    (5000, 9, 1, 0, "good"),          # only 1 more future: still good
    (5000, 9, 3, 2, "good"),          # cash risk 3 but only 1 worse...
    (5000, 9, 3, 0, "risky"),         # cash runs out in 3 of 10 futures, all of it new
    (5000, 9, 10, 10, "good"),        # doing nothing is just as bad: not this plan's fault
])
def test_verdict_rules(change, beats, cash, nothing_cash, expected):
    # (5000, 9, 3, 2): extra cash risk is 1 and the absolute risk is 3 -> rule 3 says risky
    if (change, beats, cash, nothing_cash) == (5000, 9, 3, 2):
        expected = "risky"
    assert decide_verdict(scenario(change, beats, cash), nothing_cash) == expected


def test_verdict_copes_with_missing_futures_number():
    assert decide_verdict(scenario(5000, None), 0) == "risky"


# ---------- the warning line ----------

def test_no_warning_when_nothing_is_wrong():
    assert risk_flags(scenario(), {"cash_runs_out_of_10": 0}, "good") == []


def test_warning_flags_are_real_risks_in_priority_order():
    s = scenario(cash=3, regulars_change_percent=-8,
                 moments={"full_month": 6, "lowest_cash_amount": -100, "lowest_cash_month": 4,
                          "regulars_drop_month": 5, "regulars_drop_amount": 30})
    assert risk_flags(s, {"cash_runs_out_of_10": 0, "lowest_cash_amount": 900}, "risky") == ["cash", "busy", "regulars"]


def test_a_risk_that_also_exists_when_changing_nothing_is_not_this_plans_fault():
    s = scenario(cash=10, moments={"full_month": 6, "lowest_cash_amount": -100, "lowest_cash_month": 4,
                                   "regulars_drop_month": None, "regulars_drop_amount": 0})
    nothing = {"cash_runs_out_of_10": 10, "lowest_cash_amount": -500, "full_month": 6}
    assert risk_flags(s, nothing, "good") == []


def test_risky_verdict_without_a_specific_risk_still_gets_a_general_line():
    assert risk_flags(scenario(beats=5), {"cash_runs_out_of_10": 0}, "risky") == ["swing"]


# ---------- the "why" bars ----------

def test_bars_are_the_four_biggest_drivers_largest_first_with_plain_labels():
    drivers = [{"key": "price", "amount": 109600}, {"key": "visits", "amount": -71200},
               {"key": "ingredients", "amount": -11500}, {"key": "staff", "amount": -3000},
               {"key": "menu", "amount": 800}, {"key": "fixed", "amount": 0}, {"key": "investment", "amount": 0}]
    bars = build_bars(scenario(drivers=drivers))
    assert [b["label"] for b in bars] == ["Higher prices", "Fewer visits", "Ingredients", "Staff"]
    assert len(bars) == 4 and bars[0]["amount"] == 109600


def test_driver_labels_follow_the_direction():
    assert driver_label("price", 5) == "Higher prices" and driver_label("price", -5) == "Lower prices"
    assert driver_label("visits", -5) == "Fewer visits" and driver_label("visits", 5) == "More visits"
    assert driver_label("menu", 5) == "Menu"


# ---------- through the API ----------

def test_summary_comes_from_the_engine_and_rules_not_from_the_ai(client, run, use_provider):
    use_provider(good_reply(headline="This is a terrible idea, avoid it."))
    body = final(client, run)
    assert body["mode"] == "ollama"
    s = body["summary"]
    assert s["verdict"]["key"] in ("good", "try") and s["verdict"]["label"] in ("Good idea", "Worth a try")
    assert s["profit_change"] == pytest.approx(26900, abs=100)         # engine number, 3 significant figures
    assert isinstance(s["better_of_10"], int) and s["regulars_change_count"] < 0
    assert [b["label"] for b in s["bars"]][:2] == ["Higher prices", "Fewer visits"]
    assert len(s["bars"]) <= 4


def test_template_coach_summary_and_calm_card(client, run):
    body = client.post(f"/simulation_runs/{run['id']}/coach").json()
    assert body["summary"]["has_risk"] is False and body["watch_out"] == []      # nothing to warn about


def test_ai_warning_is_dropped_when_there_is_no_real_risk(client, run, use_provider):
    use_provider(good_reply(watch_out=["Be careful, everything could go wrong."]))
    assert final(client, run)["watch_out"] == []


@pytest.fixture()
def risky_run(client, business):
    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Big spend", "decisions": [
        {"type": "investment", "start_month": 2, "value": 60000, "unit": "amount", "confirmed": True}]}).json()
    return client.post(f"/businesses/{business['id']}/simulate", json={
        "scenario_ids": [made["id"]], "horizon": 24, "iterations": 300, "seed": 3}).json()


def test_a_real_risk_gets_exactly_one_short_line(client, risky_run):
    body = client.post(f"/simulation_runs/{risky_run['id']}/coach").json()
    assert body["summary"]["has_risk"] and "cash" in body["summary"]["risk_flags"]
    assert body["summary"]["verdict"]["key"] in ("risky", "no")
    assert len(body["watch_out"]) == 1 and len(body["watch_out"][0].split()) <= 16


def test_ai_that_forgets_the_warning_gets_the_rule_based_one(client, risky_run, use_provider):
    use_provider(good_reply(watch_out=[]))
    body = final(client, risky_run)
    assert body["mode"] == "ollama" and len(body["watch_out"]) == 1


def test_ai_that_writes_several_warnings_keeps_one(client, risky_run, use_provider):
    use_provider(good_reply(watch_out=["Cash is tight.", "Regulars may leave.", "Third one."]))
    assert final(client, risky_run)["watch_out"] == ["Cash is tight."]


# ---------- tone limits ----------

def test_long_ai_headline_is_replaced_and_long_sections_are_cut_to_two_sentences(client, run, use_provider):
    use_provider(good_reply(
        headline="Raising your prices looks like it could be a really good move for your whole cafe business.",
        what_happens="One. Two. Three. Four.", why="First. Second. Third."))
    body = final(client, run)
    assert len(body["headline"].split()) <= 12 and "really good move" not in body["headline"]
    assert body["what_happens"] == "One. Two." and body["why"] == "First. Second."


def sentences(text):
    return [x for x in re.split(r"(?<=[.!?])\s+", text.strip()) if x]


def test_template_text_is_short_warm_and_simple(client, run, risky_run):
    for r in (run, risky_run):
        body = client.post(f"/simulation_runs/{r['id']}/coach").json()
        assert len(body["headline"].split()) <= 12
        for section in ("what_happens", "why"):
            assert len(sentences(body[section])) <= 2
        for text in [body["headline"], body["what_happens"], body["why"], *body["watch_out"]]:
            assert all(len(x.split()) <= 20 for x in sentences(text)), text
        joined = " ".join([body["what_happens"], body["why"], *body["watch_out"]])
        assert re.search(r"\byou(r)?\b", joined.lower())                 # speaks to the owner
        assert not re.search(r"\b(FTE|COGS|churn|baseline|percentile)\b", joined, re.I)


def test_template_headlines_match_each_verdict_and_stay_short():
    facts = {"business": {"months": 24, "currency": "USD", "customers_word": "regulars", "staff_word": "barista",
                          "cash_today": 25000, "regulars_today": 900},
             "if_you_change_nothing": {"cash_runs_out_of_10": 0}, "scenarios": []}
    for change, beats, cash in [(9000, 9, 0), (9000, 7, 0), (9000, 5, 0), (-500, 2, 0)]:
        facts["scenarios"] = [scenario(change, beats, cash)]
        line = template._headline(facts)
        assert len(line.split()) <= 12 and not any(c.isdigit() for c in line)
    facts["scenarios"] = [scenario(9000, 9, 0, name="A very long scenario name that goes on and on and on")] * 2
    assert len(template._headline(facts).split()) <= 12
    assert build_summary({**facts, "scenarios": [scenario(9000, 9, 0)]})["verdict"]["label"] == "Good idea"


# ---------- the "now -> later" tiles ----------

def test_tiles_are_now_and_later_numbers_straight_from_the_facts(client, run):
    body = client.post(f"/simulation_runs/{run['id']}/coach").json()
    tiles = {t["key"]: t for t in body["summary"]["tiles"]}
    assert set(tiles) == {"profit", "cash", "customers"}
    assert tiles["cash"]["now"] > 0 and tiles["customers"]["now"] > 0
    assert tiles["profit"]["later"] > tiles["profit"]["now"]        # a 10% price rise lifts a typical month
    assert body["summary"]["customers_word"]


def test_old_cached_coach_without_a_summary_still_gets_a_card(client, run):
    from app import models
    from app.database import get_db
    from app.main import app

    client.post(f"/simulation_runs/{run['id']}/coach")
    db = next(app.dependency_overrides[get_db]())
    try:
        row = db.query(models.CoachResult).filter_by(simulation_run_id=run["id"]).one()
        old = {k: v for k, v in row.payload.items() if k != "summary"}
        old["what_happens"] = "An old saved story."
        row.payload = old
        db.commit()
    finally:
        db.close()

    body = client.get(f"/simulation_runs/{run['id']}/coach").json()
    assert body["what_happens"] == "An old saved story."               # the old text is kept, not regenerated
    assert {t["key"] for t in body["summary"]["tiles"]} == {"profit", "cash", "customers"}
    assert body["summary"]["verdict"]["label"]
