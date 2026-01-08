"""initial

Revision ID: 0001
Revises: 
Create Date: 2024-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.Enum("ADMIN", "OPERATEUR", name="role"), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "ovh_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("billing_account", sa.String(length=255)),
        sa.Column("service_names", sa.String(length=1024)),
        sa.Column("app_key", sa.String(length=255)),
        sa.Column("app_secret", sa.String(length=255)),
        sa.Column("consumer_key", sa.String(length=255)),
        sa.Column("last_sync_at", sa.DateTime()),
        sa.Column("last_error", sa.String(length=1024)),
    )

    op.create_table(
        "call_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ovh_consumption_id", sa.String(length=128), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("direction", sa.Enum("INBOUND", "OUTBOUND", name="calldirection"), nullable=False),
        sa.Column("calling_number", sa.String(length=64)),
        sa.Column("called_number", sa.String(length=64)),
        sa.Column("duration", sa.Integer()),
        sa.Column("status", sa.String(length=64)),
        sa.Column("is_missed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_call_records_started_at", "call_records", ["started_at"])
    op.create_index("ix_call_records_is_missed", "call_records", ["is_missed"])
    op.create_index("ix_call_records_calling_number", "call_records", ["calling_number"])
    op.create_index("ix_call_records_called_number", "call_records", ["called_number"])
    op.create_unique_constraint("uq_call_records_ovh", "call_records", ["ovh_consumption_id"])


def downgrade() -> None:
    op.drop_table("call_records")
    op.drop_table("ovh_settings")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
