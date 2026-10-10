"""startup_plans: answers of the "I don't have a business yet" guide (soft delete, optional link to a practice business)

Revision ID: b3d7f1a9c5e2
Revises: a2c5e8b1d4f7
Create Date: 2026-10-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d7f1a9c5e2'
down_revision: Union[str, Sequence[str], None] = 'a2c5e8b1d4f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'startup_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('country', sa.String(), nullable=False),
        sa.Column('business_type', sa.String(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('data_version', sa.String(), nullable=False),
        sa.Column('engine_version', sa.String(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_startup_plans_business_id'), 'startup_plans', ['business_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_startup_plans_business_id'), table_name='startup_plans')
    op.drop_table('startup_plans')
