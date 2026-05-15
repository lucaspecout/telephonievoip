"""add ldap settings

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ldap_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("url", sa.String(length=255), nullable=False),
        sa.Column("bind_dn", sa.String(length=255), nullable=False),
        sa.Column("bind_password", sa.String(length=255), nullable=True),
        sa.Column("user_base_dn", sa.String(length=255), nullable=False),
        sa.Column("user_filter", sa.String(length=255), nullable=False),
        sa.Column("group_base_dn", sa.String(length=255), nullable=False),
        sa.Column("group_filter", sa.String(length=255), nullable=False),
        sa.Column("group_name_attr", sa.String(length=64), nullable=False),
        sa.Column("group_required", sa.String(length=128), nullable=False),
        sa.Column("group_role_map", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ldap_settings")
