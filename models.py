from typing import Literal
from datetime import datetime
from pydantic import BaseModel, model_validator, Field, field_validator

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
    # start_location_text 규칙
    # - 현재 위치 표현("지금 사당")은 GPS 사용을 위해 null
    # - 미래/별도 시작 위치("5시에 사당")만 값 저장
    start_location_text: str | None = None
    end_location_text: str | None = None

    start_time: str | None = None
    end_time: str | None = None
    desired_duration_minutes: int | None = Field(
        default=None,
        gt=0
    )

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
    ] = Field(default_factory=list)

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
    ] = Field(default_factory=list)

    budget_max: int | None = Field(
        default=None,
        ge=0
    )

    budget_preference: Literal[
        "low",
        "medium",
        "flexible",
        "any",
    ] | None = None

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time_format(cls, value):

        if value is None:
            return value

        try:
            datetime.strptime(value, "%H:%M")
        except ValueError:
            raise ValueError("시간은 HH:MM 형식이어야 합니다.")

        return value
