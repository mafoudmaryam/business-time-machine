"""Coach tests. AI providers are always mocked: no real model is ever called."""
from __future__ import annotations

import json
import time

import pytest

from app import models
from app.coach import service
from app.coach.providers import ProviderError, ProviderResult
from app.database import get_db
from app.main import app

IDEA_KEYS = {"profit_change_most_likely", "beats_change_nothing_of_10", "cash_runs_out_of_10",
             "profit_bad_case", "profit_most_likely", "profit_good_case"}


def final(client, run):
    """Start the coach, then read its finished state (background jobs run inline in most tests)."""
    assert client.post(f"/simulation_runs/{run['id']}/coach").status_code == 200
    resp = client.get(f"/simulation_runs/{run['id']}/coach")
    assert resp.status_code == 200
    return resp.json()


@pytest.fixture(autouse=True)
def inline_jobs(request, monkeypatch):
    """Run the background AI job right away, so tests are deterministic. Tests that ask for
    `real_threads` use the real worker thread instead."""
    if "real_threads" not in request.fixturenames:
        monkeypatch.setattr(service, "_submit", lambda fn, *a: fn(*a))


@pytest.fixture()
def real_threads():
    yield


class FakeProvider:
    """Plays back a list of replies (strings, or exceptions to raise)."""

    name = "ollama"
    model = "fake-model"

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, system, user, schema):
        self.calls.append((system, user))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return ProviderResult(reply, self.model, 100, 50, 12)


def good_reply(**over):
    body = {
        "headline": "Raising prices looks promising for your cafe.",
        "what_happens": "You could earn more while a few regulars may drift away.",
        "why": "Each sale brings in more money, which helps more than the lost visits hurt.",
        "watch_out": ["Keep an eye on how many regulars stay."],
        "ideas": [{
            "title": "Hire 1 barista from month 6",
            "why": "An extra pair of hands could help at busy times.",
            "builds_on": "Raise prices",
            "decisions": [{"type": "hiring", "start_month": 6, "value": 1, "unit": "fte"}],
        }, {
            "title": "Try more marketing early",
            "why": "More people may hear about you.",
            "builds_on": "baseline",
            "decisions": [{"type": "marketing", "start_month": 2, "value": 20, "unit": "percent"}],
        }],
    }
    body.update(over)
    return json.dumps(body)


@pytest.fixture()
def run(client, business):
    resp = client.post(f"/businesses/{business['id']}/scenarios", json={
        "name": "Raise prices",
        "decisions": [{"type": "price", "start_month": 3, "value": 10, "unit": "percent", "confirmed": True}],
    })
    assert resp.status_code == 201
    resp = client.post(f"/businesses/{business['id']}/simulate",
                       json={"scenario_ids": [resp.json()["id"]], "horizon": 24, "iterations": 200, "seed": 42})
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture()
def use_provider(monkeypatch):
    def _use(*replies, provider="ollama"):
        fake = FakeProvider(replies)
        monkeypatch.setenv("COACH_PROVIDER", provider)
        monkeypatch.setattr(service, "make_provider", lambda name: fake)
        return fake
    return _use


def interactions():
    db = next(app.dependency_overrides[get_db]())
    try:
        return db.query(models.AiInteraction).order_by(models.AiInteraction.id).all()
    finally:
        db.close()


# ---------- template mode (default) ----------

def test_template_coach_has_story_and_engine_tested_ideas(client, run):
    resp = client.post(f"/simulation_runs/{run['id']}/coach")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "template" and body["fallback"] is False
    assert body["headline"] and body["what_happens"] and body["why"] and body["watch_out"]
    assert "USD" in body["what_happens"] or "same as changing nothing" in body["what_happens"]
    assert 2 <= len(body["ideas"]) <= 3
    for idea in body["ideas"]:
        assert set(idea["result"]) == IDEA_KEYS
        assert idea["decisions"] and idea["decision_texts"]
        assert 0 <= idea["result"]["beats_change_nothing_of_10"] <= 10


def test_coach_is_cached_per_run(client, run):
    first = final(client, run)
    n = len(interactions())
    second = final(client, run)
    assert second == first
    assert len(interactions()) == n
    third = client.post(f"/simulation_runs/{run['id']}/coach?regenerate=true")
    assert third.status_code == 200 and len(interactions()) > n


def test_template_coach_logged_for_thesis_data(client, run):
    client.post(f"/simulation_runs/{run['id']}/coach")
    (row,) = interactions()
    assert (row.kind, row.provider, row.simulation_run_id) == ("coach", "template", run["id"])
    assert row.response and row.grounding == {"passed": True, "unmatched": []}


def test_unknown_run_is_404(client):
    assert client.post("/simulation_runs/999/coach").status_code == 404
    assert client.post("/simulation_runs/999/ask", json={"question": "hi"}).status_code == 404


# ---------- AI mode with mocked providers ----------

def test_ai_reply_used_and_idea_numbers_come_from_the_engine(client, run, use_provider):
    fake = use_provider(good_reply())
    body = final(client, run)
    assert body["mode"] == "ollama" and body["model"] == "fake-model" and body["fallback"] is False
    assert body["headline"].startswith("Raising prices")
    assert len(body["ideas"]) == 2
    idea = body["ideas"][0]
    assert idea["title"] == "Hire 1 barista from month 6"
    assert idea["builds_on"] == "Raise prices" and idea["builds_on_scenario_id"]
    assert set(idea["result"]) == IDEA_KEYS
    assert len(fake.calls) == 1
    (row,) = interactions()
    assert (row.provider, row.model, row.prompt_tokens, row.completion_tokens) == ("ollama", "fake-model", 100, 50)
    assert row.grounding["passed"] is True


def test_idea_simulated_on_same_seed_matches_the_run(client, run, use_provider):
    use_provider(good_reply())
    idea = final(client, run)["ideas"][0]
    assert idea["builds_on"] == "Raise prices"          # price +10% from month 3, plus 1 hire from month 6
    # Build exactly that scenario by hand and run it with the same seed as the original run.
    made = client.post(f"/businesses/{run['business_id']}/scenarios", json={"name": "By hand", "decisions": [
        {"type": "price", "start_month": 3, "value": 10, "unit": "percent", "confirmed": True},
        {"type": "hiring", "start_month": 6, "value": 1, "unit": "fte", "confirmed": True}]}).json()
    again = client.post(f"/businesses/{run['business_id']}/simulate", json={
        "scenario_ids": [made["id"]], "horizon": run["horizon"], "iterations": run["iterations"], "seed": run["seed"]}).json()
    summary = next(r for r in again["results"] if r["scenario_name"] == "By hand")["summary"]
    assert idea["result"]["profit_change_most_likely"] == round(summary["profit_vs_baseline_p50"])
    assert idea["result"]["beats_change_nothing_of_10"] == round(summary["prob_beats_baseline_profit"] * 10)


def test_ungrounded_number_triggers_one_retry(client, run, use_provider):
    bad = good_reply(headline="You will make 987,654 EUR more.")
    fake = use_provider(bad, good_reply())
    body = final(client, run)
    assert body["mode"] == "ollama" and body["fallback"] is False
    assert len(fake.calls) == 2 and "987654" in fake.calls[1][1]
    first, second = interactions()
    assert first.grounding["passed"] is False and first.grounding["unmatched"] == [987654]
    assert second.grounding["passed"] is True and second.attempt == 2


def test_two_ungrounded_replies_fall_back_to_template(client, run, use_provider):
    bad = good_reply(why="That adds up to 7,777,777 EUR.")
    fake = use_provider(bad, bad)
    body = final(client, run)
    assert body["mode"] == "template" and body["fallback"] is True
    assert "7,777,777" not in json.dumps(body)
    assert [r.provider for r in interactions()] == ["ollama", "ollama", "template"]
    assert len(fake.calls) == 2


def test_provider_error_falls_back_without_retry(client, run, use_provider):
    fake = use_provider(ProviderError("the local model took too long to answer"))
    body = final(client, run)
    assert body["mode"] == "template" and body["fallback"] is True
    assert len(fake.calls) == 1
    first, _ = interactions()
    assert "too long" in first.error


def test_invalid_json_twice_falls_back(client, run, use_provider):
    use_provider("not json at all", "{still: broken")
    body = final(client, run)
    assert body["mode"] == "template" and body["fallback"] is True


def test_json_in_code_fence_is_accepted(client, run, use_provider):
    use_provider("```json\n" + good_reply() + "\n```")
    assert final(client, run)["mode"] == "ollama"


def test_invalid_ideas_are_dropped(client, run, use_provider):
    ideas = [
        {"title": "Bad unit", "why": "x", "builds_on": "baseline",
         "decisions": [{"type": "hiring", "start_month": 3, "value": 1, "unit": "bananas"}]},
        {"title": "Unknown scenario", "why": "x", "builds_on": "Nope",
         "decisions": [{"type": "hiring", "start_month": 3, "value": 1, "unit": "fte"}]},
        {"title": "Month out of range", "why": "x", "builds_on": "baseline",
         "decisions": [{"type": "hiring", "start_month": 99, "value": 1, "unit": "fte"}]},
        {"title": "No decisions", "why": "x", "builds_on": "baseline", "decisions": []},
        {"title": "Good one", "why": "Fine.", "builds_on": "baseline",
         "decisions": [{"type": "marketing", "start_month": 2, "value": 20, "unit": "percent"}]},
    ]
    use_provider(good_reply(ideas=ideas))
    body = final(client, run)
    titles = [i["title"] for i in body["ideas"]]
    assert titles[0] == "Good one"                      # the four invalid ideas are gone...
    assert 2 <= len(titles) <= 3 and "Bad unit" not in titles   # ...and rule-based ones fill up to two


def test_all_ideas_invalid_uses_rule_based_ideas(client, run, use_provider):
    bad = {"title": "Bad", "why": "x", "builds_on": "baseline",
           "decisions": [{"type": "price", "start_month": 0, "value": 1, "unit": "percent"}]}
    use_provider(good_reply(ideas=[bad]))
    body = final(client, run)
    assert body["mode"] == "ollama" and 2 <= len(body["ideas"]) <= 3


def test_idea_that_repeats_a_lever_the_scenario_already_uses_is_dropped(client, run, use_provider):
    again = {"title": "Price +1.1%", "why": "More price.", "builds_on": "Raise prices",
             "decisions": [{"type": "price", "start_month": 3, "value": 1.1, "unit": "percent"}]}
    fine = {"title": "Open longer", "why": "More days.", "builds_on": "Raise prices",
            "decisions": [{"type": "hours", "start_month": 4, "value": 30, "unit": "days"}]}
    use_provider(good_reply(ideas=[again, fine]))
    titles = [i["title"] for i in final(client, run)["ideas"]]
    assert "Price +1.1%" not in titles and titles[0] == "Open longer"


def test_idea_that_copies_an_existing_scenario_is_dropped(client, run, use_provider):
    copy_ = {"title": "Same as before", "why": "Again.", "builds_on": "baseline",
             "decisions": [{"type": "price", "start_month": 3, "value": 10, "unit": "percent"}]}
    use_provider(good_reply(ideas=[copy_]))
    titles = [i["title"] for i in final(client, run)["ideas"]]
    assert "Same as before" not in titles and len(titles) >= 2


def test_prompt_uses_plain_ascii_letters():
    from app.coach.prompts import coach_prompt
    facts = {"business": {"industry": "Café", "currency": "EUR", "customers_word": "regulars",
                          "staff_word": "barista", "months": 24}}
    system, user = coach_prompt(facts)
    assert "é" not in system + user and "cafe" in system


def test_mojibake_from_small_models_is_repaired(client, run, use_provider):
    garbled = "your cafÃ©".encode().decode("unicode_escape")
    use_provider(good_reply(headline=garbled))
    assert final(client, run)["headline"] == "your café".encode().decode("unicode_escape")


def test_anthropic_without_key_uses_template(client, run, monkeypatch):
    monkeypatch.setenv("COACH_PROVIDER", "anthropic")
    body = final(client, run)
    assert body["mode"] == "template" and body["fallback"] is True


# ---------- switches ----------

def test_coach_can_be_switched_off(client, run, monkeypatch):
    monkeypatch.setenv("COACH_ENABLED", "false")
    assert client.get("/coach/status").json() == {"enabled": False, "mode": None}
    assert client.post(f"/simulation_runs/{run['id']}/coach").status_code == 404
    assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "hi"}).status_code == 404


def test_mode_is_hidden_unless_show_mode_is_on(client, monkeypatch):
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    assert client.get("/coach/status").json() == {"enabled": True, "mode": None}
    monkeypatch.setenv("COACH_SHOW_MODE", "true")
    assert client.get("/coach/status").json() == {"enabled": True, "mode": "ollama"}


def test_unknown_provider_name_means_template(client, monkeypatch):
    monkeypatch.setenv("COACH_PROVIDER", "gpt-something")
    monkeypatch.setenv("COACH_SHOW_MODE", "true")
    assert client.get("/coach/status").json()["mode"] == "template"


# ---------- ask ----------

def test_ask_template_answers_from_facts_and_logs(client, run):
    resp = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Will my cash run out?"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "template" and "of 10 futures" in body["answer"]
    (row,) = interactions()
    assert row.kind == "ask" and "Will my cash run out?" in row.prompt


def test_ask_template_is_honest_when_it_cannot_tell(client, run):
    resp = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Who won the football?"})
    assert "can't tell" in resp.json()["answer"]


def test_ask_uses_provider_and_grounding(client, run, use_provider):
    fake = use_provider(json.dumps({"answer": "You would end with 5,000,000 regulars."}),
                        json.dumps({"answer": "Cash runs out in 0 of 10 futures."}))
    body = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Cash?"}).json()
    assert body == {"answer": "Cash runs out in 0 of 10 futures.", "mode": "ollama", "fallback": False}
    assert len(fake.calls) == 2
    assert all(r.kind == "ask" for r in interactions())


def test_ask_falls_back_when_provider_fails(client, run, use_provider):
    use_provider(ProviderError("down"))
    body = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "How is my cash?"}).json()
    assert body["mode"] == "template" and body["fallback"] is True


def test_ask_rejects_empty_question(client, run):
    assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "   "}).status_code == 422
    assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": ""}).status_code == 422


# ---------- the Ollama provider itself (HTTP mocked) ----------

def test_ollama_request_is_fast_and_bounded(monkeypatch):
    import httpx
    from app.coach.providers import OllamaProvider

    seen = {}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"content": "{}"}, "prompt_eval_count": 7, "eval_count": 3}

    def fake_post(url, json, timeout):
        seen.update(url=url, body=json, timeout=timeout)
        return Resp()

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:3b")
    result = OllamaProvider().complete("sys", "user", {"type": "object"})
    body = seen["body"]
    assert body["model"] == "qwen2.5:3b" and body["keep_alive"] == "30m" and body["stream"] is False
    assert body["options"]["num_predict"] == 450 and body["options"]["num_ctx"] == 4096
    assert body["format"] == {"type": "object"}
    assert (result.prompt_tokens, result.completion_tokens) == (7, 3)


def test_ollama_timeout_and_connection_errors_become_provider_errors(monkeypatch):
    import httpx
    from app.coach.providers import OllamaProvider

    for exc in (httpx.ReadTimeout("slow"), httpx.ConnectError("not running")):
        def boom(*a, _exc=exc, **k):
            raise _exc
        monkeypatch.setattr(httpx, "post", boom)
        with pytest.raises(ProviderError):
            OllamaProvider().complete("s", "u", {})


# ---------- non-blocking coach: the AI works in the background ----------

class SlowProvider(FakeProvider):
    def __init__(self, replies, delay):
        super().__init__(replies)
        self.delay = delay

    def complete(self, system, user, schema):
        time.sleep(self.delay)
        return super().complete(system, user, schema)


def wait_until_finished(client, run_id, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/simulation_runs/{run_id}/coach").json()
        if body["ai_status"] != "pending":
            return body
        time.sleep(0.1)
    raise AssertionError("the background coach never finished")


def test_simulate_and_coach_start_stay_fast_while_the_ai_is_slow(client, business, monkeypatch, real_threads):
    slow = SlowProvider([good_reply(), good_reply()], delay=3.0)
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    monkeypatch.setattr(service, "make_provider", lambda name: slow)

    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Raise prices", "decisions": [
        {"type": "price", "start_month": 3, "value": 10, "unit": "percent", "confirmed": True}]}).json()
    sim = {"scenario_ids": [made["id"]], "horizon": 24, "iterations": 1000, "seed": 1}
    run = client.post(f"/businesses/{business['id']}/simulate", json=sim).json()

    t = time.monotonic()
    started = client.post(f"/simulation_runs/{run['id']}/coach")
    start_time = time.monotonic() - t
    assert started.status_code == 200
    body = started.json()
    # The rule-based coach comes back immediately; the AI is still busy.
    assert body["ai_status"] == "pending" and body["mode"] == "template" and body["headline"]
    assert body["ai_elapsed_seconds"] is not None
    assert start_time < 2.0

    # While the slow AI is working, simulating and reading the coach are not held up.
    t = time.monotonic()
    again = client.post(f"/businesses/{business['id']}/simulate", json=sim)
    simulate_time = time.monotonic() - t
    assert again.status_code == 201 and simulate_time < 2.0 < slow.delay
    t = time.monotonic()
    assert client.get(f"/simulation_runs/{run['id']}/coach").json()["ai_status"] == "pending"
    assert time.monotonic() - t < 1.0

    done = wait_until_finished(client, run["id"])            # then the AI version replaces it
    assert done["ai_status"] == "done" and done["mode"] == "ollama"
    assert done["headline"].startswith("Raising prices")


def test_rule_based_coach_first_then_ai_replaces_it(client, run, use_provider):
    use_provider(good_reply())
    started = client.post(f"/simulation_runs/{run['id']}/coach").json()
    assert (started["mode"], started["ai_status"]) == ("template", "pending")
    later = client.get(f"/simulation_runs/{run['id']}/coach").json()
    assert (later["mode"], later["ai_status"], later["fallback"]) == ("ollama", "done", False)
    assert later["ai_elapsed_seconds"] is None
    assert later["headline"] != started["headline"]


def test_failed_ai_keeps_the_rule_based_coach_without_an_error(client, run, use_provider):
    use_provider(ProviderError("the local model took too long to answer"))
    started = client.post(f"/simulation_runs/{run['id']}/coach").json()
    later = client.get(f"/simulation_runs/{run['id']}/coach")
    assert later.status_code == 200
    body = later.json()
    assert body["ai_status"] == "failed" and body["mode"] == "template" and body["fallback"] is True
    assert body["headline"] == started["headline"] and body["ideas"]
    assert [r.provider for r in interactions()] == ["ollama", "template"]


def test_template_mode_is_final_at_once(client, run):
    body = client.post(f"/simulation_runs/{run['id']}/coach").json()
    assert body["ai_status"] == "none" and body["ai_elapsed_seconds"] is None


def test_polling_before_the_coach_started_is_a_plain_404(client, run):
    resp = client.get(f"/simulation_runs/{run['id']}/coach")
    assert resp.status_code == 404 and "switched off" not in resp.json()["detail"]


def test_starting_twice_does_not_start_a_second_ai_job(client, run, monkeypatch):
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    monkeypatch.setattr(service, "make_provider", lambda name: FakeProvider([]))
    submitted = []
    monkeypatch.setattr(service, "_submit", lambda fn, *a: submitted.append(a))    # job never runs
    first = client.post(f"/simulation_runs/{run['id']}/coach").json()
    second = client.post(f"/simulation_runs/{run['id']}/coach?regenerate=true").json()
    assert len(submitted) == 1 and first["ai_status"] == second["ai_status"] == "pending"
    service._active.discard(run["id"])


def test_pending_coach_left_over_from_a_restart_becomes_failed(client, run, monkeypatch):
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    monkeypatch.setattr(service, "make_provider", lambda name: FakeProvider([]))
    monkeypatch.setattr(service, "_submit", lambda fn, *a: None)
    assert client.post(f"/simulation_runs/{run['id']}/coach").json()["ai_status"] == "pending"
    service._active.discard(run["id"])                     # as after a server restart
    body = client.get(f"/simulation_runs/{run['id']}/coach").json()
    assert body["ai_status"] == "failed" and body["headline"]
