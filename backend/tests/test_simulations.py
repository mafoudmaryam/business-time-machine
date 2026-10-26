def _make_scenario(client, business_id, name, confirmed=True, start_month=3, value=10):
    resp = client.post(f"/businesses/{business_id}/scenarios", json={
        "name": name,
        "decisions": [
            {"type": "price", "start_month": start_month, "value": value, "unit": "percent",
             "confirmed": confirmed},
        ],
    })
    assert resp.status_code == 201
    return resp.json()


def test_simulate_single_scenario(client, business):
    scenario = _make_scenario(client, business["id"], "Price +10%")
    resp = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 12, "iterations": 200, "seed": 42})
    assert resp.status_code == 201
    body = resp.json()
    assert body["seed"] == 42
    assert body["horizon"] == 12
    names = {r["scenario_name"] for r in body["results"]}
    assert names == {"baseline", "Price +10%"}
    baseline_result = next(r for r in body["results"] if r["scenario_name"] == "baseline")
    assert baseline_result["scenario_id"] is None
    scenario_result = next(r for r in body["results"] if r["scenario_name"] == "Price +10%")
    assert scenario_result["scenario_id"] == scenario["id"]
    assert "revenue" in scenario_result["bands"]
    assert "total_profit_p50" in scenario_result["summary"]


def test_simulate_refuses_unconfirmed_decisions(client, business):
    scenario = _make_scenario(client, business["id"], "Unconfirmed idea", confirmed=False)
    resp = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 12, "iterations": 200})
    assert resp.status_code == 409


def test_simulate_assigns_random_seed_when_omitted(client, business):
    scenario = _make_scenario(client, business["id"], "No seed given")
    resp = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 12, "iterations": 200})
    assert resp.status_code == 201
    assert isinstance(resp.json()["seed"], int)


def test_compare_multiple_scenarios_shares_seed(client, business):
    s1 = _make_scenario(client, business["id"], "Price +10%", value=10)
    s2 = _make_scenario(client, business["id"], "Price +20%", value=20)

    resp = client.post(f"/businesses/{business['id']}/simulate", json={
        "scenario_ids": [s1["id"], s2["id"]], "horizon": 12, "iterations": 200, "seed": 7,
    })
    assert resp.status_code == 201
    body = resp.json()
    names = {r["scenario_name"] for r in body["results"]}
    assert names == {"baseline", "Price +10%", "Price +20%"}

    run_id = body["id"]
    fetched = client.get(f"/simulation_runs/{run_id}")
    assert fetched.status_code == 200
    assert fetched.json()["seed"] == 7
    assert len(fetched.json()["results"]) == 3


def test_compare_more_than_three_scenarios_rejected(client, business):
    ids = [_make_scenario(client, business["id"], f"S{i}")["id"] for i in range(4)]
    resp = client.post(f"/businesses/{business['id']}/simulate", json={
        "scenario_ids": ids, "horizon": 12, "iterations": 200,
    })
    assert resp.status_code == 422


def test_horizon_out_of_range_rejected(client, business):
    scenario = _make_scenario(client, business["id"], "Price +10%")
    too_short = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 6, "iterations": 200})
    too_long = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 48, "iterations": 200})
    assert too_short.status_code == 422
    assert too_long.status_code == 422


def test_simulate_missing_scenario_404(client, business):
    resp = client.post("/scenarios/999/simulate", json={"horizon": 12, "iterations": 200})
    assert resp.status_code == 404


def test_get_missing_simulation_run_404(client):
    resp = client.get("/simulation_runs/999")
    assert resp.status_code == 404


def test_list_simulation_runs_of_business(client, business):
    scenario = _make_scenario(client, business["id"], "Price +10%")
    client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 12, "iterations": 200, "seed": 1})
    client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 12, "iterations": 200, "seed": 2})

    resp = client.get(f"/businesses/{business['id']}/simulation_runs")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    # newest first
    assert body[0]["seed"] == 2
    assert set(body[0]["scenario_names"]) == {"baseline", "Price +10%"}


def test_list_simulation_runs_for_missing_business_404(client):
    resp = client.get("/businesses/999/simulation_runs")
    assert resp.status_code == 404


def test_explanation_context_is_frozen_with_saved_run(client, business):
    scenario = _make_scenario(client, business["id"], "Original", value=5)
    run = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 24, "iterations": 100, "seed": 42}).json()
    saved = next(r for r in run["results"] if r["scenario_name"] == "Original")["summary"]["explanation_context"]
    assert saved["decisions"][0]["value"] == 5
    assert saved["decisions"][0]["start_month"] == 3
    assert len(saved["month_labels"]) == 24
    assert saved["currency"] == "USD"
    assert abs(sum(saved["central"]["drivers"].values()) - saved["central"]["total"]) < 0.001
    client.patch(f"/businesses/{business['id']}/baseline", json={"cash": 1})
    client.delete(f"/scenarios/{scenario['id']}")
    fetched = client.get(f"/simulation_runs/{run['id']}").json()
    assert next(r for r in fetched["results"] if r["scenario_name"] == "Original")["summary"]["explanation_context"] == saved


def test_each_scenario_keeps_its_own_explanation_and_seeded_numbers(client, business):
    a = _make_scenario(client, business["id"], "Up", value=5)
    b = _make_scenario(client, business["id"], "Down", value=-5)
    run = client.post(f"/businesses/{business['id']}/simulate", json={"scenario_ids": [a["id"], b["id"]], "horizon": 12, "iterations": 100, "seed": 42}).json()
    for name, value in [("Up", 5), ("Down", -5)]:
        result = next(r for r in run["results"] if r["scenario_name"] == name)
        assert result["summary"]["explanation_context"]["decisions"][0]["value"] == value


def test_investment_cash_outflow_is_not_described_as_operating_profit(client, business):
    scenario = client.post(f"/businesses/{business['id']}/scenarios", json={"name": "Cash only", "decisions": [
        {"type": "investment", "value": 1000, "unit": "absolute", "start_month": 1, "confirmed": True},
    ]}).json()
    response = client.post(f"/scenarios/{scenario['id']}/simulate", json={"horizon": 12, "iterations": 100, "seed": 42})
    assert response.status_code == 201
    result = next(r for r in response.json()["results"] if r["scenario_name"] == "Cash only")
    context = result["summary"]["explanation_context"]
    assert context["central"]["total"] == 0
    assert context["cash_effect"] == -1000
    assert "investment" not in context["central"]["drivers"]
