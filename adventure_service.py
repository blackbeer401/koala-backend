from secrets import choice

from fastapi import HTTPException

from course_order_optimizer import optimize_course_order
from course_routes import calculate_course
from models import AdventureRequest, CourseCalculationRequest
from place_recommendation_service import recommend_places
from stay_time_validation import (
    IMPOSSIBLE_BY_STAY_TIME,
    validate_selected_places_stay_time,
)


MAX_GACHA_VALIDATION_CANDIDATES = 3


class NoAdventureCandidateError(Exception):
    """실제 방문 가능한 서울 가챠 후보가 없음."""


def recommend_single_place_gacha(
    request: AdventureRequest,
    *,
    recommend_places_fn=recommend_places,
    validate_stay_time_fn=validate_selected_places_stay_time,
    calculate_course_fn=calculate_course,
    optimize_course_order_fn=optimize_course_order,
    choice_fn=choice,
):
    area = request.area
    context = request.recommendation_context
    ranked_places = recommend_places_fn(
        area_name=area.area_name,
        latitude=area.latitude,
        longitude=area.longitude,
        activities=context.activities,
        companions=[],
        budget_max=None,
        budget_preference=None,
        space_preference=context.space_preference,
        activity_preferences=context.activity_preferences,
    )

    open_candidates = []
    unknown_candidates = []

    for place in ranked_places[:MAX_GACHA_VALIDATION_CANDIDATES]:
        stay_validation = validate_stay_time_fn(
            [{
                "activity": place["category"],
                "specified_duration_minutes": place.get(
                    "specified_duration_minutes"
                ),
            }],
            context.available_time_minutes,
        )
        if stay_validation["status"] == IMPOSSIBLE_BY_STAY_TIME:
            continue

        course_request = CourseCalculationRequest(
            start_location=context.start_location,
            selected_places=[place.copy()],
            available_time_minutes=context.available_time_minutes,
            departure_datetime=context.departure_datetime,
            end_location=context.end_location,
            transport_mode=context.transport_mode,
        )

        try:
            course_result = calculate_course_fn(
                course_request,
                optimize_course_order_fn,
            )
        except HTTPException as error:
            if error.status_code == 502:
                continue
            raise

        if course_result["status"] != "FEASIBLE":
            continue

        course_place = course_result["optimized_places"][0]
        availability = course_place["availability"]
        availability_status = availability["status"]
        if availability_status not in {"open", "unknown"}:
            continue

        candidate = {
            "place": {
                key: value
                for key, value in course_place.items()
                if key != "availability"
            },
            "availability": availability,
            "availability_confirmed": availability_status == "open",
            "course_preview": {
                key: course_result[key]
                for key in (
                    "status",
                    "total_travel_time_minutes",
                    "total_stay_time_minutes",
                    "total_required_minutes",
                    "remaining_time_minutes",
                )
            },
            "course_request": course_request.model_dump(),
        }

        if availability_status == "open":
            open_candidates.append(candidate)
        else:
            unknown_candidates.append(candidate)

    candidates = open_candidates or unknown_candidates
    if not candidates:
        raise NoAdventureCandidateError

    return choice_fn(candidates)
