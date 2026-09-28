from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# 모든 SQLAlchemy DB 모델이 공통으로 상속받을 기본 클래스
class Base(DeclarativeBase):
    pass


# users 테이블과 연결되는 SQLAlchemy 모델
class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("recovery_email", name="uq_users_recovery_email"),)

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )

    recovery_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    @property
    def recovery_email_masked(self) -> str | None:
        if not self.recovery_email or "@" not in self.recovery_email:
            return None
        local, domain = self.recovery_email.split("@", 1)
        return f"{local[:1]}{'*' * max(2, min(6, len(local) - 1))}@{domain}"

    token_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    nickname: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


class AccountRecoveryCode(Base):
    """One-time verification codes for account recovery and signup."""

    __tablename__ = "account_recovery_codes"
    __table_args__ = (
        Index("ix_recovery_target_purpose_created", "target_email", "purpose", "created_at"),
        Index("ix_recovery_ip_created", "request_ip", "created_at"),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    user_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    target_email: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    request_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    expires_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    consumed_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )


# 사용자 1명당 1행으로 공간 선호와 기본 이동수단을 저장한다.
class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    space_preference: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    transport_mode: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

# 추천에서 사용하는 활동 코드와 활성화 여부를 관리하는 기준 테이블
class ActivityCategory(Base):
    __tablename__ = "activity_categories"

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )

    code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        nullable=False,
        server_default="1",
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


# 사용자와 활동 카테고리를 연결해 활동별 1~5 선호도를 저장한다.
class UserActivityPreference(Base):
    
    __tablename__ = "user_activity_preferences"
    # 같은 사용자의 같은 활동은 한 번만 저장하고 선호도는 DB에서도 1~5로 제한한다.
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "activity_id",
            name="uq_user_activity",
        ),
        CheckConstraint(
            "preference_level BETWEEN 1 AND 5",
            name="chk_preference_level",
        ),
    )    
    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    activity_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("activity_categories.id", ondelete="RESTRICT"),
        nullable=False,
    )

    preference_level: Mapped[int] = mapped_column(
    TINYINT(unsigned=True),
    nullable=False,
)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[DateTime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


# 계정 개인화·지역 탐험·보상 데이터는 공용 metadata 아래에서 관리한다.
class SavedCourse(Base):
    __tablename__ = "saved_courses"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    area_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    course_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp())


class ExcludedPlace(Base):
    __tablename__ = "excluded_places"
    __table_args__ = (UniqueConstraint("user_id", "place_key", name="uq_excluded_place_user_key"),)

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    place_key: Mapped[str] = mapped_column(String(255), nullable=False)
    place_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp())


class FavoritePlace(Base):
    __tablename__ = "favorite_places"
    __table_args__ = (UniqueConstraint("user_id", "place_key", name="uq_favorite_place_user_key"),)

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    place_key: Mapped[str] = mapped_column(String(255), nullable=False)
    place_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    place_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp())


class UserInteraction(Base):
    __tablename__ = "user_interactions"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    place_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    place_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    context_hour: Mapped[int | None] = mapped_column(TINYINT(unsigned=True), nullable=True)
    context_day: Mapped[str | None] = mapped_column(String(12), nullable=True)
    context_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp(), index=True)


class UserExploredRegion(Base):
    __tablename__ = "user_explored_regions"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", "district_code", name="uq_explored_region_course"),
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[str] = mapped_column(String(80), nullable=False)
    district_code: Mapped[str] = mapped_column(String(5), nullable=False, index=True)
    district_name: Mapped[str] = mapped_column(String(20), nullable=False)
    place_names: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp(), index=True)


class GamificationProfile(Base):
    __tablename__ = "user_gamification_profiles"

    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    total_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    equipped_title_id: Mapped[str] = mapped_column(String(50), nullable=False, default="", server_default="")
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp(), server_onupdate=func.current_timestamp()
    )


class UserAchievementUnlock(Base):
    __tablename__ = "user_achievement_unlocks"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement_unlock"),
        Index("ix_user_achievement_unlocks_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    achievement_id: Mapped[str] = mapped_column(String(50), nullable=False)
    unlocked_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp())


class GamificationEvent(Base):
    __tablename__ = "user_gamification_events"
    __table_args__ = (
        UniqueConstraint("user_id", "event_key", name="uq_gamification_event_user_key"),
        Index("ix_gamification_event_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    event_key: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    xp_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp(), index=True)


