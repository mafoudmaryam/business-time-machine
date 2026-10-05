"""The quick "just a sketch" for the Try a change page. Read-only: nothing here saves anything or writes to ai_interactions.

    POST /businesses/{id}/preview_change   one slider position -> a 12-month answer in well under a second
    GET  /start_options                    the "when would it start?" buttons, with the right month numbers

The sketch is the owner's own input (a slider, not words an AI read), so golden rule 2 lets it show numbers before they
confirm anything. It is never stored, and the AI never explains it. Saving it goes through the normal confirm flow.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import engine_bridge, lookup, schemas
from ..database import get_db
from ..interpret.months import sim_month_of
from ..today import labels_from

router = APIRouter(tags=["sketch"])


@router.get("/start_options", response_model=schemas.StartOptionsOut)
def start_options():
    """Month 1 is next month. "In 3 months" is month 3; "In spring" is the next March (the first spring month)."""
    today = dt.date.today()
    labels = labels_from(today, 12, long=True)
    options = [
        ("next", "Next month", 1),
        ("in3", "In 3 months", 3),
        ("spring", "In spring", sim_month_of(3, today)),
    ]
    return schemas.StartOptionsOut(
        options=[schemas.StartOption(key=k, label=text, month=m, name=labels[m - 1]) for k, text, m in options],
    )


@router.post("/businesses/{business_id}/preview_change", response_model=schemas.PreviewChangeOut)
def preview_change(business_id: int, payload: schemas.PreviewChangeIn, db: Session = Depends(get_db)):
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    if business.baseline is None:
        raise HTTPException(status_code=422, detail="business has no baseline snapshot")
    try:
        result = engine_bridge.sketch_change(business, payload.type, payload.amount, payload.start_month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    labels = labels_from(dt.date.today(), 12)
    long_labels = labels_from(dt.date.today(), 12, long=True)
    start = payload.start_month
    path = lambda p: schemas.SketchPath(**p)  # noqa: E731
    return schemas.PreviewChangeOut(
        type=payload.type, amount=payload.amount, start_month=start, start_label=long_labels[start - 1],
        # "Raise prices by 7% from month 1" -> "... from Nov 2026 (month 1)"
        sentence=result["sentence"].replace(f"from month {start}", f"from {long_labels[start - 1]} (month {start})"),
        engine_version=result["engine_version"], seed=result["seed"], iterations=result["iterations"],
        horizon=result["horizon"], month_labels=labels,
        extra_profit_per_month=result["extra_profit_per_month"],
        profit_per_month_with_change=result["profit_per_month_with_change"],
        profit_per_month_without=result["profit_per_month_without"],
        visits_change_per_month=result["visits_change_per_month"],
        visits_per_month_without=result["visits_per_month_without"],
        ahead_of_10=result["ahead_of_10"], cash_now=result["cash_now"],
        change=path(result["change"]), baseline=path(result["baseline"]),
        example=schemas.PriceExample(**result["example"]) if "example" in result else None,
    )
