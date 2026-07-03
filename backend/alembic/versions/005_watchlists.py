"""watchlists tables

Revision ID: 005
Revises: 004
Create Date: 2026-06-30 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "watchlists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_watchlists_id"), "watchlists", ["id"], unique=False)

    op.create_table(
        "watchlist_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("watchlist_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_asset"),
    )
    op.create_index(op.f("ix_watchlist_assets_id"), "watchlist_assets", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_watchlist_assets_id"), table_name="watchlist_assets")
    op.drop_table("watchlist_assets")
    op.drop_index(op.f("ix_watchlists_id"), table_name="watchlists")
    op.drop_table("watchlists")
