"""paper trading table

Revision ID: 004
Revises: 003
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paper_trades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("strategy_id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("health_score", sa.Integer(), nullable=True),
        sa.Column("health_report", sa.Text(), nullable=True),
        sa.Column("health_checked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_paper_trades_id"), "paper_trades", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_paper_trades_id"), table_name="paper_trades")
    op.drop_table("paper_trades")
