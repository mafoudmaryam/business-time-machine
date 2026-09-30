"""add decisions.confirmed_via (how the owner confirmed a decision)

Revision ID: d8f3a1c5e9b7
Revises: c6e2f9b4d8a1
Create Date: 2026-10-01 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f3a1c5e9b7'
down_revision: Union[str, Sequence[str], None] = 'c6e2f9b4d8a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('decisions') as batch:
        batch.add_column(sa.Column('confirmed_via', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('decisions') as batch:
        batch.drop_column('confirmed_via')
