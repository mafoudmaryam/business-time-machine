"""The existing journal remains the sole monthly store."""
import datetime as dt
import pytest
from app import models
from tests.test_journal import create_business, forecast, with_db, get_journal, fixed_clock


def post(client, bid, **data):
    return client.post(f'/businesses/{bid}/journal', json={'month':'2026-11', **data})


def test_complete_costs_derive_profit_and_compare_same_calendar_month(client):
    b=create_business(client); bands=forecast(client,b['id'])
    out=post(client,b['id'],actual_sales=10000,actual_costs=7000,costs_complete=True).json()
    assert out['entry']['actual_profit']==3000
    assert out['entry']['actual_cash'] is None
    comps={c['metric']:c for c in out['comparisons']}
    assert set(comps)=={'profit','revenue'}
    assert comps['revenue']['expected']==bands['revenue']['p50'][0]
    assert comps['profit']['expected']==bands['profit']['p50'][0]
    assert comps['profit']['difference']==3000-bands['profit']['p50'][0]


@pytest.mark.parametrize('data,remaining', [({'actual_sales':100,'actual_costs':60},40),({'actual_sales':0,'actual_costs':60},-60),({'actual_sales':0},None),({'actual_costs':0},None)])
def test_incomplete_figures_are_saved_without_fabricated_profit(client,data,remaining):
    b=create_business(client)
    out=post(client,b['id'],**data).json()
    assert out['entry']['actual_profit'] is None
    assert out['entry']['recorded_remaining']==remaining
    assert out['entry']['actual_cash'] is None
    assert out['entry']['actual_visits'] is None


@pytest.mark.parametrize('sales,costs,expected', [(0,0,0),(20,30,-10),(.3,.2,.1)])
def test_zero_loss_and_decimal_results(client,sales,costs,expected):
    b=create_business(client)
    out=post(client,b['id'],actual_sales=sales,actual_costs=costs,costs_complete=True).json()
    assert out['entry']['actual_profit']==expected


@pytest.mark.parametrize('data', [{},{'note':'unknown'},{'actual_sales':-1},{'actual_costs':-2},{'actual_sales':1e13},{'actual_costs':'lots'},{'actual_sales':10,'costs_complete':True},{'actual_sales':10,'actual_profit':1}])
def test_invalid_or_empty_entry_does_not_create_a_record(client,data):
    b=create_business(client)
    assert post(client,b['id'],**data).status_code==422
    assert get_journal(client,b['id'])['entries']==[]


def test_snapshot_survives_correction_plan_changes_currency_changes_and_delete_restore(client):
    b=create_business(client); forecast(client,b['id'])
    first=post(client,b['id'],actual_sales=10,actual_costs=20,costs_complete=True).json()
    snap=first['comparison_plan']
    def change(db):
        run=db.get(models.SimulationRun,snap['run_id'])
        for result in run.results: result.bands={}
        run.deleted_at=dt.datetime(2026,12,1)
        db.get(models.Business,b['id']).currency='EUR'
        db.commit()
    with_db(change)
    second=post(client,b['id'],actual_sales=30,actual_costs=20,costs_complete=True).json()
    assert second['entry']['id']==first['entry']['id']
    assert second['comparison_plan']==snap and second['currency']=='USD'
    assert second['entry']['actual_profit']==10
    assert second['comparisons'][0]['expected']==first['comparisons'][0]['expected']
    client.delete(f"/businesses/{b['id']}/journal/2026-11")
    restored=client.post(f"/businesses/{b['id']}/journal/2026-11/restore").json()
    assert restored['comparison_plan']==snap
    assert client.get('/journal/accuracy').status_code==200


def test_missing_prediction_stays_missing_after_a_backdated_plan_is_added(client):
    b=create_business(client)
    first=post(client,b['id'],actual_sales=100).json()
    assert not first['has_prediction']
    forecast(client,b['id'])
    later=get_journal(client,b['id'])['entries'][0]
    assert later['comparison_plan']==first['comparison_plan']
    assert not later['has_prediction'] and later['comparisons']==[]


def test_missing_months_are_not_created_and_no_simulation_is_started(client):
    b=create_business(client)
    post(client,b['id'],actual_sales=100)
    def counts(db): return db.query(models.JournalEntry).count(),db.query(models.SimulationRun).count()
    assert with_db(counts)==(1,0)
    assert [m['entry']['month'] for m in get_journal(client,b['id'])['entries']]==['2026-11']


def test_chart_uses_frozen_profit_band_not_mutated_plan(client):
    b=create_business(client); forecast(client,b['id'])
    out=post(client,b['id'],actual_sales=100,actual_costs=50,costs_complete=True).json()
    original=out['comparison_plan']['bands']['profit']
    def mutate(db):
        run=db.get(models.SimulationRun,out['prediction_run_id'])
        result=run.results[0]; bands=dict(result.bands); bands['profit']={k:[999]*12 for k in ('p10','p50','p90')}; result.bands=bands; db.commit()
    with_db(mutate)
    chart=get_journal(client,b['id'])['forecast']['months'][0]
    assert {k:chart[k] for k in original}==original


def test_older_client_cannot_silently_erase_extended_record(client):
    b=create_business(client)
    first=post(client,b['id'],actual_sales=100,actual_costs=60,costs_complete=True).json()
    response=post(client,b['id'],actual_profit=50,actual_cash=20,actual_visits=4)
    assert response.status_code==422
    assert get_journal(client,b['id'])['entries'][0]['entry']==first['entry']
