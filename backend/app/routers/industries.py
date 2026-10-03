"""List the supported industries, so the frontend never hard-codes café
wording, defaults or field labels."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import engine_bridge, schemas
from ..engine_bridge import list_industries, preview_starting_month, to_baseline

router = APIRouter(tags=["industries"])


def _field_labels(customer_noun: str) -> dict[str, str]:
    # "regulars" already means repeat customers; prefixing "Regular" would read
    # as "Regular regulars", so only prefix nouns that don't already imply it.
    customers_label = customer_noun.capitalize() if customer_noun == "regulars" else f"Regular {customer_noun}"
    return {
        "customers": customers_label,
        "walk_in_visits": f"Walk-in {customer_noun}",
    }


@router.get("/industries", response_model=list[schemas.IndustryOut])
def get_industries():
    return [
        schemas.IndustryOut(
            id=tpl.id,
            display_name=tpl.display_name,
            customer_noun=tpl.customer_noun,
            staff_noun=tpl.staff_noun,
            capacity_label=tpl.capacity_label,
            default_baseline=schemas.BaselineIn(**tpl.default_baseline.to_dict()),
            field_labels=_field_labels(tpl.customer_noun),
        )
        for tpl in list_industries()
    ]


@router.post("/industries/{industry_id}/preview", response_model=schemas.StartingMonthOut)
def preview_starting_month_for(industry_id: str, baseline: schemas.BaselineIn):
    """What a typical month looks like with these numbers (sales, costs, profit), computed by the
    engine, so the setup wizard never does the math itself. Nothing is saved."""
    if industry_id not in {t.id for t in list_industries()}:
        raise HTTPException(status_code=404, detail="unknown industry")
    return preview_starting_month(industry_id, to_baseline(baseline))


@router.post("/industries/{industry_id}/quick_baseline", response_model=schemas.QuickStartOut)
def quick_baseline_for(industry_id: str, answers: schemas.QuickStartIn):
    """Four easy answers -> all the model's numbers, what was assumed, and what month 1 would look like.
    The conversion is the engine's (btm_engine.quickstart), so the frontend never does the math. Nothing is saved."""
    if industry_id not in {t.id for t in list_industries()}:
        raise HTTPException(status_code=404, detail="unknown industry")
    try:
        result = engine_bridge.quick_start(industry_id, answers.customers_per_day, answers.avg_spend,
                                           answers.monthly_rent, answers.staff)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return schemas.QuickStartOut(
        baseline=schemas.BaselineIn(**result["baseline"]),
        assumed=[schemas.AssumedFieldIn(**a) for a in result["assumed"]],
        warnings=result["warnings"], preview=schemas.StartingMonthOut(**result["preview"]),
    )
