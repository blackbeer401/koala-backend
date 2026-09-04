from fastapi import FastAPI, HTTPException
from auth_routes import router as auth_router
from course_routes import (
    calculate_course as calculate_course_route,
    router as course_router,
)

from place_recommendation_service import recommend_places
from region_recommendation_service import recommend_regions
from place_recommendation_cache import (
    PlaceCursorExpiredError,
    PlaceCursorNotFoundError,
    create_place_recommendation_page,
    get_next_place_recommendation_page,
)

from models import (
    RecommendRequest,
    PlaceRecommendRequest,
    PlaceRecommendMoreRequest,
    PlaceSelectionValidationRequest,
    CourseCalculationRequest,
)

from llm_service import (
    parse_user_intent,
    generate_recommendation_message,
)

from map_service import (
    search_location,
    get_travel,
)

from poi import load_poi_candidates

from activity_score import load_poi_activity_scores

from congestion_service import get_congestion_data

from stay_time_validation import (
    validate_selected_places_stay_time,
    calculate_estimated_route_travel_minutes,
)

from course_order_optimizer import optimize_course_order


# 1. FastAPI 앱 생성
app = FastAPI()
app.include_router(auth_router)
app.include_router(course_router)


# 2. 서버 기본 동작 확인
@app.get("/")
def root():
    return {
        "message": "KOALA backend"
    }


# 3. 서울 121개 POI 데이터 로드 테스트
@app.get("/test-poi")
def test_poi():

    candidates = load_poi_candidates()

    return {
        "candidate_count": len(candidates),
        "candidates": candidates
    }


# 4. 지역 추천 API
@app.post("/recommend")
def recommend(request: RecommendRequest):
    return recommend_regions(
        request,
        parse_user_intent_fn=parse_user_intent,
        generate_recommendation_message_fn=generate_recommendation_message,
        search_location_fn=search_location,
        get_travel_fn=get_travel,
        load_poi_candidates_fn=load_poi_candidates,
        load_poi_activity_scores_fn=load_poi_activity_scores,
        get_congestion_data_fn=get_congestion_data,
    )


# 실제 장소 추천
@app.post("/recommend/places")
def recommend_actual_places(
    request: PlaceRecommendRequest
):
    """
    지역 추천 이후 사용자가 선택한 지역을 기준으로
    실제 방문 장소를 추천한다.
    """

    ranked_places = recommend_places(
        area_name=request.area_name,
        latitude=request.latitude,
        longitude=request.longitude,
        activities=request.activities,
        companions=request.companions,
        budget_max=request.budget_max,
        budget_preference=request.budget_preference,
        space_preference=request.space_preference,
    )

    page = create_place_recommendation_page(
        area_name=request.area_name,
        places=ranked_places,
    )

    return {
        "area_name": page.area_name,
        "places": page.places,
        "cursor": page.cursor,
        "has_more": page.has_more,
        "next_offset": page.next_offset,
    }


@app.post("/recommend/places/more")
def recommend_more_actual_places(
    request: PlaceRecommendMoreRequest
):
    """기존 candidate pool에서 다음 실제 장소를 반환한다."""

    try:
        page = get_next_place_recommendation_page(
            request.cursor,
            request.offset,
        )

    except PlaceCursorExpiredError as error:
        raise HTTPException(
            status_code=410,
            detail="장소 추천 cursor가 만료되었습니다.",
        ) from error

    except PlaceCursorNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail="유효하지 않은 장소 추천 cursor입니다.",
        ) from error

    return {
        "area_name": page.area_name,
        "places": page.places,
        "cursor": page.cursor,
        "has_more": page.has_more,
        "next_offset": page.next_offset,
    }


@app.post("/recommend/places/validate-selection")
def validate_place_selection(
    request: PlaceSelectionValidationRequest,
):
    selected_places = [
        place.model_dump()
        for place in request.selected_places
    ]
    validation_result = validate_selected_places_stay_time(
        [
            {
                "activity": place["category"],
                "specified_duration_minutes": place.get(
                    "specified_duration_minutes"
                ),
            }
            for place in selected_places
        ],
        request.available_time_minutes,
    )
    estimated_travel_result = calculate_estimated_route_travel_minutes(
        start_latitude=request.start_latitude,
        start_longitude=request.start_longitude,
        selected_places=selected_places,
    )

    estimated_travel_minutes = estimated_travel_result[
        "estimated_travel_minutes"
    ]

    estimated_total_required_minutes = (
        validation_result["total_stay_duration_minutes"]
        + estimated_travel_minutes
    )

    estimated_minimum_required_minutes = (
        validation_result["total_minimum_stay_duration_minutes"]
        + estimated_travel_minutes
    )
    # 예상 이동시간까지 포함했을 때
    # 현재 선택이 시간상 빡빡할 가능성이 있는지 확인한다.
    travel_time_warning = (
        estimated_minimum_required_minutes
        > request.available_time_minutes
    )
    return {
        "status": validation_result["status"],
        "selected_places": selected_places,

        "stay_time_validation": {
            key: value
            for key, value in validation_result.items()
            if key != "status"
        } | {
            "available_time_minutes": request.available_time_minutes,
        },

        # 선택 중 위도·경도를 이용해 계산한
        # 대략적인 이동시간 사전검증 결과
        "travel_time_precheck": {
            "estimated_travel_minutes": estimated_travel_minutes,
            "estimated_total_required_minutes": (
                estimated_total_required_minutes
            ),
            "estimated_minimum_required_minutes": (
                estimated_minimum_required_minutes
            ),
            "warning": travel_time_warning,
            "estimated_order": estimated_travel_result[
                "estimated_order"
            ],
        },
    }


def calculate_course(
    request: CourseCalculationRequest,
):
    """기존 직접 호출 테스트를 위한 호환 함수."""

    return calculate_course_route(
        request,
        optimize_course_order_fn=optimize_course_order,
    )
