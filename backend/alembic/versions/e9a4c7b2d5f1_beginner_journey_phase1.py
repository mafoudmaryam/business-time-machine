"""beginner journey phase 1: quick start, Today note, ui events, study-ready columns

Revision ID: e9a4c7b2d5f1
Revises: d8f3a1c5e9b7
Create Date: 2026-10-03 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9a4c7b2d5f1'
down_revision: Union[str, Sequence[str], None] = 'd8f3a1c5e9b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('businesses') as batch:
        batch.add_column(sa.Column('setup_source', sa.String(), nullable=False, server_default='full'))
        batch.add_column(sa.Column('is_sample', sa.Boolean(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('participant_code', sa.String(), nullable=True))
        batch.add_column(sa.Column('study_condition', sa.String(), nullable=True))
        batch.create_index('ix_businesses_participant_code', ['participant_code'])
    with op.batch_alter_table('business_snapshots') as batch:
        batch.add_column(sa.Column('assumed_fields', sa.JSON(), nullable=True))
    with op.batch_alter_table('simulation_runs') as batch:
        batch.add_column(sa.Column('kind', sa.String(), nullable=False, server_default='compare'))
    op.create_table(
        'today_notes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('simulation_run_id', sa.Integer(), sa.ForeignKey('simulation_runs.id'), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('simulation_run_id', name='uq_today_note_run'),
    )
    op.create_table(
        'ui_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('business_id', sa.Integer(), sa.ForeignKey('businesses.id'), nullable=True),
        sa.Column('participant_code', sa.String(), nullable=True),
        sa.Column('screen', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
    )
    op.create_index('ix_ui_events_created_at', 'ui_events', ['created_at'])
    op.create_index('ix_ui_events_session_id', 'ui_events', ['session_id'])
    op.create_index('ix_ui_events_business_id', 'ui_events', ['business_id'])
    op.create_index('ix_ui_events_name', 'ui_events', ['name'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('ui_events')
    op.drop_table('today_notes')
    with op.batch_alter_table('simulation_runs') as batch:
        batch.drop_column('kind')
    with op.batch_alter_table('business_snapshots') as batch:
        batch.drop_column('assumed_fields')
    with op.batch_alter_table('businesses') as batch:
        batch.drop_index('ix_businesses_participant_code')
        batch.drop_column('study_condition')
        batch.drop_column('participant_code')
        batch.drop_column('is_sample')
        batch.drop_column('setup_source')
