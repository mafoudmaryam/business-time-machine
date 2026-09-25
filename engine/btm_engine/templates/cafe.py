"""Café industry template -- the original, validated defaults. Every number
here is unchanged from the pre-multi-industry CafeTemplate/CafeBaseline."""
from __future__ import annotations

from ..decisions import DECISION_TYPES
from ..params import BusinessBaseline, IndustryTemplate

TEMPLATE = IndustryTemplate(
    id="cafe",
    display_name="Café",
    customer_noun="regulars",
    capacity_label="visits per staff member per month",
    allowed_decision_types=DECISION_TYPES,
    default_baseline=BusinessBaseline(
        customers=900.0,
        cash=25_000.0,
        staff_fte=5.0,
        avg_ticket=6.50,
        visits_per_regular=6.0,
        walk_in_visits=2_500.0,
        cogs_ratio=0.30,
        wage_per_fte=3_000.0,
        fixed_costs=15_000.0,
        marketing=400.0,
        churn_rate=0.05,
        seats=35,
        open_days=28.0,
    ),
    # Sourced -- see model spec / README. Unchanged from before multi-industry support.
    elasticity=(-1.76, -0.81, -0.23),          # Andreyeva et al. 2010
    short_run_share=(0.3, 0.5, 0.7),
    churn_range=(0.05, 0.12),
    marketing_curvature=(0.3, 0.7),
    word_of_mouth=(0.005, 0.02),
    demand_noise_sd=0.05,
    waste_rate=(0.0, 0.0, 0.0),                # not modelled for café
    awareness0=0.30,
    awareness_decay=0.10,
    marketing_ref=100.0,
    service_penalty=1.0,
    visits_per_fte=1_800.0,
    utilities_share=0.20,
)
