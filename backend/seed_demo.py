"""Seeds a demo cafe with three confirmed decisions, so the frontend has
something to look at without going through the setup wizard by hand.

Run from backend/, with the venv active:
    python seed_demo.py

To reset and reseed from scratch (PowerShell):
    Remove-Item btm.db
    alembic upgrade head
    python seed_demo.py
"""
from __future__ import annotations

from app import models
from app.database import Base, SessionLocal, engine

BUSINESS_NAME = "Demo Cafe"

SCENARIOS = [
    {
        "name": "Price +10% in March",
        "decisions": [
            {"type": "price", "start_month": 3, "value": 10, "unit": "percent"},
        ],
    },
    {
        "name": "Hire a barista in month 6",
        "decisions": [
            {"type": "hiring", "start_month": 6, "value": 1, "unit": "fte"},
        ],
    },
    {
        "name": "Marketing to 1,200/month",
        "decisions": [
            {"type": "marketing", "start_month": 1, "value": 1200, "unit": "per_month"},
        ],
    },
]


def seed(business_name: str = BUSINESS_NAME) -> None:
    Base.metadata.create_all(bind=engine)  # no-op if alembic already created the tables

    db = SessionLocal()
    try:
        existing = db.query(models.Business).filter(models.Business.name == business_name).first()
        if existing is not None:
            print(f"'{business_name}' already exists (id={existing.id}); nothing to do.")
            return

        business = models.Business(name=business_name)
        db.add(business)
        db.flush()
        db.add(models.BusinessSnapshot(business_id=business.id))  # engine defaults

        for scenario_spec in SCENARIOS:
            scenario = models.Scenario(business_id=business.id, name=scenario_spec["name"])
            db.add(scenario)
            db.flush()
            for d in scenario_spec["decisions"]:
                db.add(models.Decision(
                    scenario_id=scenario.id, type=d["type"], start_month=d["start_month"],
                    value=d["value"], unit=d["unit"], extra={}, source="user", confirmed=True,
                ))

        db.commit()
        print(f"Seeded '{business_name}' (id={business.id}) with {len(SCENARIOS)} confirmed scenarios.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
