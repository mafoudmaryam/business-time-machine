"""add coach_answers (non-blocking Ask the coach)

Revision ID: c6e2f9b4d8a1
Revises: b5d1e8a3c7f2
Create Date: 2026-10-01 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6e2f9b4d8a1'
down_revision: Union[str, Sequence[str], None] = 'b5d1e8a3c7f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'coach_answers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('simulation_run_id', sa.Integer(), sa.ForeignKey('simulation_runs.id'), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('mode', sa.String(), nullable=False),
        sa.Column('answered', sa.Boolean(), nullable=False),
        sa.Column('fallback', sa.Boolean(), nullable=False),
        sa.Column('ai_status', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('coach_answers')
