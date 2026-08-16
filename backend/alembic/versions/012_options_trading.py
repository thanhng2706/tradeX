"""options trading fields on strategies and broker_orders

Revision ID: 012
Revises: 011
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "strategies",
        sa.Column("asset_type", sa.String(), nullable=False, server_default="equity"),
    )
    op.add_column("strategies", sa.Column("option_type", sa.String(), nullable=True))
    op.add_column("strategies", sa.Column("strike_distance_pct", sa.Float(), nullable=True))
    op.add_column("strategies", sa.Column("dte_min", sa.Integer(), nullable=True))
    op.add_column("strategies", sa.Column("dte_max", sa.Integer(), nullable=True))
    op.add_column("strategies", sa.Column("take_profit_pct", sa.Float(), nullable=True))
    op.add_column("strategies", sa.Column("stop_loss_pct", sa.Float(), nullable=True))
    op.add_column("strategies", sa.Column("max_days_held", sa.Integer(), nullable=True))

    op.add_column("broker_orders", sa.Column("contract_symbol", sa.String(), nullable=True))
    op.add_column("broker_orders", sa.Column("strike", sa.Float(), nullable=True))
    op.add_column("broker_orders", sa.Column("expiration", sa.Date(), nullable=True))
    op.add_column("broker_orders", sa.Column("option_type", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("broker_orders", "option_type")
    op.drop_column("broker_orders", "expiration")
    op.drop_column("broker_orders", "strike")
    op.drop_column("broker_orders", "contract_symbol")

    op.drop_column("strategies", "max_days_held")
    op.drop_column("strategies", "stop_loss_pct")
    op.drop_column("strategies", "take_profit_pct")
    op.drop_column("strategies", "dte_max")
    op.drop_column("strategies", "dte_min")
    op.drop_column("strategies", "strike_distance_pct")
    op.drop_column("strategies", "option_type")
    op.drop_column("strategies", "asset_type")
