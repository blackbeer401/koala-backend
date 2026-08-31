import os
import requests

from dotenv import load_dotenv


# 1. Kakao API 키 불러오기
# .env 파일에 저장된 KAKAO_REST_API_KEY를 사용한다.
load_dotenv()

KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")


# 2. Kakao API 요청에 사용할 인증 헤더 생성
def kakao_headers():
    return {
        "Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"
    }


# 3. 장소명 / 주소 → 좌표 변환
def search_location(query: str):
    """
    사용자가 입력한 장소명 또는 주소를
    Kakao Local API를 이용해 좌표로 변환한다.

    검색 순서:
    1. 키워드 장소 검색
       예) 강남역, 롯데월드, 서울역

    2. 키워드 검색 결과가 없으면 주소 검색
       예) 서울특별시 강남구 테헤란로 152

    반환:
    {
        "name": 장소명,
        "address": 주소,
        "x": 경도,
        "y": 위도
    }

    장소와 주소 모두 검색되지 않으면 None을 반환한다.
    """

    # 3-1. 키워드 장소 검색
    keyword_url = (
        "https://dapi.kakao.com/v2/local/search/keyword.json"
    )

    response = requests.get(
        keyword_url,
        headers=kakao_headers(),
        params={
            "query": query
        }
    )

    data = response.json()

    # 검색 결과가 있으면 첫 번째 장소 사용
    if data.get("documents"):

        place = data["documents"][0]

        return {
            # 실제 Kakao 장소명
            "name": place.get(
                "place_name",
                query
            ),

            # 도로명 주소가 있으면 우선 사용하고
            # 없으면 지번 주소 사용
            "address": (
                place.get("road_address_name")
                or place.get("address_name")
            ),

            # x = 경도(Longitude)
            "x": float(place["x"]),

            # y = 위도(Latitude)
            "y": float(place["y"])
        }

    # 3-2. 키워드 검색 결과가 없으면 주소 검색
    address_url = (
        "https://dapi.kakao.com/v2/local/search/address.json"
    )

    response = requests.get(
        address_url,
        headers=kakao_headers(),
        params={
            "query": query
        }
    )

    data = response.json()

    # 주소 검색 결과가 있으면 첫 번째 결과 사용
    if data.get("documents"):

        place = data["documents"][0]

        return {
            "name": query,
            "address": place.get("address_name"),
            "x": float(place["x"]),
            "y": float(place["y"])
        }

    # 장소명과 주소 모두 검색되지 않은 경우
    return None


# 4. 대중교통 경로 조회
def get_transit(
    start_x,
    start_y,
    end_x,
    end_y
):
    """
    Kakao 대중교통 Routing API를 이용해
    두 좌표 사이의 실제 대중교통 경로를 조회한다.

    경로에는 도보 / 버스 / 지하철 구간이 포함될 수 있다.

    주요 반환값:
    - 전체 이동거리
    - 전체 이동시간
    - 환승 횟수
    - 교통요금
    - 버스 / 지하철 / 도보 세부 경로
    """

    url = (
        "https://dapi.kakao.com/"
        "v2/routing/publictraffic"
    )

    params = {
        "start_x": start_x,
        "start_y": start_y,
        "end_x": end_x,
        "end_y": end_y
    }

    response = requests.get(
        url,
        headers=kakao_headers(),
        params=params
    )

    data = response.json()

    # 조회 실패 시 Kakao 응답을 그대로 반환
    if data.get("status") != "OK":
        print("Kakao transit error:", data)
        return data

    # 여러 추천 경로 중 현재는 첫 번째 경로 사용
    route = data["routes"][0]

    # 전체 경로 정보
    properties = route["properties"]

    # 세부 이동 경로를 저장할 리스트
    paths = []

    # 전체 경로를 도보 / 버스 / 지하철 구간별로 나눠 저장
    for step in route["steps"]:

        step_properties = step["properties"]

        # WALKING / BUS / SUBWAY
        step_type = step_properties["type"]

        # 버스 번호 또는 지하철 노선 정보
        vehicles = step_properties.get(
            "vehicles",
            []
        )

        vehicle_name = None

        if vehicles:
            vehicle_name = vehicles[0].get(
                "name"
            )

        paths.append({
            # WALKING / BUS / SUBWAY
            "type": step_type,

            # 예: 2호선, 341번 버스
            "vehicle": vehicle_name,

            # 이동 안내문
            "guidance":
                step_properties.get("guidance"),

            # 해당 구간 거리
            "distance":
                step_properties.get("distance"),

            # 해당 구간 이동시간
            "time":
                step_properties.get("time"),

            # 지도에 경로를 표시할 때 사용할 좌표
            "points":
                step["path"]["points"]
        })

    return {
        # 이동수단
        "mode": "transit",

        # BUS / SUBWAY / BUS_AND_SUBWAY 등
        "route_type":
            properties["type"],

        # 전체 이동거리(m)
        "distance_m":
            properties["totalDistance"],

        # 전체 이동시간(초)
        "duration_sec":
            properties["totalTime"],

        # 계산 및 화면 표시용 이동시간(분)
        "duration_min":
            round(properties["totalTime"] / 60),

        # 총 환승 횟수
        "transfers":
            properties["transfers"],

        # 총 교통요금
        "fare":
            properties["fare"]["value"],

        # 도보 / 버스 / 지하철 세부 경로
        "paths": paths
    }

# 5. 도보 이동시간 계산
def get_walking(
    start_x,
    start_y,
    end_x,
    end_y
):
    """
    두 좌표 사이의 직선거리를 기준으로
    도보 이동시간을 추정한다.

    대중교통 경로가 없는 근거리 후보를
    처리하기 위한 fallback 용도이다.
    """

    from math import radians, sin, cos, sqrt, atan2

    # 위도 / 경도를 라디안으로 변환
    lat1 = radians(float(start_y))
    lon1 = radians(float(start_x))
    lat2 = radians(float(end_y))
    lon2 = radians(float(end_x))

    # 지구 반지름(km)
    earth_radius = 6371.0

    # 두 좌표의 차이
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    # Haversine 공식으로 직선거리 계산
    a = (
        sin(dlat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a)
    )

    distance_km = earth_radius * c

    # 실제 보행거리는 직선거리보다 길기 때문에
    # 보정계수 1.2를 적용한다.
    walking_distance_km = distance_km * 1.2

    # 평균 보행속도 4.5 km/h 기준
    walking_minutes = (
        walking_distance_km / 4.5
    ) * 60

    return {
        "mode": "walk",
        "distance_km": round(
            walking_distance_km,
            2
        ),
        "duration_min": max(
            1,
            round(walking_minutes)
        )
    }

# 6. 두 지점이 도보 fallback을 사용할 수 있을 정도로 가까운지 확인
def is_nearby(
    start_x,
    start_y,
    end_x,
    end_y,
    max_distance_km=1.5
):
    """
    두 좌표의 직선거리를 계산하여
    도보 fallback이 가능한 근거리인지 판단한다.

    기본 기준:
    - 직선거리 1.5km 이하 → 근거리
    - 직선거리 1.5km 초과 → 근거리 아님
    """

    from math import radians, sin, cos, sqrt, atan2

    lat1 = radians(float(start_y))
    lon1 = radians(float(start_x))
    lat2 = radians(float(end_y))
    lon2 = radians(float(end_x))

    earth_radius = 6371.0

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        sin(dlat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a)
    )

    distance_km = earth_radius * c

    return distance_km <= max_distance_km