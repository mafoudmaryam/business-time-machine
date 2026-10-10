"""The start-up guide migration (b3d7f1a9c5e2) adds startup_plans without touching anything else, and downgrades again."""
from __future__ import annotations

import sqlite3

import pytest
from alembic import command

from tests.test_beginner_migration import _config, _tables, _columns  # same helpers as the earlier migration tests

BEFORE = "a2c5e8b1d4f7"
AFTER = "b3d7f1a9c5e2"


def _database_at(path, monkeypatch, revision):
    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), revision)


def test_upgrade_adds_the_table_and_keeps_existing_data(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    _database_at(path, monkeypatch, BEFORE)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('Old cafe', 'cafe', 'EUR', '2026-10-01 00:00:00')")
        con.commit()
    assert "startup_plans" not in _tables(path)

    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), AFTER)

    assert {"id", "answers", "country", "business_type", "currency", "data_version", "engine_version", "business_id",
            "created_at", "updated_at", "deleted_at"} == _columns(path, "startup_plans")
    with sqlite3.connect(path) as con:
        assert con.execute("SELECT name, currency FROM businesses").fetchall() == [("Old cafe", "EUR")]


def test_a_plan_can_be_stored_and_linked_to_a_business(tmp_path, monkeypatch):
    path = tmp_path / "db.db"
    _database_at(path, monkeypatch, AFTER)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('B', 'cafe', 'USD', '2026-10-01 00:00:00')")
        con.execute("INSERT INTO startup_plans (answers, country, business_type, currency, data_version, engine_version, business_id, created_at, updated_at) "
                    "VALUES ('{}', 'US', 'cafe', 'USD', 'v1', 'e1', 1, '2026-10-10 00:00:00', '2026-10-10 00:00:00')")
        assert con.execute("SELECT business_id, deleted_at FROM startup_plans").fetchall() == [(1, None)]


def test_downgrade_removes_only_the_new_table_and_upgrade_works_again(tmp_path, monkeypatch):
    path = tmp_path / "db.db"
    _database_at(path, monkeypatch, AFTER)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (name, industry, currency, created_at) VALUES ('Keep me', 'cafe', 'USD', '2026-10-01 00:00:00')")
        con.commit()
    command.downgrade(_config(f"sqlite:///{path}", monkeypatch), BEFORE)
    assert "startup_plans" not in _tables(path) and "journal_entries" in _tables(path)
    with sqlite3.connect(path) as con:
        assert con.execute("SELECT name FROM businesses").fetchall() == [("Keep me",)]
    command.upgrade(_config(f"sqlite:///{path}", monkeypatch), AFTER)
    assert "startup_plans" in _tables(path)


def test_the_real_head_is_this_migration():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    cfg = Config("alembic.ini")
    assert ScriptDirectory.from_config(cfg).get_current_head() == AFTER
