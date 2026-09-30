def test_create_scenario_with_decisions(client, business):
    resp = client.post(f"/businesses/{business['id']}/scenarios", json={
        "name": "Price +10% in March",
        "decisions": [
            {"type": "price", "start_month": 3, "value": 10, "unit": "percent", "confirmed": True},
        ],
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Price +10% in March"
    assert len(body["decisions"]) == 1
    assert body["decisions"][0]["confirmed"] is True


def test_scenario_with_investment_loan_extra_fields(client, business):
    resp = client.post(f"/businesses/{business['id']}/scenarios", json={
        "name": "New espresso machine",
        "decisions": [
            {"type": "investment", "start_month": 1, "value": 12_000, "unit": "amount",
             "loan_months": 24, "annual_rate": 0.08, "capacity_pct": 15, "confirmed": True},
        ],
    })
    assert resp.status_code == 201
    extra = resp.json()["decisions"][0]["extra"]
    assert extra["loan_months"] == 24
    assert extra["capacity_pct"] == 15


def test_scenario_rejects_unknown_decision_type(client, business):
    resp = client.post(f"/businesses/{business['id']}/scenarios", json={
        "name": "Bogus",
        "decisions": [{"type": "not_a_type", "start_month": 1, "value": 1, "unit": "percent"}],
    })
    assert resp.status_code == 422


def test_scenario_name_baseline_is_reserved(client, business):
    resp = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Baseline", "decisions": []})
    assert resp.status_code == 422


def test_duplicate_scenario_name_conflict(client, business):
    payload = {"name": "Hire barista", "decisions": []}
    first = client.post(f"/businesses/{business['id']}/scenarios", json=payload)
    assert first.status_code == 201
    second = client.post(f"/businesses/{business['id']}/scenarios", json=payload)
    assert second.status_code == 409


def test_get_scenario(client, business):
    created = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "S1", "decisions": []}).json()
    resp = client.get(f"/scenarios/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "S1"


def test_scenario_for_missing_business_404(client):
    resp = client.post("/businesses/999/scenarios", json={"name": "S1", "decisions": []})
    assert resp.status_code == 404


def test_list_scenarios_of_business(client, business):
    client.post(f"/businesses/{business['id']}/scenarios", json={"name": "S1", "decisions": []})
    client.post(f"/businesses/{business['id']}/scenarios", json={"name": "S2", "decisions": []})
    resp = client.get(f"/businesses/{business['id']}/scenarios")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert names == ["S1", "S2"]


def test_list_scenarios_for_missing_business_404(client):
    resp = client.get("/businesses/999/scenarios")
    assert resp.status_code == 404


def test_scenario_versioning_reports_parent_name(client, business):
    parent = client.post(f"/businesses/{business['id']}/scenarios", json={
        "name": "Price +10%",
        "decisions": [{"type": "price", "start_month": 1, "value": 10, "unit": "percent", "confirmed": True}],
    }).json()

    child = client.post(f"/businesses/{business['id']}/scenarios", json={
        "name": "Price +10% v2",
        "parent_scenario_id": parent["id"],
        "decisions": [{"type": "price", "start_month": 1, "value": 15, "unit": "percent", "confirmed": True}],
    })
    assert child.status_code == 201
    assert child.json()["parent_scenario_name"] == "Price +10%"

    listed = client.get(f"/businesses/{business['id']}/scenarios").json()
    versioned = next(s for s in listed if s["name"] == "Price +10% v2")
    assert versioned["parent_scenario_name"] == "Price +10%"
    original = next(s for s in listed if s["name"] == "Price +10%")
    assert original["parent_scenario_name"] is None


def test_confirming_a_scenario_ticks_all_its_decisions_and_unlocks_simulation(client, business):
    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Raise prices", "decisions": [
        {"type": "price", "start_month": 2, "value": 5, "unit": "percent"},
        {"type": "hiring", "start_month": 3, "value": 1, "unit": "fte", "confirmed": True}]}).json()
    body = {"scenario_ids": [made["id"]], "horizon": 12, "iterations": 100, "seed": 1}
    assert client.post(f"/businesses/{business['id']}/simulate", json=body).status_code == 409   # not yet reviewed

    resp = client.post(f"/scenarios/{made['id']}/confirm")
    assert resp.status_code == 200 and all(d["confirmed"] for d in resp.json()["decisions"])
    assert client.get(f"/scenarios/{made['id']}").json()["decisions"][0]["confirmed"] is True   # it was saved
    assert client.post(f"/businesses/{business['id']}/simulate", json=body).status_code == 201


def test_confirming_an_unknown_scenario_is_404(client):
    assert client.post("/scenarios/999/confirm").status_code == 404


def _decisions(via_a="one_by_one", via_b="confirm_all"):
    return [
        {"type": "price", "start_month": 2, "value": 5, "unit": "percent", "confirmed": True, "confirmed_via": via_a},
        {"type": "hiring", "start_month": 3, "value": 1, "unit": "fte", "confirmed": True, "confirmed_via": via_b},
        {"type": "marketing", "start_month": 4, "value": 10, "unit": "percent", "confirmed": False, "confirmed_via": "edited"},
    ]


def test_how_each_decision_was_confirmed_is_stored(client, business):
    from app import models
    from app.database import get_db
    from app.main import app

    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Plan", "decisions": _decisions()}).json()
    db = next(app.dependency_overrides[get_db]())
    try:
        rows = db.query(models.Decision).filter_by(scenario_id=made["id"]).order_by(models.Decision.id).all()
        assert [(r.confirmed, r.confirmed_via) for r in rows] == [(True, "one_by_one"), (True, "confirm_all"), (False, None)]
    finally:
        db.close()


def test_looks_right_on_the_compare_page_records_its_own_method_only_for_what_it_confirmed(client, business):
    from app import models
    from app.database import get_db
    from app.main import app

    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Plan", "decisions": _decisions()}).json()
    client.post(f"/scenarios/{made['id']}/confirm")
    db = next(app.dependency_overrides[get_db]())
    try:
        rows = db.query(models.Decision).filter_by(scenario_id=made["id"]).order_by(models.Decision.id).all()
        assert [r.confirmed_via for r in rows] == ["one_by_one", "confirm_all", "looks_right"]
    finally:
        db.close()


def test_a_bad_confirmed_via_value_is_rejected(client, business):
    bad = [{"type": "price", "start_month": 2, "value": 5, "unit": "percent", "confirmed": True, "confirmed_via": "Robert'); DROP"}]
    assert client.post(f"/businesses/{business['id']}/scenarios", json={"name": "P", "decisions": bad}).status_code == 422


def test_simulation_still_refuses_any_unconfirmed_decision(client, business):
    made = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Plan", "decisions": _decisions()}).json()
    body = {"scenario_ids": [made["id"]], "horizon": 12, "iterations": 100, "seed": 1}
    assert client.post(f"/businesses/{business['id']}/simulate", json=body).status_code == 409
