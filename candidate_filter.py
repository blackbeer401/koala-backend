TIME_BUFFER_MINUTES = 10

# 이동시간 비율 기준
NORMAL_TRAVEL_RATIO = 0.30
EXTENDED_TRAVEL_RATIO = 0.40


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
