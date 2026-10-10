"""The "I don't have a business yet" start-up guide: routes, plain-word errors, soft delete, the practice business, and no AI."""
from __future__ import annotations

import datetime as dt
import socket

import pytest

from app import models, purge
from app.database import get_db
from app.main import app

ANSWERS = dict(business_type="cafe", country="US", budget=200000, premises="fit_out", rent=4000, size="small", menu="simple",
               alcohol="no", people=3, customers_per_day=120, avg_spend=7, timeline="6m")


def with_db(fn):
    session = next(app.dependency_overrides[get_db]())
    try:
        return fn(session)
    finally:
        session.close()


def make_plan(client, **over):
    resp = client.post("/guide/plans", json=ANSWERS | over)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- options ----------

def test_options_list_the_countries_and_their_modes(client):
    out = client.get("/guide/options").json()
    modes = {c["id"]: c["mode"] for c in out["countries"]}
    assert modes == {"US": "full", "UK": "own_numbers", "CN": "own_numbers", "OTHER": "checklist_only"}
    assert {t["id"] for t in out["business_types"]} == {"cafe", "restaurant", "bakery"}
    assert out["data_version"] and out["engine_version"]


# ---------- creating and reading a plan ----------

def test_a_plan_is_made_from_the_answers_and_matches_the_worked_example(client):
    out = make_plan(client)
    plan = out["plan"]
    assert out["id"] >= 1 and out["data_changed"] is False and out["business_id"] is None
    assert plan["startup"]["low"] == 63_500 and plan["startup"]["high"] == 250_000
    assert plan["running"]["middle"] == pytest.approx(21_062, abs=1)
    assert plan["break_even"]["per_day_with_cushion"]["middle"] == pytest.approx(111.6, abs=0.2)
    assert plan["budget"]["verdict"] == "tight"
    assert len(plan["checklist"]) == 9 and plan["struggles"]
    assert all(s["url"].startswith("https://") and s["accessed"] for s in plan["sources"])
    assert client.get(f"/guide/plans/{out['id']}").json()["plan"] == plan          # worked out again, the same


def test_only_the_answers_are_stored_not_the_plan(client):
    out = make_plan(client)
    row = with_db(lambda db: db.get(models.StartupPlan, out["id"]))
    stored = row.answers
    assert stored["business_type"] == "cafe" and stored["people"] == 3
    assert "startup" not in stored and "running" not in stored and "format" not in stored and "notes" not in stored
    assert (row.country, row.business_type, row.currency) == ("US", "cafe", "USD")


@pytest.mark.parametrize("change, message", [
    ({"business_type": None}, "what you would like to open"),
    ({"country": "FR"}, "country"),
    ({"people": 0}, "too small"),
    ({"people": None}, "how many people"),
    ({"avg_spend": -1}, "too small"),
    ({"premises": "castle"}, "rent, own"),
    ({"ingredient_share": 100}, "too large"),
])
def test_bad_answers_get_a_plain_sentence_and_nothing_is_saved(client, change, message):
    resp = client.post("/guide/plans", json=ANSWERS | change)
    assert resp.status_code == 422 and message in resp.json()["detail"]
    assert client.get("/guide/plans").json() == []


def test_unsure_answers_are_fine(client):
    out = make_plan(client, budget=None, rent=None, customers_per_day=None, avg_spend=None)
    plan = out["plan"]
    assert plan["budget"]["verdict"] == "unknown" and plan["running"]["rent_from"] == "guide"
    assert plan["break_even"]["available"] is False


def test_unknown_and_deleted_plans_are_404(client):
    assert client.get("/guide/plans/999").status_code == 404
    out = make_plan(client)
    client.delete(f"/guide/plans/{out['id']}")
    assert client.get(f"/guide/plans/{out['id']}").status_code == 404
    assert client.put(f"/guide/plans/{out['id']}", json=ANSWERS).status_code == 404
    assert client.get(f"/guide/plans/{out['id']}/simulator").status_code == 404


def test_modes_per_country(client):
    uk = make_plan(client, country="UK", rent=None)["plan"]
    assert uk["currency"] == "GBP" and uk["startup"]["available"] is False and uk["running"]["available"] is False
    assert set(uk["running"]["needs"]) == {"rent", "ingredient_share"}
    uk2 = make_plan(client, country="UK", rent=3000, ingredient_share=30)["plan"]
    assert uk2["running"]["available"] and uk2["break_even"]["available"]
    other = make_plan(client, country="OTHER")["plan"]
    assert other["mode"] == "checklist_only" and other["running"]["available"] is False and len(other["checklist"]) == 9
    cn = make_plan(client, country="CN", rent=8000, ingredient_share=35, avg_spend=40)["plan"]
    assert cn["currency"] == "CNY" and cn["running"]["per_person_monthly"]["low"] < cn["running"]["per_person_monthly"]["high"]


# ---------- change answers, newer data, delete and undo ----------

def test_change_my_answers_works_the_plan_out_again(client):
    out = make_plan(client)
    changed = client.put(f"/guide/plans/{out['id']}", json=ANSWERS | {"people": 5}).json()
    assert changed["plan"]["answers"]["people"] == 5
    assert changed["plan"]["running"]["middle"] > out["plan"]["running"]["middle"]
    assert client.put(f"/guide/plans/{out['id']}", json=ANSWERS | {"people": 0}).status_code == 422
    assert client.get(f"/guide/plans/{out['id']}").json()["plan"]["answers"]["people"] == 5     # a refused change changes nothing


def test_newer_data_is_reported_and_recalculate_clears_it(client):
    out = make_plan(client)

    def age(db):
        row = db.get(models.StartupPlan, out["id"])
        row.data_version = "2026-01-01.1"
        db.commit()
    with_db(age)
    assert client.get(f"/guide/plans/{out['id']}").json()["data_changed"] is True
    again = client.post(f"/guide/plans/{out['id']}/recalculate").json()
    assert again["data_changed"] is False
    assert client.get(f"/guide/plans/{out['id']}").json()["data_changed"] is False


def test_delete_hides_the_plan_and_undo_brings_it_back(client):
    out = make_plan(client)
    deleted = client.delete(f"/guide/plans/{out['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["kind"] == "plan" and "café" in deleted.json()["name"]
    assert client.get("/guide/plans").json() == []
    restored = client.post(f"/guide/plans/{out['id']}/restore")
    assert restored.status_code == 200 and restored.json()["plan"] == out["plan"]
    assert [p["id"] for p in client.get("/guide/plans").json()] == [out["id"]]
    assert client.post("/guide/plans/999/restore").status_code == 404


# ---------- "Try it in the simulator" ----------

def create_practice_business(client, plan_id):
    sim = client.get(f"/guide/plans/{plan_id}/simulator").json()
    assert sim["ready"] is True, sim
    quick = sim["quick"]
    resp = client.post("/businesses", json={"name": "My future café (plan)", "industry": "cafe", "currency": "USD",
                                            "baseline": quick["baseline"], "setup_source": "guide", "assumed_fields": quick["assumed"]})
    assert resp.status_code == 201, resp.text
    return resp.json(), sim


def test_the_simulator_step_returns_the_quick_start_shape_with_the_guides_numbers(client):
    out = make_plan(client)
    sim = client.get(f"/guide/plans/{out['id']}/simulator").json()
    q = sim["quick"]
    assert q["baseline"]["staff_fte"] == 3 and q["baseline"]["avg_ticket"] == 7
    assert q["baseline"]["wage_per_fte"] == pytest.approx(15.24 * 173.333333, abs=0.01)
    assert q["baseline"]["cogs_ratio"] == pytest.approx(0.324)
    assert q["baseline"]["cash"] == pytest.approx(200_000 - 156_750, rel=0.01)
    rules = {a["field"]: a["rule"] for a in q["assumed"]}
    assert "Bureau of Labor Statistics" in rules["wage_per_fte"] and "National Restaurant Association" in rules["cogs_ratio"]
    assert q["preview"]["sales"] > 0


def test_missing_numbers_are_named_and_never_invented(client):
    out = make_plan(client, avg_spend=None)
    sim = client.get(f"/guide/plans/{out['id']}/simulator").json()
    assert sim["ready"] is False and sim["missing"] == ["avg_spend"] and sim["quick"] is None
    uk = make_plan(client, country="UK", rent=None, ingredient_share=None, avg_spend=5)
    assert client.get(f"/guide/plans/{uk['id']}/simulator").json()["ready"] is False


def test_the_practice_business_is_made_with_the_usual_flow_and_linked_back(client):
    out = make_plan(client)
    business, _ = create_practice_business(client, out["id"])
    assert business["setup_source"] == "guide" and business["is_sample"] is False
    linked = client.post(f"/guide/plans/{out['id']}/link_business", json={"business_id": business["id"]})
    assert linked.status_code == 200 and linked.json()["business_id"] == business["id"]
    assert [p["business_id"] for p in client.get("/guide/plans").json()] == [business["id"]]
    # the rest of the app treats it like any business: Today, and "How we worked it out"
    assert client.get(f"/businesses/{business['id']}/today").status_code == 200
    how = client.get(f"/businesses/{business['id']}/how").json()
    assert how["setup_source"] == "guide"
    told = {i["key"] for i in how["told"]}
    assert {"customers_per_day", "avg_spend", "monthly_rent", "staff"} <= told
    assumed_text = " ".join(a["rule"] for a in how["assumed"])
    assert "Bureau of Labor Statistics" in assumed_text


def test_link_business_only_accepts_a_business_made_from_a_plan(client):
    out = make_plan(client)
    other = client.post("/businesses", json={"name": "Ordinary", "industry": "cafe"}).json()
    assert client.post(f"/guide/plans/{out['id']}/link_business", json={"business_id": other["id"]}).status_code == 422
    assert client.post(f"/guide/plans/{out['id']}/link_business", json={"business_id": 999}).status_code == 404


def test_a_deleted_practice_business_drops_out_of_the_plan_list(client):
    out = make_plan(client)
    business, _ = create_practice_business(client, out["id"])
    client.post(f"/guide/plans/{out['id']}/link_business", json={"business_id": business["id"]})
    client.delete(f"/businesses/{business['id']}")
    assert client.get("/guide/plans").json()[0]["business_id"] is None


# ---------- golden rule: no AI, nothing sent out, nothing simulated ----------

def test_the_guide_calls_no_ai_writes_no_ai_log_runs_no_simulation_and_sends_nothing(client, monkeypatch):
    def no_network(*args, **kwargs):
        raise AssertionError("the guide must not open a network connection")
    monkeypatch.setattr(socket.socket, "connect", no_network)
    out = make_plan(client)
    client.get(f"/guide/plans/{out['id']}")
    client.get(f"/guide/plans/{out['id']}/simulator")
    client.put(f"/guide/plans/{out['id']}", json=ANSWERS | {"timeline": "3m"})
    client.delete(f"/guide/plans/{out['id']}")
    assert with_db(lambda db: db.query(models.AiInteraction).count()) == 0
    assert with_db(lambda db: db.query(models.SimulationRun).count()) == 0
    assert with_db(lambda db: db.query(models.Business).count()) == 0                    # nothing is created until the person says so


# ---------- purge ----------

def test_purge_removes_old_deleted_plans_keeps_recent_ones_and_unlinks_purged_businesses(client):
    old, recent, kept = make_plan(client), make_plan(client), make_plan(client)
    business, _ = create_practice_business(client, kept["id"])
    client.post(f"/guide/plans/{kept['id']}/link_business", json={"business_id": business["id"]})
    client.delete(f"/guide/plans/{old['id']}")
    client.delete(f"/guide/plans/{recent['id']}")
    client.delete(f"/businesses/{business['id']}")

    def age(db):
        db.get(models.StartupPlan, old["id"]).deleted_at = dt.datetime.utcnow() - dt.timedelta(days=60)
        db.get(models.Business, business["id"]).deleted_at = dt.datetime.utcnow() - dt.timedelta(days=60)
        db.commit()
    with_db(age)

    counts = with_db(lambda db: purge.purge(db, dt.timedelta(days=30), dry_run=True))
    assert counts["startup_plans"] == 1
    with_db(lambda db: purge.purge(db, dt.timedelta(days=30), dry_run=False))

    def left(db):
        return {r.id: r.business_id for r in db.query(models.StartupPlan).all()}
    remaining = with_db(left)
    assert old["id"] not in remaining                       # purged for good
    assert recent["id"] in remaining                        # deleted recently: still there, can be undone
    assert remaining[kept["id"]] is None                    # its practice business is gone, the plan lives on
