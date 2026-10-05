"""Quick start: turn four easy answers into the model's inputs.

An owner who has never filled in a model can tell us four things: customers on a normal day,
the average spend per customer, the monthly rent, and how many people work there. Everything
else comes from the industry's typical values, and every value we filled in is returned with a
plain-words rule, so the app can show a "what we assumed" note and the owner can change it later.

Plain arithmetic only: no randomness, no AI.

Rules (`t0` is the industry's default baseline):
    visits a month           = customers a day x opening days (t0.open_days)
    regulars' share of visits = the share in t0 (regulars x visits each / that + walk-in visits)
    regulars                 = visits x share / t0.visits_per_regular
    walk-in visits           = visits x (1 - share)
    fixed costs              = rent + one third of rent (utilities, insurance, other bills; a rough rule)
    marketing                = t0's marketing as a share of t0's sales, applied to the owner's sales
    cash                     = two months of the owner's monthly costs
    staff                    = counted as full-time people
    everything else          = t0
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace

from .explain import month_one_summary, round_display
from .params import BusinessBaseline, IndustryTemplate

OTHER_FIXED_SHARE_OF_RENT = 1 / 3      # rough rule, not sourced: utilities and other fixed bills
CASH_MONTHS_OF_COSTS = 2.0             # rough rule, not sourced: cash in the bank at the start

MAX_CUSTOMERS_PER_DAY = 20_000
MAX_STAFF = 500


@dataclass(frozen=True)
class QuickStart:
    baseline: BusinessBaseline
    # One entry per number we filled in for the owner: {"field": <BusinessBaseline field>, "rule": plain words}.
    assumed: list[dict]
    # Plain-words things worth a second look (never blocks): too few staff for that many customers.
    warnings: list[str]


def _check(name: str, value: float, *, minimum: float, maximum: float, strict: bool = False) -> None:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(f"{name} must be a number")
    if (value <= minimum) if strict else (value < minimum):
        raise ValueError(f"{name} is too small")
    if value > maximum:
        raise ValueError(f"{name} is too large")


def quick_baseline(tpl: IndustryTemplate, customers_per_day: float, avg_spend: float,
                   monthly_rent: float, staff: float) -> QuickStart:
    """Build a full baseline from the four answers. Raises ValueError with a short reason."""
    _check("customers per day", customers_per_day, minimum=0, maximum=MAX_CUSTOMERS_PER_DAY, strict=True)
    _check("average spend", avg_spend, minimum=0, maximum=100_000, strict=True)
    _check("monthly rent", monthly_rent, minimum=0, maximum=100_000_000)
    _check("staff", staff, minimum=0, maximum=MAX_STAFF, strict=True)

    t0 = tpl.default_baseline
    visits = customers_per_day * t0.open_days
    regular_visits_t0 = t0.customers * t0.visits_per_regular
    share = regular_visits_t0 / (regular_visits_t0 + t0.walk_in_visits)
    t0_sales = (regular_visits_t0 + t0.walk_in_visits) * t0.avg_ticket
    marketing_share = t0.marketing / t0_sales
    sales = visits * avg_spend

    draft = replace(
        t0,
        customers=round(visits * share / t0.visits_per_regular, 2),
        walk_in_visits=round(visits * (1 - share), 2),
        avg_ticket=avg_spend,
        staff_fte=staff,
        fixed_costs=round(monthly_rent * (1 + OTHER_FIXED_SHARE_OF_RENT), 2),
        marketing=round_display(marketing_share * sales),
        cash=0.0,
    )
    costs = month_one_summary(draft, tpl)["costs"]
    baseline = replace(draft, cash=round_display(CASH_MONTHS_OF_COSTS * costs))
    baseline.validate()

    noun = tpl.display_name.lower()
    assumed = [
        {"field": "customers", "rule": f"split of your customers into regulars and walk-ins, typical for a small {noun}"},
        {"field": "walk_in_visits", "rule": f"split of your customers into regulars and walk-ins, typical for a small {noun}"},
        {"field": "visits_per_regular", "rule": f"how often a regular comes back each month, typical for a small {noun}"},
        {"field": "fixed_costs", "rule": "your rent plus a rough rule: one third of the rent again for utilities, insurance and other bills"},
        {"field": "marketing", "rule": f"the share of sales a small {noun} typically spends on marketing"},
        {"field": "cash", "rule": "two months of your monthly costs"},
        {"field": "staff_fte", "rule": "counted as full-time people, so two part-timers count as one"},
        {"field": "wage_per_fte", "rule": f"typical monthly pay per full-time person at a small {noun} (US dollars)"},
        {"field": "cogs_ratio", "rule": f"typical share of sales spent on ingredients at a small {noun}"},
        {"field": "churn_rate", "rule": f"typical share of regulars who stop coming each month at a small {noun}"},
        {"field": "seats", "rule": f"typical number of seats for a small {noun}"},
        {"field": "open_days", "rule": f"typical number of days open each month for a small {noun}"},
    ]
    warnings = []
    per_day = tpl.visits_per_fte * staff / t0.open_days       # what this many people can look after in a day
    if visits > tpl.visits_per_fte * staff:
        warnings.append(
            f"At a typical small {noun}, {_people(staff)} can look after about {int(per_day)} customers a day, "
            f"and you said {_plain(customers_per_day)}. Check the numbers, or add staff. "
            "Otherwise service suffers and regulars slowly drift away.")
    return QuickStart(baseline=baseline, assumed=assumed, warnings=warnings)


def answers_from_baseline(base: BusinessBaseline) -> dict[str, float]:
    """The four answers behind a quick-start business: the rules of `quick_baseline` run backwards, so the
    "what you told us" list can show customers a day, spend, rent and staff the way the owner typed them.
    Only meaningful while those numbers are still the quick-start ones (the app checks that)."""
    visits = base.customers * base.visits_per_regular + base.walk_in_visits
    return {
        "customers_per_day": round(visits / base.open_days, 1),
        "avg_spend": base.avg_ticket,
        "monthly_rent": round(base.fixed_costs / (1 + OTHER_FIXED_SHARE_OF_RENT), 2),
        "staff": base.staff_fte,
    }


def _plain(x: float) -> str:
    return f"{x:,.0f}" if x >= 10 else f"{x:g}"


def _people(n: float) -> str:
    return "1 person" if n == 1 else f"{_plain(n)} people"


def sample_assumed(tpl: IndustryTemplate) -> list[dict]:
    """For a sample business every number is the industry's typical value."""
    noun = tpl.display_name.lower()
    return [{"field": f, "rule": f"typical for a small {noun}"} for f in tpl.default_baseline.to_dict()]
