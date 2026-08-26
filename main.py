from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class RecommendRequest(BaseModel):
    user_message: str
    gps_latitude: float | None = None
    gps_longitude: float | None = None

from typing import Literal

class StructuredConditions(BaseModel):
    start_location_text: str | None = None
    end_location_text: str | None = None

    start_time: str | None = None
    end_time: str | None = None
    desired_duration_minutes: int | None = None

    activities: list[
        Literal[
            "food",
            "cafe",
            "walk",
            "culture",
            "entertainment",
            "shopping",
            "drink",
        ]
    ] = []

    transport_mode: Literal[
        "auto",
        "public_transit",
        "walk",
        "car",
    ] = "auto"

    companions: list[
        Literal[
            "solo",
            "friend",
            "partner",
            "family",
            "child",
            "coworker",
        ]
    ] = []

    budget_max: int | None = None

    budget_preference: Literal[
        "low",
        "medium",
        "flexible",
        "any",
    ] | None = None



def resolve_start_location(
    request: RecommendRequest,
    conditions: StructuredConditions
):
    # 사용자가 별도의 시작 위치를 말한 경우
    if conditions.start_location_text is not None:
        return {
            "source": "text",
            "location_text": conditions.start_location_text,
            "latitude": None,
            "longitude": None
        }

    # 별도 시작 위치가 없고 GPS가 있는 경우
    if request.gps_latitude is not None and request.gps_longitude is not None:
        return {
            "source": "gps",
            "location_text": None,
            "latitude": request.gps_latitude,
            "longitude": request.gps_longitude
        }

    # 둘 다 없는 경우
    return {
        "source": "missing",
        "location_text": None,
        "latitude": None,
        "longitude": None
    }
@app.get("/")
def root():
    return {"message": "KOALA backend"}


@app.post("/recommend")
def recommend(request: RecommendRequest):

    mock_conditions = StructuredConditions(
        start_location_text=None,
        end_location_text="고터",
        start_time="17:00",
        end_time="21:00",
        desired_duration_minutes=120,
        activities=["cafe", "drink"],
        transport_mode="auto",
        companions=[],
        budget_max=None,
        budget_preference=None,
    )

    start_location = resolve_start_location(
        request,
        mock_conditions
    )

    return {
        "conditions": mock_conditions,
        "start_location": start_location
    }