from fastapi import APIRouter

from models import RecommendRequest


def create_region_router(recommend_handler):
    router = APIRouter()

    @router.post("/recommend")
    def recommend_endpoint(request: RecommendRequest):
        return recommend_handler(request)

    return router
