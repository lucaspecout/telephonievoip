"""add admin phone number to ovh settings

Revision ID: 0002
Revises: 0001
Create Date: 2024-05-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ovh_settings", sa.Column("admin_phone_number", sa.String(length=64)))


def downgrade() -> None:
    op.drop_column("ovh_settings", "admin_phone_number")
