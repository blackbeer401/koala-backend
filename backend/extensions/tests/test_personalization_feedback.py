from models import StructuredConditions, UserInteractionCreate
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from region_recommendation_service import (
    _local_activity_match_score,
    _make_location_lookup,
    _merge_stored_preferences,
    _submit_optional_proactive,
)
from personalization_service import _levels, build_personalization_profile


def test_lower_activity_preference_reduces_recommendation_score():
    candidate = {"cafe_score": 4.0}

    neutral = _local_activity_match_score(candidate, ["cafe"], {})
    less_preferred = _local_activity_match_score(candidate, ["cafe"], {"cafe": 1})

    assert less_preferred < neutral


def test_positive_activity_preference_increases_recommendation_score():
    candidate = {"cafe_score": 4.0}

    neutral = _local_activity_match_score(candidate, ["cafe"], {})
    preferred = _local_activity_match_score(candidate, ["cafe"], {"cafe": 5})

    assert preferred > neutral


def test_like_and_dislike_are_valid_interaction_events():
    assert UserInteractionCreate(event_type="like", category="cafe").event_type == "like"
    assert UserInteractionCreate(event_type="dislike", category="cafe").event_type == "dislike"


def test_repeated_dislikes_become_a_learned_lower_preference():
    assert _levels({"cafe": -3, "food": 5}) == {"cafe": 1, "food": 5}


def test_a_single_dislike_does_not_overfit_the_profile():
    assert _levels({"cafe": -1}) == {}


def test_latest_feedback_for_a_place_replaces_older_opposite_feedback():
    now = datetime.now(timezone.utc)
    interactions = [
        SimpleNamespace(
            event_type="dislike", category="cafe", place_key="place-1",
            place_name="카페", context_hour=None, context_day=None,
            created_at=now,
        ),
        SimpleNamespace(
            event_type="like", category="cafe", place_key="place-1",
            place_name="카페", context_hour=None, context_day=None,
            created_at=now - timedelta(minutes=1),
        ),
    ]

    class FakeDB:
        @staticmethod
        def scalars(_statement):
            return iter(interactions)

    profile = build_personalization_profile(FakeDB(), user_id=1)

    assert profile["activity_preferences"] == {"cafe": 1}


def test_old_interactions_lose_influence_over_time():
    old_interaction = SimpleNamespace(
        event_type="like", category="cafe", place_key="old-place",
        place_name="오래된 카페", context_hour=None, context_day=None,
        created_at=datetime.now(timezone.utc) - timedelta(days=180),
    )

    class FakeDB:
        @staticmethod
        def scalars(_statement):
            return iter([old_interaction])

    profile = build_personalization_profile(FakeDB(), user_id=1)

    assert profile["activity_preferences"] == {}


def test_location_lookup_reuses_normalized_queries_per_request():
    location = {"name": "홍대역", "x": 127.0, "y": 37.5}
    calls = []

    def search(query):
        calls.append(query)
        return location

    lookup = _make_location_lookup(search)

    assert lookup("홍대역") is location
    assert lookup("  홍대역  ") is location
    assert calls == ["홍대역"]


def test_optional_proactive_work_returns_a_future_without_blocking():
    future = _submit_optional_proactive(lambda: "보조 추천")

    assert future is not None
    assert future.result(timeout=1) == "보조 추천"


def test_saved_likes_fill_in_when_the_user_does_not_name_an_activity():
    conditions = StructuredConditions()

    preferences = _merge_stored_preferences(
        conditions,
        {"activity_preferences": {"cafe": 5, "food": 1}},
    )

    assert conditions.activities == ["cafe"]
    assert preferences == {"cafe": 5, "food": 1}


def test_explicitly_requested_activities_override_saved_likes():
    conditions = StructuredConditions(activities=["walk"])

    _merge_stored_preferences(
        conditions,
        {"activity_preferences": {"cafe": 5}},
    )

    assert conditions.activities == ["walk"]
