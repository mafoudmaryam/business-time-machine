import pytest
from app.database import get_db


def test_tool_is_usable_without_a_business_or_database_dependency(client):
    def no_database():
        raise AssertionError("The tool must not access the database")
    client.app.dependency_overrides[get_db] = no_database
    response = client.post("/tools/sales_needed", json={"selling_price": "20", "cost_per_sale": "8", "monthly_costs": "1200", "opening_days": "20"})
    assert response.status_code == 200
    assert response.json()["monthly_sales"] == "100"
    assert response.json()["daily_average"] == "5"


def test_no_margin_is_explained_without_infinity_or_a_fake_target(client):
    response = client.post("/tools/sales_needed", json={"selling_price": "5", "cost_per_sale": "6", "monthly_costs": "100"})
    assert response.status_code == 200
    assert response.json()["status"] == "no_margin"
    assert response.json()["monthly_sales"] is None
    assert response.json()["contribution_per_sale"] == "-1"


@pytest.mark.parametrize("patch", [
    {"selling_price": ""}, {"cost_per_sale": "-1"}, {"monthly_costs": "NaN"},
    {"opening_days": "0"}, {"selling_price": "1e309"}, {"cost_per_sale": None},
])
def test_invalid_requests_are_rejected(client, patch):
    body = {"selling_price": "10", "cost_per_sale": "2", "monthly_costs": "100", **patch}
    assert client.post("/tools/sales_needed", json=body).status_code == 422


def test_large_counts_are_json_strings_and_nothing_is_saved(client):
    before = client.get("/businesses").json()
    response = client.post("/tools/sales_needed", json={"selling_price": "0.000001", "cost_per_sale": "0", "monthly_costs": "999999999999.999999"})
    assert response.status_code == 200
    assert response.json()["monthly_sales"] == "999999999999999999"
    assert client.get("/businesses").json() == before
