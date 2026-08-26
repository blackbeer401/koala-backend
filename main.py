from fastapi import FastAPI
from typing import Literal
from datetime import datetime
from zoneinfo import ZoneInfo
from pydantic import BaseModel, model_validator, Field

app = FastAPI()

class RecommendRequest(BaseModel):
    user_message: str

    gps_latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90
    )

    gps_longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180
    )

    @model_validator(mode="after")
    def validate_gps_pair(self):

        if (self.gps_latitude is None) != (self.gps_longitude is None):
            raise ValueError(
                "gps_latitude와 gps_longitude는 함께 입력되어야 합니다."
            )

        return self

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

def resolve_start_time(conditions: StructuredConditions):

    # 사용자가 시작 시간을 직접 말한 경우
    if conditions.start_time is not None:
        return {
            "source": "text",
            "start_time": conditions.start_time
        }

    # 시작 시간을 말하지 않은 경우 현재 시각 사용
    current_time = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%H:%M")

    return {
        "source": "current",
        "start_time": current_time
    }

def resolve_end_location(conditions: StructuredConditions):

    # 다음 일정 위치를 사용자가 말한 경우
    if conditions.end_location_text is not None:
        return {
            "source": "text",
            "location_text": conditions.end_location_text,
            "latitude": None,
            "longitude": None
        }

    # 다음 일정 위치가 없는 경우
    return {
        "source": "none",
        "location_text": None,
        "latitude": None,
        "longitude": None
    }

def resolve_end_time(conditions: StructuredConditions):

    # 사용자가 종료 시간 또는 다음 일정 시간을 말한 경우
    if conditions.end_time is not None:
        return {
            "source": "text",
            "end_time": conditions.end_time
        }

    # 종료 시간이 없는 경우
    return {
        "source": "none",
        "end_time": None
    }

@app.get("/")
def root():
    return {"message": "KOALA backend"}

@app.post("/recommend")
def recommend(request: RecommendRequest):

    mock_conditions = StructuredConditions(
        start_location_text=None,
        end_location_text=None,
        start_time=None,
        end_time=None,
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

    start_time = resolve_start_time(mock_conditions)

    end_location = resolve_end_location(mock_conditions)

    end_time = resolve_end_time(mock_conditions)

    return {
        "conditions": mock_conditions,
        "start_location": start_location,
        "start_time": start_time,
        "end_location": end_location,
        "end_time": end_time
    }