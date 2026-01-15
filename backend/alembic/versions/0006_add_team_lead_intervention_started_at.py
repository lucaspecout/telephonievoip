"""add intervention started at to team leads

Revision ID: 0006
Revises: 0005
Create Date: 2025-09-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "team_leads",
        sa.Column("intervention_started_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("team_leads", "intervention_started_at")
