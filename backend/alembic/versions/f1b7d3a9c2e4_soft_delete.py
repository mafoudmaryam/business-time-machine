"""soft delete (deleted_at) for businesses, scenarios and runs; ai_interactions keeps former ids

Revision ID: f1b7d3a9c2e4
Revises: e9a4c7b2d5f1
Create Date: 2026-10-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1b7d3a9c2e4'
down_revision: Union[str, Sequence[str], None] = 'e9a4c7b2d5f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ('businesses', 'scenarios', 'simulation_runs'):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('deleted_at', sa.DateTime(), nullable=True))
    with op.batch_alter_table('ai_interactions') as batch:
        batch.add_column(sa.Column('former_run_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('former_business_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('former_interpretation_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('ai_interactions') as batch:
        batch.drop_column('former_interpretation_id')
        batch.drop_column('former_business_id')
        batch.drop_column('former_run_id')
    for table in ('simulation_runs', 'scenarios', 'businesses'):
        with op.batch_alter_table(table) as batch:
            batch.drop_column('deleted_at')
