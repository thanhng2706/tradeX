"""kill switch columns on broker_connections

Revision ID: 010
Revises: 009
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "broker_connections",
        sa.Column("kill_switch_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "broker_connections",
        sa.Column("kill_switch_activated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("broker_connections", "kill_switch_activated_at")
    op.drop_column("broker_connections", "kill_switch_active")
