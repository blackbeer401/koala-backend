"""행동 이력을 보조 선호도로 바꾸는 작은 집계 계층.

명시적으로 저장한 선호도가 항상 우선이며, 이 모듈의 결과는 사용자가
선호를 지정하지 않은 활동을 정렬할 때만 사용한다.
"""

from collections import defaultdict
from datetime import datetime, timezone
from math import pow
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from db_models import UserInteraction


EVENT_WEIGHTS = {
    "place_view": 0.25,
    "place_select": 2.0,
    "favorite": 5.0,
    "like": 3.0,
    "dislike": -3.0,
    "hide": -5.0,
    "course_confirm": 4.0,
    "course_open": 2.0,
}
FEEDBACK_EVENTS = {"favorite", "like", "dislike", "hide"}
INTERACTION_HALF_LIFE_DAYS = 60


def day_part(hour: int) -> str:
    if hour < 11:
        return "morning"
    if hour < 15:
        return "lunch"
    if hour < 18:
        return "afternoon"
    if hour < 22:
        return "evening"
    return "night"


def _levels(scores: dict[str, float]) -> dict[str, int]:
    """강한 긍정·부정 신호만 선호도로 반영해 과학습을 막는다."""
    if not scores:
        return {}
    positive_maximum = max((score for score in scores.values() if score > 0), default=0)
    result = {}
    for activity, score in scores.items():
        if score <= -2:
            result[activity] = 1
        elif score >= 2:
            result[activity] = 5 if score >= positive_maximum * 0.75 else 4
    return result


def build_personalization_profile(db: Session, user_id: int) -> dict:
    interactions = list(
        db.scalars(
            select(UserInteraction)
            .where(UserInteraction.user_id == user_id)
            .order_by(UserInteraction.created_at.desc(), UserInteraction.id.desc())
            .limit(500)
        )
    )
    activity_scores = defaultdict(float)
    context_scores = defaultdict(lambda: defaultdict(float))
    now = datetime.now(timezone.utc)
    seen_feedback = set()
    for item in interactions:
        if not item.category:
            continue
        weight = EVENT_WEIGHTS.get(item.event_type, 0)
        if weight == 0:
            continue

        # 좋아요/싫어요/숨김은 같은 장소에서 가장 최근 선택만 사용한다.
        # 과거의 좋아요가 이후 싫어요를 상쇄하지 않게 한다.
        if item.event_type in FEEDBACK_EVENTS:
            place_identity = item.place_key or item.place_name
            if place_identity:
                feedback_key = (place_identity, item.category)
                if feedback_key in seen_feedback:
                    continue
                seen_feedback.add(feedback_key)

        # 최근 행동을 더 강하게 반영하되 시간이 지나면 영향이 자연스럽게 줄어든다.
        created_at = item.created_at
        if created_at is not None:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            age_days = max(0.0, (now - created_at.astimezone(timezone.utc)).total_seconds() / 86400)
            weight *= pow(0.5, age_days / INTERACTION_HALF_LIFE_DAYS)
        activity_scores[item.category] += weight
        if item.context_hour is not None and item.context_day:
            key = f"{item.context_day}:{day_part(item.context_hour)}"
            context_scores[key][item.category] += weight
    return {
        "activity_preferences": _levels(dict(activity_scores)),
        "context_activity_preferences": {
            key: _levels(dict(scores)) for key, scores in context_scores.items()
        },
        "interaction_count": len(interactions),
    }


def current_context_key(now: datetime | None = None) -> str:
    # 운영 서버는 UTC여도 추천 시간대는 사용자의 서비스 지역(서울)을 따른다.
    current = now or datetime.now(ZoneInfo("Asia/Seoul"))
    day = "weekend" if current.weekday() >= 5 else "weekday"
    return f"{day}:{day_part(current.hour)}"


def merge_behavior_preferences(explicit: dict | None, profile: dict) -> dict:
    """현재 시간대 행동값을 적용하되 사용자가 고른 값은 절대 덮지 않는다."""
    merged = dict(explicit or {})
    learned = dict(profile.get("activity_preferences") or {})
    learned.update(
        profile.get("context_activity_preferences", {}).get(
            current_context_key(),
            {},
        )
    )
    for activity, level in learned.items():
        merged.setdefault(activity, level)
    return merged

