"""add interpretations; ai_interactions can belong to a business instead of a run

Revision ID: b5d1e8a3c7f2
Revises: a4c8d2e6f1b3
Create Date: 2026-09-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5d1e8a3c7f2'
down_revision: Union[str, Sequence[str], None] = 'a4c8d2e6f1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'interpretations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('business_id', sa.Integer(), sa.ForeignKey('businesses.id'), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('fallback', sa.Boolean(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    # SQLite cannot change a column's NOT NULL in place, so alembic rebuilds the table in batch mode.
    with op.batch_alter_table('ai_interactions') as batch:
        batch.alter_column('simulation_run_id', existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column('business_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('interpretation_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('input_text', sa.Text(), nullable=True))
        batch.create_foreign_key('fk_ai_business', 'businesses', ['business_id'], ['id'])
        batch.create_foreign_key('fk_ai_interpretation', 'interpretations', ['interpretation_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('ai_interactions') as batch:
        batch.drop_constraint('fk_ai_interpretation', type_='foreignkey')
        batch.drop_constraint('fk_ai_business', type_='foreignkey')
        batch.drop_column('input_text')
        batch.drop_column('interpretation_id')
        batch.drop_column('business_id')
        batch.alter_column('simulation_run_id', existing_type=sa.Integer(), nullable=False)
    op.drop_table('interpretations')
