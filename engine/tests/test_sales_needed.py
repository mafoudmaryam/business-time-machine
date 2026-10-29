from decimal import Decimal
import pytest
from btm_engine.sales_needed import sales_needed


def test_entered_costs_and_daily_target():
    result = sales_needed("20", "8", "1200", "20")
    assert result == {
        "status": "target", "selling_price": "20", "cost_per_sale": "8", "monthly_costs": "1200",
        "contribution_per_sale": "12", "opening_days": 20, "monthly_sales": "100", "daily_average": "5",
        "monthly_revenue": "2000", "cost_share_percent": 40.0,
    }


def test_rounds_monthly_up_then_spreads_that_target_over_open_days():
    result = sales_needed("10", "3", "100", "22")
    assert result["monthly_sales"] == "15"
    assert result["daily_average"] == "0.69"
    assert sales_needed("10", "3", "100")["monthly_sales"] == "15"


@pytest.mark.parametrize("price,cost,fixed,target", [
    ("0.30", "0.10", "0.60", "3"), ("0.3", "0.2", "1", "10"),
    ("0.000002", "0.000001", "1", "1000000"),
    ("0.000001", "0", "999999999999.999999", "999999999999999999"),
    ("1,200.50", "200.25", "3,000", "3"), (".5", "0", "1.", "2"),
])
def test_decimal_and_large_targets_are_exact_strings(price, cost, fixed, target):
    assert sales_needed(price, cost, fixed)["monthly_sales"] == target


def test_zero_fixed_costs_and_zero_variable_cost_are_explicit_valid_inputs():
    result = sales_needed("5", "0", "0", "31")
    assert result["monthly_sales"] == "0" and result["daily_average"] == "0"
    assert result["contribution_per_sale"] == "5"


@pytest.mark.parametrize("price,cost,fixed", [("0", "0", "0"), ("10", "10", "50"), ("9", "10", "50"), ("0", "1", "0")])
def test_no_positive_contribution_never_returns_an_impossible_target(price, cost, fixed):
    result = sales_needed(price, cost, fixed, "20")
    assert result["status"] == "no_margin"
    assert result["monthly_sales"] is None and result["daily_average"] is None
    assert result["monthly_revenue"] is None and result["cost_share_percent"] is None


@pytest.mark.parametrize("field", ["selling_price", "cost_per_sale", "monthly_costs"])
@pytest.mark.parametrize("bad", ["", "-1", "NaN", "Infinity", "1e3", "1,2", "1.0000001", "1000000000000", "$20", None])
def test_missing_negative_invalid_and_excess_precision_never_become_zero(field, bad):
    inputs = dict(selling_price="10", cost_per_sale="2", monthly_costs="100")
    inputs[field] = bad
    with pytest.raises(ValueError):
        sales_needed(**inputs)


@pytest.mark.parametrize("days", ["0", "-1", "32", "1.5", "Infinity", "NaN", "1e1", None])
def test_invalid_opening_days(days):
    with pytest.raises(ValueError):
        sales_needed("10", "2", "100", days)


def test_blank_days_do_not_create_a_daily_target():
    result = sales_needed("10", "2", "100", "  ")
    assert result["opening_days"] is None and result["daily_average"] is None


def test_target_covers_entered_costs_and_one_fewer_sale_does_not():
    for price, cost in [("0.3", "0.1"), ("7.50", "3.25"), ("50", "0"), ("1", "0.999999")]:
        for fixed in ["0", "0.01", "10", "3000.99"]:
            result = sales_needed(price, cost, fixed)
            count = int(result["monthly_sales"])
            contribution = Decimal(price) - Decimal(cost)
            assert count * contribution >= Decimal(fixed)
            if count:
                assert (count - 1) * contribution < Decimal(fixed)
