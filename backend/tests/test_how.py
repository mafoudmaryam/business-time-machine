"""GET /businesses/{id}/how (your numbers vs ours) and GET /businesses/{id}/summary (Today's numbers, no coach)."""
from __future__ import annotations

import pytest

from app import models
from app.coach import service, today as today_mod
from app.database import Base, get_db
from app.main import app

ANSWERS = {"customers_per_day": 150, "avg_spend": 7, "monthly_rent": 3000, "staff": 4}


def with_db(fn):
    session = next(app.dependency_overrides[get_db]())
    try:
        return fn(session)
    finally:
        session.close()


def create_quick(client, industry="cafe", **over):
    q = client.post(f"/industries/{industry}/quick_baseline", json=ANSWERS | over).json()
    resp = client.post("/businesses", json={"name": "Mine", "industry": industry, "baseline": q["baseline"],
                                            "setup_source": "quick", "assumed_fields": q["assumed"]})
    assert resp.status_code == 201, resp.text
    return resp.json()


def how(client, business_id):
    resp = client.get(f"/businesses/{business_id}/how")
    assert resp.status_code == 200, resp.text
    return resp.json()


def keys(items):
    return [i["key"] for i in items]


def fields(items):
    return [i["field"] for i in items]


class TestFullSetup:
    def test_everything_is_the_owners_own_and_nothing_is_assumed(self, client, business):
        h = how(client, business["id"])
        assert h["assumed"] == []
        assert sorted(keys(h["told"])) == sorted([
            "avg_ticket", "customers", "visits_per_regular", "walk_in_visits", "churn_rate", "seats", "staff_fte", "wage_per_fte",
            "cogs_ratio", "fixed_costs", "marketing", "open_days", "cash",
        ])
        by = {i["key"]: i for i in h["told"]}
        assert by["cash"]["value"] == business["baseline"]["cash"] and by["cash"]["unit"] == "money"
        assert by["churn_rate"]["unit"] == "percent"
        assert by["customers"]["label"] == "Regulars"

    def test_it_says_what_the_answer_was_made_with(self, client, business):
        run = how(client, business["id"])["run"]
        assert run["iterations"] == 1000 and run["horizon"] == 12 and run["engine_version"] and run["seed"]


class TestQuickStart:
    def test_the_four_answers_are_shown_as_typed(self, client):
        b = create_quick(client)
        told = {i["key"]: i for i in how(client, b["id"])["told"]}
        assert set(told) == {"customers_per_day", "avg_spend", "monthly_rent", "staff"}
        assert told["customers_per_day"]["value"] == pytest.approx(150, abs=0.1)
        assert told["avg_spend"]["value"] == 7
        assert told["monthly_rent"]["value"] == pytest.approx(3000, abs=0.01)
        assert told["staff"]["value"] == 4
        assert told["monthly_rent"]["label"] == "Monthly rent" and told["monthly_rent"]["unit"] == "money"

    def test_what_we_filled_in_is_listed_separately_with_a_rule_for_each(self, client):
        b = create_quick(client)
        h = how(client, b["id"])
        assert {"cash", "fixed_costs", "marketing", "staff_fte", "customers", "open_days"} <= set(fields(h["assumed"]))
        assert all(a["rule"] for a in h["assumed"])
        assert next(a for a in h["assumed"] if a["field"] == "cash")["rule"] == "two months of your monthly costs"

    def test_a_number_is_never_in_both_lists(self, client):
        b = create_quick(client)
        h = how(client, b["id"])
        told_fields = {"avg_ticket" if k == "avg_spend" else k for k in keys(h["told"])}
        assert told_fields.isdisjoint(set(fields(h["assumed"])))

    def test_changing_an_assumed_number_moves_it_to_what_you_told_us(self, client):
        b = create_quick(client)
        assert client.patch(f"/businesses/{b['id']}/baseline", json={"cash": 40000}).status_code == 200
        h = how(client, b["id"])
        assert "cash" not in fields(h["assumed"])
        cash = next(i for i in h["told"] if i["key"] == "cash")
        assert cash["value"] == 40000 and cash["label"] == "Cash in the bank"
        assert set(keys(h["told"])) >= {"customers_per_day", "avg_spend", "monthly_rent", "staff", "cash"}

    def test_changing_the_fixed_costs_replaces_the_rent_answer(self, client):
        b = create_quick(client)
        client.patch(f"/businesses/{b['id']}/baseline", json={"fixed_costs": 5200})
        h = how(client, b["id"])
        assert "monthly_rent" not in keys(h["told"])
        assert next(i for i in h["told"] if i["key"] == "fixed_costs")["value"] == 5200
        assert "fixed_costs" not in fields(h["assumed"])

    def test_changing_the_regulars_drops_the_customers_a_day_answer_but_keeps_the_rest(self, client):
        b = create_quick(client)
        client.patch(f"/businesses/{b['id']}/baseline", json={"customers": 500})
        h = how(client, b["id"])
        assert "customers_per_day" not in keys(h["told"])
        assert next(i for i in h["told"] if i["key"] == "customers")["value"] == 500
        assert {"avg_spend", "monthly_rent", "staff"} <= set(keys(h["told"]))

    @pytest.mark.parametrize("industry", ["cafe", "restaurant", "bakery"])
    def test_every_industry(self, client, industry):
        b = create_quick(client, industry)
        h = how(client, b["id"])
        assert h["industry"] == industry and len(h["told"]) == 4 and h["assumed"]


class TestSample:
    def test_a_sample_business_has_nothing_of_the_owners_own(self, client):
        b = client.post("/sample_business", json={"industry": "bakery"}).json()
        h = how(client, b["id"])
        assert h["is_sample"] is True and h["setup_source"] == "sample"
        assert h["told"] == []
        assert len(h["assumed"]) == 13
        assert all("typical for a small bakery" in a["rule"] for a in h["assumed"])


class TestSummary:
    def test_it_has_the_same_numbers_as_today_but_no_coach_note(self, client):
        b = create_quick(client)
        summary = client.get(f"/businesses/{b['id']}/summary").json()
        assert summary["note"] is None
        today = client.get(f"/businesses/{b['id']}/today").json()
        for key in ("tiles", "profit", "cash", "month_labels", "run_id", "assumptions"):
            assert summary[key] == today[key]

    def test_it_starts_no_ai_job_and_stores_no_note(self, client, monkeypatch):
        def boom(*_a, **_k):
            raise AssertionError("no AI for the summary")
        monkeypatch.setenv("COACH_PROVIDER", "ollama")
        monkeypatch.setattr(service, "make_provider", boom)
        monkeypatch.setattr(today_mod, "make_provider", boom)
        b = create_quick(client)
        assert client.get(f"/businesses/{b['id']}/summary").status_code == 200
        assert client.get(f"/businesses/{b['id']}/how").status_code == 200
        assert with_db(lambda db: db.query(models.TodayNote).count()) == 0
        assert with_db(lambda db: db.query(models.AiInteraction).count()) == 0

    def test_it_works_with_the_coach_switched_off(self, client, monkeypatch):
        b = create_quick(client)
        monkeypatch.setenv("COACH_ENABLED", "false")
        assert client.get(f"/businesses/{b['id']}/summary").status_code == 200
        assert client.get(f"/businesses/{b['id']}/how").status_code == 200


class TestSafety:
    @pytest.mark.parametrize("path", ["how", "summary"])
    def test_unknown_and_deleted_businesses_are_404(self, client, business, path):
        assert client.get(f"/businesses/999/{path}").status_code == 404
        client.delete(f"/businesses/{business['id']}")
        assert client.get(f"/businesses/{business['id']}/{path}").status_code == 404

    def test_reading_changes_nothing_but_the_one_stored_today_run(self, client):
        b = create_quick(client)
        def counts():
            return with_db(lambda db: {t.name: db.execute(t.select().with_only_columns(__import__("sqlalchemy").func.count())).scalar()
                                       for t in Base.metadata.sorted_tables})
        client.get(f"/businesses/{b['id']}/how")                     # makes (once) the same stored run Today uses
        before = counts()
        for _ in range(3):
            client.get(f"/businesses/{b['id']}/how")
            client.get(f"/businesses/{b['id']}/summary")
        assert counts() == before
