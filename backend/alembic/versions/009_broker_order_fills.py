"""broker order fill status columns

Revision ID: 009
Revises: 008
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("broker_orders", sa.Column("filled_qty", sa.Float(), nullable=True))
    op.add_column("broker_orders", sa.Column("filled_avg_price", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("broker_orders", "filled_avg_price")
    op.drop_column("broker_orders", "filled_qty")
