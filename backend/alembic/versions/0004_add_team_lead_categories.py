"""add team lead categories

Revision ID: 0004
Revises: 0003
Create Date: 2024-06-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_lead_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=64), nullable=False, unique=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.execute(
        """
        INSERT INTO team_lead_categories (name, position)
        VALUES
            ('Disponible', 1),
            ('En intervention', 2),
            ('Indisponible', 3)
        """
    )


def downgrade() -> None:
    op.drop_table("team_lead_categories")
