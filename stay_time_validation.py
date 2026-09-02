from activity_duration_policy import (
    determine_stay_duration,
    get_activity_duration_policy,
)


IMPOSSIBLE_BY_STAY_TIME = "IMPOSSIBLE_BY_STAY_TIME"
TIGHT_BY_STAY_TIME = "TIGHT_BY_STAY_TIME"
PENDING_TRAVEL_TIME_VALIDATION = "PENDING_TRAVEL_TIME_VALIDATION"


def validate_selected_places_stay_time(
    selected_places: list[dict],
    available_time_minutes: int,
) -> dict:
    stay_durations_minutes = []
    minimum_stay_durations_minutes = []

    for place in selected_places:
        specified_duration_minutes = place.get("specified_duration_minutes")
        stay_durations_minutes.append(
            determine_stay_duration(
                place["activity"],
                specified_duration_minutes,
            )
        )
        minimum_stay_durations_minutes.append(
            specified_duration_minutes
            if specified_duration_minutes is not None
            else get_activity_duration_policy(place["activity"])["min"]
        )

    total_stay_duration_minutes = sum(stay_durations_minutes)
    total_minimum_stay_duration_minutes = sum(
        minimum_stay_durations_minutes
    )

    if total_minimum_stay_duration_minutes > available_time_minutes:
        status = IMPOSSIBLE_BY_STAY_TIME
    elif total_stay_duration_minutes > available_time_minutes:
        status = TIGHT_BY_STAY_TIME
    else:
        status = PENDING_TRAVEL_TIME_VALIDATION

    return {
        "status": status,
        "stay_durations_minutes": stay_durations_minutes,
        "minimum_stay_durations_minutes": minimum_stay_durations_minutes,
        "total_stay_duration_minutes": total_stay_duration_minutes,
        "total_minimum_stay_duration_minutes": (
            total_minimum_stay_duration_minutes
        ),
    }
