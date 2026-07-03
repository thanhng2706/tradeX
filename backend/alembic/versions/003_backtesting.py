"""backtesting tables

Revision ID: 003
Revises: 002
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "price_data",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open", sa.Float(), nullable=True),
        sa.Column("high", sa.Float(), nullable=True),
        sa.Column("low", sa.Float(), nullable=True),
        sa.Column("close", sa.Float(), nullable=True),
        sa.Column("volume", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticker", "date", name="uq_price_data_ticker_date"),
    )
    op.create_index(op.f("ix_price_data_id"), "price_data", ["id"], unique=False)
    op.create_index(op.f("ix_price_data_ticker"), "price_data", ["ticker"], unique=False)

    op.create_table(
        "backtest_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("strategy_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("starting_balance", sa.Float(), nullable=False),
        sa.Column("final_balance", sa.Float(), nullable=True),
        sa.Column("total_return_pct", sa.Float(), nullable=True),
        sa.Column("annualized_return_pct", sa.Float(), nullable=True),
        sa.Column("sharpe_ratio", sa.Float(), nullable=True),
        sa.Column("max_drawdown_pct", sa.Float(), nullable=True),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column("num_trades", sa.Integer(), nullable=True),
        sa.Column("equity_curve", sa.JSON(), nullable=True),
        sa.Column("trades", sa.JSON(), nullable=True),
        sa.Column("ai_explanation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_backtest_results_id"), "backtest_results", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_backtest_results_id"), table_name="backtest_results")
    op.drop_table("backtest_results")
    op.drop_index(op.f("ix_price_data_ticker"), table_name="price_data")
    op.drop_index(op.f("ix_price_data_id"), table_name="price_data")
    op.drop_table("price_data")
