"""Delete and undo for scenarios, runs and businesses (soft delete), and the purge that really erases them."""
from __future__ import annotations

import datetime as dt

import pytest

from app import models
from app.database import get_db
from app.main import app
from app.purge import purge


def with_db(fn):
    session = next(app.dependency_overrides[get_db]())
    try:
        return fn(session)
    finally:
        session.close()


def make_scenario(client, business_id, name="Raise prices", **over):
    body = {"name": name, "decisions": [{"type": "price", "start_month": 3, "value": 10, "unit": "percent", "confirmed": True}]}
    body.update(over)
    resp = client.post(f"/businesses/{business_id}/scenarios", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def make_run(client, business_id, scenario_ids):
    resp = client.post(f"/businesses/{business_id}/simulate",
                       json={"scenario_ids": scenario_ids, "horizon": 12, "iterations": 100, "seed": 5})
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
def world(client, business):
    s = make_scenario(client, business["id"])
    run = make_run(client, business["id"], [s["id"]])
    return {"business": business, "scenario": s, "run": run}


# ---------- scenarios ----------

class TestDeleteScenario:
    def test_it_disappears_from_every_scenario_view(self, client, world):
        b, s = world["business"], world["scenario"]
        resp = client.delete(f"/scenarios/{s['id']}")
        assert resp.status_code == 200
        assert resp.json()["kind"] == "scenario" and resp.json()["name"] == "Raise prices"
        assert client.get(f"/scenarios/{s['id']}").status_code == 404
        assert client.get(f"/businesses/{b['id']}/scenarios").json() == []
        assert client.post(f"/scenarios/{s['id']}/confirm").status_code == 404

    def test_it_cannot_be_simulated_any_more(self, client, world):
        b, s = world["business"], world["scenario"]
        client.delete(f"/scenarios/{s['id']}")
        assert client.post(f"/businesses/{b['id']}/simulate", json={"scenario_ids": [s["id"]]}).status_code == 404
        assert client.post(f"/scenarios/{s['id']}/simulate", json={}).status_code == 404

    def test_runs_and_history_still_work_afterwards(self, client, world):
        b, s, run = world["business"], world["scenario"], world["run"]
        client.delete(f"/scenarios/{s['id']}")
        history = client.get(f"/businesses/{b['id']}/simulation_runs").json()
        assert [r["id"] for r in history] == [run["id"]]
        assert "Raise prices" in history[0]["scenario_names"]
        reopened = client.get(f"/simulation_runs/{run['id']}")
        assert reopened.status_code == 200
        assert {r["scenario_name"] for r in reopened.json()["results"]} == {"baseline", "Raise prices"}
        # the coach can still explain that old run
        assert client.post(f"/simulation_runs/{run['id']}/coach").status_code == 200
        assert client.get(f"/simulation_runs/{run['id']}/coach").status_code == 200

    def test_the_name_can_be_used_again(self, client, world):
        b, s = world["business"], world["scenario"]
        client.delete(f"/scenarios/{s['id']}")
        again = make_scenario(client, b["id"], name="Raise prices")
        assert again["id"] != s["id"]
        assert [x["name"] for x in client.get(f"/businesses/{b['id']}/scenarios").json()] == ["Raise prices"]

    def test_undo_brings_it_back_as_it_was(self, client, world):
        b, s = world["business"], world["scenario"]
        client.delete(f"/scenarios/{s['id']}")
        resp = client.post(f"/scenarios/{s['id']}/restore")
        assert resp.status_code == 200 and resp.json()["name"] == "Raise prices"
        assert len(resp.json()["decisions"]) == 1
        assert [x["id"] for x in client.get(f"/businesses/{b['id']}/scenarios").json()] == [s["id"]]

    def test_undo_after_the_name_was_reused_is_refused_kindly(self, client, world):
        b, s = world["business"], world["scenario"]
        client.delete(f"/scenarios/{s['id']}")
        make_scenario(client, b["id"], name="Raise prices")
        resp = client.post(f"/scenarios/{s['id']}/restore")
        assert resp.status_code == 409 and "Raise prices" in resp.json()["detail"]

    def test_undo_restores_the_original_name_after_a_rename_in_the_meantime(self, client, world):
        b, s = world["business"], world["scenario"]
        client.delete(f"/scenarios/{s['id']}")
        newer = make_scenario(client, b["id"], name="Raise prices")
        client.delete(f"/scenarios/{newer['id']}")
        resp = client.post(f"/scenarios/{s['id']}/restore")      # its stored name carries a "(deleted #n)" suffix
        assert resp.status_code == 200 and resp.json()["name"] == "Raise prices"
        assert [x["name"] for x in client.get(f"/businesses/{b['id']}/scenarios").json()] == ["Raise prices"]

    def test_what_goes_with_it_is_counted(self, client, world):
        s = world["scenario"]
        assert client.get(f"/scenarios/{s['id']}/impact").json() == {"decisions": 1, "runs": 1}

    def test_unknown_twice_and_restore_of_unknown(self, client, world):
        s = world["scenario"]
        assert client.delete("/scenarios/999").status_code == 404
        assert client.delete(f"/scenarios/{s['id']}").status_code == 200
        assert client.delete(f"/scenarios/{s['id']}").status_code == 404
        assert client.get(f"/scenarios/{s['id']}/impact").status_code == 404
        assert client.post("/scenarios/999/restore").status_code == 404

    def test_restoring_something_not_deleted_changes_nothing(self, client, world):
        s = world["scenario"]
        assert client.post(f"/scenarios/{s['id']}/restore").status_code == 200

    def test_nothing_is_erased(self, client, world):
        s = world["scenario"]
        client.delete(f"/scenarios/{s['id']}")
        row = with_db(lambda db: db.get(models.Scenario, s["id"]))
        assert row is not None
        assert with_db(lambda db: db.query(models.Decision).filter_by(scenario_id=s["id"]).count()) == 1


# ---------- runs ----------

class TestDeleteRun:
    def test_it_leaves_the_history_and_cannot_be_opened(self, client, world):
        b, run = world["business"], world["run"]
        resp = client.delete(f"/simulation_runs/{run['id']}")
        assert resp.status_code == 200 and resp.json()["kind"] == "run" and resp.json()["name"] == "Raise prices"
        assert client.get(f"/businesses/{b['id']}/simulation_runs").json() == []
        assert client.get(f"/simulation_runs/{run['id']}").status_code == 404
        assert client.post(f"/simulation_runs/{run['id']}/coach").status_code == 404
        assert client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Will my cash run out?"}).status_code == 404

    def test_the_scenario_it_used_is_not_affected(self, client, world):
        b, s, run = world["business"], world["scenario"], world["run"]
        client.delete(f"/simulation_runs/{run['id']}")
        assert [x["id"] for x in client.get(f"/businesses/{b['id']}/scenarios").json()] == [s["id"]]

    def test_undo(self, client, world):
        b, run = world["business"], world["run"]
        client.delete(f"/simulation_runs/{run['id']}")
        resp = client.post(f"/simulation_runs/{run['id']}/restore")
        assert resp.status_code == 200 and resp.json()["scenario_names"] == ["baseline", "Raise prices"]
        assert [r["id"] for r in client.get(f"/businesses/{b['id']}/simulation_runs").json()] == [run["id"]]
        assert client.get(f"/simulation_runs/{run['id']}").status_code == 200

    def test_errors(self, client, world):
        run = world["run"]
        assert client.delete("/simulation_runs/999").status_code == 404
        client.delete(f"/simulation_runs/{run['id']}")
        assert client.delete(f"/simulation_runs/{run['id']}").status_code == 404
        assert client.post("/simulation_runs/999/restore").status_code == 404


# ---------- businesses ----------

class TestDeleteBusiness:
    def test_it_and_everything_in_it_disappears(self, client, world):
        b, s, run = world["business"], world["scenario"], world["run"]
        resp = client.delete(f"/businesses/{b['id']}")
        assert resp.status_code == 200 and resp.json()["kind"] == "business" and resp.json()["name"] == "Corner Cafe"
        assert client.get("/businesses").json() == []
        for path in (f"/businesses/{b['id']}", f"/businesses/{b['id']}/scenarios", f"/businesses/{b['id']}/simulation_runs",
                     f"/businesses/{b['id']}/today", f"/scenarios/{s['id']}", f"/simulation_runs/{run['id']}",
                     f"/businesses/{b['id']}/impact"):
            assert client.get(path).status_code == 404, path
        assert client.post(f"/businesses/{b['id']}/simulate", json={"scenario_ids": [s["id"]]}).status_code == 404
        assert client.post(f"/businesses/{b['id']}/scenarios", json={"name": "x", "decisions": []}).status_code == 404
        assert client.post(f"/simulation_runs/{run['id']}/coach").status_code == 404

    def test_other_businesses_are_not_affected(self, client, world):
        other = client.post("/businesses", json={"name": "Second"}).json()
        client.delete(f"/businesses/{world['business']['id']}")
        assert [x["name"] for x in client.get("/businesses").json()] == ["Second"]
        assert client.get(f"/businesses/{other['id']}/today").status_code == 200

    def test_undo_brings_back_everything(self, client, world):
        b, s, run = world["business"], world["scenario"], world["run"]
        client.delete(f"/businesses/{b['id']}")
        resp = client.post(f"/businesses/{b['id']}/restore")
        assert resp.status_code == 200 and resp.json()["name"] == "Corner Cafe"
        assert [x["id"] for x in client.get("/businesses").json()] == [b["id"]]
        assert [x["id"] for x in client.get(f"/businesses/{b['id']}/scenarios").json()] == [s["id"]]
        assert [x["id"] for x in client.get(f"/businesses/{b['id']}/simulation_runs").json()] == [run["id"]]
        assert client.get(f"/simulation_runs/{run['id']}").status_code == 200

    def test_what_goes_with_it_is_counted(self, client, world):
        b = world["business"]
        make_scenario(client, b["id"], name="Second idea")
        assert client.get(f"/businesses/{b['id']}/impact").json() == {"scenarios": 2, "runs": 1}

    def test_a_deleted_scenario_or_run_is_not_counted(self, client, world):
        b, s, run = world["business"], world["scenario"], world["run"]
        client.delete(f"/simulation_runs/{run['id']}")
        client.delete(f"/scenarios/{s['id']}")
        assert client.get(f"/businesses/{b['id']}/impact").json() == {"scenarios": 0, "runs": 0}

    def test_the_today_run_is_not_counted_as_a_run(self, client, world):
        b = world["business"]
        client.get(f"/businesses/{b['id']}/today")
        assert client.get(f"/businesses/{b['id']}/impact").json()["runs"] == 1

    def test_with_nothing_left_the_app_has_no_business_to_open(self, client, world):
        client.delete(f"/businesses/{world['business']['id']}")
        assert client.get("/businesses").json() == []
        sample = client.post("/sample_business", json={"industry": "cafe"})      # and a new start still works
        assert sample.status_code == 201
        assert [x["id"] for x in client.get("/businesses").json()] == [sample.json()["id"]]

    def test_events_for_a_deleted_business_are_kept_without_it(self, client, world):
        b = world["business"]
        client.delete(f"/businesses/{b['id']}")
        resp = client.post("/events", json={"session_id": "abc12345", "business_id": b["id"], "events": [{"name": "x_y"}]})
        assert resp.status_code == 201
        assert with_db(lambda db: db.query(models.UiEvent).one().business_id) is None

    def test_errors(self, client, world):
        b = world["business"]
        assert client.delete("/businesses/999").status_code == 404
        client.delete(f"/businesses/{b['id']}")
        assert client.delete(f"/businesses/{b['id']}").status_code == 404
        assert client.post("/businesses/999/restore").status_code == 404


# ---------- the AI logs stay ----------

def ai_rows():
    return with_db(lambda db: [(r.id, r.kind, r.simulation_run_id, r.business_id, r.interpretation_id,
                                r.former_run_id, r.former_business_id, r.former_interpretation_id)
                               for r in db.query(models.AiInteraction).order_by(models.AiInteraction.id)])


@pytest.fixture()
def logged(client, world):
    """The run has coach logs; the business has a describe-it reading with a log."""
    run, b = world["run"], world["business"]
    client.post(f"/simulation_runs/{run['id']}/coach")
    client.post(f"/simulation_runs/{run['id']}/ask", json={"question": "Will my cash run out?"})

    def add(db):
        interp = models.Interpretation(business_id=b["id"], text="Raise prices 5%", status="done", provider="template")
        db.add(interp)
        db.flush()
        db.add(models.AiInteraction(business_id=b["id"], interpretation_id=interp.id, input_text="Raise prices 5%", kind="interpret",
                                    provider="template", prompt="p"))
        db.commit()
        return interp.id
    return {**world, "interpretation_id": with_db(add)}


class TestAiLogsAreKept:
    def test_soft_delete_leaves_every_log_row_exactly_as_it_was(self, client, logged):
        before = ai_rows()
        assert len(before) >= 3
        client.delete(f"/simulation_runs/{logged['run']['id']}")
        client.delete(f"/businesses/{logged['business']['id']}")
        assert ai_rows() == before

    def test_purging_a_run_keeps_its_logs_and_remembers_the_id(self, client, logged):
        run_id = logged["run"]["id"]
        before = ai_rows()
        client.delete(f"/simulation_runs/{run_id}")
        counts = with_db(lambda db: purge(db, dt.timedelta(0), now=dt.datetime.utcnow() + dt.timedelta(seconds=1), dry_run=False))
        assert counts["runs"] == 1
        after = ai_rows()
        assert [row[0] for row in after] == [row[0] for row in before]                  # not one log row lost
        run_logs = [row for row in after if row[1] in ("coach", "ask")]
        assert run_logs and all(row[2] is None and row[5] == run_id for row in run_logs)
        assert with_db(lambda db: db.get(models.SimulationRun, run_id)) is None            # the run itself is gone
        assert with_db(lambda db: db.query(models.SimulationResult).filter_by(simulation_run_id=run_id).count()) == 0

    def test_purging_a_business_keeps_all_its_logs_with_plain_ids(self, client, logged):
        b, run_id, interp_id = logged["business"]["id"], logged["run"]["id"], logged["interpretation_id"]
        count_before = len(ai_rows())
        client.delete(f"/businesses/{b}")
        with_db(lambda db: purge(db, dt.timedelta(0), now=dt.datetime.utcnow() + dt.timedelta(seconds=1), dry_run=False))
        rows = ai_rows()
        assert len(rows) == count_before
        interpret = next(r for r in rows if r[1] == "interpret")
        assert interpret[3] is None and interpret[4] is None
        assert interpret[6] == b and interpret[7] == interp_id
        assert all(r[5] == run_id for r in rows if r[1] in ("coach", "ask"))
        assert with_db(lambda db: db.query(models.Business).count()) == 0
        assert with_db(lambda db: db.query(models.Interpretation).count()) == 0


# ---------- purge ----------

class TestPurge:
    def test_a_dry_run_changes_nothing_and_counts(self, client, world):
        client.delete(f"/businesses/{world['business']['id']}")
        counts = with_db(lambda db: purge(db, dt.timedelta(0), now=dt.datetime.utcnow() + dt.timedelta(seconds=1), dry_run=True))
        assert counts["businesses"] == 1 and counts["scenarios"] == 1 and counts["runs"] == 1 and counts["decisions"] == 1
        assert with_db(lambda db: db.query(models.Business).count()) == 1

    def test_recent_deletions_are_left_alone(self, client, world):
        client.delete(f"/businesses/{world['business']['id']}")
        counts = with_db(lambda db: purge(db, dt.timedelta(days=30), dry_run=False))
        assert counts["businesses"] == 0 and counts["runs"] == 0
        assert with_db(lambda db: db.query(models.Business).count()) == 1

    def test_things_that_are_not_deleted_are_never_touched(self, client, world):
        other = client.post("/businesses", json={"name": "Keeper"}).json()
        keep = make_scenario(client, other["id"], name="Keep me")
        run = make_run(client, other["id"], [keep["id"]])
        client.delete(f"/businesses/{world['business']['id']}")
        with_db(lambda db: purge(db, dt.timedelta(0), now=dt.datetime.utcnow() + dt.timedelta(seconds=1), dry_run=False))
        assert [b["name"] for b in client.get("/businesses").json()] == ["Keeper"]
        assert client.get(f"/simulation_runs/{run['id']}").status_code == 200
        assert client.get(f"/scenarios/{keep['id']}").status_code == 200

    def test_purging_a_scenario_keeps_the_runs_that_used_it_readable(self, client, world):
        b, s, run = world["business"], world["scenario"], world["run"]
        client.delete(f"/scenarios/{s['id']}")
        counts = with_db(lambda db: purge(db, dt.timedelta(0), now=dt.datetime.utcnow() + dt.timedelta(seconds=1), dry_run=False))
        assert counts["scenarios"] == 1 and counts["runs"] == 0
        reopened = client.get(f"/simulation_runs/{run['id']}")
        assert reopened.status_code == 200
        assert {r["scenario_name"] for r in reopened.json()["results"]} == {"baseline", "Raise prices"}
        assert [r["id"] for r in client.get(f"/businesses/{b['id']}/simulation_runs").json()] == [run["id"]]
        assert client.get(f"/businesses/{b['id']}/scenarios").json() == []

    def test_a_child_scenario_survives_the_purge_of_its_parent(self, client, world):
        b, s = world["business"], world["scenario"]
        child = make_scenario(client, b["id"], name="Child", parent_scenario_id=s["id"])
        client.delete(f"/scenarios/{s['id']}")
        with_db(lambda db: purge(db, dt.timedelta(0), now=dt.datetime.utcnow() + dt.timedelta(seconds=1), dry_run=False))
        reopened = client.get(f"/scenarios/{child['id']}")
        assert reopened.status_code == 200 and reopened.json()["parent_scenario_id"] is None
