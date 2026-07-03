"""backtest events

Revision ID: 006
Revises: 005
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("backtest_results", sa.Column("events", sa.JSON(), nullable=True))
    op.add_column("backtest_results", sa.Column("events_truncated", sa.Boolean(), nullable=True, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("backtest_results", "events_truncated")
    op.drop_column("backtest_results", "events")
