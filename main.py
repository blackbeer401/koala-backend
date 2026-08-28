from fastapi import FastAPI

from models import RecommendRequest, StructuredConditions
from map_service import search_location, get_transit
from poi import load_poi_candidates

from conditions import (
    resolve_start_location,
    resolve_start_time,
    resolve_end_location,
    resolve_end_time,
    resolve_datetimes,
    calculate_time_window,
)

from candidate_filter import (
    calculate_available_stay_minutes,
    check_duration_feasibility,
    classify_travel_time,
)

from activity_score import load_poi_activity_scores


# 1. FastAPI 앱 생성
app = FastAPI()


# 2. 서버 기본 동작 확인
@app.get("/")
def root():
    return {
        "message": "KOALA backend"
    }


# 3. 서울 121개 POI 데이터 로드 테스트
@app.get("/test-poi")
def test_poi():

    candidates = load_poi_candidates()

    return {
        "candidate_count": len(candidates),
        "candidates": candidates
    }


# 4. 지역 추천 API
@app.post("/recommend")
def recommend(request: RecommendRequest):

    # 현재는 LLM 조건 추출 기능이 연결되지 않았기 때문에
    # 추천 파이프라인 테스트용 조건을 직접 설정한다.
    mock_conditions = StructuredConditions(
        start_location_text=None,
        end_location_text=None,
        start_time="17:00",
        end_time="21:00",
        desired_duration_minutes=120,
        activities=["cafe", "drink"],
        transport_mode="auto",
        companions=[],
        budget_max=None,
        budget_preference=None,
    )

    # 5. 사용자 시작 위치 결정
    # request의 GPS와 구조화된 위치 조건을 이용한다.
    resolved_start_location = resolve_start_location(
        request,
        mock_conditions
    )

    # 6. 시작시간 / 종료위치 / 종료시간 결정
    resolved_start_time = resolve_start_time(
        mock_conditions
    )

    resolved_end_location = resolve_end_location(
        mock_conditions
    )

    resolved_end_time = resolve_end_time(
        mock_conditions
    )

    # 7. 시작시간과 종료시간을 실제 datetime으로 변환
    resolved_datetimes = resolve_datetimes(
        resolved_start_time,
        resolved_end_time
    )

    # 8. 사용자가 실제로 사용할 수 있는 전체 시간 계산
    time_window = calculate_time_window(
        resolved_datetimes
    )

    # 9. 실제 POI 테스트
    # 현재는 전체 121개 중 앞의 5개만 사용한다.이후 우회거리 기반 사전선별 + Ranking으로 교체할 예정이다.
    real_candidates = load_poi_candidates()[:5]

    # 현재 지도 API 테스트를 위해 시작점과 종료점을 사당역 / 잠실역으로 고정한다.
    test_start = search_location("사당역")
    test_end = search_location("잠실역")

    # 각 후보의 상세 계산 결과
    real_candidate_results = []

    # 최종 분류 결과
    recommended_candidates = []
    extended_candidates = []
    excluded_candidates = []

    # 10. 후보 POI별 실제 이동시간 및 체류 가능시간 계산
    for candidate in real_candidates:

        # 시작 위치 → 후보 POI 실제 대중교통 이동시간
        start_to_candidate = get_transit(
            test_start["x"],
            test_start["y"],
            candidate["longitude"],
            candidate["latitude"]
        )

        # 후보 POI → 다음 일정 위치 실제 대중교통 이동시간
        candidate_to_end = get_transit(
            candidate["longitude"],
            candidate["latitude"],
            test_end["x"],
            test_end["y"]
        )

        # 전체 시간에서 이동시간과 버퍼를 제외한
        # 실제 후보지역 체류 가능시간 계산
        available_stay_minutes = calculate_available_stay_minutes(
            time_window["time_window_minutes"],
            start_to_candidate["duration_min"],
            candidate_to_end["duration_min"]
        )

        # 사용자가 원하는 체류시간을 확보할 수 있는지 검사
        duration_feasibility = check_duration_feasibility(
            available_stay_minutes,
            mock_conditions.desired_duration_minutes
        )

        # 전체 시간 중 이동시간이 차지하는 비율을 기준으로
        # normal / penalty / extended 분류
        travel_time_classification = classify_travel_time(
            time_window["time_window_minutes"],
            start_to_candidate["duration_min"],
            candidate_to_end["duration_min"]
        )

        # 후보별 계산 결과 저장
        real_candidate_results.append({
            "AREA_CD": candidate["AREA_CD"],
            "AREA_NM": candidate["AREA_NM"],
            "CATEGORY": candidate["CATEGORY"],
            "start_to_candidate_travel_minutes":
                start_to_candidate["duration_min"],
            "candidate_to_end_location_travel_minutes":
                candidate_to_end["duration_min"],
            "available_stay_minutes":
                available_stay_minutes,
            "duration_feasibility":
                duration_feasibility,
            "travel_time_classification":
                travel_time_classification
        })

        # 11. 체류 가능 여부와 이동부담에 따라 후보 분류

        # 희망 체류시간 확보 불가능 → 추천 제외
        if duration_feasibility["is_feasible"] is False:
            excluded_candidates.append(
                candidate["AREA_NM"]
            )

        # 체류는 가능하지만 이동시간 비율이 40% 초과
        # → 확장 후보로 분류
        elif (
            travel_time_classification["travel_level"]
            == "extended"
        ):
            extended_candidates.append(
                candidate["AREA_NM"]
            )

        # 체류 가능 + 이동부담도 허용 범위
        # → 일반 추천 후보
        else:
            recommended_candidates.append(
                candidate["AREA_NM"]
            )

    # 12. 현재 추천 파이프라인 테스트 결과 반환
    return {
        "conditions": mock_conditions,
        "start_location": resolved_start_location,
        "start_time": resolved_start_time,
        "end_location": resolved_end_location,
        "end_time": resolved_end_time,
        "resolved_datetimes": resolved_datetimes,
        "time_window": time_window,
        "real_candidate_results": real_candidate_results,
        "recommended_candidates": recommended_candidates,
        "extended_candidates": extended_candidates,
        "excluded_candidates": excluded_candidates,
    }