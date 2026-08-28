import math

TIME_BUFFER_MINUTES = 10

# 이동시간 비율 기준
NORMAL_TRAVEL_RATIO = 0.30
EXTENDED_TRAVEL_RATIO = 0.40

def calculate_straight_distance_km(
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float
):
    earth_radius_km = 6371

    lat1 = math.radians(start_latitude)
    lon1 = math.radians(start_longitude)
    lat2 = math.radians(end_latitude)
    lon2 = math.radians(end_longitude)

    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return earth_radius_km * c

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


def preselect_candidates_by_detour(
    candidates: list[dict],
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float,
    limit: int = 20
):
    # 시작 위치 → 종료 위치를 바로 갔을 때의 직선거리
    direct_distance_km = calculate_straight_distance_km(
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude
    )

    candidate_results = []

    for candidate in candidates:

        # 시작 위치 → 후보지역
        start_to_candidate_km = calculate_straight_distance_km(
            start_latitude,
            start_longitude,
            candidate["latitude"],
            candidate["longitude"]
        )

        # 후보지역 → 종료 위치
        candidate_to_end_km = calculate_straight_distance_km(
            candidate["latitude"],
            candidate["longitude"],
            end_latitude,
            end_longitude
        )

        # 후보지역을 들렀을 때의 전체 직선거리
        total_distance_km = (
            start_to_candidate_km
            + candidate_to_end_km
        )

        # 후보지역 때문에 추가되는 우회거리
        detour_distance_km = (
            total_distance_km
            - direct_distance_km
        )

        candidate_results.append({
            **candidate,
            "start_to_candidate_km": start_to_candidate_km,
            "candidate_to_end_km": candidate_to_end_km,
            "total_distance_km": total_distance_km,
            "detour_distance_km": detour_distance_km
        })

    # 우회거리가 적은 후보부터 정렬
    candidate_results.sort(
        key=lambda candidate: candidate["detour_distance_km"]
    )

    # 우선 상위 N개만 반환
    return candidate_results[:limit]