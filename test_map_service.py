from map_service import search_location, get_transit
from poi import load_poi_candidates
from candidate_filter import (
    calculate_available_stay_minutes,
    check_duration_feasibility,
    classify_travel_time,
)


# 시작 위치
start = search_location("사당역")

# 다음 일정 위치
end = search_location("잠실역")

# 실제 121개 POI 불러오기
candidates = load_poi_candidates()

# 첫 번째 후보
test_candidates = candidates[:5]
print("출발:", start)
print("종료:", end)

# 테스트용 전체 가용시간
time_window_minutes = 240

# 사용자가 원하는 체류시간
desired_duration_minutes = 120


# 실제 POI 5개를 하나씩 계산
for candidate in test_candidates:

    # 시작 위치 → 후보지역 실제 대중교통 이동시간
    start_to_candidate = get_transit(
        start["x"],
        start["y"],
        candidate["longitude"],
        candidate["latitude"]
    )

    # 후보지역 → 종료 위치 실제 대중교통 이동시간
    candidate_to_end = get_transit(
        candidate["longitude"],
        candidate["latitude"],
        end["x"],
        end["y"]
    )

    # 후보지역에서 실제로 머물 수 있는 시간 계산
    available_stay_minutes = calculate_available_stay_minutes(
        time_window_minutes,
        start_to_candidate["duration_min"],
        candidate_to_end["duration_min"]
    )

    # 사용자가 원하는 체류시간을 확보할 수 있는지 확인
    duration_feasibility = check_duration_feasibility(
        available_stay_minutes,
        desired_duration_minutes
    )

    # 전체 가용시간 대비 이동시간 비율 계산
    travel_time_classification = classify_travel_time(
        time_window_minutes,
        start_to_candidate["duration_min"],
        candidate_to_end["duration_min"]
    )

    print()
    print("후보지역:", candidate["AREA_NM"])
    print("시작 → 후보:", start_to_candidate["duration_min"], "분")
    print("후보 → 종료:", candidate_to_end["duration_min"], "분")
    print("체류 가능시간:", available_stay_minutes, "분")
    print("체류시간 충족 여부:", duration_feasibility)
    print("이동시간 분류:", travel_time_classification)