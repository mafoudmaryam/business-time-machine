"""Accounting controls for the diagnostic; not empirical model validation."""
import pytest

from scripts.audit_marketing import audit_rows


def test_no_response_costs_exactly_the_extra_spending_and_unchanged_budget_is_zero():
    rows = list(audit_rows(budgets=(400, 1200), horizons=(12,), seeds=(42,), iterations=30))
    assert len(rows) == 6
    for row in rows:
        if row['scenario_marketing_monthly'] == 400:
            assert row['profit_change_p10'] == row['profit_change_p50'] == row['profit_change_p90'] == 0
            assert row['share_beating_baseline'] == 0  # strict improvement, not a tie
        elif row['case'] == 'no_extra_response':
            assert row['extra_marketing_total'] == 9600
            assert row['profit_change_p10'] == row['profit_change_p50'] == row['profit_change_p90'] == -9600
            assert row['share_beating_baseline'] == 0


def test_audit_is_repeatable_without_changing_registered_template():
    from btm_engine import get_template
    template = get_template('cafe')
    original = (template.marketing_curvature, template.default_baseline)
    args = dict(budgets=(1200,), horizons=(12,), seeds=(7,), iterations=30)
    assert list(audit_rows(**args)) == list(audit_rows(**args))
    assert (template.marketing_curvature, template.default_baseline) == original
    with pytest.raises(ValueError, match='iterations'):
        list(audit_rows(iterations=0))
