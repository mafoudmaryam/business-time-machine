"""Test fixtures: a throwaway SQLite database per test, built straight from
the SQLAlchemy models (Alembic is for the real deployed database)."""
from __future__ import annotations

import os
import tempfile

# Tests must never depend on a developer's backend/.env: real environment variables win over .env,
# so pin the coach to the free rule-based mode before the app is imported.
os.environ["COACH_PROVIDER"] = "template"
os.environ["COACH_ENABLED"] = "true"
os.environ["COACH_SHOW_MODE"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app


@pytest.fixture(autouse=True)
def _coach_defaults(monkeypatch):
    monkeypatch.setenv("COACH_PROVIDER", "template")
    monkeypatch.setenv("COACH_ENABLED", "true")
    monkeypatch.setenv("COACH_SHOW_MODE", "false")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        os.remove(path)


@pytest.fixture()
def business(client):
    resp = client.post("/businesses", json={"name": "Corner Cafe"})
    assert resp.status_code == 201
    return resp.json()
