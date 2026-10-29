"""Extend existing journal actuals; freeze available historical comparison figures.

Historical records retain their figures. The original choice was not stored, so
legacy snapshots explicitly say they capture the eligible plan available at upgrade.
"""
import datetime as dt
import json
from alembic import op
import sqlalchemy as sa

revision = 'c4f8a2d6e0b1'
down_revision = 'b3d7f1a9c5e2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('journal_entries') as batch:
        for name in ('actual_profit', 'actual_cash', 'actual_visits'):
            batch.alter_column(name, existing_type=sa.Float(), nullable=True)
        batch.add_column(sa.Column('actual_sales', sa.Float(), nullable=True))
        batch.add_column(sa.Column('actual_costs', sa.Float(), nullable=True))
        batch.add_column(sa.Column('costs_complete', sa.Boolean(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('comparison_snapshot', sa.JSON(), nullable=True))
        batch.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
    bind = op.get_bind()
    entries = bind.execute(sa.text('SELECT j.id, j.business_id, j.month, b.currency FROM journal_entries j JOIN businesses b ON b.id=j.business_id')).mappings().all()
    for entry in entries:
        snap = dict(version=1, month=entry['month'], currency=entry['currency'], source='legacy_upgrade', available=False, bands={})
        year, month = map(int, entry['month'].split('-'))
        runs = bind.execute(sa.text("SELECT * FROM simulation_runs WHERE business_id=:b AND kind='today' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC"), {'b': entry['business_id']}).mappings()
        for run in runs:
            made = run['created_at'] if isinstance(run['created_at'], dt.datetime) else dt.datetime.fromisoformat(run['created_at'])
            idx = (year-made.year)*12+month-made.month
            if not 1 <= idx <= run['horizon']:
                continue
            raw = bind.execute(sa.text("SELECT bands FROM simulation_results WHERE simulation_run_id=:r AND scenario_name='baseline'"), {'r': run['id']}).scalar()
            bands = json.loads(raw) if isinstance(raw, str) else raw
            if bands:
                for metric in ('profit', 'cash', 'visits', 'revenue'):
                    band = bands.get(metric, {})
                    if all(len(band.get(k, [])) >= idx for k in ('p10', 'p50', 'p90')):
                        snap['bands'][metric] = {k: band[k][idx-1] for k in ('p10', 'p50', 'p90')}
                snap.update(available=bool(snap['bands']), run_id=run['id'], made_at=made.isoformat(), name='Overview plan — changing nothing', engine_version=run['engine_version'], seed=run['seed'], iterations=run['iterations'])
            break
        bind.execute(sa.text('UPDATE journal_entries SET comparison_snapshot=:s WHERE id=:i'), {'s': json.dumps(snap), 'i': entry['id']})


def downgrade():
    bind = op.get_bind()
    count = bind.execute(sa.text('SELECT count(*) FROM journal_entries WHERE actual_sales IS NOT NULL OR actual_costs IS NOT NULL OR actual_profit IS NULL OR actual_cash IS NULL OR actual_visits IS NULL')).scalar()
    if count:
        raise RuntimeError('Export and retain the extended journal records before downgrading; the old schema cannot represent them.')
    with op.batch_alter_table('journal_entries') as batch:
        for name in ('actual_sales', 'actual_costs', 'costs_complete', 'comparison_snapshot', 'updated_at'):
            batch.drop_column(name)
        for name in ('actual_profit', 'actual_cash', 'actual_visits'):
            batch.alter_column(name, existing_type=sa.Float(), nullable=False)
