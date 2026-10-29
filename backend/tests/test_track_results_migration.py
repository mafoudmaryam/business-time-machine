import json
import sqlite3
import pytest
from alembic import command
from tests.test_beginner_migration import _config

BEFORE='b3d7f1a9c5e2'
AFTER='c4f8a2d6e0b1'


def seeded(tmp_path,monkeypatch):
    path=tmp_path/'journal.db'; cfg=_config(f'sqlite:///{path}',monkeypatch)
    command.upgrade(cfg,BEFORE)
    with sqlite3.connect(path) as con:
        con.execute("INSERT INTO businesses (id,name,industry,currency,created_at) VALUES (1,'Keep me','cafe','EUR','2026-10-01')")
        con.execute("INSERT INTO simulation_runs (id,business_id,engine_version,seed,iterations,horizon,kind,created_at) VALUES (1,1,'v1',42,10,12,'today','2026-10-15')")
        bands={m:{k:[v]*12 for k,v in [('p10',1),('p50',2),('p90',3)]} for m in ('profit','cash','visits','revenue')}
        con.execute("INSERT INTO simulation_results (simulation_run_id,scenario_name,bands,summary) VALUES (1,'baseline',?,'{}')",(json.dumps(bands),))
        con.execute("INSERT INTO journal_entries (id,business_id,month,actual_profit,actual_cash,actual_visits,note,created_at,deleted_at) VALUES (7,1,'2026-11',-5,10,2,'keep note','2026-12-01','2026-12-02')")
    return path,cfg


def test_upgrade_preserves_legacy_values_ids_soft_deletes_and_freezes_plan(tmp_path,monkeypatch):
    path,cfg=seeded(tmp_path,monkeypatch); command.upgrade(cfg,AFTER)
    with sqlite3.connect(path) as con:
        row=con.execute('SELECT id,actual_profit,actual_cash,actual_visits,note,deleted_at,actual_sales,actual_costs,comparison_snapshot FROM journal_entries').fetchone()
        assert row[:8]==(7,-5,10,2,'keep note','2026-12-02',None,None)
        snap=json.loads(row[8]); assert snap['source']=='legacy_upgrade' and snap['currency']=='EUR'
        assert snap['run_id']==1 and snap['bands']['revenue']['p50']==2
        assert con.execute('SELECT name FROM businesses').fetchone()==('Keep me',)
        con.execute("INSERT INTO journal_entries (business_id,month,created_at,actual_sales) VALUES (1,'2026-12','2027-01-01',0)")
        assert con.execute("SELECT actual_profit,actual_cash FROM journal_entries WHERE month='2026-12'").fetchone()==(None,None)


def test_legacy_roundtrip_keeps_existing_rows(tmp_path,monkeypatch):
    path,cfg=seeded(tmp_path,monkeypatch); command.upgrade(cfg,AFTER); command.downgrade(cfg,BEFORE)
    with sqlite3.connect(path) as con: assert con.execute('SELECT id,actual_profit,note FROM journal_entries').fetchone()==(7,-5,'keep note')
    command.upgrade(cfg,AFTER)


def test_downgrade_refuses_to_discard_new_or_incomplete_records(tmp_path,monkeypatch):
    path,cfg=seeded(tmp_path,monkeypatch); command.upgrade(cfg,AFTER)
    with sqlite3.connect(path) as con: con.execute('UPDATE journal_entries SET actual_sales=100')
    with pytest.raises(RuntimeError,match='old schema cannot represent'): command.downgrade(cfg,BEFORE)
    with sqlite3.connect(path) as con: assert con.execute('SELECT actual_sales FROM journal_entries').fetchone()==(100,)
