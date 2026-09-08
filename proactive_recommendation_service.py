from datetime import date, datetime
from pathlib import Path

from activity_duration_policy import get_activity_duration_policy
from candidate_filter import calculate_available_stay_minutes
from map_service import get_travel
from place_availability import SEOUL_TIMEZONE, evaluate_place_availability
from popup_service import load_popup_places
from seoul_culture_service import (
    calculate_distance_m,
    get_nearby_current_seoul_culture_places,
)


POPUP_DATA_PATH = Path(__file__).resolve().parent / "data" / "20260908_popup_places.json"
MAX_DISTANCE_M = 2000
MAX_TRAVEL_CANDIDATES = 3
ENDING_SOON_DAYS = 3


def _parse_date(value):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _duration_minutes(travel):
    if not isinstance(travel, dict):
        return None

    duration = travel.get("duration_min")
    if isinstance(duration, bool) or not isinstance(duration, (int, float)):
        return None
    return duration if duration >= 0 else None


def _message(place, days_left, travel_minutes, visitable_minutes, departure_datetime):
    name = place["name"]
    now = datetime.now(SEOUL_TIMEZONE)
    future_departure = departure_datetime > now
    departure_text = departure_datetime.strftime("%H시 %M분에 출발하면")

    if days_left == 0:
        timing = departure_text if future_departure else "지금 출발하면"
        return (
            f"오늘이 마지막 날인 {name}이(가) {travel_minutes}분 거리에 있어요. "
            f"{timing} 약 {visitable_minutes}분 둘러볼 수 있는데 확인해 보실래요?"
        )

    timing = (
        f"{departure_text} 들러볼 수 있는데"
        if future_departure
        else "지금 들러볼 수 있는데"
    )
    return (
        f"{days_left}일 뒤 종료되는 {name}이(가) {travel_minutes}분 거리에 있어요. "
        f"{timing} 확인해 보실래요?"
    )


def find_proactive_suggestion(
    start_location,
    departure_datetime,
    end_location,
    end_datetime,
    transport_mode,
    *,
    load_popup_places_fn=load_popup_places,
    load_culture_places_fn=get_nearby_current_seoul_culture_places,
    get_travel_fn=get_travel,
    evaluate_availability_fn=evaluate_place_availability,
):
    """종료가 임박했고 실제로 방문 가능한 팝업·문화행사 한 곳을 찾는다."""

    latitude = float(start_location["y"])
    longitude = float(start_location["x"])
    departure_datetime = departure_datetime.astimezone(SEOUL_TIMEZONE)
    departure_date = departure_datetime.date()
    candidates = []

    try:
        popup_places = load_popup_places_fn(POPUP_DATA_PATH)
    except Exception:
        popup_places = []

    try:
        culture_places = load_culture_places_fn(
            latitude=latitude,
            longitude=longitude,
            max_distance_m=MAX_DISTANCE_M,
            reference_date=departure_date,
        )
    except Exception:
        culture_places = []

    for place in [*popup_places, *culture_places]:
        start_at = _parse_date(place.get("start_at"))
        end_at = _parse_date(place.get("end_at"))
        if (
            end_at is None
            or departure_date > end_at
            or (start_at is not None and departure_date < start_at)
            or place.get("operation_schedule_status") != "parsed"
        ):
            continue

        days_left = (end_at - departure_date).days
        if not 0 <= days_left <= ENDING_SOON_DAYS:
            continue

        try:
            distance_m = calculate_distance_m(
                latitude,
                longitude,
                place["latitude"],
                place["longitude"],
            )
        except (KeyError, TypeError, ValueError):
            continue

        if distance_m <= MAX_DISTANCE_M:
            candidates.append((days_left, distance_m, place))

    candidates.sort(key=lambda item: (item[0], item[1]))

    for days_left, _, place in candidates[:MAX_TRAVEL_CANDIDATES]:
        try:
            travel = get_travel_fn(
                longitude,
                latitude,
                place["longitude"],
                place["latitude"],
                transport_mode=transport_mode,
            )
            travel_minutes = _duration_minutes(travel)
            if travel_minutes is None:
                continue

            availability = evaluate_availability_fn(
                place,
                departure_datetime,
                travel_minutes,
            )
            if availability.get("status") != "open":
                continue

            minimum_stay = get_activity_duration_policy(
                place["category"]
            )["min"]
            remaining_minutes = availability.get("remaining_minutes")
            if remaining_minutes is None or remaining_minutes < minimum_stay:
                continue

            fits_before_next_schedule = None
            visitable_minutes = remaining_minutes

            if end_location is not None and end_datetime is not None:
                onward = get_travel_fn(
                    place["longitude"],
                    place["latitude"],
                    end_location["x"],
                    end_location["y"],
                    transport_mode=transport_mode,
                )
                onward_minutes = _duration_minutes(onward)
                if onward_minutes is None:
                    continue

                time_window_minutes = int(
                    (end_datetime - departure_datetime).total_seconds() / 60
                )
                schedule_minutes = calculate_available_stay_minutes(
                    time_window_minutes,
                    travel_minutes,
                    onward_minutes,
                )
                fits_before_next_schedule = schedule_minutes >= minimum_stay
                if not fits_before_next_schedule:
                    continue
                visitable_minutes = min(remaining_minutes, schedule_minutes)

            return {
                "place": {
                    key: place.get(key)
                    for key in (
                        "source",
                        "source_id",
                        "name",
                        "latitude",
                        "longitude",
                        "category",
                    )
                },
                "reason": "ending_today" if days_left == 0 else "ending_soon",
                "travel": {
                    "mode": travel.get("mode"),
                    "duration_min": travel_minutes,
                },
                "availability": availability,
                "visitable_minutes": visitable_minutes,
                "fits_before_next_schedule": fits_before_next_schedule,
                "message": _message(
                    place,
                    days_left,
                    travel_minutes,
                    visitable_minutes,
                    departure_datetime,
                ),
            }
        except (KeyError, TypeError, ValueError):
            continue

    return None
