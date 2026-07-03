"""strategies

Revision ID: 002
Revises: 001
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "strategies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("ticker", sa.String(), nullable=False),
        sa.Column("buy_conditions", sa.JSON(), nullable=False),
        sa.Column("sell_conditions", sa.JSON(), nullable=False),
        sa.Column("position_size_pct", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_strategies_id"), "strategies", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_strategies_id"), table_name="strategies")
    op.drop_table("strategies")
