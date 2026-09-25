"""Restaurant industry template.

Only avg_ticket, visits_per_regular, customers, walk_in_visits (adjusted, see
below), cogs_ratio, staff_fte, wage_per_fte, fixed_costs, marketing, churn_rate,
seats and visits_per_fte were given as "typical small restaurant" figures.
Everything else is a plain assumption, marked below -- none of it is sourced
from literature or real restaurant data yet.
"""
from __future__ import annotations

from ..decisions import DECISION_TYPES
from ..params import BusinessBaseline, IndustryTemplate

TEMPLATE = IndustryTemplate(
    id="restaurant",
    display_name="Restaurant",
    customer_noun="guests",
    capacity_label="covers per staff member per month",
    allowed_decision_types=DECISION_TYPES,
    default_baseline=BusinessBaseline(
        customers=700.0,
        cash=25_000.0,                # assumption: reused from café, not given
        staff_fte=8.0,
        avg_ticket=28.0,
        visits_per_regular=2.0,
        # Given as 900; raised to 1,400 so the baseline clears a plausible 5-15%
        # margin (900 produced a loss). TODO: revisit against real restaurant data.
        walk_in_visits=1_400.0,
        cogs_ratio=0.32,
        wage_per_fte=3_000.0,
        fixed_costs=22_000.0,
        marketing=600.0,
        churn_rate=0.04,
        seats=50,
        open_days=28.0,                # assumption: reused from café, not given
    ),
    # TODO: not yet industry-differentiated -- reuses café's literature-based
    # ranges as a placeholder pending real restaurant calibration.
    elasticity=(-1.76, -0.81, -0.23),
    short_run_share=(0.3, 0.5, 0.7),
    churn_range=(0.05, 0.12),
    marketing_curvature=(0.3, 0.7),
    word_of_mouth=(0.005, 0.02),
    demand_noise_sd=0.05,
    waste_rate=(0.0, 0.0, 0.0),         # not modelled for restaurant
    awareness0=0.30,
    awareness_decay=0.10,
    marketing_ref=100.0,
    service_penalty=1.0,
    visits_per_fte=450.0,               # given: "covers per staff member per month"
    utilities_share=0.20,               # assumption: reused from café, not given
)
