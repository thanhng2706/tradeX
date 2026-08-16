"""move last_notifications_seen_at from broker_connections to users

Revision ID: 013
Revises: 012
Create Date: 2026-08-05 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_notifications_seen_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE users
        SET last_notifications_seen_at = broker_connections.last_notifications_seen_at
        FROM broker_connections
        WHERE broker_connections.user_id = users.id
        """
    )
    op.drop_column("broker_connections", "last_notifications_seen_at")


def downgrade() -> None:
    op.add_column("broker_connections", sa.Column("last_notifications_seen_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE broker_connections
        SET last_notifications_seen_at = users.last_notifications_seen_at
        FROM users
        WHERE broker_connections.user_id = users.id
        """
    )
    op.drop_column("users", "last_notifications_seen_at")
