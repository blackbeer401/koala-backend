from fastapi import FastAPI
from auth_routes import router as auth_router
from course_routes import (
    calculate_course as calculate_course_route,
    router as course_router,
)
from place_routes import (
    recommend_actual_places as recommend_actual_places_route,
    recommend_more_actual_places as recommend_more_actual_places_route,
    validate_place_selection as validate_place_selection_route,
    router as place_router,
)

from place_recommendation_service import recommend_places
from region_recommendation_service import recommend_regions
from place_recommendation_cache import (
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
app.include_router(place_router)


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


def recommend_actual_places(
    request: PlaceRecommendRequest
):
    """기존 직접 호출 테스트를 위한 호환 함수."""

    return recommend_actual_places_route(
        request,
        recommend_places,
        create_place_recommendation_page,
    )


def recommend_more_actual_places(
    request: PlaceRecommendMoreRequest
):
    """기존 직접 호출 테스트를 위한 호환 함수."""

    return recommend_more_actual_places_route(
        request,
        get_next_place_recommendation_page,
    )


def validate_place_selection(
    request: PlaceSelectionValidationRequest,
):
    """기존 직접 호출 테스트를 위한 호환 함수."""

    return validate_place_selection_route(
        request,
        validate_selected_places_stay_time,
        calculate_estimated_route_travel_minutes,
    )


def calculate_course(
    request: CourseCalculationRequest,
):
    """기존 직접 호출 테스트를 위한 호환 함수."""

    return calculate_course_route(
        request,
        optimize_course_order_fn=optimize_course_order,
    )
