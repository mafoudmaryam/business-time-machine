import pytest

def test_list_industries(client):
    resp = client.get("/industries")
    assert resp.status_code == 200
    body = resp.json()
    ids = {i["id"] for i in body}
    assert ids == {"cafe", "restaurant", "bakery"}

    cafe = next(i for i in body if i["id"] == "cafe")
    assert cafe["display_name"] == "Café"
    assert cafe["customer_noun"] == "regulars"
    assert cafe["staff_noun"] == "barista"
    assert cafe["default_baseline"]["customers"] == 900.0
    assert cafe["field_labels"]["customers"] == "Regulars"

    restaurant = next(i for i in body if i["id"] == "restaurant")
    assert restaurant["customer_noun"] == "guests"
    assert restaurant["staff_noun"] == "server"
    assert restaurant["default_baseline"]["walk_in_visits"] == 1_400.0
    assert restaurant["field_labels"]["walk_in_visits"] == "Walk-in guests"

    bakery = next(i for i in body if i["id"] == "bakery")
    assert bakery["customer_noun"] == "customers"
    assert bakery["staff_noun"] == "baker"
    assert bakery["default_baseline"]["fixed_costs"] == 12_000.0


def test_preview_starting_month_matches_the_engine_hand_calculation(client):
    resp = client.post("/industries/cafe/preview", json={})       # empty body = the cafe defaults
    assert resp.status_code == 200
    body = resp.json()
    assert body["sales"] == 51_350 and round(body["profit"]) == 5_545
    assert round(body["sales"] - body["costs"]) == round(body["profit"])


def test_preview_shows_a_loss_and_does_not_save_anything(client):
    numbers = {"customers": 500, "visits_per_regular": 10, "staff_fte": 5, "wage_per_fte": 5000, "marketing": 1000}
    body = client.post("/industries/cafe/preview", json=numbers).json()
    assert round(body["profit"]) == -6_875 and body["staff_costs"] == 25_000
    assert client.get("/businesses").json() == []


def test_preview_percent_style_inputs_are_ratios(client):
    """cogs_ratio 0.35 means 35% (regression guard for the percent <-> ratio conversion)."""
    body = client.post("/industries/cafe/preview", json={"cogs_ratio": 0.35}).json()
    assert body["ingredient_costs"] == pytest.approx(0.35 * body["sales"])
    assert client.post("/industries/cafe/preview", json={"cogs_ratio": 35}).status_code == 422


def test_preview_rejects_unknown_industry(client):
    assert client.post("/industries/nope/preview", json={}).status_code == 404
