from map_service import search_location
from poi import load_poi_candidates
from candidate_filter import preselect_candidates_by_detour


# 시작 위치
start = search_location("사당역")

# 다음 일정 위치
end = search_location("잠실역")

# 실제 121개 POI
candidates = load_poi_candidates()


# 우회거리가 적은 후보 20개 선별
preselected_candidates = preselect_candidates_by_detour(
    candidates=candidates,
    start_latitude=start["y"],
    start_longitude=start["x"],
    end_latitude=end["y"],
    end_longitude=end["x"],
    limit=20
)


# 우선 상위 10개만 출력해서 확인
for candidate in preselected_candidates[:10]:

    print()
    print("후보지역:", candidate["AREA_NM"])
    print(
        "우회거리:",
        round(candidate["detour_distance_km"], 2),
        "km"
    )