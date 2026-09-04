from fastapi import APIRouter, HTTPException

from course_order_optimizer import optimize_course_order
from models import CourseCalculationRequest


router = APIRouter()


def calculate_course(
    request: CourseCalculationRequest,
    optimize_course_order_fn,
):
    selected_places = []
    for place in request.selected_places:
        place_data = place.model_dump()
        place_data["activity"] = place_data["category"]
        selected_places.append(place_data)

    try:
        course_result = optimize_course_order_fn(
            start_location=request.start_location.model_dump(),
            selected_places=selected_places,
            available_time_minutes=request.available_time_minutes,
            end_location=(
                request.end_location.model_dump()
                if request.end_location is not None
                else None
            ),
            transport_mode=request.transport_mode,
        )

        cleaned_optimized_places = []

        for place in course_result["optimized_places"]:
            cleaned_place = place.copy()
            cleaned_place.pop("activity", None)
            cleaned_place.pop("preferred_first", None)
            cleaned_optimized_places.append(cleaned_place)

        course_result["optimized_places"] = cleaned_optimized_places

        return course_result

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except RuntimeError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error


@router.post("/recommend/course")
def calculate_course_endpoint(
    request: CourseCalculationRequest,
):
    return calculate_course(request, optimize_course_order)
