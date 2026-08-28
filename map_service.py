import os
import requests

from dotenv import load_dotenv


load_dotenv()

KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")

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

    검색 결과가 없으면 None 반환.
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

    # 검색 결과가 존재하면 첫 번째 장소를 사용한다.
    if data.get("documents"):

        place = data["documents"][0]

        return {
            # 실제 카카오 장소명
            "name": place.get(
                "place_name",
                query
            ),

            # 도로명 주소가 있으면 우선 사용하고,
            # 없으면 일반 지번 주소 사용
            "address": (
                place.get("road_address_name")
                or place.get("address_name")
            ),

            # x = 경도(Longitude)
            "x": float(place["x"]),

            # y = 위도(Latitude)
            "y": float(place["y"])
        }


    # 3-2. 키워드 검색 실패 시 주소 검색

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


    # 주소 검색 결과가 존재할 경우
    if data.get("documents"):

        place = data["documents"][0]

        return {
            "name": query,
            "address": place.get("address_name"),
            "x": float(place["x"]),
            "y": float(place["y"])
        }


    # 장소와 주소 모두 검색되지 않음
    return None

# 7. 대중교통 경로 조회

def get_transit(
    start_x,
    start_y,
    end_x,
    end_y
):

    """
    Kakao 대중교통 Routing API를 이용한다.

    대중교통 경로에는
    - 도보
    - 버스
    - 지하철

    구간이 함께 포함될 수 있다.

    반환:
    - 총 거리
    - 총 이동시간
    - 환승 횟수
    - 교통요금
    - 버스/지하철/도보 각각의 세부 경로
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


    # 조회 실패 시 카카오 응답을 그대로 반환
    if data.get("status") != "OK":
        return data


    # 여러 추천 경로 중
    # 현재 테스트에서는 첫 번째 경로만 사용한다.
    route = data["routes"][0]


    # 전체 경로 정보
    properties = route["properties"]


    # 세부 이동 경로 저장
    paths = []


    # 전체 대중교통 경로를 구간별로 나눈다.
    for step in route["steps"]:

        step_properties = step["properties"]


        # 현재 구간 이동수단
        # WALKING / BUS / SUBWAY
        step_type = step_properties["type"]


        # 버스번호 또는 지하철 노선 등의 정보
        vehicles = step_properties.get(
            "vehicles",
            []
        )


        vehicle_name = None


        # 노선 정보가 존재하는 경우
        if vehicles:

            vehicle_name = vehicles[0].get(
                "name"
            )


        paths.append({

            # WALKING / BUS / SUBWAY
            "type": step_type,

            # 예:
            # 2호선
            # 341번 버스
            "vehicle": vehicle_name,

            # 이동 안내문
            "guidance":
                step_properties.get("guidance"),

            # 구간 거리
            "distance":
                step_properties.get("distance"),

            # 구간 시간
            "time":
                step_properties.get("time"),

            # 지도에 표시할 실제 좌표
            "points":
                step["path"]["points"]
        })


    return {

        # 대중교통
        "mode": "transit",

        # BUS / SUBWAY / BUS_AND_SUBWAY 등
        "route_type":
            properties["type"],

        # 전체 이동거리
        "distance_m":
            properties["totalDistance"],

        # 전체 이동시간(초)
        "duration_sec":
            properties["totalTime"],

        # 화면 표시용 분 단위 시간
        "duration_min":
            round(properties["totalTime"] / 60),

        # 총 환승 횟수
        "transfers":
            properties["transfers"],

        # 총 교통요금
        "fare":
            properties["fare"]["value"],

        # 세부 경로
        "paths": paths
    }
