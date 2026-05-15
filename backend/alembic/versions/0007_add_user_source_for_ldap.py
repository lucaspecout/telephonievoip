"""add user source for ldap

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_source = sa.Enum("local", "ldap", name="usersource")
    user_source.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column("source", user_source, nullable=False, server_default="local"),
    )
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_column("users", "source")
    user_source = sa.Enum("local", "ldap", name="usersource")
    user_source.drop(op.get_bind(), checkfirst=True)
