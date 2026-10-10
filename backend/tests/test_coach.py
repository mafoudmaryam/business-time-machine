"""Coach tests. AI providers are always mocked: no real model is ever called."""
from __future__ import annotations

import json
import re
import threading
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
        monkeypatch.setattr(service, "_submit_ask", lambda fn, *a: fn(*a))


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
    assert body["headline"] and body["what_happens"] and body["why"]
    assert body["summary"]["verdict"]["label"] in ("Good idea", "Worth a try", "Risky", "Not worth it")
    assert "$" in body["what_happens"] and "USD" not in json.dumps(body)
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
    bad = good_reply(headline="You will make 987,654 more.")
    fake = use_provider(bad, good_reply())
    body = final(client, run)
    assert body["mode"] == "ollama" and body["fallback"] is False
    assert len(fake.calls) == 2 and "987654" in fake.calls[1][1]
    first, second = interactions()
    assert first.grounding["passed"] is False and first.grounding["unmatched"] == [987654]
    assert second.grounding["passed"] is True and second.attempt == 2


def test_an_amount_in_the_wrong_currency_triggers_one_retry_and_is_logged(client, run, use_provider):
    bad = good_reply(headline="You would keep £4,000 more.")        # the test business uses dollars
    fake = use_provider(bad, good_reply())
    body = final(client, run)
    assert body["mode"] == "ollama" and body["fallback"] is False
    assert len(fake.calls) == 2 and "wrong currency" in fake.calls[1][1]
    first, second = interactions()
    assert first.grounding["passed"] is False and "£" in first.error and first.error.startswith("currency check")
    assert second.grounding["passed"] is True


def test_two_replies_in_the_wrong_currency_fall_back_to_template(client, run, use_provider):
    bad = good_reply(why="That is $5 in USD and €7.")
    use_provider(bad, bad)
    body = final(client, run)
    assert body["mode"] == "template" and body["fallback"] is True and "€" not in json.dumps(body)


def test_two_ungrounded_replies_fall_back_to_template(client, run, use_provider):
    bad = good_reply(why="That adds up to 7,777,777 in total.")
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

CHIPS = ["Will my cash run out?", "Why does this happen?", "What should I watch for?"]


def ask(client, run, question):
    resp = client.post(f"/simulation_runs/{run['id']}/ask", json={"question": question})
    assert resp.status_code == 200, resp.text
    return resp.json()


def polled(client, body):
    resp = client.get(f"/asks/{body['id']}")
    assert resp.status_code == 200
    return resp.json()


def numbers_are_grounded(run, text):
    """The same check every AI answer must pass: each number in the text is in the run's facts."""
    from app import engine_bridge
    from app.coach import grounding
    db = next(app.dependency_overrides[get_db]())
    try:
        facts, _ = engine_bridge.build_run_facts(db, db.get(models.SimulationRun, run["id"]))
    finally:
        db.close()
    return grounding.unmatched_numbers([text], grounding.allowed_numbers(facts, [])) == []


@pytest.mark.parametrize("chip", CHIPS)
def test_chip_questions_always_get_an_instant_good_answer_without_the_ai(client, run, use_provider, chip):
    fake = use_provider()                      # an AI is configured, but must never be called for a chip
    body = ask(client, run, chip)
    assert body["answered"] is True and body["suggestions"] == []
    assert (body["mode"], body["ai_status"], body["fallback"]) == ("template", "none", False)
    assert len(body["answer"].split()) >= 8 and "can't" not in body["answer"]
    assert numbers_are_grounded(run, body["answer"])
    assert fake.calls == []


def test_cash_chip_says_when_cash_is_lowest_and_in_how_many_futures(client, run):
    answer = ask(client, run, "Will my cash run out?")["answer"]
    assert "lowest around month" in answer and "of 10 futures" in answer


def test_watch_chip_is_calm_when_nothing_is_wrong_and_warns_when_something_is(client, run, business):
    calm = ask(client, run, "What should I watch for?")["answer"]
    assert "Nothing worrying stands out" in calm
    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Big spend", "decisions": [
        {"type": "investment", "start_month": 2, "value": 60000, "unit": "amount", "confirmed": True}]}).json()
    risky_run = client.post(f"/businesses/{business['id']}/simulate", json={
        "scenario_ids": [made["id"]], "horizon": 24, "iterations": 300, "seed": 3}).json()
    warned = ask(client, risky_run, "What should I watch for?")["answer"]
    assert "Nothing worrying" not in warned and "cash" in warned.lower()


def test_chips_match_however_they_are_typed(client, run):
    assert ask(client, run, "why does this happen")["ai_status"] == "none"
    assert ask(client, run, "  WILL MY CASH RUN OUT ?  ")["answered"] is True


@pytest.mark.parametrize("question,expect", [
    ("How is my cash?", "cash is lowest"),
    ("What about my regulars?", "regulars"),
    ("Will I get too busy?", "team"),
    ("How much do my prices add?", "prices"),
    ("What does marketing do?", "marketing"),
    ("Is it risky?", "of 10 futures"),
    ("Why is it better?", "Over"),
    ("How much profit will I make?", "Over"),
])
def test_simple_topics_are_answered_from_the_facts(client, run, question, expect):
    body = ask(client, run, question)
    assert body["answered"] is True and expect in body["answer"]
    assert numbers_are_grounded(run, body["answer"])


def test_a_question_it_cannot_answer_gets_a_kind_reply_and_the_chips_and_no_numbers(client, run):
    body = ask(client, run, "Who won the football?")
    assert body["answered"] is False
    assert body["answer"] == "I can't answer that one yet. Try one of these:"
    assert body["suggestions"] == CHIPS
    assert not re.search(r"\d", body["answer"])


def test_instant_answers_are_logged(client, run):
    ask(client, run, "Will my cash run out?")
    (row,) = interactions()
    assert row.kind == "ask" and row.provider == "template" and "Will my cash run out?" in row.prompt


def test_free_text_returns_at_once_then_the_ai_answer_replaces_it(client, run, use_provider):
    use_provider(json.dumps({"answer": "Cash runs out in 0 of 10 futures, so you look safe."}))
    body = ask(client, run, "Any thoughts on my money situation?")
    assert body["ai_status"] == "done" or body["ai_status"] == "pending"      # inline jobs finish at once in tests
    final_ = polled(client, body)
    assert final_["ai_status"] == "done" and final_["mode"] == "ollama"
    assert final_["answer"] == "Cash runs out in 0 of 10 futures, so you look safe." and final_["fallback"] is False
    assert {r.kind for r in interactions()} == {"ask"}


def test_an_ai_answer_must_pass_the_grounding_check_or_the_instant_answer_stays(client, run, use_provider):
    fake = use_provider(json.dumps({"answer": "You would end with 5,000,000 regulars."}),
                        json.dumps({"answer": "You would end with 7,777,777 regulars."}))
    body = ask(client, run, "How is my cash?")
    instant = body["answer"]
    final_ = polled(client, body)
    assert len(fake.calls) == 2                                              # one retry, then give up
    assert final_["ai_status"] == "failed" and final_["fallback"] is True
    assert final_["answer"] == instant and final_["mode"] == "template"      # the instant answer stays


def test_one_ungrounded_reply_is_retried_and_the_grounded_one_is_used(client, run, use_provider):
    fake = use_provider(json.dumps({"answer": "You would end with 5,000,000 regulars."}),
                        json.dumps({"answer": "Cash runs out in 0 of 10 futures."}))
    final_ = polled(client, ask(client, run, "Any thoughts on my money situation?"))
    assert final_["answer"] == "Cash runs out in 0 of 10 futures." and len(fake.calls) == 2


def test_a_failing_ai_leaves_the_instant_answer_in_place_with_no_error(client, run, use_provider):
    use_provider(ProviderError("the local model took too long to answer"))
    body = ask(client, run, "Any thoughts on my money situation?")
    final_ = polled(client, body)
    assert final_["ai_status"] == "failed" and final_["fallback"] is True
    assert final_["answer"] == body["answer"] and final_["mode"] == "template"


def test_invalid_ai_json_twice_keeps_the_instant_answer(client, run, use_provider):
    use_provider("not json", "still not json")
    body = ask(client, run, "How is my cash?")
    assert polled(client, body)["answer"] == body["answer"]


def test_an_unanswerable_question_may_still_be_answered_by_the_ai(client, run, use_provider):
    use_provider(json.dumps({"answer": "Cash runs out in 0 of 10 futures."}))
    body = ask(client, run, "Should I sleep on it?")
    assert body["answered"] is False and body["suggestions"] == CHIPS
    final_ = polled(client, body)
    assert final_["answered"] is True and final_["suggestions"] == [] and final_["mode"] == "ollama"


def test_the_request_returns_at_once_while_the_ai_is_slow(client, run, monkeypatch, real_threads):
    gate = threading.Event()

    class Slow(FakeProvider):
        def complete(self, system, user, schema, max_tokens=None):
            gate.wait(10)
            return super().complete(system, user, schema)

    fake = Slow([json.dumps({"answer": "Cash runs out in 0 of 10 futures."})])
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    monkeypatch.setattr(service, "make_provider", lambda name: fake)
    try:
        started = time.monotonic()
        body = ask(client, run, "Any thoughts on my money situation?")
        assert time.monotonic() - started < 3                                # nowhere near the AI's 10 s
        assert body["ai_status"] == "pending" and body["mode"] == "template" and body["answer"]
        assert polled(client, body)["ai_status"] == "pending"               # still working; instant answer shown
        gate.set()
        final_ = body
        for _ in range(100):
            final_ = polled(client, body)
            if final_["ai_status"] != "pending":
                break
            time.sleep(0.05)
        assert final_["ai_status"] == "done" and final_["mode"] == "ollama"
    finally:
        gate.set()


def test_a_question_lost_to_a_restart_keeps_its_instant_answer(client, run):
    db = next(app.dependency_overrides[get_db]())
    row = models.CoachAnswer(simulation_run_id=run["id"], question="q", answer="instant", mode="template",
                             answered=True, fallback=False, ai_status="pending")
    db.add(row)
    db.commit()
    ask_id = row.id
    db.close()
    body = client.get(f"/asks/{ask_id}").json()
    assert (body["ai_status"], body["answer"], body["fallback"]) == ("failed", "instant", True)


def test_a_poll_that_read_pending_just_before_the_job_finished_never_overwrites_the_finished_answer(client, run):
    """The old race: the poll loaded the row as "pending", the job then committed "done" and left the active list, and the
    poll (seeing 'not active') wrote "failed" over the finished answer. Done in a fixed order, no threads or sleeps."""
    from sqlalchemy.orm import Session
    db = next(app.dependency_overrides[get_db]())
    row = models.CoachAnswer(simulation_run_id=run["id"], question="q", answer="instant", mode="template",
                             answered=True, fallback=False, ai_status="pending")
    db.add(row)
    db.commit()
    ask_id = row.id
    assert db.get(models.CoachAnswer, ask_id).ai_status == "pending"            # the poll's session has read "pending"
    with Session(db.get_bind()) as job:                                        # the job finishes in its own session
        done = job.get(models.CoachAnswer, ask_id)
        done.answer, done.mode, done.ai_status = "the AI answer", "ollama", "done"
        job.commit()
    try:
        out = service.read_ask(db, ask_id)                                     # the poll now checks the active list
    finally:
        db.close()
    assert (out["ai_status"], out["answer"], out["mode"]) == ("done", "the AI answer", "ollama")


def test_unknown_ask_is_404_and_empty_question_is_422(client, run):
    assert client.get("/asks/999").status_code == 404
    assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "   "}).status_code == 422
    assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": ""}).status_code == 422


def test_ask_is_switched_off_with_the_coach(client, run, monkeypatch):
    monkeypatch.setenv("COACH_ENABLED", "false")
    assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "hi"}).status_code == 404
    assert client.get("/asks/1").status_code == 404


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
    assert body["ai_status"] == "none"


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


# ---------- wording: money format, whole numbers, no repetition, no near-duplicate ideas ----------

def test_template_text_uses_the_currency_symbol_and_whole_numbers(client, run):
    import re
    body = client.post(f"/simulation_runs/{run['id']}/coach").json()
    text = " ".join([body["headline"], body["what_happens"], body["why"], *body["watch_out"]])
    assert re.search(r"\$\d{1,3}(,\d{3})*", text) and "USD" not in text
    assert not re.search(r"\d\.\d+%", text)                    # never 3.01%
    assert "fewer regulars" in text and re.search(r"about \d+ fewer regulars", text)


def test_template_headline_is_a_verdict_and_does_not_repeat_the_first_sentence(client, run):
    from app.coach.ideas import sounds_alike
    body = client.post(f"/simulation_runs/{run['id']}/coach").json()
    assert not any(ch.isdigit() for ch in body["headline"])
    first_sentence = body["what_happens"].split(". ")[0]
    assert not sounds_alike(body["headline"], first_sentence)


def test_euro_business_gets_euro_symbols(client):
    biz = client.post("/businesses", json={"name": "Euro Cafe", "currency": "EUR"}).json()
    sc = client.post(f"/businesses/{biz['id']}/scenarios", json={"name": "Raise", "decisions": [
        {"type": "price", "start_month": 3, "value": 10, "unit": "percent", "confirmed": True}]}).json()
    run = client.post(f"/businesses/{biz['id']}/simulate",
                      json={"scenario_ids": [sc["id"]], "horizon": 24, "iterations": 200, "seed": 1}).json()
    body = client.post(f"/simulation_runs/{run['id']}/coach").json()
    assert "€" in body["what_happens"] and "EUR" not in body["what_happens"]


def test_the_ai_sees_money_already_formatted_but_numbers_are_still_checked_against_plain_facts(client, run, use_provider):
    fake = use_provider(good_reply(what_happens="You could earn about $26,900 more."))
    body = final(client, run)
    assert "$26,900" in fake.calls[0][1] and "USD" not in fake.calls[0][1]      # what the AI was shown
    assert body["mode"] == "ollama" and "$26,900" in body["what_happens"]       # and it passed the check


def test_ai_headline_repeated_by_its_first_sentence_is_trimmed(client, run, use_provider):
    use_provider(good_reply(headline="Raising prices looks promising for your cafe.",
                            what_happens="Raising prices looks promising for your cafe. Regulars may drift away."))
    body = final(client, run)
    assert body["what_happens"] == "Regulars may drift away."


def test_near_duplicate_ai_ideas_are_dropped(client, run, use_provider):
    def price(title, value):
        return {"title": title, "why": "Try it.", "builds_on": "baseline",
                "decisions": [{"type": "price", "start_month": 2, "value": value, "unit": "percent"}]}
    ideas = [price("Small rise", 3), price("Slightly bigger rise", 5), price("Price cut", -5),
             {"title": "Open longer", "why": "More days.", "builds_on": "baseline",
              "decisions": [{"type": "hours", "start_month": 4, "value": 30, "unit": "days"}]}]
    use_provider(good_reply(ideas=ideas))
    titles = [i["title"] for i in final(client, run)["ideas"]]
    assert "Small rise" in titles and "Slightly bigger rise" not in titles       # 3% vs 5%: too alike
    assert "Price cut" not in titles                                            # a second price idea: same kind
    assert "Open longer" in titles                                              # a different area is kept


def test_template_ideas_are_never_near_duplicates(client, run):
    from app.coach.ideas import near_duplicate
    ideas = client.post(f"/simulation_runs/{run['id']}/coach").json()["ideas"]
    for i, a in enumerate(ideas):
        for b in ideas[i + 1:]:
            assert not near_duplicate(a, b)
