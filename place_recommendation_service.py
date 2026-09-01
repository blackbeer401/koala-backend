from map_service import (
    get_region_from_coordinates,
    search_places_by_category,
)
from tour_service import (
    get_tour_sigungu_code,
    get_hub_places,
    add_distance_to_places,
    filter_places_by_distance,
)

# 우리 서비스 활동 카테고리 → Kakao 장소 카테고리 코드
KAKAO_ACTIVITY_CATEGORY_CODES = {
    "food": "FD6",
    "cafe": "CE7",
    "culture": "CT1",
}

# TourAPI 관광지 중분류 → 우리 서비스 활동 카테고리
TOUR_ACTIVITY_CATEGORY_MAP = {
    "문화관광": "culture",
    "역사관광": "culture",
    "쇼핑": "shopping",
    "레저스포츠": "entertainment",
}

def normalize_place_name(name: str | None):
    """
    장소 중복 비교를 위해 장소명의 표기 차이를 정리한다.

    예:
    CGV 홍대
    CGV/홍대
    → cgv홍대
    """

    if not name:
        return ""

    return (
        name
        .lower()
        .replace(" ", "")
        .replace("/", "")
    )

def remove_duplicate_places(
    places: list[dict],
    max_distance_m: int = 50,
):
    """
    서로 다른 외부 API에서 같은 장소가 중복으로 들어오는 경우를 제거한다.

    중복 판단 기준:
    1. 정규화한 장소명이 동일하고
    2. 두 장소의 좌표가 충분히 가까운 경우

    현재는 같은 이름의 체인점이 다른 지역에 있을 수 있으므로
    이름만으로는 중복 처리하지 않는다.
    """

    unique_places = []

    for place in places:
        place_name = normalize_place_name(
            place.get("name")
        )

        is_duplicate = False

        for saved_place in unique_places:
            saved_name = normalize_place_name(
                saved_place.get("name")
            )

            if place_name != saved_name:
                continue

            # 위도 약 1도 ≈ 111km를 이용한
            # 중복 판정용 간단한 좌표 거리 계산
            latitude_distance_m = (
                abs(
                    place["latitude"]
                    - saved_place["latitude"]
                )
                * 111000
            )

            longitude_distance_m = (
                abs(
                    place["longitude"]
                    - saved_place["longitude"]
                )
                * 88000
            )

            if (
                latitude_distance_m <= max_distance_m
                and longitude_distance_m <= max_distance_m
            ):
                is_duplicate = True
                break

        if not is_duplicate:
            unique_places.append(place)

    return unique_places


def normalize_kakao_places(
    places: list[dict],
    activity: str,
):
    """
    Kakao Local API 장소 데이터를
    우리 서비스 내부 공통 장소 형식으로 변환한다.
    """

    normalized_places = []

    for place in places:

        normalized_places.append({
            "source": "kakao",

            # Kakao 장소 고유 ID
            "source_id": place.get("id"),

            # 장소명
            "name": place.get("place_name"),

            # 좌표
            "latitude": float(place["y"]),
            "longitude": float(place["x"]),

            # 우리 서비스 내부 활동 카테고리
            "category": activity,

            # Kakao에서 제공하는 상세 카테고리
            "category_detail": place.get(
                "category_name"
            ),

            # 주소
            "address": (
                place.get("road_address_name")
                or place.get("address_name")
            ),

            # 기준 좌표와의 거리(m)
            "distance_m": (
                int(place["distance"])
                if place.get("distance")
                else None
            ),
        })

    return normalized_places

def normalize_tour_places(
    places: list[dict],
):
    """
    TourAPI 장소 데이터를
    우리 서비스 내부 공통 장소 형식으로 변환한다.
    """

    normalized_places = []

    for place in places:

        # 좌표가 없는 장소는 실제 장소 추천에 사용할 수 없으므로 제외한다.
        if not place.get("mapX") or not place.get("mapY"):
            continue

        normalized_places.append({
            "source": "tour",

            # 현재 TourAPI 응답에는 별도 장소 ID를
            # 안정적으로 사용하지 않으므로 None으로 둔다.
            "source_id": None,

            # 장소명
            "name": place.get("hubTatsNm"),

            # 좌표
            "latitude": float(place["mapY"]),
            "longitude": float(place["mapX"]),

            # TourAPI 중분류를 우리 서비스 활동 카테고리로 변환한다.
            "category": TOUR_ACTIVITY_CATEGORY_MAP.get(
                place.get("hubCtgryMclsNm")
            ),

            # TourAPI의 관광지 중분류
            "category_detail": place.get(
                "hubCtgryMclsNm"
            ),

            # 현재 사용 중인 API 응답에서는
            # 공통 주소 필드를 사용하지 않는다.
            "address": None,

            # 추천 지역 중심 좌표와의 거리(m)
            "distance_m": (
                round(
                    place["poi_distance_km"] * 1000
                )
                if place.get("poi_distance_km") is not None
                else None
            ),
        })

    return normalized_places


def recommend_places(
    area_name: str,
    latitude: float,
    longitude: float,
    activities: list[str],
    companions: list[str],
    budget_max: int | None,
    budget_preference: str | None,
    space_preference: str | None,
):
    """
    추천된 지역을 기준으로 실제 방문 장소를 추천한다.

    현재 지역 추천 로직과 실제 장소 추천 로직을 분리하기 위한
    장소 추천 전용 서비스 함수다.

    이후 이 함수 안에서 다음 흐름을 연결한다.

    지역 좌표
    → 행정구역 확인
    → 외부 장소 API 후보 조회
    → 거리 필터
    → 사용자 활동 조건 반영
    → 장소 Ranking
    → 최종 장소 반환
    """

    # 사용자 활동 중 Kakao 카테고리 검색이 가능한 활동을 확인한다.
    kakao_category_codes = []

    for activity in activities:
        category_code = KAKAO_ACTIVITY_CATEGORY_CODES.get(
            activity
        )

        if category_code is not None:
            kakao_category_codes.append(
                category_code
            )

    # Kakao에서 검색 가능한 활동의 실제 장소 후보를 조회한다.
    normalized_kakao_places = []

    for activity in activities:
        category_code = KAKAO_ACTIVITY_CATEGORY_CODES.get(
            activity
        )

        if category_code is None:
            continue

        kakao_places = search_places_by_category(
            latitude=latitude,
            longitude=longitude,
            category_code=category_code,
            radius=2000,
            size=15,
        )

        normalized_kakao_places.extend(
            normalize_kakao_places(
                kakao_places,
                activity
            )
        )

    # 1. 추천 지역의 좌표를 기준으로 행정구역을 확인한다.
    region = get_region_from_coordinates(
        latitude=latitude,
        longitude=longitude,
    )

    # 행정구역을 찾지 못한 경우 장소 추천을 진행할 수 없다.
    if region is None:
        return []

    # 2. 행정구 이름을 TourAPI의 시군구 코드로 변환한다.
    sigungu_name = region["sigungu_name"]

    tour_sigungu_code = get_tour_sigungu_code(
        sigungu_name
    )

    # TourAPI에서 지원하는 시군구 코드가 없는 경우
    # 장소 추천을 진행하지 않는다.
    if tour_sigungu_code is None:
        return []

    # 3. 확인된 자치구를 기준으로 TourAPI에서
    # 실제 장소 후보를 조회한다.
    places = get_hub_places(
        gu_code=tour_sigungu_code,
        base_ym="202504",
    )

    # 장소 후보가 없는 경우 빈 리스트를 반환한다.
    if not places:
        return []

    # 4. 각 장소와 추천 지역 중심 좌표 사이의
    # 직선거리를 계산해 장소 데이터에 추가한다.
    places = add_distance_to_places(
        places=places,
        poi_latitude=latitude,
        poi_longitude=longitude,
    )

    # 5. 추천 지역 중심에서 2km 이내의 장소만 남긴다.
    nearby_places = filter_places_by_distance(
        places=places,
        max_distance_km=2.0,
    )

    # 6. TourAPI 원본 데이터를
    # 서비스 내부 공통 장소 형식으로 변환한다.
    normalized_tour_places = normalize_tour_places(
        nearby_places
    )

    # 7. 사용자가 원하는 활동과 맞는 TourAPI 장소만 남긴다.
    filtered_tour_places = [
        place
        for place in normalized_tour_places
        if place["category"] in activities
    ]

    # 8. Kakao와 TourAPI 후보를 합친 뒤
    # 같은 실제 장소가 중복된 경우 하나만 남긴다.
    combined_places = (
        normalized_kakao_places
        + filtered_tour_places
    )

    unique_places = remove_duplicate_places(
        combined_places
    )

    return unique_places