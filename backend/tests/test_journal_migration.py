"""The Phase 4 migration (a2c5e8b1d4f7) adds journal_entries without touching anything else, and downgrades again."""
from __future__ import annotations

import sqlite3

import pytest
from alembic import command

from tests.test_beginner_migration import _config, _tables, _columns  # same helpers as the earlier migration tests

BEFORE = "f1b7d3a9c2e4"
AFTER = "a2c5e8b1d4f7"


def _database_at(path, monkeypatch, revision):
    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), revision)


def test_upgrade_adds_the_table_and_keeps_existing_data(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    _database_at(path, monkeypatch, BEFORE)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('Old cafe', 'cafe', 'EUR', '2026-10-01 00:00:00')")
        con.commit()
    assert "journal_entries" not in _tables(path)

    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), AFTER)

    assert {"id", "business_id", "month", "actual_profit", "actual_cash", "actual_visits", "note", "created_at", "deleted_at"} == _columns(path, "journal_entries")
    with sqlite3.connect(path) as con:
        assert con.execute("SELECT name, currency FROM businesses").fetchall() == [("Old cafe", "EUR")]


def test_one_entry_per_business_per_month_is_enforced_by_the_database(tmp_path, monkeypatch):
    path = tmp_path / "db.db"
    _database_at(path, monkeypatch, AFTER)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('B', 'cafe', 'USD', '2026-10-01 00:00:00')")
        row = "INSERT INTO journal_entries (business_id, month, actual_profit, actual_cash, actual_visits, created_at) VALUES (1, ?, 1, 2, 3, '2026-10-05 00:00:00')"
        con.execute(row, ("2026-10",))
        con.execute(row, ("2026-11",))          # another month is fine
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(row, ("2026-10",))


def test_downgrade_removes_only_the_new_table(tmp_path, monkeypatch):
    path = tmp_path / "db.db"
    _database_at(path, monkeypatch, AFTER)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('Keep me', 'cafe', 'USD', '2026-10-01 00:00:00')")
        con.commit()

    command.downgrade(_config(f"sqlite:///{path}", monkeypatch), BEFORE)

    assert "journal_entries" not in _tables(path)
    assert {"businesses", "simulation_runs", "today_notes"} <= _tables(path)
    with sqlite3.connect(path) as con:
        assert con.execute("SELECT name FROM businesses").fetchall() == [("Keep me",)]


def test_upgrade_again_after_a_downgrade_works(tmp_path, monkeypatch):
    path = tmp_path / "db.db"
    cfg = _config(f"sqlite:///{path}", monkeypatch)
    command.upgrade(cfg, AFTER)
    command.downgrade(cfg, BEFORE)
    command.upgrade(cfg, AFTER)
    assert "journal_entries" in _tables(path)
