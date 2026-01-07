"""initial

Revision ID: 0001
Revises: 
Create Date: 2024-01-07 00:00:00
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
        sa.Column("username", sa.String(length=150), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("must_change_password", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_table(
        "ovh_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("billing_account", sa.String(length=64)),
        sa.Column("service_names", sa.JSON(), default=list),
        sa.Column("app_key", sa.String(length=128)),
        sa.Column("app_secret", sa.String(length=128)),
        sa.Column("consumer_key", sa.String(length=128)),
        sa.Column("monitored_numbers", sa.JSON(), default=list),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "call_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ovh_consumption_id", sa.String(length=64), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("calling_number", sa.String(length=64)),
        sa.Column("called_number", sa.String(length=64)),
        sa.Column("duration", sa.Integer(), default=0),
        sa.Column("status", sa.String(length=40)),
        sa.Column("nature", sa.String(length=40)),
        sa.Column("is_missed", sa.Boolean(), default=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("ovh_consumption_id"),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer()),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=255)),
        sa.Column("metadata", sa.JSON(), default=dict),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("call_records")
    op.drop_table("ovh_settings")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
