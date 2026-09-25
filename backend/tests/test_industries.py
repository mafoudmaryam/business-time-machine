def test_list_industries(client):
    resp = client.get("/industries")
    assert resp.status_code == 200
    body = resp.json()
    ids = {i["id"] for i in body}
    assert ids == {"cafe", "restaurant", "bakery"}

    cafe = next(i for i in body if i["id"] == "cafe")
    assert cafe["display_name"] == "Café"
    assert cafe["customer_noun"] == "regulars"
    assert cafe["default_baseline"]["customers"] == 900.0
    assert cafe["field_labels"]["customers"] == "Regulars"

    restaurant = next(i for i in body if i["id"] == "restaurant")
    assert restaurant["customer_noun"] == "guests"
    assert restaurant["default_baseline"]["walk_in_visits"] == 1_400.0
    assert restaurant["field_labels"]["walk_in_visits"] == "Walk-in guests"

    bakery = next(i for i in body if i["id"] == "bakery")
    assert bakery["customer_noun"] == "customers"
    assert bakery["default_baseline"]["fixed_costs"] == 12_000.0
