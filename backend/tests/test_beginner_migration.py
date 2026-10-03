"""The Phase 1 migration (e9a4c7b2d5f1) upgrades an existing database without losing anything, and downgrades again."""
from __future__ import annotations

import datetime as dt
import os
import shutil
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parent.parent
BEFORE = "d8f3a1c5e9b7"
AFTER = "e9a4c7b2d5f1"


def _config(url: str, monkeypatch) -> Config:
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    return cfg


def _columns(path, table):
    with sqlite3.connect(path) as con:
        return {row[1] for row in con.execute(f"PRAGMA table_info({table})")}


def _tables(path):
    with sqlite3.connect(path) as con:
        return {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _seed_old_database(path, monkeypatch):
    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), BEFORE)
    now = dt.datetime.utcnow().isoformat(sep=" ")
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('Old cafe', 'cafe', 'EUR', ?)", (now,))
        con.execute(
            "INSERT INTO business_snapshots (business_id, created_at, customers, cash, staff_fte, avg_ticket, "
            "visits_per_regular, walk_in_visits, cogs_ratio, wage_per_fte, fixed_costs, marketing, churn_rate, seats, "
            "open_days) VALUES (1, ?, 800, 20000, 4, 6, 6, 2000, 0.3, 3000, 14000, 300, 0.05, 30, 28)", (now,))
        con.execute("INSERT INTO simulation_runs (business_id, engine_version, seed, iterations, horizon, created_at) "
                    "VALUES (1, '1', 5, 1000, 24, ?)", (now,))
        con.commit()


def test_upgrade_keeps_data_and_adds_the_new_pieces(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    _seed_old_database(path, monkeypatch)
    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), AFTER)

    assert {"setup_source", "is_sample", "participant_code", "study_condition"} <= _columns(path, "businesses")
    assert "assumed_fields" in _columns(path, "business_snapshots")
    assert "kind" in _columns(path, "simulation_runs")
    assert {"today_notes", "ui_events"} <= _tables(path)
    with sqlite3.connect(path) as con:
        assert con.execute("SELECT name, currency, setup_source, is_sample FROM businesses").fetchall() == [
            ("Old cafe", "EUR", "full", 0)]
        assert con.execute("SELECT customers, assumed_fields FROM business_snapshots").fetchall() == [(800.0, None)]
        assert con.execute("SELECT seed, kind FROM simulation_runs").fetchall() == [(5, "compare")]


def test_downgrade_removes_the_new_pieces_and_keeps_the_old_data(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    _seed_old_database(path, monkeypatch)
    cfg = _config(f"sqlite:///{path}", monkeypatch)
    command.upgrade(cfg, AFTER)
    command.downgrade(cfg, BEFORE)

    assert not {"setup_source", "is_sample", "participant_code", "study_condition"} & _columns(path, "businesses")
    assert "assumed_fields" not in _columns(path, "business_snapshots")
    assert "kind" not in _columns(path, "simulation_runs")
    assert not {"today_notes", "ui_events"} & _tables(path)
    with sqlite3.connect(path) as con:
        assert con.execute("SELECT name, currency FROM businesses").fetchall() == [("Old cafe", "EUR")]
        assert con.execute("SELECT customers FROM business_snapshots").fetchall() == [(800.0,)]
        assert con.execute("SELECT seed FROM simulation_runs").fetchall() == [(5,)]


def test_up_down_up_again(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    _seed_old_database(path, monkeypatch)
    cfg = _config(f"sqlite:///{path}", monkeypatch)
    command.upgrade(cfg, AFTER)
    command.downgrade(cfg, BEFORE)
    command.upgrade(cfg, "head")
    assert "ui_events" in _tables(path)


def test_the_real_development_database_survives_a_round_trip(tmp_path, monkeypatch):
    """Runs on a COPY of backend/btm.db when it exists (skipped on a fresh checkout)."""
    real = BACKEND / "btm.db"
    if not real.exists():
        pytest.skip("no development database here")
    copy = tmp_path / "copy.db"
    shutil.copy(real, copy)

    def counts():
        with sqlite3.connect(copy) as con:
            return {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                    for t in ("businesses", "business_snapshots", "scenarios", "decisions", "simulation_runs",
                              "simulation_results", "ai_interactions")}

    cfg = _config(f"sqlite:///{copy}", monkeypatch)
    command.upgrade(cfg, "head")                 # a copy already at head stays there; an older one moves up
    before = counts()
    command.downgrade(cfg, BEFORE)
    assert counts() == before
    command.upgrade(cfg, "head")
    assert counts() == before
    assert os.path.getsize(real) > 0             # the original was never touched
