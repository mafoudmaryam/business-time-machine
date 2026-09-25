"""seed_demo.py is a standalone script (not part of the FastAPI app), so these
tests point its module-level `engine`/`SessionLocal` at a throwaway SQLite
file instead of using the `client` fixture from conftest.py."""
from __future__ import annotations

import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import seed_demo
from app import models


@pytest.fixture()
def seed_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    test_engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    monkeypatch.setattr(seed_demo, "engine", test_engine)
    monkeypatch.setattr(seed_demo, "SessionLocal", TestingSessionLocal)

    try:
        yield TestingSessionLocal
    finally:
        test_engine.dispose()
        os.remove(path)


def test_seed_creates_business_with_three_confirmed_scenarios(seed_db):
    seed_demo.seed()

    db = seed_db()
    try:
        business = db.query(models.Business).filter(models.Business.name == seed_demo.BUSINESS_NAME).one()
        assert business.baseline is not None

        scenarios = {s.name: s for s in business.scenarios}
        assert len(scenarios) == 3

        for scenario in scenarios.values():
            assert len(scenario.decisions) == 1
            assert all(d.confirmed for d in scenario.decisions)

        price = scenarios["Price +10% in March"].decisions[0]
        assert (price.type, price.start_month, price.value, price.unit) == ("price", 3, 10.0, "percent")

        hiring = scenarios["Hire a barista in month 6"].decisions[0]
        assert (hiring.type, hiring.start_month, hiring.value, hiring.unit) == ("hiring", 6, 1.0, "fte")

        marketing = scenarios["Marketing to 1,200/month"].decisions[0]
        assert (marketing.type, marketing.start_month, marketing.value, marketing.unit) == (
            "marketing", 1, 1200.0, "per_month",
        )
    finally:
        db.close()


def test_seed_is_idempotent(seed_db):
    seed_demo.seed()
    seed_demo.seed()

    db = seed_db()
    try:
        count = db.query(models.Business).filter(models.Business.name == seed_demo.BUSINESS_NAME).count()
        assert count == 1
    finally:
        db.close()
