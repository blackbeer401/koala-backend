from typing import Literal
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    model_validator,
    Field,
    field_validator,
)


# 1. 프론트엔드 → 백엔드로 들어오는 사용자 요청
class RecommendRequest(BaseModel):
    """
    프론트엔드에서 /recommend로 전달하는 최초 요청 데이터.

    사용자가 입력한 자연어 문장과
    현재 위치 GPS 좌표를 받는다.

    예:
    {
        "user_message": "지금 사당인데 7시에 잠실 가야 해. 카페 가고 싶어.",
        "gps_latitude": 37.4765,
        "gps_longitude": 126.9816
    }
    """

    # 사용자가 입력한 자연어 요청
    user_message: str

    # 현재 위치 위도
    gps_latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90
    )

    # 현재 위치 경도
    gps_longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180
    )

    # 위도와 경도 중 하나만 들어오는 것을 방지
    @model_validator(mode="after")
    def validate_gps_pair(self):

        if (
            (self.gps_latitude is None)
            != (self.gps_longitude is None)
        ):
            raise ValueError(
                "gps_latitude와 gps_longitude는 함께 입력되어야 합니다."
            )

        return self


# 2. 자연어 요청에서 추출한 추천 조건
class StructuredConditions(BaseModel):
    """
    사용자의 자연어 요청을 추천 계산에 사용할 수 있도록
    구조화한 조건을 저장한다.
    """

    # 추천을 시작할 별도 위치
    #
    # 현재 위치 표현:
    # "지금 사당이야"
    # → GPS를 사용하기 위해 None
    #
    # 별도 시작 위치 표현:
    # "5시에 사당에서 출발할 거야"
    # → "사당" 저장
    start_location_text: str | None = None

    # 사용자가 실제로 추천 활동을 하고 싶은 지역
    #
    # 추천 활동 자체의 목적 지역을 의미
    #
    # 예:
    # "오늘 강남에서 2~3시간 놀 거야"
    # → "강남" 저장
    #
    # "홍대에서 놀다가 7시에 잠실 가야 해"
    # → "홍대" 저장
    #
    # 다음 일정 위치와는 구분
    # "7시에 강남에서 약속 있어. 그전에 카페 갈래"
    # → target_location_text = None
    # → end_location_text = "강남"
    target_location_text: str | None = None

    # target_location_text가 넓은 지역인지
    # 특정 장소인지 구분
    #
    # area:
    # "강남에서 놀고 싶어"
    # "홍대에서 카페 가고 싶어"
    #
    # place:
    # "강남역에서 놀고 싶어"
    # "홍대입구에서 놀고 싶어"
    # "서울숲에서 산책하고 싶어"
    #
    # target_location_text가 None이면
    # target_location_scope도 None
    target_location_scope: Literal[
        "area",
        "place",
    ] | None = None

    # 다음 일정 위치
    # 예: "7시에 잠실 가야 해" → "잠실"
    end_location_text: str | None = None

    # 추천 활동 시작시간
    # HH:MM 형식
    start_time: str | None = None

    # 활동 종료시간 또는 다음 일정시간
    # HH:MM 형식
    end_time: str | None = None

    # 정확한 시작시간이 없을 때 사용하는 시간대
    start_time_period: Literal[
        "morning",
        "lunch",
        "evening",
        "am",
        "pm",
    ] | None = None

    # 정확한 종료시간이 없을 때 사용하는 시간대
    end_time_period: Literal[
        "morning",
        "lunch",
        "evening",
        "am",
        "pm",
    ] | None = None

    # LLM이 추출한 최소 희망 체류시간
    # 예: "1~2시간 정도 있고 싶어" → 60
    desired_duration_min_minutes: int | None = Field(
        default=None,
        gt=0
    )

    # LLM이 추출한 최대 희망 체류시간
    # 예: "1~2시간 정도 있고 싶어" → 120
    desired_duration_max_minutes: int | None = Field(
        default=None,
        gt=0
    )

    # 기존 백엔드 추천 로직에서 사용하는 체류시간
    # 기존 코드 호환을 위해 임시 유지
    desired_duration_minutes: int | None = Field(
        default=None,
        gt=0
    )

    # 사용자가 원하는 활동 종류
    # 여러 활동을 동시에 선택할 수 있다.
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
    ] = Field(
        default_factory=list
    )

    # 이동수단
    # auto는 백엔드에서 상황에 맞게 판단하기 위한 기본값
    transport_mode: Literal[
        "auto",
        "public_transit",
        "walk",
        "car",
    ] = "auto"

    # 동행인
    companions: list[
        Literal[
            "solo",
            "friend",
            "partner",
            "family",
            "child",
            "coworker",
        ]
    ] = Field(
        default_factory=list
    )

    # 사용자가 제시한 최대 예산
    budget_max: int | None = Field(
        default=None,
        ge=0
    )

    # 사용자의 예산 선호
    budget_preference: Literal[
        "low",
        "medium",
        "flexible",
        "any",
    ] | None = None

    # 실내 / 야외 공간 선호
    space_preference: Literal[
        "indoor",
        "outdoor",
        "any",
    ] | None = None

    @model_validator(mode="after")
    def set_legacy_desired_duration(self):

        if self.desired_duration_minutes is None:
            self.desired_duration_minutes = (
                self.desired_duration_min_minutes
            )

        return self

    # start_time / end_time이 들어온 경우
    # HH:MM 형식인지 검사
    @field_validator(
        "start_time",
        "end_time"
    )
    @classmethod
    def validate_time_format(
        cls,
        value
    ):

        # 시간이 없는 것은 허용
        if value is None:
            return value

        try:
            datetime.strptime(
                value,
                "%H:%M"
            )

        except ValueError:
            raise ValueError(
                "시간은 HH:MM 형식이어야 합니다."
            )

        return value


class PlaceRecommendMoreRequest(BaseModel):
    """기존 실제 장소 추천의 다음 후보 페이지 요청."""

    cursor: str = Field(
        min_length=1,
        max_length=64,
    )

    offset: int = Field(
        ge=0,
    )


class SelectedPlaceRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    # 선택한 실제 장소의 활동 카테고리
    category: Literal[
        "food",
        "cafe",
        "walk",
        "culture",
        "entertainment",
        "shopping",
        "drink",
    ]

    # 선택한 실제 장소의 위도
    # 선택 중 대략적인 이동시간을 계산할 때 사용한다.
    latitude: float = Field(
        ge=-90,
        le=90,
    )

    # 선택한 실제 장소의 경도
    # 선택 중 대략적인 이동시간을 계산할 때 사용한다.
    longitude: float = Field(
        ge=-180,
        le=180,
    )

    # 사용자가 해당 장소의 체류시간을 직접 지정한 경우 사용한다.
    # 지정하지 않으면 활동별 기본 체류시간 정책을 사용한다.
    specified_duration_minutes: int | None = Field(
        default=None,
        gt=0,
    )

class PlaceSelectionValidationRequest(BaseModel):

    # 사용자의 현재 위치 위도
    # 현재 위치 → 첫 번째 선택 장소의
    # 대략적인 이동시간을 계산할 때 사용한다.
    start_latitude: float = Field(
        ge=-90,
        le=90,
    )

    # 사용자의 현재 위치 경도
    start_longitude: float = Field(
        ge=-180,
        le=180,
    )

    # 사용자가 현재 선택한 실제 장소 목록
    # KOALA MVP에서는 한 코스에 최대 6곳까지 선택할 수 있다.
    selected_places: list[SelectedPlaceRequest] = Field(
        min_length=1,
        max_length=6,
    )

    # 사용자가 현재 사용할 수 있는 전체 시간
    available_time_minutes: int = Field(gt=0)


class CourseLocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CoursePlaceRequest(SelectedPlaceRequest):
    preferred_first: bool = False


class CourseCalculationRequest(BaseModel):
    start_location: CourseLocationRequest
    selected_places: list[CoursePlaceRequest] = Field(
        min_length=1,
        max_length=6,
    )
    available_time_minutes: int = Field(gt=0)
    end_location: CourseLocationRequest | None = None
    transport_mode: Literal[
        "auto",
        "public_transit",
        "walk",
        "car",
    ] = "auto"

    @model_validator(mode="after")
    def validate_preferred_first_count(self):
        if sum(place.preferred_first for place in self.selected_places) > 1:
            raise ValueError(
                "preferred_first=True인 장소는 최대 1개만 허용됩니다."
            )

        return self


# 선택한 지역의 실제 장소 추천 요청
class PlaceRecommendRequest(BaseModel):
    """
    지역 추천 이후,
    사용자가 선택한 지역 안에서 실제 장소를 추천할 때 사용하는 요청 데이터.

    지역 이름과 중심 좌표,
    그리고 장소 추천에 필요한 사용자 조건을 받는다.
    """

    # 사용자가 선택한 추천 지역 이름
    area_name: str

    # 선택한 지역의 중심 위도
    latitude: float = Field(
        ge=-90,
        le=90
    )

    # 선택한 지역의 중심 경도
    longitude: float = Field(
        ge=-180,
        le=180
    )

    # 사용자가 원하는 활동 종류
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
    ] = Field(
        default_factory=list
    )

    # 동행인
    companions: list[
        Literal[
            "solo",
            "friend",
            "partner",
            "family",
            "child",
            "coworker",
        ]
    ] = Field(
        default_factory=list
    )

    # 최대 예산
    budget_max: int | None = Field(
        default=None,
        ge=0
    )

    # 예산 선호
    budget_preference: Literal[
        "low",
        "medium",
        "flexible",
        "any",
    ] | None = None

    # 실내 / 야외 공간 선호
    space_preference: Literal[
        "indoor",
        "outdoor",
        "any",
    ] | None = None
