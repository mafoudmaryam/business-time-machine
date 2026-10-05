"""journal_entries: what really happened each month (one row per business per month, soft delete)

Revision ID: a2c5e8b1d4f7
Revises: f1b7d3a9c2e4
Create Date: 2026-10-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2c5e8b1d4f7'
down_revision: Union[str, Sequence[str], None] = 'f1b7d3a9c2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'journal_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.String(), nullable=False),
        sa.Column('actual_profit', sa.Float(), nullable=False),
        sa.Column('actual_cash', sa.Float(), nullable=False),
        sa.Column('actual_visits', sa.Float(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('business_id', 'month', name='uq_journal_business_month'),
    )
    op.create_index(op.f('ix_journal_entries_business_id'), 'journal_entries', ['business_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_journal_entries_business_id'), table_name='journal_entries')
    op.drop_table('journal_entries')
