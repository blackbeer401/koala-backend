from datetime import datetime
from zoneinfo import ZoneInfo

from conditions import extract_explicit_duration_minutes
from conditions import resolve_datetimes, resolve_end_time, resolve_start_time
from models import StructuredConditions


SEOUL = ZoneInfo("Asia/Seoul")


def test_availability_is_not_recovered_as_desired_duration():
    assert extract_explicit_duration_minutes(
        "홍대역인데 2시간 비어 카페가고싶어"
    ) is None


def test_desired_activity_duration_is_recovered():
    assert extract_explicit_duration_minutes(
        "홍대역에서 2시간 놀고 싶어"
    ) == 120


def test_relative_clock_duration_is_not_recovered_as_activity_duration():
    assert extract_explicit_duration_minutes(
        "2시간 뒤에 약속 장소로 가야 해"
    ) is None


def test_start_period_is_used_as_the_recommendation_start():
    now = datetime(2026, 9, 27, 10, 0, tzinfo=SEOUL)
    resolved = resolve_start_time(
        StructuredConditions(start_time_period="evening"),
        current_datetime=now,
    )

    assert resolved == {"source": "period", "start_time": "18:00"}


def test_end_period_uses_its_upcoming_boundary():
    now = datetime(2026, 9, 27, 16, 0, tzinfo=SEOUL)
    resolved = resolve_end_time(
        StructuredConditions(end_time_period="evening"),
        current_datetime=now,
    )

    assert resolved == {"source": "period", "end_time": "18:00"}


def test_end_period_during_window_uses_window_end_without_next_day_rollover():
    now = datetime(2026, 9, 27, 19, 0, tzinfo=SEOUL)
    conditions = StructuredConditions(end_time_period="pm")
    start = resolve_start_time(conditions, current_datetime=now)
    end = resolve_end_time(conditions, current_datetime=now)
    resolved = resolve_datetimes(start, end, current_datetime=now)

    assert end == {"source": "period", "end_time": "22:00"}
    assert resolved["end_datetime"].date() == now.date()
    assert resolved["end_datetime"].hour == 22


def test_explicit_end_time_takes_precedence_over_end_period():
    resolved = resolve_end_time(
        StructuredConditions(end_time="20:30", end_time_period="evening"),
        current_datetime=datetime(2026, 9, 27, 16, 0, tzinfo=SEOUL),
    )

    assert resolved == {"source": "text", "end_time": "20:30"}


def test_end_period_that_has_passed_does_not_create_tomorrows_time_window():
    now = datetime(2026, 9, 27, 16, 0, tzinfo=SEOUL)
    resolved = resolve_end_time(
        StructuredConditions(end_time_period="lunch"),
        current_datetime=now,
    )

    assert resolved == {"source": "period_passed_today", "end_time": None}
