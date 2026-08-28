from fastapi import FastAPI
from typing import Literal
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pydantic import BaseModel, model_validator, Field, field_validator

app = FastAPI()

TIME_BUFFER_MINUTES = 10

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

def resolve_datetimes(
    start_time: dict,
    end_time: dict
):
    now = datetime.now(ZoneInfo("Asia/Seoul"))

    start_datetime = datetime.strptime(
        start_time["start_time"],
        "%H:%M"
    ).replace(
        year=now.year,
        month=now.month,
        day=now.day,
        tzinfo=ZoneInfo("Asia/Seoul")
    )

    # 종료 시간이 없는 경우
    if end_time["end_time"] is None:
        return {
            "start_datetime": start_datetime,
            "end_datetime": None
        }

    end_datetime = datetime.strptime(
        end_time["end_time"],
        "%H:%M"
    ).replace(
        year=now.year,
        month=now.month,
        day=now.day,
        tzinfo=ZoneInfo("Asia/Seoul")
    )

    # 종료 시간이 시작 시간보다 이르면 자정을 넘긴 것으로 처리
    if end_datetime <= start_datetime:
        end_datetime += timedelta(days=1)

    return {
        "start_datetime": start_datetime,
        "end_datetime": end_datetime
    }

def calculate_time_window(
    resolved_datetimes: dict
    ):
    start_datetime = resolved_datetimes["start_datetime"]
    end_datetime = resolved_datetimes["end_datetime"]

    # 종료 시간이 없는 경우
    if end_datetime is None:
        return {
            "time_window_minutes": None
        }

    # 시작 시간부터 종료 시간까지의 전체 시간창을 분 단위로 계산
    time_window_minutes = int(
        (end_datetime - start_datetime).total_seconds() / 60
    )

    return {
        "time_window_minutes": time_window_minutes
    }

def calculate_available_stay_minutes(
    time_window_minutes: int | None,
    start_to_candidate_travel_minutes: int,
    candidate_to_end_location_travel_minutes: int = 0
    ):
    # 종료시간이 없어 전체 시간창을 계산할 수 없는 경우
    if time_window_minutes is None:
        return None

    available_stay_minutes = (
        time_window_minutes
        - start_to_candidate_travel_minutes
        - candidate_to_end_location_travel_minutes
        - TIME_BUFFER_MINUTES
    )

    return max(available_stay_minutes, 0)

def check_duration_feasibility(
    available_stay_minutes: int | None,
    desired_duration_minutes: int | None
    ):
    # 실제 체류 가능시간 자체를 계산할 수 없는 경우
    if available_stay_minutes is None:
        return {
            "is_feasible": None,
            "reason": "time_window_missing"
        }

    # 사용자가 원하는 활동시간을 따로 말하지 않은 경우
    if desired_duration_minutes is None:
        return {
            "is_feasible": True,
            "reason": "no_desired_duration"
        }

    # 실제 체류 가능시간이 희망 활동시간 이상인지 확인
    is_feasible = available_stay_minutes >= desired_duration_minutes

    return {
        "is_feasible": is_feasible,
        "reason": "enough_time" if is_feasible else "not_enough_time"
    }

# 이동시간 비율 기준
NORMAL_TRAVEL_RATIO = 0.30
EXTENDED_TRAVEL_RATIO = 0.40


def classify_travel_time(
    time_window_minutes: int | None,
    start_to_candidate_travel_minutes: int,
    candidate_to_end_location_travel_minutes: int = 0
):
    # 시작 → 후보지역 + 후보지역 → 다음 일정 위치
    total_travel_minutes = (
        start_to_candidate_travel_minutes
        + candidate_to_end_location_travel_minutes
    )

    # 종료시간이 없어서 전체 시간창을 알 수 없는 경우
    # 이동시간 "비율"은 계산할 수 없음
    if time_window_minutes is None:
        return {
            "total_travel_minutes": total_travel_minutes,
            "travel_ratio": None,
            "travel_level": "ratio_unavailable"
        }

    # 전체 시간 중 이동시간이 차지하는 비율
    travel_ratio = (
        total_travel_minutes
        / time_window_minutes
    )

    # 30% 이하 → 기본 추천 후보
    if travel_ratio <= NORMAL_TRAVEL_RATIO:
        travel_level = "normal"

    # 30% 초과 ~ 40% 이하 → 후보 유지, Ranking 감점
    elif travel_ratio <= EXTENDED_TRAVEL_RATIO:
        travel_level = "penalty"

    # 40% 초과 → 기본 추천에서는 제외하고
    # "다른 지역도 보기"에서 사용할 확장 후보
    else:
        travel_level = "extended"

    return {
        "total_travel_minutes": total_travel_minutes,
        "travel_ratio": travel_ratio,
        "travel_level": travel_level
    }

@app.get("/")
def root():
    return {"message": "KOALA backend"}

@app.post("/recommend")
def recommend(request: RecommendRequest):

    mock_conditions = StructuredConditions(
        start_location_text=None,
        end_location_text=None,
        start_time='17:00',
        end_time='21:00',
        desired_duration_minutes=120,
        activities=["cafe", "drink"],
        transport_mode="auto",
        companions=[],
        budget_max=None,
        budget_preference=None,
    )

    resolved_start_location = resolve_start_location(
        request,
        mock_conditions
    )

    resolved_start_time = resolve_start_time(mock_conditions)

    resolved_end_location = resolve_end_location(mock_conditions)

    resolved_end_time = resolve_end_time(mock_conditions)

    resolved_datetimes = resolve_datetimes(
        resolved_start_time,
        resolved_end_time
    )

    time_window = calculate_time_window(resolved_datetimes)


    mock_candidates = [
        {
            "name": "후보 A",
            "start_to_candidate_travel_minutes": 30,
            "candidate_to_end_location_travel_minutes": 30
        },
        {
            "name": "후보 B",
            "start_to_candidate_travel_minutes": 40,
            "candidate_to_end_location_travel_minutes": 40
        },
        {
            "name": "후보 C",
            "start_to_candidate_travel_minutes": 50,
            "candidate_to_end_location_travel_minutes": 50
        },
        {
        "name": "후보 D",
        "start_to_candidate_travel_minutes": 70,
        "candidate_to_end_location_travel_minutes": 70
        }
    ]
    candidate_results = []

    # 후보를 추천, 확장, 제외로 분류
    # 추천
    recommended_candidates = []
    # 확장
    extended_candidates = []
    # 제외
    excluded_candidates = []

    for candidate in mock_candidates:

        start_to_candidate_travel_minutes = (
            candidate["start_to_candidate_travel_minutes"]
        )

        candidate_to_end_location_travel_minutes = (
            candidate["candidate_to_end_location_travel_minutes"]
        )
        available_stay_minutes = calculate_available_stay_minutes(
            time_window["time_window_minutes"],
            start_to_candidate_travel_minutes,
            candidate_to_end_location_travel_minutes
        )
        duration_feasibility = check_duration_feasibility(
            available_stay_minutes,
            mock_conditions.desired_duration_minutes
        )
        travel_time_classification = classify_travel_time(
            time_window["time_window_minutes"],
            start_to_candidate_travel_minutes,
            candidate_to_end_location_travel_minutes
        )

        candidate_results.append({
            "name": candidate["name"],
            "start_to_candidate_travel_minutes": start_to_candidate_travel_minutes,
            "candidate_to_end_location_travel_minutes": candidate_to_end_location_travel_minutes,
            "available_stay_minutes": available_stay_minutes,
            "duration_feasibility": duration_feasibility,
            "travel_time_classification": travel_time_classification
        })
                # 희망 활동시간을 확보할 수 없는 후보는 제외
        if duration_feasibility["is_feasible"] is False:
            excluded_candidates.append(candidate["name"])

        # 이동시간 비율이 40%를 초과하면 확장 추천 후보
        elif travel_time_classification["travel_level"] == "extended":
            extended_candidates.append(candidate["name"])

        # normal / penalty는 기본 추천 후보
        else:
            recommended_candidates.append(candidate["name"])

    return {
        "conditions": mock_conditions,
        "start_location": resolved_start_location,
        "start_time": resolved_start_time,
        "end_location": resolved_end_location,
        "end_time": resolved_end_time,
        "resolved_datetimes": resolved_datetimes,
        "time_window": time_window,
        "candidate_results": candidate_results,
        "recommended_candidates": recommended_candidates,
        "extended_candidates": extended_candidates,
        "excluded_candidates": excluded_candidates        

    }