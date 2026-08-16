"""add benchmark_equity_curve/benchmark_return_pct to backtest_results

Revision ID: 014
Revises: 013
Create Date: 2026-08-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("backtest_results", sa.Column("benchmark_equity_curve", sa.JSON(), nullable=True))
    op.add_column("backtest_results", sa.Column("benchmark_return_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("backtest_results", "benchmark_return_pct")
    op.drop_column("backtest_results", "benchmark_equity_curve")
