from fastapi import APIRouter, HTTPException

from adventure_service import (
    NoAdventureCandidateError,
    recommend_single_place_gacha,
)
from models import AdventureRequest, AdventureResponse


router = APIRouter()


@router.post("/recommend/adventure", response_model=AdventureResponse)
def recommend_adventure(request: AdventureRequest):
    try:
        return recommend_single_place_gacha(request)
    except NoAdventureCandidateError as error:
        raise HTTPException(
            status_code=404,
            detail="현재 조건에서 방문 가능한 가챠 후보가 없습니다.",
        ) from error
