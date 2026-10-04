"""Beginner journey, Phase 1: quick start, sample business, Today page and its coach note, edits, events, config."""
from __future__ import annotations

import json

import pytest
from btm_engine import round_display

from app import engine_bridge, models
from app.coach import consistency, grounding, today as today_mod
from app.coach.providers import ProviderError, ProviderResult
from app.database import get_db
from app.main import app

ANSWERS = {"customers_per_day": 150, "avg_spend": 7, "monthly_rent": 3000, "staff": 4}
LOSING = {"customers_per_day": 20, "avg_spend": 5, "monthly_rent": 6000, "staff": 6}


@pytest.fixture(autouse=True)
def inline_jobs(request, monkeypatch):
    monkeypatch.setattr(today_mod, "_submit", lambda fn, *a: fn(*a))
    today_mod._active.clear()


def with_db(fn):
    """Run fn(session) on the test database and close the session (Windows cannot delete an open file)."""
    session = next(app.dependency_overrides[get_db]())
    try:
        return fn(session)
    finally:
        session.close()


def quick(client, industry="cafe", **over):
    resp = client.post(f"/industries/{industry}/quick_baseline", json=ANSWERS | over)
    assert resp.status_code == 200, resp.text
    return resp.json()


def create_quick(client, industry="cafe", currency="USD", **over):
    q = quick(client, industry, **over)
    resp = client.post("/businesses", json={"name": "Mine", "industry": industry, "currency": currency,
                                            "baseline": q["baseline"], "setup_source": "quick",
                                            "assumed_fields": q["assumed"]})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- quick start ----------

@pytest.mark.parametrize("industry", ["cafe", "restaurant", "bakery"])
def test_quick_baseline_returns_numbers_assumptions_and_a_preview(client, industry):
    q = quick(client, industry)
    assert q["baseline"]["avg_ticket"] == 7
    assert q["baseline"]["staff_fte"] == 4
    assert q["baseline"]["fixed_costs"] == pytest.approx(4000)
    assert {a["field"] for a in q["assumed"]} >= {"cash", "fixed_costs", "staff_fte"}
    assert q["preview"]["sales"] > 0 and "profit" in q["preview"]
    assert isinstance(q["warnings"], list)


def test_quick_baseline_does_not_save_anything(client):
    quick(client)
    assert client.get("/businesses").json() == []


@pytest.mark.parametrize("bad", [{"customers_per_day": 0}, {"avg_spend": -1}, {"monthly_rent": -5}, {"staff": 0},
                                 {"customers_per_day": 10**9}, {"staff": "many"}])
def test_quick_baseline_rejects_nonsense(client, bad):
    assert client.post("/industries/cafe/quick_baseline", json=ANSWERS | bad).status_code == 422


def test_quick_baseline_unknown_industry_is_404(client):
    assert client.post("/industries/pizzeria/quick_baseline", json=ANSWERS).status_code == 404


def test_quick_baseline_warns_when_there_are_too_few_staff(client):
    q = quick(client, "restaurant", customers_per_day=400, staff=2)
    assert len(q["warnings"]) == 1 and "2 people" in q["warnings"][0]


def test_business_created_from_quick_start_remembers_what_was_assumed(client):
    business = create_quick(client)
    assert business["setup_source"] == "quick" and business["is_sample"] is False
    fields = {a["field"] for a in business["baseline"]["assumed_fields"]}
    assert "cash" in fields and "avg_ticket" not in fields


def test_full_setup_has_no_assumed_fields(client, business):
    assert business["baseline"]["assumed_fields"] is None
    assert business["setup_source"] == "full"


# ---------- sample business ----------

@pytest.mark.parametrize("industry", ["cafe", "restaurant", "bakery"])
def test_sample_business_uses_the_industry_defaults(client, industry):
    resp = client.post("/sample_business", json={"industry": industry})
    assert resp.status_code == 201
    b = resp.json()
    assert b["is_sample"] is True and b["setup_source"] == "sample" and b["name"].startswith("Sample ")
    default = next(i for i in client.get("/industries").json() if i["id"] == industry)["default_baseline"]
    assert b["baseline"]["customers"] == default["customers"]
    assert b["baseline"]["cash"] == default["cash"]


def test_sample_business_in_another_currency(client):
    assert client.post("/sample_business", json={"industry": "bakery", "currency": "eur"}).json()["currency"] == "EUR"


def test_sample_business_rejects_unknown_industry(client):
    assert client.post("/sample_business", json={"industry": "pizzeria"}).status_code == 422


# ---------- Today ----------

def today(client, business_id):
    resp = client.get(f"/businesses/{business_id}/today")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_today_has_tiles_a_line_and_a_note(client):
    b = create_quick(client)
    t = today(client, b["id"])
    assert t["horizon"] == 12 and len(t["month_labels"]) == 12
    assert len(t["profit"]["p50"]) == 12 and len(t["cash"]["p50"]) == 12
    tiles = t["tiles"]
    assert tiles["profit_a_month_bad_case"] <= tiles["profit_a_month"] <= tiles["profit_a_month_good_case"]
    assert tiles["lowest_cash_month_label"] in t["month_labels"]
    assert t["note"]["ai_status"] == "none" and t["note"]["mode"] == "template"
    assert t["assumed_by_app"] is True and any(a["field"] == "cash" for a in t["assumptions"])
    assert t["engine_version"] and t["seed"] and t["iterations"] == 1000      # reproducibility is stored


def test_today_is_the_same_each_time_and_does_not_pile_up_runs(client):
    b = create_quick(client)
    first, second = today(client, b["id"]), today(client, b["id"])
    assert first["run_id"] == second["run_id"] and first["profit"] == second["profit"]
    assert with_db(lambda db: db.query(models.SimulationRun).filter_by(kind="today").count()) == 1


def test_today_run_is_hidden_from_the_run_list(client):
    b = create_quick(client)
    today(client, b["id"])
    assert client.get(f"/businesses/{b['id']}/simulation_runs").json() == []


def test_today_for_a_full_setup_business_has_no_assumptions(client, business):
    t = today(client, business["id"])
    assert t["assumptions"] == [] and t["assumed_by_app"] is False


def test_today_unknown_business_is_404(client):
    assert client.get("/businesses/999/today").status_code == 404


def test_today_numbers_match_the_engine_month_one(client):
    b = create_quick(client)
    q = quick(client)
    t = today(client, b["id"])
    # the most likely coming month is close to the engine's plain month-1 profit (noise is small and centred)
    assert t["tiles"]["profit_a_month"] == pytest.approx(q["preview"]["profit"], rel=0.15, abs=300)


def test_changing_a_number_makes_today_recompute_and_removes_it_from_the_assumed_list(client):
    b = create_quick(client)
    before = today(client, b["id"])
    resp = client.patch(f"/businesses/{b['id']}/baseline", json={"cash": 1234})
    assert resp.status_code == 200
    after = today(client, b["id"])
    assert after["run_id"] != before["run_id"]
    assert after["tiles"]["cash_now"] == 1230          # shown the way the coach rounds it (3 figures)
    assert "cash" not in {a["field"] for a in after["assumptions"]}
    assert "fixed_costs" in {a["field"] for a in after["assumptions"]}


def test_patch_rejects_invalid_numbers_and_empty_changes(client):
    b = create_quick(client)
    assert client.patch(f"/businesses/{b['id']}/baseline", json={"cogs_ratio": 1.5}).status_code == 422
    assert client.patch(f"/businesses/{b['id']}/baseline", json={}).status_code == 422
    assert client.patch("/businesses/999/baseline", json={"cash": 5}).status_code == 404


def test_a_patch_adds_a_snapshot_and_old_runs_keep_their_numbers(client):
    b = create_quick(client)
    t1 = today(client, b["id"])
    client.patch(f"/businesses/{b['id']}/baseline", json={"cash": 99999})
    assert with_db(lambda db: db.query(models.BusinessSnapshot).filter_by(business_id=b["id"]).count()) == 2
    assert client.get(f"/simulation_runs/{t1['run_id']}").status_code == 200


# ---------- the coach speaks first ----------

def facts_for(client, business_id):
    t = today(client, business_id)
    return with_db(lambda db: engine_bridge.build_today_run_facts(db, db.get(models.SimulationRun, t["run_id"])))


@pytest.mark.parametrize("industry", ["cafe", "restaurant", "bakery"])
def test_rule_based_note_is_short_plain_and_grounded(client, industry):
    b = create_quick(client, industry)
    facts = facts_for(client, b["id"])
    text = today(client, b["id"])["note"]["text"]
    sentences = [s for s in text.replace("?", ".").split(". ") if s.strip()]
    assert 2 <= len(sentences) <= 4
    assert grounding.unmatched_numbers([text], grounding.allowed_numbers(facts)) == []
    assert consistency.check([text], facts) is None
    for banned in ("FTE", "COGS", "churn", "baseline", "p10", "p90"):
        assert banned not in text


def test_note_for_a_losing_business_says_so_and_passes_the_claim_check(client):
    b = create_quick(client, **LOSING)
    facts = facts_for(client, b["id"])
    text = today(client, b["id"])["note"]["text"]
    assert facts["today"]["profit_a_month"] < 0
    assert "you lose about" in text
    assert consistency.check([text], facts) is None
    assert grounding.unmatched_numbers([text], grounding.allowed_numbers(facts)) == []


def test_note_for_a_cash_risk_mentions_futures(client):
    b = create_quick(client, **LOSING)
    facts = facts_for(client, b["id"])
    assert facts["today"]["cash_runs_out_of_10"] >= 1
    assert "of 10 futures" in today(client, b["id"])["note"]["text"]


def test_note_is_in_the_businesses_currency(client):
    b = create_quick(client, currency="EUR")
    assert "€" in today(client, b["id"])["note"]["text"]


def test_note_is_hidden_when_the_coach_is_switched_off(client, monkeypatch):
    b = create_quick(client)
    monkeypatch.setenv("COACH_ENABLED", "false")
    t = today(client, b["id"])
    assert t["note"] is None and t["tiles"]["cash_now"] > 0          # tiles and chart still work
    assert client.get(f"/businesses/{b['id']}/today/note").status_code == 404


# ---------- claim check on a note with no plan ----------

def today_facts(**over):
    t = {"sales_a_month": 20000, "costs_a_month": 18000, "profit_a_month": 2000, "profit_a_month_bad_case": 500,
         "profit_a_month_good_case": 3500, "profit_year_most_likely": 24000, "cash_now": 30000,
         "months_of_bills_covered": 2, "lowest_cash_month": 1, "lowest_cash_amount": 30000, "cash_runs_out_of_10": 0,
         "profit_bad_case_year": 6000}
    t.update(over)
    return {"scenarios": [], "today": t, "business": {"currency": "USD"}, "if_you_change_nothing": {}}


@pytest.mark.parametrize("text", [
    "Your cash could run out soon.",
    "You may run out of money in the first months.",
    "You could lose money every month.",
    "This is dangerous for your cash.",
])
def test_claim_check_rejects_risks_the_facts_do_not_show(text):
    assert consistency.check([text], today_facts()) is not None


@pytest.mark.parametrize("text", [
    "Your cash is safe and will not run out.",
    "Your cash runs out in 0 of 10 futures.",
    "You keep a steady profit each month.",
])
def test_claim_check_accepts_agreeing_text(text):
    assert consistency.check([text], today_facts()) is None


@pytest.mark.parametrize("text", ["Your cash is safe.", "There is no risk at all.", "You will not lose money."])
def test_claim_check_rejects_a_false_all_clear(text):
    risky = today_facts(cash_runs_out_of_10=4, profit_a_month=-300, profit_year_most_likely=-3600)
    assert consistency.check([text], risky) is not None


def test_claim_check_accepts_a_true_warning_and_rejects_a_wrong_count():
    risky = today_facts(cash_runs_out_of_10=4)
    assert consistency.check(["Your cash could run out in 4 of 10 futures."], risky) is None
    assert consistency.check(["Your cash could run out in 9 of 10 futures."], risky) is not None


# ---------- AI note: grounding + claim check + fallback ----------

class FakeProvider:
    name = "ollama"
    model = "fake-model"

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def complete(self, system, user, schema):
        self.calls += 1
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return ProviderResult(reply, self.model, 100, 50, 12)


@pytest.fixture()
def use_provider(monkeypatch):
    def _use(*replies):
        fake = FakeProvider(replies)
        monkeypatch.setenv("COACH_PROVIDER", "ollama")
        monkeypatch.setattr(today_mod, "make_provider", lambda name: fake)
        return fake
    return _use


def note_of(client, business_id):
    return client.get(f"/businesses/{business_id}/today/note").json()


def interactions(kind="today"):
    return with_db(lambda db: db.query(models.AiInteraction).filter_by(kind=kind)
                   .order_by(models.AiInteraction.id).all())


def test_a_grounded_ai_note_replaces_the_rule_based_one(client, use_provider):
    b = create_quick(client)
    cash = round_display(b["baseline"]["cash"])                      # the coach is shown cash to 3 figures
    fake = use_provider(json.dumps({"note": f"Good morning! You have ${cash:,.0f} in the bank. Nice and steady."}))
    today(client, b["id"])
    final = note_of(client, b["id"])
    assert final["ai_status"] == "done" and final["mode"] == "ollama" and "Good morning" in final["text"]
    assert fake.calls == 1
    rows = interactions()
    assert rows and rows[-1].provider == "ollama" and rows[-1].grounding["passed"] is True


def test_an_ai_note_with_an_invented_number_is_retried_then_replaced_by_the_rules(client, use_provider):
    b = create_quick(client)
    bad = json.dumps({"note": "You keep $98,765 a month, which is great."})
    fake = use_provider(bad, bad)
    today(client, b["id"])
    final = note_of(client, b["id"])
    assert final["ai_status"] == "failed" and final["fallback"] is True and final["mode"] == "template"
    assert fake.calls == 2                                  # first try plus one retry
    assert any(r.grounding and r.grounding["passed"] is False for r in interactions())


def test_an_ai_note_that_contradicts_the_facts_is_rejected_without_retry(client, use_provider):
    b = create_quick(client)
    fake = use_provider(json.dumps({"note": "Careful, your cash could run out soon."}))
    today(client, b["id"])
    final = note_of(client, b["id"])
    assert final["ai_status"] == "failed" and final["mode"] == "template"
    assert fake.calls == 1
    assert any((r.error or "").startswith("claim check") for r in interactions())


def test_a_provider_failure_keeps_the_rule_based_note(client, use_provider):
    b = create_quick(client)
    use_provider(ProviderError("down"))
    today(client, b["id"])
    final = note_of(client, b["id"])
    assert final["ai_status"] == "failed" and final["text"]


def test_the_ai_never_blocks_the_request(client, use_provider, monkeypatch):
    b = create_quick(client)
    use_provider("{}")
    queued = []
    monkeypatch.setattr(today_mod, "_submit", lambda fn, *a: queued.append((fn, a)))
    t = today(client, b["id"])
    assert t["note"]["ai_status"] == "pending" and t["note"]["text"]       # the instant rule-based text is there
    assert len(queued) == 1


def test_a_pending_note_left_over_from_a_restart_becomes_failed(client, use_provider, monkeypatch):
    b = create_quick(client)
    use_provider("{}")
    monkeypatch.setattr(today_mod, "_submit", lambda fn, *a: None)         # the job never runs
    today(client, b["id"])
    today_mod._active.clear()
    assert note_of(client, b["id"])["ai_status"] == "failed"


# ---------- events and config ----------

def test_events_are_stored_with_the_business_and_session(client):
    b = create_quick(client)
    resp = client.post("/events", json={"session_id": "abc12345", "business_id": b["id"], "events": [
        {"name": "screen_view", "screen": "today"}, {"name": "tour_skip", "screen": "today", "payload": {"step": 2}}]})
    assert resp.status_code == 201 and resp.json() == {"stored": 2}
    rows = with_db(lambda db: db.query(models.UiEvent).order_by(models.UiEvent.id).all())
    assert [r.name for r in rows] == ["screen_view", "tour_skip"]
    assert rows[1].payload == {"step": 2} and rows[0].business_id == b["id"] and rows[0].session_id == "abc12345"


def test_events_with_an_unknown_business_are_kept_without_one(client):
    client.post("/events", json={"session_id": "abc12345", "business_id": 999, "events": [{"name": "x_y"}]})
    assert with_db(lambda db: db.query(models.UiEvent).one().business_id) is None


@pytest.mark.parametrize("body", [
    {"session_id": "abc12345", "events": []},
    {"session_id": "short", "events": [{"name": "ok"}]},
    {"session_id": "abc12345", "events": [{"name": "Has Spaces"}]},
    {"session_id": "abc12345", "events": [{"name": "ok", "payload": {"x": "y" * 3000}}]},
    {"session_id": "abc12345", "events": [{"name": "ok"}] * 51},
])
def test_bad_events_are_rejected(client, body):
    assert client.post("/events", json=body).status_code == 422
    assert with_db(lambda db: db.query(models.UiEvent).count()) == 0


def test_config_reports_the_coach_state(client, monkeypatch):
    assert client.get("/config").json() == {"coach_enabled": True, "coach_mode": None, "study_mode": False}
    monkeypatch.setenv("COACH_ENABLED", "false")
    assert client.get("/config").json()["coach_enabled"] is False
    monkeypatch.setenv("COACH_ENABLED", "true")
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    monkeypatch.setenv("COACH_SHOW_MODE", "true")
    assert client.get("/config").json()["coach_mode"] == "ollama"


# ---------- the safety rules still hold ----------

def test_simulating_unconfirmed_decisions_is_still_refused(client):
    b = create_quick(client)
    s = client.post(f"/businesses/{b['id']}/scenarios", json={
        "name": "x", "decisions": [{"type": "price", "start_month": 2, "value": 5, "unit": "percent"}]}).json()
    resp = client.post(f"/businesses/{b['id']}/simulate", json={"scenario_ids": [s["id"]], "horizon": 12})
    assert resp.status_code == 409


def test_sample_business_gets_a_today_page_in_every_industry(client):
    for industry in ("cafe", "restaurant", "bakery"):
        bid = client.post("/sample_business", json={"industry": industry}).json()["id"]
        t = today(client, bid)
        assert t["is_sample"] is True and t["note"]["text"]


# ---------- nothing is ever created or chosen for the owner ----------

def test_opening_the_app_creates_nothing(client):
    for path in ("/config", "/industries", "/businesses", "/coach/status", "/health"):
        assert client.get(path).status_code == 200
    assert client.get("/businesses").json() == []
    assert client.get("/businesses/1/today").status_code == 404      # there is no "default" business to fall back on
    assert client.get("/businesses").json() == []


def test_a_sample_or_quick_business_only_exists_after_it_is_asked_for(client):
    quick(client)                                                      # a preview saves nothing
    assert client.get("/businesses").json() == []
    client.post("/sample_business", json={"industry": "cafe"})
    assert len(client.get("/businesses").json()) == 1
