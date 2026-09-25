"""add business industry

Revision ID: 3c1a7e2f9b4d
Revises: 8b8ddf130992
Create Date: 2026-09-25 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c1a7e2f9b4d'
down_revision: Union[str, Sequence[str], None] = '8b8ddf130992'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'businesses',
        sa.Column('industry', sa.String(), nullable=False, server_default='cafe'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('businesses', 'industry')
