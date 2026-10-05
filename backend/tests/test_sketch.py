"""POST /businesses/{id}/preview_change and GET /start_options: the read-only "just a sketch" for Try a change."""
from __future__ import annotations

import datetime as dt
import json
import time

import pytest

from app import models
from app.coach import service, today as today_mod
from app.database import Base, get_db
from app.main import app


def with_db(fn):
    session = next(app.dependency_overrides[get_db]())
    try:
        return fn(session)
    finally:
        session.close()


def row_counts() -> dict[str, int]:
    return with_db(lambda db: {t.name: db.execute(t.select().with_only_columns(__import__("sqlalchemy").func.count())).scalar()
                               for t in Base.metadata.sorted_tables})


def sketch(client, business_id, type="price", amount=7, start_month=1):
    return client.post(f"/businesses/{business_id}/preview_change", json={"type": type, "amount": amount, "start_month": start_month})


@pytest.fixture()
def industries_business(client):
    return {i: client.post("/businesses", json={"name": f"B {i}", "industry": i}).json() for i in ("cafe", "restaurant", "bakery")}


class TestAnswer:
    def test_it_returns_what_the_page_shows(self, client, business):
        r = sketch(client, business["id"], amount=7)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["just_a_sketch"] is True
        assert body["type"] == "price" and body["amount"] == 7 and body["start_month"] == 1
        assert body["extra_profit_per_month"] > 0
        assert body["visits_change_per_month"] < 0
        assert 0 <= body["ahead_of_10"] <= 10
        assert body["horizon"] == 12 and len(body["month_labels"]) == 12
        for path in ("change", "baseline"):
            for metric in ("profit", "cash", "customers"):
                assert len(body[path][metric]["p10"]) == len(body[path][metric]["p50"]) == len(body[path][metric]["p90"]) == 12
            assert 1 <= body[path]["lowest_cash_month"] <= 12
        assert body["cash_now"] == business["baseline"]["cash"]
        assert body["example"]["after"] == pytest.approx(body["example"]["before"] * 1.07, abs=0.01)

    def test_the_three_money_numbers_add_up(self, client, business):
        b = sketch(client, business["id"], amount=12).json()
        assert b["profit_per_month_with_change"] - b["profit_per_month_without"] == pytest.approx(b["extra_profit_per_month"], abs=0.011)

    def test_the_sentence_names_the_change_and_the_month(self, client, business):
        body = sketch(client, business["id"], amount=5, start_month=3).json()
        assert body["sentence"].startswith("Raise prices by 5% from ")
        assert body["sentence"].endswith("(month 3)")
        assert body["start_label"] in body["sentence"]
        assert body["start_label"].split()[0].startswith(body["month_labels"][2].split()[0])     # "Jan" / "January" 

    def test_first_month_label_is_next_month(self, client, business):
        today = dt.date.today()
        first = sketch(client, business["id"]).json()["month_labels"][0]
        assert first.endswith(str((today.year * 12 + today.month) // 12))  # rolls into the next year in December

    @pytest.mark.parametrize("kind,amount,sentence", [
        ("price", 10, "Raise prices by 10%"), ("hours", 24, "Open 24 days per month"),
        ("hiring", 1, "Hire 1 full-time staff"), ("marketing", 50, "Increase marketing spend by 50%"),
    ])
    def test_every_kind_works_for_every_industry(self, client, industries_business, kind, amount, sentence):
        for business in industries_business.values():
            r = sketch(client, business["id"], type=kind, amount=amount)
            assert r.status_code == 200, r.text
            assert r.json()["sentence"].startswith(sentence)
            assert ("example" in r.text and r.json()["example"] is not None) == (kind == "price")

    def test_the_menu_and_investments_are_not_sketches(self, client, business):
        for kind in ("menu", "investment", "unknown"):
            assert sketch(client, business["id"], type=kind).status_code == 422

    def test_it_is_deterministic(self, client, business):
        a = sketch(client, business["id"], amount=9, start_month=3).text
        b = sketch(client, business["id"], amount=9, start_month=3).text
        assert a == b

    def test_a_different_slider_position_gives_a_different_picture(self, client, business):
        assert sketch(client, business["id"], amount=3).json()["extra_profit_per_month"] != sketch(client, business["id"], amount=12).json()["extra_profit_per_month"]

    def test_the_same_picture_each_time_even_after_other_requests(self, client, business):
        first = sketch(client, business["id"]).text
        client.get(f"/businesses/{business['id']}/today")
        sketch(client, business["id"], amount=1)
        assert sketch(client, business["id"]).text == first

    def test_it_is_quick(self, client, business):
        sketch(client, business["id"])                   # warm up
        start = time.perf_counter()
        for amount in (2, 5, 9, 14):
            assert sketch(client, business["id"], amount=amount).status_code == 200
        assert (time.perf_counter() - start) / 4 < 1.0


class TestValidation:
    @pytest.mark.parametrize("kind,amount", [
        ("price", 31), ("price", -21), ("hours", 0), ("hours", 32), ("hiring", 6), ("hiring", -6), ("marketing", 301), ("marketing", -51),
    ])
    def test_amounts_out_of_range_are_refused_with_a_plain_reason(self, client, business, kind, amount):
        r = sketch(client, business["id"], type=kind, amount=amount)
        assert r.status_code == 422
        assert "choose between" in r.json()["detail"]

    @pytest.mark.parametrize("kind,amount", [("price", 30), ("price", -20), ("hours", 1), ("hours", 31), ("hiring", 5), ("marketing", 300)])
    def test_the_edges_are_allowed(self, client, business, kind, amount):
        assert sketch(client, business["id"], type=kind, amount=amount).status_code == 200

    @pytest.mark.parametrize("start", [0, 13, -1, 36])
    def test_start_month_must_be_inside_the_twelve_months(self, client, business, start):
        assert sketch(client, business["id"], start_month=start).status_code == 422

    @pytest.mark.parametrize("body", [
        {}, {"type": "price"}, {"amount": 5}, {"type": "price", "amount": "lots"}, {"type": "price", "amount": None},
        {"type": "price", "amount": 5, "start_month": "soon"},
    ])
    def test_malformed_requests_are_refused(self, client, business, body):
        assert client.post(f"/businesses/{business['id']}/preview_change", json=body).status_code == 422

    def test_unknown_and_deleted_businesses_are_404(self, client, business):
        assert sketch(client, 999).status_code == 404
        client.delete(f"/businesses/{business['id']}")
        assert sketch(client, business["id"]).status_code == 404


class TestReadOnly:
    def test_it_saves_nothing_anywhere(self, client, business):
        before = row_counts()
        for amount in (1, 5, 10, 15):
            assert sketch(client, business["id"], amount=amount, start_month=2).status_code == 200
        assert sketch(client, business["id"], type="hiring", amount=2).status_code == 200
        assert sketch(client, business["id"], amount=99).status_code == 422          # refused ones leave nothing either
        assert row_counts() == before

    def test_it_writes_no_ai_logs_and_never_calls_a_provider(self, client, business, monkeypatch):
        def boom(*_a, **_k):
            raise AssertionError("the AI must never be called for a sketch")
        monkeypatch.setenv("COACH_PROVIDER", "ollama")
        monkeypatch.setattr(service, "make_provider", boom)
        monkeypatch.setattr(today_mod, "make_provider", boom)
        before = with_db(lambda db: db.query(models.AiInteraction).count())
        assert sketch(client, business["id"]).status_code == 200
        assert with_db(lambda db: db.query(models.AiInteraction).count()) == before

    def test_it_does_not_change_the_business_or_its_today_page(self, client, business):
        today_before = client.get(f"/businesses/{business['id']}/today").json()
        sketch(client, business["id"], amount=15)
        assert client.get(f"/businesses/{business['id']}").json() == business
        today_after = client.get(f"/businesses/{business['id']}/today").json()
        assert today_after["profit"] == today_before["profit"] and today_after["run_id"] == today_before["run_id"]

    def test_it_needs_no_confirmation_because_nothing_is_saved_but_saving_still_does(self, client, business):
        """The sketch is the owner's own input. A saved scenario with unconfirmed steps is still refused at simulate time."""
        s = client.post(f"/businesses/{business['id']}/scenarios", json={
            "name": "x", "decisions": [{"type": "price", "start_month": 2, "value": 5, "unit": "percent"}]}).json()
        assert sketch(client, business["id"], amount=5, start_month=2).status_code == 200
        assert client.post(f"/businesses/{business['id']}/simulate", json={"scenario_ids": [s["id"]]}).status_code == 409


class TestStartOptions:
    def test_three_buttons_with_real_months(self, client):
        options = client.get("/start_options").json()["options"]
        assert [o["key"] for o in options] == ["next", "in3", "spring"]
        assert [o["label"] for o in options] == ["Next month", "In 3 months", "In spring"]
        assert options[0]["month"] == 1 and options[1]["month"] == 3
        assert all(1 <= o["month"] <= 12 for o in options)

    def test_spring_is_the_next_march(self, client):
        spring = client.get("/start_options").json()["options"][2]
        assert spring["name"].startswith("March ")
        today = dt.date.today()
        year = int(spring["name"].split()[1])
        assert (year, 3) > (today.year, today.month)          # in the future, never this month

    def test_names_match_the_month_labels_of_the_sketch(self, client, business):
        options = {o["month"]: o["name"] for o in client.get("/start_options").json()["options"]}
        body = sketch(client, business["id"], start_month=3).json()
        assert options[3] == body["start_label"]
