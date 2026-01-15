"""add category id to team leads

Revision ID: 0005
Revises: 0004
Create Date: 2024-06-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("team_leads", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_team_leads_category_id",
        "team_leads",
        "team_lead_categories",
        ["category_id"],
        ["id"],
    )
    op.execute(
        """
        UPDATE team_leads
        SET category_id = (
            SELECT id FROM team_lead_categories
            WHERE team_lead_categories.name = team_leads.status
        )
        WHERE category_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_team_leads_category_id", "team_leads", type_="foreignkey")
    op.drop_column("team_leads", "category_id")
