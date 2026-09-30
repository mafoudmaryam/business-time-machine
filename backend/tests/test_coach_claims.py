"""Claim consistency: the AI's risk talk must agree with the engine's facts (both directions)."""
from __future__ import annotations

import json

import pytest

from app.coach import consistency
from tests.test_coach import (FakeProvider, final, good_reply, inline_jobs, interactions, real_threads, run,  # noqa: F401
                              use_provider)
from tests.test_coach_summary import risky_run  # noqa: F401


def facts(cash_out=0, lowest=5000, profit_total=50000, profit_change=1000, bad_case=20000, most_likely=50000,
          nothing_cash_out=0, nothing_lowest=5000):
    plan = {
        "name": "Plan", "profit_total": profit_total, "profit_change": profit_change,
        "regulars_change_count": -5, "regulars_change_percent": -1, "drivers": [],
        "monthly_profit_now": 2000, "monthly_profit_end": 2200, "cash_end": 30000, "regulars_end": 890,
        "futures": {"beats_change_nothing_of_10": 8, "cash_runs_out_of_10": cash_out, "profit_bad_case": bad_case,
                    "profit_most_likely": most_likely},
        "moments": {"full_month": None, "lowest_cash_amount": lowest, "lowest_cash_month": 3,
                    "regulars_drop_month": None, "regulars_drop_amount": 0},
    }
    return {"business": {"months": 24, "currency": "USD", "customers_word": "regulars", "staff_word": "barista",
                         "cash_today": 25000, "regulars_today": 900},
            "if_you_change_nothing": {"cash_runs_out_of_10": nothing_cash_out, "lowest_cash_amount": nothing_lowest,
                                      "profit_total": 40000, "profit_most_likely": 40000},
            "scenarios": [plan]}


CALM = facts()
RISKY = facts(cash_out=3, lowest=-500, profit_total=-2000, profit_change=-3000, bad_case=-9000, most_likely=-1500)


# ---------- the AI claims a risk the facts do not support ----------

@pytest.mark.parametrize("text", [
    "Your cash could run out in the first month.",
    "You might go under if this goes wrong.",
    "This plan could make you run out of money.",
    "You could lose money with this plan.",
    "You may end up losing money.",
    "This is dangerous for your business.",
    "Your business is at risk.",
    "Your cash could dip below zero around month 3.",
    "Cash runs out in 3 of 10 futures.",
])
def test_a_risk_the_facts_do_not_show_is_rejected(text):
    assert consistency.check([text], CALM) is not None


def test_the_reason_names_what_the_facts_say():
    reason = consistency.check(["Your cash could run out in the first month."], CALM)
    assert "0 of 10 futures" in reason


# ---------- the AI says "safe" when the facts show a risk ----------

@pytest.mark.parametrize("text", [
    "Your cash is safe.",
    "There is no risk here.",
    "You will not lose money.",
    "Your cash will not run out.",
    "You look safe with this plan.",
    "Nothing to worry about.",
    "Cash runs out in 0 of 10 futures.",
])
def test_calling_it_safe_when_the_facts_show_a_risk_is_rejected(text):
    assert consistency.check([text], RISKY) is not None


def test_the_reason_for_a_false_all_clear_says_what_the_facts_show():
    assert "3 of 10 futures" in consistency.check(["Your cash will not run out."], RISKY)


def test_a_wrong_count_of_futures_is_rejected_even_when_cash_really_is_at_risk():
    assert "5 of 10" in consistency.check(["Your cash runs out in 5 of 10 futures."], RISKY)


# ---------- text that agrees with the facts passes ----------

@pytest.mark.parametrize("text", [
    "Cash runs out in 0 of 10 futures.",
    "Your cash will not run out.",
    "No risk of running out of cash.",
    "It looks safe, and you won't lose money.",
    "Raising prices looks promising, though a few regulars may drift away.",
    "Nothing worrying stands out.",
    "Without extra staff you may get too busy.",
])
def test_text_that_agrees_with_calm_facts_passes(text):
    assert consistency.check([text], CALM) is None


@pytest.mark.parametrize("text", [
    "Your cash could run out in 3 of 10 futures, so watch it closely.",
    "You could lose money in the bad case.",
    "This one is risky, so start small.",
    "It is not safe to spend that much.",
    "Your cash could dip below zero around month 3.",
    "This is dangerous for your cash.",
])
def test_text_that_agrees_with_risky_facts_passes(text):
    assert consistency.check([text], RISKY) is None


def test_the_do_nothing_case_can_support_a_claim_about_doing_nothing():
    plan_safe_but_baseline_risky = facts(nothing_cash_out=4, nothing_lowest=-100)
    assert consistency.check(["If you change nothing, your cash could run out."], plan_safe_but_baseline_risky) is None
    assert consistency.check(["Your plan keeps your cash safe."], plan_safe_but_baseline_risky) is None


def test_every_text_is_checked_and_the_first_contradiction_wins():
    assert consistency.check(["All good here.", "You might go under."], CALM) is not None
    assert consistency.check([], CALM) is None
    assert consistency.check(["You might go under."], {"scenarios": []}) is None


# ---------- through the coach card ----------

def claims_ok(row):
    return row.grounding and row.grounding.get("claims_ok") is not False


def test_coach_rejects_ai_text_that_claims_a_risk_the_facts_do_not_show(client, run, use_provider):
    use_provider(good_reply(watch_out=["Your cash could run out in the first month."]))
    body = final(client, run)
    assert body["mode"] == "template" and body["ai_status"] == "failed" and body["fallback"] is True
    assert "first month" not in json.dumps(body)
    rejected = [r for r in interactions() if r.error and r.error.startswith("claim check:")]
    assert len(rejected) == 1
    assert "0 of 10 futures" in rejected[0].error
    assert rejected[0].grounding["claims_ok"] is False and rejected[0].grounding["passed"] is True
    assert rejected[0].provider == "ollama" and rejected[0].response


def test_coach_rejects_a_false_all_clear_when_the_facts_show_a_risk(client, risky_run, use_provider):
    use_provider(good_reply(why="Your cash is safe and there is no risk here."))
    body = final(client, risky_run)
    assert body["mode"] == "template" and body["ai_status"] == "failed"
    assert body["summary"]["has_risk"] is True                        # the rule-based card still warns
    assert any("claim check:" in (r.error or "") for r in interactions())


def test_coach_keeps_ai_text_that_agrees_with_the_facts(client, run, use_provider):
    use_provider(good_reply())
    body = final(client, run)
    assert body["mode"] == "ollama" and body["ai_status"] == "done"
    assert all(claims_ok(r) for r in interactions())


def test_a_rejected_coach_text_is_not_retried(client, run, use_provider):
    fake = use_provider(good_reply(why="You might go under."), good_reply())
    final(client, run)
    assert len(fake.calls) == 1


# ---------- through Ask ----------

def polled(client, body):
    return client.get(f"/asks/{body['id']}").json()


def test_ask_rejects_a_false_alarm_and_keeps_the_instant_answer(client, run, use_provider):
    use_provider(json.dumps({"answer": "Your cash could run out in the first month, so be careful."}))
    body = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Any thoughts on my money?"}).json()
    done = polled(client, body)
    assert done["ai_status"] == "failed" and done["fallback"] is True
    assert done["answer"] == body["answer"] and done["mode"] == "template"
    rows = [r for r in interactions() if r.kind == "ask" and r.error]
    assert len(rows) == 1 and rows[0].error.startswith("claim check:") and "0 of 10 futures" in rows[0].error


def test_ask_rejects_a_false_all_clear_when_cash_is_at_risk(client, risky_run, use_provider):
    use_provider(json.dumps({"answer": "Your cash is safe, so there is nothing to worry about."}))
    body = client.post(f"/simulation_runs/{risky_run['id']}/ask", json={"question": "Any thoughts on my money?"}).json()
    done = polled(client, body)
    assert done["ai_status"] == "failed" and done["answer"] == body["answer"]


def test_ask_keeps_an_ai_answer_that_agrees_with_the_facts(client, run, use_provider):
    use_provider(json.dumps({"answer": "Cash runs out in 0 of 10 futures, so you look fine."}))
    body = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Any thoughts on my money?"}).json()
    done = polled(client, body)
    assert done["ai_status"] == "done" and done["mode"] == "ollama"
    assert done["answer"] == "Cash runs out in 0 of 10 futures, so you look fine."


def test_the_instant_rule_based_answers_never_trip_the_check(client, run, risky_run):
    """The rule-based text must itself be consistent with the facts (same check, both kinds of run)."""
    from app import engine_bridge, models
    from app.coach import template
    from app.database import get_db
    from app.main import app
    db = next(app.dependency_overrides[get_db]())
    try:
        for r in (run, risky_run):
            f, raw = engine_bridge.build_run_facts(db, db.get(models.SimulationRun, r["id"]))
            texts = [template.answer(f, q) for q in template.CHIP_QUESTIONS]
            coach = template.build_coach(f, raw)
            texts += [coach["headline"], coach["what_happens"], coach["why"], *coach["watch_out"]]
            assert consistency.check(texts, f) is None, texts
    finally:
        db.close()
