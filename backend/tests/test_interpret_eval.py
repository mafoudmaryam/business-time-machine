"""The evaluation set is real thesis data: keep it well-formed, keep the scoring honest, and guard the rule-based score."""
from __future__ import annotations

import csv
import datetime as dt
import importlib.util
import json
from pathlib import Path

import pytest

from app import engine_bridge
from app.interpret import evaluation
from tests.test_interpret import FakeProvider, item, reply

DATA = evaluation.load_cases()
CASES = DATA["cases"]
TODAY = dt.date.fromisoformat(DATA["today"])
SLOTS = {"amount", "when", "permanent", "rate", "loan_months"}


def test_the_set_is_big_and_varied():
    assert len(CASES) >= 40
    assert len({c["id"] for c in CASES}) == len(CASES)
    assert {c["category"] for c in CASES} >= {"easy", "ambiguous", "multi", "out_of_scope", "typo", "seasonal"}
    assert {c["industry"] for c in CASES} == {"cafe", "restaurant", "bakery"}


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_every_expected_result_is_itself_valid(case):
    assert set(case) >= {"id", "category", "industry", "text", "decisions", "questions", "refusal"}
    assert set(case["questions"]) <= SLOTS
    if case["decisions"]:
        engine_bridge.clean_idea_decisions(case["decisions"], 36)       # the engine would accept what we expect
    assert not (case["refusal"] and case["questions"])                  # a refusal never comes with a question


def test_rule_based_parser_meets_its_recorded_score():
    """A regression guard: the rules were 44 of 48 exact when this was written."""
    rows = [evaluation.run_case(c, TODAY, None) for c in CASES]
    s = evaluation.summarize(rows, CASES)
    assert s["exact"] >= 44
    assert s["questions_correct"] == s["questions_expected"]             # never invents a value where it should ask
    assert s["refusals_correct"] == s["refusals_expected"]
    assert s["fell_back"] == 0


def test_scoring_tells_exact_partial_and_wrong_apart():
    case = {"decisions": [{"type": "price", "start_month": 6, "value": 10, "unit": "percent"},
                          {"type": "hiring", "start_month": 9, "value": 1, "unit": "fte"}],
            "questions": [], "refusal": False}
    good = {"type": "price", "start_month": 6, "value": 10.0, "unit": "percent"}
    other = {"type": "hiring", "start_month": 9, "value": 1.0, "unit": "fte"}
    wrong_month = {**other, "start_month": 8}
    base = {"questions": [], "out_of_scope": None}
    assert evaluation.score(case, {**base, "decisions": [good, other]})["exact"]
    partial = evaluation.score(case, {**base, "decisions": [good, wrong_month]})
    assert not partial["exact"] and partial["partial"] and partial["matched"] == 1
    wrong = evaluation.score(case, {**base, "decisions": []})
    assert not wrong["exact"] and not wrong["partial"]


def test_an_invented_value_where_the_reader_should_have_asked_is_not_a_correct_question():
    case = {"decisions": [], "questions": ["amount"], "refusal": False}
    invented = {"decisions": [{"type": "price", "start_month": 1, "value": 5, "unit": "percent"}], "questions": [],
                "out_of_scope": None}
    assert not evaluation.score(case, invented)["exact"]
    asked = {"decisions": [], "questions": [{"slot": "amount"}], "out_of_scope": None}
    assert evaluation.score(case, asked)["exact"]


def test_a_refusal_must_actually_refuse():
    case = {"decisions": [], "questions": [], "refusal": True}
    assert evaluation.score(case, {"decisions": [], "questions": [], "out_of_scope": {"message": "no"}})["exact"]
    assert not evaluation.score(case, {"decisions": [], "questions": [], "out_of_scope": None})["exact"]


def test_a_mocked_ai_is_scored_and_a_failing_ai_is_counted_as_fallback(monkeypatch):
    case = next(c for c in CASES if c["id"] == "multi-01")
    good = FakeProvider([reply(item("price", 10, "percent", "in March", "Raise prices 10% in March"),
                               item("hiring", 1, "fte", "for the summer", "hire a baker for the summer"))])
    row = evaluation.run_case(case, TODAY, good)
    assert row["exact"] and row["provider_used"] == "ollama" and not row["fallback"]
    assert json.loads(row["got"])["decisions"][0]["start_month"] == 6

    broken = FakeProvider(["nope", "still nope"])
    row = evaluation.run_case(case, TODAY, broken)
    assert row["fallback"] and row["provider_used"] == "template" and row["exact"]      # the rules answered


def test_summary_text_reports_every_measure():
    rows = [evaluation.run_case(c, TODAY, None) for c in CASES[:6]]
    text = evaluation.format_summary(evaluation.summarize(rows, CASES), "template", "")
    for word in ("Exact match", "Partial match", "Correct question", "Correct refusal", "Average time"):
        assert word in text


def load_script():
    path = Path(__file__).resolve().parents[1] / "scripts" / "eval_interpret.py"
    spec = importlib.util.spec_from_file_location("eval_interpret", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sample_spreads_over_the_kinds_of_sentence():
    picked = load_script().pick_sample(CASES, 5)
    assert len(picked) == 5 and len({c["category"] for c in picked}) == 5


def test_the_script_writes_a_csv(tmp_path, monkeypatch):
    script = load_script()
    out = tmp_path / "eval.csv"
    monkeypatch.setattr("sys.argv", ["eval_interpret.py", "--provider", "template", "--limit", "4", "--out", str(out)])
    assert script.main() == 0
    rows = list(csv.DictReader(out.open(encoding="utf-8-sig")))
    assert len(rows) == 4 and {"id", "exact", "seconds", "expected", "got", "provider_used"} <= set(rows[0])
