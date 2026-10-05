"""The journal: entries (one per month, edit, soft delete + undo), the comparison with the stored Today forecast, accuracy."""
from __future__ import annotations

import datetime as dt

import pytest

from app import journal, models
from app.database import get_db
from app.main import app

ANSWERS = {"customers_per_day": 150, "avg_spend": 7, "monthly_rent": 3000, "staff": 4}
FORECAST_MADE = dt.datetime(2026, 10, 15, 9, 0)        # month 1 of this forecast = November 2026
TODAY = dt.datetime(2026, 12, 10, 9, 0)                 # the clock the journal sees in these tests


def with_db(fn):
    session = next(app.dependency_overrides[get_db]())
    try:
        return fn(session)
    finally:
        session.close()


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(journal, "now", lambda: TODAY)


def create_business(client, name="Mine", industry="cafe", sample=False):
    if sample:
        return client.post("/sample_business", json={"industry": industry, "currency": "USD"}).json()
    q = client.post(f"/industries/{industry}/quick_baseline", json=ANSWERS).json()
    resp = client.post("/businesses", json={"name": name, "industry": industry, "baseline": q["baseline"],
                                            "setup_source": "quick", "assumed_fields": q["assumed"]})
    assert resp.status_code == 201, resp.text
    return resp.json()


def forecast(client, business_id, made=FORECAST_MADE):
    """Makes the Today run (via /summary) and pretends it was made on `made`. Returns its bands."""
    assert client.get(f"/businesses/{business_id}/summary").status_code == 200

    def move(db):
        run = db.query(models.SimulationRun).filter_by(business_id=business_id, kind="today").one()
        run.created_at = made
        db.commit()
        return {m: dict(b) for m, b in next(r for r in run.results if r.scenario_name == "baseline").bands.items()}
    return with_db(move)


def entry(month="2026-11", profit=5000.0, cash=20000.0, visits=3000.0, note=None):
    return {"month": month, "actual_profit": profit, "actual_cash": cash, "actual_visits": visits, "note": note}


def save(client, business_id, **kw):
    return client.post(f"/businesses/{business_id}/journal", json=entry(**kw))


def get_journal(client, business_id):
    resp = client.get(f"/businesses/{business_id}/journal")
    assert resp.status_code == 200, resp.text
    return resp.json()


def count_rows(model=models.JournalEntry):
    return with_db(lambda db: db.query(model).count())


# ---------- saving ----------

def test_a_new_month_is_saved(client):
    b = create_business(client)
    resp = save(client, b["id"], note="Slow first week")
    assert resp.status_code == 201
    body = resp.json()["entry"]
    assert (body["month"], body["month_label"], body["actual_profit"], body["note"]) == ("2026-11", "November 2026", 5000, "Slow first week")
    assert count_rows() == 1


def test_saving_the_same_month_again_edits_it(client):
    b = create_business(client)
    save(client, b["id"], profit=100)
    resp = save(client, b["id"], profit=900, note="  fixed a typo  ")
    assert resp.status_code == 200
    assert resp.json()["entry"]["actual_profit"] == 900 and resp.json()["entry"]["note"] == "fixed a typo"
    assert count_rows() == 1


def test_put_edits_an_existing_month(client):
    b = create_business(client)
    save(client, b["id"])
    resp = client.put(f"/businesses/{b['id']}/journal/2026-11", json={"actual_profit": 1, "actual_cash": 2, "actual_visits": 3})
    assert resp.status_code == 200 and resp.json()["entry"]["actual_cash"] == 2
    assert count_rows() == 1


def test_put_for_a_month_without_an_entry_is_404(client):
    b = create_business(client)
    resp = client.put(f"/businesses/{b['id']}/journal/2026-11", json={"actual_profit": 1, "actual_cash": 2, "actual_visits": 3})
    assert resp.status_code == 404 and count_rows() == 0


def test_an_empty_note_is_stored_as_nothing(client):
    b = create_business(client)
    assert save(client, b["id"], note="   ").json()["entry"]["note"] is None


def test_a_loss_and_negative_cash_are_allowed(client):
    b = create_business(client)
    resp = save(client, b["id"], profit=-1200, cash=-300)
    assert resp.status_code == 201


@pytest.mark.parametrize("bad", [
    {"month": "2026-13"}, {"month": "2026-00"}, {"month": "26-11"}, {"month": "November"}, {"month": "2026-1"},
    {"actual_visits": -1}, {"actual_profit": 1e15}, {"actual_cash": "lots"}, {"actual_profit": None},
    {"note": "x" * 1001},
])
def test_nonsense_is_refused_and_nothing_is_saved(client, bad):
    b = create_business(client)
    resp = client.post(f"/businesses/{b['id']}/journal", json=entry() | bad)
    assert resp.status_code == 422 and count_rows() == 0


def test_not_a_number_is_refused(client):
    b = create_business(client)
    resp = client.post(f"/businesses/{b['id']}/journal", content='{"month":"2026-11","actual_profit":NaN,"actual_cash":1,"actual_visits":1}',
                       headers={"content-type": "application/json"})
    assert resp.status_code == 422 and count_rows() == 0


def test_a_missing_figure_is_refused(client):
    b = create_business(client)
    body = entry()
    del body["actual_cash"]
    assert client.post(f"/businesses/{b['id']}/journal", json=body).status_code == 422


def test_a_month_that_has_not_started_is_refused(client):
    b = create_business(client)
    assert save(client, b["id"], month="2027-01").status_code == 422
    assert save(client, b["id"], month="2026-12").status_code == 201        # the current month is allowed
    assert count_rows() == 1


def test_a_business_that_does_not_exist_is_404(client):
    assert save(client, 999).status_code == 404
    assert client.get("/businesses/999/journal").status_code == 404


def test_months_of_two_businesses_do_not_mix(client):
    a, b = create_business(client, "A"), create_business(client, "B")
    save(client, a["id"], profit=1)
    save(client, b["id"], profit=2)
    assert [e["entry"]["actual_profit"] for e in get_journal(client, a["id"])["entries"]] == [1]
    assert [e["entry"]["actual_profit"] for e in get_journal(client, b["id"])["entries"]] == [2]


# ---------- delete and undo ----------

def test_delete_hides_the_entry_and_restore_brings_it_back(client):
    b = create_business(client)
    save(client, b["id"], profit=777, note="keep me")
    resp = client.delete(f"/businesses/{b['id']}/journal/2026-11")
    assert resp.status_code == 200
    assert resp.json()["kind"] == "journal" and resp.json()["name"] == "November 2026"
    assert get_journal(client, b["id"])["entries"] == []
    assert count_rows() == 1                                                  # soft: the row is still there

    back = client.post(f"/businesses/{b['id']}/journal/2026-11/restore")
    assert back.status_code == 200
    assert back.json()["entry"]["actual_profit"] == 777 and back.json()["entry"]["note"] == "keep me"
    assert len(get_journal(client, b["id"])["entries"]) == 1


def test_deleting_twice_or_a_missing_month_is_404(client):
    b = create_business(client)
    assert client.delete(f"/businesses/{b['id']}/journal/2026-11").status_code == 404
    save(client, b["id"])
    assert client.delete(f"/businesses/{b['id']}/journal/2026-11").status_code == 200
    assert client.delete(f"/businesses/{b['id']}/journal/2026-11").status_code == 404


def test_saving_a_deleted_month_revives_the_same_row_with_the_new_figures(client):
    b = create_business(client)
    save(client, b["id"], profit=1)
    client.delete(f"/businesses/{b['id']}/journal/2026-11")
    resp = save(client, b["id"], profit=2)
    assert resp.status_code == 201 and resp.json()["entry"]["actual_profit"] == 2
    assert count_rows() == 1
    assert len(get_journal(client, b["id"])["entries"]) == 1


def test_restore_of_a_month_never_saved_is_404(client):
    b = create_business(client)
    assert client.post(f"/businesses/{b['id']}/journal/2026-11/restore").status_code == 404


def test_a_deleted_business_has_no_journal(client):
    b = create_business(client)
    save(client, b["id"])
    client.delete(f"/businesses/{b['id']}")
    assert client.get(f"/businesses/{b['id']}/journal").status_code == 404
    assert save(client, b["id"], month="2026-10").status_code == 404
    assert client.delete(f"/businesses/{b['id']}/journal/2026-11").status_code == 404
    assert client.post(f"/businesses/{b['id']}/journal/2026-11/restore").status_code == 404
    client.post(f"/businesses/{b['id']}/restore")
    assert len(get_journal(client, b["id"])["entries"]) == 1                  # and it all comes back with the business


def test_a_bad_month_in_the_address_is_refused(client):
    b = create_business(client)
    assert client.delete(f"/businesses/{b['id']}/journal/soon").status_code == 422
    assert client.put(f"/businesses/{b['id']}/journal/2026-99", json={"actual_profit": 1, "actual_cash": 2, "actual_visits": 3}).status_code == 422


# ---------- the comparison ----------

def test_the_entry_is_compared_with_the_right_month_of_the_forecast(client):
    b = create_business(client)
    bands = forecast(client, b["id"])
    nov = save(client, b["id"], month="2026-11").json()                      # month 1 of the forecast
    dec = save(client, b["id"], month="2026-12").json()                      # month 2
    for result, i in ((nov, 0), (dec, 1)):
        assert result["has_prediction"]
        by = {c["metric"]: c for c in result["comparisons"]}
        for metric in ("profit", "cash", "visits"):
            assert by[metric]["expected_low"] == bands[metric]["p10"][i]
            assert by[metric]["expected"] == bands[metric]["p50"][i]
            assert by[metric]["expected_high"] == bands[metric]["p90"][i]


def test_difference_and_position_are_plain_arithmetic(client):
    b = create_business(client)
    bands = forecast(client, b["id"])
    p10, p50, p90 = (bands["profit"][k][0] for k in ("p10", "p50", "p90"))
    cases = [(p50 + 1, "inside"), (p10 - 5, "below"), (p90 + 5, "above"), (p10, "inside"), (p90, "inside")]
    for actual, position in cases:
        c = save(client, b["id"], profit=actual).json()["comparisons"][0]
        assert c["metric"] == "profit" and c["position"] == position
        assert c["difference"] == pytest.approx(actual - p50)
        if p50:
            assert c["percent_difference"] == pytest.approx(100 * (actual - p50) / abs(p50))


def test_a_month_before_any_forecast_is_saved_but_not_compared(client):
    b = create_business(client)
    forecast(client, b["id"])
    body = save(client, b["id"], month="2026-10").json()             # the forecast was made in October: it starts in November
    assert body["has_prediction"] is False and body["comparisons"] == []
    assert "no forecast" in body["summary"] and "October 2026" in body["summary"]


def test_a_business_with_no_forecast_at_all_is_saved_but_not_compared(client):
    b = create_business(client)
    body = save(client, b["id"]).json()
    assert body["has_prediction"] is False and body["comparisons"] == []


def test_a_forecast_made_during_the_month_is_not_used_for_that_month(client):
    b = create_business(client)
    forecast(client, b["id"], made=dt.datetime(2026, 11, 20))        # made in November: month 1 = December
    assert save(client, b["id"], month="2026-11").json()["has_prediction"] is False
    assert save(client, b["id"], month="2026-12").json()["has_prediction"] is True


def test_the_latest_forecast_made_before_the_month_wins(client):
    b = create_business(client)
    first = forecast(client, b["id"], made=dt.datetime(2026, 9, 15))          # covers Oct.. Sep next year
    # a newer forecast (the owner changed a number) made in October
    client.patch(f"/businesses/{b['id']}/baseline", json={"fixed_costs": 99999})
    client.get(f"/businesses/{b['id']}/summary")

    def age(db):
        runs = db.query(models.SimulationRun).filter_by(business_id=b["id"], kind="today").order_by(models.SimulationRun.id).all()
        assert len(runs) == 2
        runs[0].created_at = dt.datetime(2026, 9, 15)
        runs[1].created_at = dt.datetime(2026, 10, 15)
        db.commit()
        return runs[1].id
    newer_id = with_db(age)
    body = save(client, b["id"], month="2026-11").json()
    assert body["prediction_run_id"] == newer_id


def test_the_forecast_horizon_ends_after_twelve_months(client, monkeypatch):
    b = create_business(client)
    forecast(client, b["id"])
    monkeypatch.setattr(journal, "now", lambda: dt.datetime(2027, 12, 10))
    assert save(client, b["id"], month="2027-10").json()["has_prediction"] is True      # month 12
    assert save(client, b["id"], month="2027-11").json()["has_prediction"] is False     # month 13: not forecast


def test_sentences_use_the_businesss_currency_and_plain_words(client):
    q = client.post("/industries/cafe/quick_baseline", json=ANSWERS).json()
    b = client.post("/businesses", json={"name": "Euro", "industry": "cafe", "currency": "EUR", "baseline": q["baseline"],
                                         "setup_source": "quick", "assumed_fields": q["assumed"]}).json()
    forecast(client, b["id"])
    body = save(client, b["id"], profit=5900, cash=20000, visits=3000).json()
    profit = body["comparisons"][0]["sentence"]
    assert profit.startswith("You made about €5,900. We expected ") and "most likely" in profit
    assert any(w in profit for w in ("inside the range we showed", "below the range", "better than the range"))
    assert "$" not in profit
    visits = next(c for c in body["comparisons"] if c["metric"] == "visits")["sentence"]
    assert "customer visits" in visits
    loss = save(client, b["id"], profit=-300).json()["comparisons"][0]["sentence"]
    assert loss.startswith("You lost about €300.")
    assert body["summary"] == profit


def test_the_comparison_never_calls_the_coach_or_the_ai(client, monkeypatch):
    from app.coach import service
    b = create_business(client)
    forecast(client, b["id"])
    calls = []
    for name in ("start_ask", "start_coach", "generate"):
        if hasattr(service, name):
            monkeypatch.setattr(service, name, lambda *a, **k: calls.append(name))
    save(client, b["id"])
    get_journal(client, b["id"])
    assert calls == []
    assert with_db(lambda db: db.query(models.AiInteraction).count()) == 0


def test_reading_the_journal_changes_nothing(client):
    b = create_business(client)
    forecast(client, b["id"])
    save(client, b["id"])
    before = (count_rows(), with_db(lambda db: db.query(models.SimulationRun).count()))
    get_journal(client, b["id"])
    get_journal(client, b["id"])
    assert (count_rows(), with_db(lambda db: db.query(models.SimulationRun).count())) == before


def test_the_journal_does_not_start_a_forecast(client):
    b = create_business(client)
    get_journal(client, b["id"])
    assert with_db(lambda db: db.query(models.SimulationRun).count()) == 0


# ---------- "How did X really go?" ----------

def test_ended_months_with_a_forecast_and_no_entry_are_due(client):
    b = create_business(client)
    forecast(client, b["id"])
    due = get_journal(client, b["id"])["due"]
    assert [d["month"] for d in due] == ["2026-11"]                      # October has no forecast, December has not ended
    assert due[0]["month_label"] == "November 2026"


def test_a_month_that_has_an_entry_or_was_removed_is_not_due(client):
    b = create_business(client)
    forecast(client, b["id"])
    save(client, b["id"], month="2026-11")
    assert get_journal(client, b["id"])["due"] == []
    client.delete(f"/businesses/{b['id']}/journal/2026-11")
    assert get_journal(client, b["id"])["due"] == []                     # removed on purpose: do not nag


def test_months_before_the_business_existed_are_not_due(client):
    b = create_business(client)
    forecast(client, b["id"])

    def born_later(db):
        db.get(models.Business, b["id"]).created_at = dt.datetime(2026, 12, 1)
        db.commit()
    with_db(born_later)
    assert get_journal(client, b["id"])["due"] == []


# ---------- accuracy ----------

def test_the_journal_summarises_how_the_ranges_did(client):
    b = create_business(client)
    bands = forecast(client, b["id"])
    save(client, b["id"], month="2026-11", profit=bands["profit"]["p50"][0])
    save(client, b["id"], month="2026-12", profit=bands["profit"]["p90"][1] + 100)
    acc = {a["metric"]: a for a in get_journal(client, b["id"])["accuracy"]}
    assert acc["profit"]["months"] == 2 and acc["profit"]["inside"] == 1 and acc["profit"]["above"] == 1


def test_no_summary_until_something_was_compared(client):
    b = create_business(client)
    save(client, b["id"], month="2026-10")
    assert get_journal(client, b["id"])["accuracy"] == []


def test_the_accuracy_report_lists_every_compared_month_with_its_seed(client):
    b = create_business(client)
    forecast(client, b["id"])
    save(client, b["id"], month="2026-11")
    save(client, b["id"], month="2026-10")                                # not compared: left out
    report = client.get("/journal/accuracy").json()
    assert report["pilot"] is True
    assert {(r["month"], r["metric"]) for r in report["rows"]} == {("2026-11", "profit"), ("2026-11", "cash"), ("2026-11", "visits")}
    row = report["rows"][0]
    assert row["seed"] == 1000 + b["id"] and row["iterations"] == 1000 and row["engine_version"]
    assert {t["metric"] for t in report["totals"]} == {"profit", "cash", "visits"}


def test_the_accuracy_report_skips_samples_deleted_entries_and_deleted_businesses(client):
    real = create_business(client, "Real")
    sample = create_business(client, sample=True)
    gone = create_business(client, "Gone")
    for b in (real, sample, gone):
        forecast(client, b["id"])
        save(client, b["id"])
    save(client, real["id"], month="2026-12")
    client.delete(f"/businesses/{real['id']}/journal/2026-12")
    client.delete(f"/businesses/{gone['id']}")
    rows = client.get("/journal/accuracy").json()["rows"]
    assert {(r["business_id"], r["month"]) for r in rows} == {(real["id"], "2026-11")}
    with_samples = client.get("/journal/accuracy", params={"include_samples": "true"}).json()["rows"]
    assert sample["id"] in {r["business_id"] for r in with_samples}


def test_an_empty_accuracy_report(client):
    assert client.get("/journal/accuracy").json() == {"pilot": True, "rows": [], "totals": []}


# ---------- purge ----------

def test_purge_removes_journal_entries_of_a_purged_business(client):
    from app.purge import purge
    b = create_business(client)
    save(client, b["id"])
    client.delete(f"/businesses/{b['id']}")
    later = dt.datetime.utcnow() + dt.timedelta(seconds=1)
    assert with_db(lambda db: purge(db, dt.timedelta(0), now=later, dry_run=True))["journal_entries"] == 1
    assert count_rows() == 1                                                  # a dry run changes nothing
    with_db(lambda db: purge(db, dt.timedelta(0), now=later, dry_run=False))
    assert count_rows() == 0


def test_purge_removes_an_entry_deleted_long_ago_but_keeps_recent_ones_and_live_ones(client):
    from app.purge import purge
    b = create_business(client)
    save(client, b["id"], month="2026-09")
    save(client, b["id"], month="2026-10")
    save(client, b["id"], month="2026-11")
    client.delete(f"/businesses/{b['id']}/journal/2026-09")
    client.delete(f"/businesses/{b['id']}/journal/2026-10")

    def age(db):
        db.query(models.JournalEntry).filter_by(month="2026-09").one().deleted_at = dt.datetime.utcnow() - dt.timedelta(days=60)
        db.commit()
    with_db(age)
    with_db(lambda db: purge(db, dt.timedelta(days=30), dry_run=False))
    left = with_db(lambda db: sorted(r.month for r in db.query(models.JournalEntry)))
    assert left == ["2026-10", "2026-11"]


# ---------- the forecast for the chart ----------

def test_the_journal_carries_the_twelve_month_forecast_for_the_chart(client):
    b = create_business(client)
    bands = forecast(client, b["id"])
    f = get_journal(client, b["id"])["forecast"]
    assert len(f["months"]) == 12
    assert [m["month"] for m in f["months"]][:3] == ["2026-11", "2026-12", "2027-01"]
    assert f["months"][0]["month_label"] == "November 2026"
    assert f["months"][1]["p50"] == bands["profit"]["p50"][1]
    assert f["months"][-1]["month"] == "2027-10"


def test_no_forecast_in_the_journal_when_none_was_made_and_none_is_started(client):
    b = create_business(client)
    assert get_journal(client, b["id"])["forecast"] is None
    assert with_db(lambda db: db.query(models.SimulationRun).count()) == 0


def test_the_chart_reaches_back_to_a_month_judged_by_an_older_forecast(client):
    b = create_business(client)
    older = forecast(client, b["id"], made=dt.datetime(2026, 9, 15))             # covers Oct 2026 .. Sep 2027
    client.patch(f"/businesses/{b['id']}/baseline", json={"fixed_costs": 99999})
    client.get(f"/businesses/{b['id']}/summary")                                  # a newer run (real clock month)

    def age(db):
        runs = db.query(models.SimulationRun).filter_by(business_id=b["id"], kind="today").order_by(models.SimulationRun.id).all()
        runs[0].created_at = dt.datetime(2026, 9, 15)
        runs[1].created_at = dt.datetime(2026, 11, 15)                            # covers Dec 2026 .. Nov 2027
        db.commit()
    with_db(age)
    save(client, b["id"], month="2026-11")                                        # judged by the September forecast
    months = get_journal(client, b["id"])["forecast"]["months"]
    keys = [m["month"] for m in months]
    assert keys[0] == "2026-11" and keys[-1] == "2027-11"
    assert keys == sorted(keys) and len(keys) == len(set(keys))
    assert months[0]["p50"] == older["profit"]["p50"][1]                          # Nov = month 2 of the September run
    assert months[1]["month"] == "2026-12"
