"""broker connections

Revision ID: 007
Revises: 006
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "broker_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("broker", sa.String(), nullable=False, server_default="alpaca"),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False),
        sa.Column("api_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("is_paper", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("alpaca_account_id", sa.String(), nullable=True),
        sa.Column("alpaca_account_number", sa.String(), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_broker_connections_user_id"),
    )
    op.create_index(op.f("ix_broker_connections_id"), "broker_connections", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_broker_connections_id"), table_name="broker_connections")
    op.drop_table("broker_connections")
