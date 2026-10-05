"""The journal: write down what really happened in a month, get it back next to what we expected.

One entry per business per month. Saving a month again edits it. Delete is a soft delete with a restore ("Undo"), like
businesses and scenarios; saving a month that was deleted brings the same row back with the new figures. The owner's
figures are their own input: no AI reads them and there is nothing to confirm.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.orm import Session

from .. import journal, lookup, models, schemas
from ..database import get_db

router = APIRouter(tags=["journal"])

_MONTH = dict(pattern=schemas.MONTH_PATTERN)


def _business(db: Session, business_id: int) -> models.Business:
    business = lookup.business(db, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="business not found")
    return business


def _check_month(month: str) -> None:
    if journal.is_future(month):
        raise HTTPException(status_code=422, detail="that month has not started yet")


def _row(db: Session, business_id: int, month: str) -> models.JournalEntry | None:
    return db.query(models.JournalEntry).filter_by(business_id=business_id, month=month).first()


def _fill(row: models.JournalEntry, data) -> None:
    row.actual_profit, row.actual_cash, row.actual_visits = data.actual_profit, data.actual_cash, data.actual_visits
    row.note = (data.note or "").strip() or None
    row.deleted_at = None


@router.get("/businesses/{business_id}/journal", response_model=schemas.JournalOut)
def get_journal(business_id: int, db: Session = Depends(get_db)):
    return journal.build_journal(db, _business(db, business_id))


@router.post("/businesses/{business_id}/journal", response_model=schemas.JournalMonthOut)
def save_entry(business_id: int, data: schemas.JournalEntryIn, response: Response, db: Session = Depends(get_db)):
    """Saves a month. A new month answers 201; a month that already has an entry is edited (200)."""
    business = _business(db, business_id)
    _check_month(data.month)
    row = _row(db, business_id, data.month)
    response.status_code = 200 if row is not None and row.deleted_at is None else 201
    if row is None:
        row = models.JournalEntry(business_id=business_id, month=data.month)
        db.add(row)
    _fill(row, data)
    db.commit()
    db.refresh(row)
    return journal.compare_entry(db, business, row)


@router.put("/businesses/{business_id}/journal/{month}", response_model=schemas.JournalMonthOut)
def edit_entry(business_id: int, data: schemas.JournalEntryUpdate, month: str = Path(**_MONTH),
               db: Session = Depends(get_db)):
    business = _business(db, business_id)
    row = _row(db, business_id, month)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="no entry for that month")
    _fill(row, data)
    db.commit()
    db.refresh(row)
    return journal.compare_entry(db, business, row)


@router.delete("/businesses/{business_id}/journal/{month}", response_model=schemas.DeletedOut)
def delete_entry(business_id: int, month: str = Path(**_MONTH), db: Session = Depends(get_db)):
    """Hides the entry. `restore` brings it back unchanged."""
    _business(db, business_id)
    row = _row(db, business_id, month)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="no entry for that month")
    row.deleted_at = dt.datetime.utcnow()
    db.commit()
    return schemas.DeletedOut(id=row.id, kind="journal", name=journal.month_label(month), deleted_at=row.deleted_at)


@router.post("/businesses/{business_id}/journal/{month}/restore", response_model=schemas.JournalMonthOut)
def restore_entry(business_id: int, month: str = Path(**_MONTH), db: Session = Depends(get_db)):
    business = _business(db, business_id)
    row = _row(db, business_id, month)
    if row is None:
        raise HTTPException(status_code=404, detail="no entry for that month")
    row.deleted_at = None
    db.commit()
    db.refresh(row)
    return journal.compare_entry(db, business, row)


@router.get("/journal/accuracy", response_model=schemas.JournalAccuracyReport)
def accuracy(include_samples: bool = False, db: Session = Depends(get_db)):
    """Thesis output: how the expected ranges did against what owners wrote down. Pilot data, not a validation."""
    return journal.accuracy_report(db, include_samples=include_samples)
