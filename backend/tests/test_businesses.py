def test_create_business_uses_default_baseline(client):
    resp = client.post("/businesses", json={"name": "Corner Cafe"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Corner Cafe"
    assert body["baseline"]["customers"] == 900.0
    assert body["baseline"]["avg_ticket"] == 6.50


def test_create_business_with_custom_baseline(client):
    resp = client.post("/businesses", json={
        "name": "Riverside Roasters",
        "baseline": {"customers": 500, "cash": 10_000, "avg_ticket": 5.0},
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["baseline"]["customers"] == 500
    assert body["baseline"]["cash"] == 10_000
    # unspecified fields keep their engine defaults
    assert body["baseline"]["staff_fte"] == 5.0


def test_get_business(client, business):
    resp = client.get(f"/businesses/{business['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == business["id"]


def test_get_missing_business_404(client):
    resp = client.get("/businesses/999")
    assert resp.status_code == 404


def test_invalid_baseline_rejected(client):
    resp = client.post("/businesses", json={
        "name": "Bad Cafe", "baseline": {"cogs_ratio": 1.5},
    })
    assert resp.status_code == 422
