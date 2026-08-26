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

@app.get("/")
def root():
    return {"message": "KOALA backend"}


@app.post("/recommend")
def recommend(request: RecommendRequest):

    mock_conditions = StructuredConditions(
        start_location_text="사당",
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

    return mock_conditions