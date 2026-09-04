from fastapi import APIRouter, HTTPException

from models import PlaceRecommendMoreRequest, PlaceRecommendRequest
from place_recommendation_cache import (
    PlaceCursorExpiredError,
    PlaceCursorNotFoundError,
    create_place_recommendation_page,
    get_next_place_recommendation_page,
)
from place_recommendation_service import recommend_places


router = APIRouter()


def recommend_actual_places(
    request: PlaceRecommendRequest,
    recommend_places_fn,
    create_page_fn,
):
    ranked_places = recommend_places_fn(
        area_name=request.area_name,
        latitude=request.latitude,
        longitude=request.longitude,
        activities=request.activities,
        companions=request.companions,
        budget_max=request.budget_max,
        budget_preference=request.budget_preference,
        space_preference=request.space_preference,
    )

    page = create_page_fn(
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


def recommend_more_actual_places(
    request: PlaceRecommendMoreRequest,
    get_next_page_fn,
):
    try:
        page = get_next_page_fn(
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


@router.post("/recommend/places")
def recommend_actual_places_endpoint(
    request: PlaceRecommendRequest,
):
    return recommend_actual_places(
        request,
        recommend_places,
        create_place_recommendation_page,
    )


@router.post("/recommend/places/more")
def recommend_more_actual_places_endpoint(
    request: PlaceRecommendMoreRequest,
):
    return recommend_more_actual_places(
        request,
        get_next_place_recommendation_page,
    )
