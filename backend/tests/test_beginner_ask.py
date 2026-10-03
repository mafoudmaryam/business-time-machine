"""'Ask a question' on the Today page: the same Ask endpoint, answered from the Today facts."""
from __future__ import annotations

import pytest

from app.coach import consistency, grounding, template
from test_beginner import LOSING, create_quick, facts_for, today  # noqa: F401  (also brings the autouse fixture)
from test_beginner import inline_jobs  # noqa: F401


def ask(client, run_id, question):
    resp = client.post(f"/simulation_runs/{run_id}/ask", json={"question": question})
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.parametrize("question", template.CHIP_QUESTIONS)
def test_the_three_chips_are_answered_for_the_today_run(client, question):
    b = create_quick(client)
    run_id = today(client, b["id"])["run_id"]
    out = ask(client, run_id, question)
    assert out["answered"] is True and out["answer"] and out["ai_status"] == "none"
    facts = facts_for(client, b["id"])
    assert grounding.unmatched_numbers([out["answer"]], grounding.allowed_numbers(facts)) == []
    assert consistency.check([out["answer"]], facts) is None


def test_a_cash_question_in_the_owners_own_words(client):
    b = create_quick(client, **LOSING)
    out = ask(client, today(client, b["id"])["run_id"], "Am I going to be broke?")
    assert "of 10 futures" in out["answer"]


def test_a_profit_question(client):
    b = create_quick(client)
    out = ask(client, today(client, b["id"])["run_id"], "How much do I make?")
    assert "you keep about" in out["answer"]


def test_a_question_the_rules_cannot_tell_gets_the_kind_fallback(client):
    b = create_quick(client)
    out = ask(client, today(client, b["id"])["run_id"], "What colour is the sky?")
    assert out["answered"] is False and out["suggestions"]


def test_the_coach_card_endpoints_refuse_the_today_run(client):
    b = create_quick(client)
    run_id = today(client, b["id"])["run_id"]
    assert client.post(f"/simulation_runs/{run_id}/coach").status_code == 422
    assert client.get(f"/simulation_runs/{run_id}/coach").status_code == 422
