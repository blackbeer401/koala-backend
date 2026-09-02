from activity_duration_policy import determine_stay_duration


IMPOSSIBLE_BY_STAY_TIME = "IMPOSSIBLE_BY_STAY_TIME"
PENDING_TRAVEL_TIME_VALIDATION = "PENDING_TRAVEL_TIME_VALIDATION"


def validate_selected_places_stay_time(
    selected_places: list[dict],
    available_time_minutes: int,
) -> dict:
    stay_durations_minutes = [
        determine_stay_duration(
            place["activity"],
            place.get("specified_duration_minutes"),
        )
        for place in selected_places
    ]
    total_stay_duration_minutes = sum(stay_durations_minutes)

    return {
        "status": (
            IMPOSSIBLE_BY_STAY_TIME
            if total_stay_duration_minutes > available_time_minutes
            else PENDING_TRAVEL_TIME_VALIDATION
        ),
        "stay_durations_minutes": stay_durations_minutes,
        "total_stay_duration_minutes": total_stay_duration_minutes,
    }
