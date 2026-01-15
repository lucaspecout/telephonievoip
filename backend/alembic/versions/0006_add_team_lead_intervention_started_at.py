"""add intervention started at to team leads

Revision ID: 0006_add_team_lead_intervention_started_at
Revises: 0005_add_team_lead_category_id
Create Date: 2025-09-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0006_add_team_lead_intervention_started_at"
down_revision = "0005_add_team_lead_category_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "team_leads",
        sa.Column("intervention_started_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("team_leads", "intervention_started_at")
