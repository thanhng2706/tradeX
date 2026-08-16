"""broker deployments, orders, events

Revision ID: 008
Revises: 007
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "broker_deployments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("strategy_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("started_at", sa.Date(), nullable=False),
        sa.Column("last_tick_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("strategy_id", name="uq_broker_deployments_strategy_id"),
    )
    op.create_index(op.f("ix_broker_deployments_id"), "broker_deployments", ["id"], unique=False)

    op.create_table(
        "broker_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deployment_id", sa.Integer(), nullable=False),
        sa.Column("alpaca_order_id", sa.String(), nullable=True),
        sa.Column("side", sa.String(), nullable=False),
        sa.Column("qty", sa.Float(), nullable=False),
        sa.Column("order_type", sa.String(), nullable=False, server_default="market"),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["deployment_id"], ["broker_deployments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deployment_id", "trade_date", "side", name="uq_broker_order_dedupe"),
    )
    op.create_index(op.f("ix_broker_orders_id"), "broker_orders", ["id"], unique=False)

    op.create_table(
        "broker_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deployment_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["deployment_id"], ["broker_deployments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_broker_events_id"), "broker_events", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_broker_events_id"), table_name="broker_events")
    op.drop_table("broker_events")
    op.drop_index(op.f("ix_broker_orders_id"), table_name="broker_orders")
    op.drop_table("broker_orders")
    op.drop_index(op.f("ix_broker_deployments_id"), table_name="broker_deployments")
    op.drop_table("broker_deployments")
