"""Add verified recovery email, revocable sessions, and one-time codes."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20260928_0002"
down_revision = "20260916_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("recovery_email", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_recovery_email", "users", ["recovery_email"])
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "account_recovery_codes",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("user_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("target_email", sa.String(255), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("request_ip", sa.String(45), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(
        "ix_recovery_target_purpose_created",
        "account_recovery_codes",
        ["target_email", "purpose", "created_at"],
    )
    op.create_index(
        "ix_recovery_ip_created",
        "account_recovery_codes",
        ["request_ip", "created_at"],
    )


def downgrade():
    op.drop_index("ix_recovery_ip_created", table_name="account_recovery_codes")
    op.drop_index("ix_recovery_target_purpose_created", table_name="account_recovery_codes")
    op.drop_table("account_recovery_codes")
    op.drop_column("users", "token_version")
    op.drop_constraint("uq_users_recovery_email", "users", type_="unique")
    op.drop_column("users", "recovery_email")
