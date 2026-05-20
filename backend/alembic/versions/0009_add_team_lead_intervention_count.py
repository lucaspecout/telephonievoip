"""add intervention count to team leads

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "team_leads",
        sa.Column(
            "intervention_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column("team_leads", "intervention_count", server_default=None)


def downgrade() -> None:
    op.drop_column("team_leads", "intervention_count")
