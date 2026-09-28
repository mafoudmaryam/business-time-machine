"""Bakery industry template.

avg_ticket, visits_per_regular, customers, walk_in_visits, cogs_ratio,
staff_fte, wage_per_fte, marketing, churn_rate and visits_per_fte were given as
"typical small bakery" figures. fixed_costs was raised from the given 9,000 (see
below); seats and open_days are plain assumptions. Everything else is reused
from café, marked below -- none of it is sourced from literature or real
bakery data yet.
"""
from __future__ import annotations

from ..decisions import DECISION_TYPES
from ..params import BusinessBaseline, IndustryTemplate

TEMPLATE = IndustryTemplate(
    id="bakery",
    display_name="Bakery",
    customer_noun="customers",
    staff_noun="baker",
    capacity_label="units of baking output per staff member per month",
    allowed_decision_types=DECISION_TYPES,
    default_baseline=BusinessBaseline(
        customers=600.0,
        cash=25_000.0,                # assumption: reused from café, not given
        staff_fte=4.0,
        avg_ticket=5.5,
        visits_per_regular=8.0,
        walk_in_visits=3_000.0,
        cogs_ratio=0.30,
        wage_per_fte=2_800.0,
        # Given as 9,000; raised to 12,000 so the baseline clears a plausible
        # 5-15% margin comfortably (9,000 gave ~20%, over the top of the band).
        fixed_costs=12_000.0,
        marketing=300.0,
        churn_rate=0.05,
        seats=8,                       # assumption: small counter, not given
        open_days=28.0,                # assumption: reused from café, not given
    ),
    # TODO: not yet industry-differentiated -- reuses café's literature-based
    # ranges as a placeholder pending real bakery calibration.
    elasticity=(-1.76, -0.81, -0.23),
    short_run_share=(0.3, 0.5, 0.7),
    churn_range=(0.05, 0.12),
    marketing_curvature=(0.3, 0.7),
    word_of_mouth=(0.005, 0.02),
    demand_noise_sd=0.05,
    # TODO: to calibrate -- not sourced. Share of baked goods thrown away unsold.
    waste_rate=(0.04, 0.08, 0.12),
    awareness0=0.30,
    awareness_decay=0.10,
    marketing_ref=100.0,
    service_penalty=1.0,
    visits_per_fte=2_400.0,             # given: baking output per staff member per month
    utilities_share=0.20,               # assumption: reused from café, not given
)
