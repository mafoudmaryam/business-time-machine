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
