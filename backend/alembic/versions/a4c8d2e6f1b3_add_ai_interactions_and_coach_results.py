"""add ai_interactions and coach_results

Revision ID: a4c8d2e6f1b3
Revises: 7f2b9a1c4e6d
Create Date: 2026-09-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4c8d2e6f1b3'
down_revision: Union[str, Sequence[str], None] = '7f2b9a1c4e6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'ai_interactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('simulation_run_id', sa.Integer(), sa.ForeignKey('simulation_runs.id'), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('attempt', sa.Integer(), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('response', sa.Text(), nullable=True),
        sa.Column('prompt_tokens', sa.Integer(), nullable=True),
        sa.Column('completion_tokens', sa.Integer(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('grounding', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'coach_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('simulation_run_id', sa.Integer(), sa.ForeignKey('simulation_runs.id'), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('simulation_run_id', name='uq_coach_run'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('coach_results')
    op.drop_table('ai_interactions')
