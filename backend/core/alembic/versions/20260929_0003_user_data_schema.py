"""Register account data, exploration, and gamification tables with Alembic.

These tables were historically created from application imports. The
check-first migration adopts that existing schema without dropping user data,
and creates the same tables for new databases.
"""

from alembic import op
import sqlalchemy as sa

from db_models import Base


revision = "20260929_0003"
down_revision = "20260928_0002"
branch_labels = None
depends_on = None


TABLE_NAMES = (
    "saved_courses",
    "excluded_places",
    "favorite_places",
    "user_interactions",
    "user_explored_regions",
    "user_gamification_profiles",
    "user_achievement_unlocks",
    "user_gamification_events",
)


def upgrade():
    """Create only absent tables; existing user records are left untouched."""
    tables = [Base.metadata.tables[name] for name in TABLE_NAMES]
    Base.metadata.create_all(bind=op.get_bind(), tables=tables, checkfirst=True)
    # Previous application starts used a different server default. Keep old
    # and newly created profiles aligned with the current model contract.
    op.alter_column(
        "user_gamification_profiles",
        "equipped_title_id",
        existing_type=sa.String(length=50),
        existing_nullable=False,
        server_default=sa.text("''"),
    )


def downgrade():
    """Keep account history when rolling back application code."""
    # This migration consolidates tables that older application starts may
    # already have created. Dropping them would erase saved courses and XP.
