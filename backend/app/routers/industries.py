"""List the supported industries, so the frontend never hard-codes café
wording, defaults or field labels."""
from __future__ import annotations

from fastapi import APIRouter

from .. import schemas
from ..engine_bridge import list_industries

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
