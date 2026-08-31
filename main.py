from fastapi import FastAPI

from datetime import datetime

from models import RecommendRequest, StructuredConditions

from llm_service import parse_user_intent

from map_service import (
    search_location,
    get_transit,
    get_walking,
    is_nearby,
)

from poi import load_poi_candidates

from conditions import (
    resolve_start_location,
    resolve_start_time,
    resolve_end_location,
    resolve_end_time,
    resolve_datetimes,
    calculate_time_window,
    calculate_candidate_arrival_time,
)

from candidate_filter import (
    calculate_available_stay_minutes,
    check_duration_feasibility,
    classify_travel_time,
    preselect_candidates_by_detour,
    preselect_candidates_by_distance,
    
)

from activity_score import load_poi_activity_scores

from congestion_service import (
    get_congestion_data,
    get_nearest_forecast_congestion,
)

from ranking import (
    convert_congestion_to_score, 
    convert_travel_ratio_to_score,
    calculate_final_score,
    convert_travel_minutes_to_score,
)


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

    current_datetime = datetime.now().astimezone().isoformat()

    intent = parse_user_intent(
        user_input=request.user_message,
        current_datetime=current_datetime
    )

    mock_conditions = StructuredConditions(**intent)
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
    
    # 9. 전체 POI를 불러온 뒤 우회거리 기준으로 1차 후보를 선별한다.
    all_candidates = load_poi_candidates()

    # 실제 시작 위치를 좌표 형태로 변환한다.
    if resolved_start_location["source"] == "text":
        start_location = search_location(
            resolved_start_location["location_text"]
        )

    elif resolved_start_location["source"] == "gps":
        start_location = {
            "x": resolved_start_location["longitude"],
            "y": resolved_start_location["latitude"]
        }


    # 실제 종료 위치를 좌표 형태로 변환한다.
    if resolved_end_location["source"] == "text":
        end_location = search_location(
            resolved_end_location["location_text"]
        )
    else:
        end_location = None

    # 종료지가 있는 경우 → 시작-후보-종료 우회거리 기준
    if end_location is not None:
        real_candidates = preselect_candidates_by_detour(
            candidates=all_candidates,
            start_latitude=float(start_location["y"]),
            start_longitude=float(start_location["x"]),
            end_latitude=float(end_location["y"]),
            end_longitude=float(end_location["x"]),
            limit=20,
        )

    # 종료지가 없는 경우 → 시작 위치와 가까운 거리 기준
    else:
        real_candidates = preselect_candidates_by_distance(
            candidates=all_candidates,
            start_latitude=float(start_location["y"]),
            start_longitude=float(start_location["x"]),
            limit=20,
        )

    # 우회거리로 선별된 후보에 활동 적합도 점수를 연결해 확인한다.
    activity_scores = load_poi_activity_scores()

    selected_area_codes = [
        candidate["AREA_CD"]
        for candidate in real_candidates
    ]

    selected_activity_scores = activity_scores[
        activity_scores["AREA_CD"].isin(selected_area_codes)
    ]

    distance_map = {
        candidate["AREA_CD"]: {
            "detour_distance_km": candidate.get("detour_distance_km"),
            "start_to_candidate_km": candidate.get("start_to_candidate_km"),
        }
        for candidate in real_candidates
    }
    candidate_location_map = {
        candidate["AREA_CD"]: {
            "latitude": candidate["latitude"],
            "longitude": candidate["longitude"],
        }
        for candidate in real_candidates
    }
    activity_test_results = []

    for _, row in selected_activity_scores.iterrows():
        activity_test_results.append({
            "AREA_CD": row["AREA_CD"],
            "AREA_NM": row["AREA_NM"],
            "latitude": candidate_location_map[row["AREA_CD"]]["latitude"],
            "longitude": candidate_location_map[row["AREA_CD"]]["longitude"],
            "detour_distance_km": distance_map[row["AREA_CD"]]["detour_distance_km"],
            "start_to_candidate_km": distance_map[row["AREA_CD"]]["start_to_candidate_km"],
            "cafe_score": row["cafe_score"],
            "drink_score": row["drink_score"],
        })

    # 사용자가 선택한 활동들의 점수만 평균낸다.
    for candidate in activity_test_results:

        selected_scores = []

        for activity in mock_conditions.activities:
            score_key = f"{activity}_score"

            if score_key in candidate:
                selected_scores.append(
                    candidate[score_key]
                )

        if selected_scores:
            candidate["activity_match_score"] = (
                sum(selected_scores) / len(selected_scores)
            )
        else:
            candidate["activity_match_score"] = 0

    # 활동 적합도가 높은 순서대로 정렬한다.
    activity_test_results.sort(
        key=lambda candidate: candidate["activity_match_score"],
        reverse=True
    )

    # 활동 적합도가 높은 상위 5개를
    # 실제 대중교통 이동시간을 확인할 예비 후보로 선정한다.
    api_candidates = activity_test_results[:5]

    # 상위 후보의 실제 대중교통 이동시간을 확인한다.
    valid_api_candidates = []

    for candidate in api_candidates:

        start_to_candidate = get_transit(
            start_location["x"],
            start_location["y"],
            candidate["longitude"],
            candidate["latitude"]
        )

        # 대중교통 경로가 없는 경우 도보 이동을 시도한다.
        if "duration_min" not in start_to_candidate:

            # 대중교통 경로가 없는 경우
            # 먼저 출발지와 후보지가 가까운지 확인한다.
            if is_nearby(
                start_location["x"],
                start_location["y"],
                candidate["longitude"],
                candidate["latitude"]
            ):

                start_to_candidate = get_walking(
                    start_location["x"],
                    start_location["y"],
                    candidate["longitude"],
                    candidate["latitude"]
                )

                print(
                    f"Transit route not found: "
                    f"{candidate['AREA_NM']} "
                    f"(start → candidate)"
                )

                print(
                    f"Walking fallback: "
                    f"{start_to_candidate['duration_min']} min"
                )

            else:
                print(
                    f"Transit route not found and "
                    f"too far to walk: "
                    f"{candidate['AREA_NM']} "
                    f"(start → candidate)"
                )
                continue
        # 종료지가 있는 경우에만 후보 → 종료지 이동시간을 계산한다.
        if end_location is not None:

            candidate_to_end = get_transit(
                candidate["longitude"],
                candidate["latitude"],
                end_location["x"],
                end_location["y"]
            )

            # 대중교통 경로가 없으면 가까운 경우 도보 이동을 시도한다.
            if "duration_min" not in candidate_to_end:

                if is_nearby(
                    candidate["longitude"],
                    candidate["latitude"],
                    end_location["x"],
                    end_location["y"]
                ):
                    candidate_to_end = get_walking(
                        candidate["longitude"],
                        candidate["latitude"],
                        end_location["x"],
                        end_location["y"]
                    )

                else:
                    continue

        # 종료지가 없으면 후보 → 종료지 이동시간은 0으로 처리한다.
        else:
            candidate_to_end = {
                "duration_min": 0
            }

        candidate["start_to_candidate_travel_minutes"] = (
            start_to_candidate["duration_min"]
        )

        candidate["candidate_to_end_travel_minutes"] = (
            candidate_to_end["duration_min"]
        )

        candidate["available_stay_minutes"] = (
            calculate_available_stay_minutes(
                time_window["time_window_minutes"],
                start_to_candidate["duration_min"],
                candidate_to_end["duration_min"]
            )
        )

        candidate["duration_feasibility"] = (
            check_duration_feasibility(
                candidate["available_stay_minutes"],
                mock_conditions.desired_duration_minutes
            )
        )

        candidate["travel_time_classification"] = (
            classify_travel_time(
                time_window["time_window_minutes"],
                start_to_candidate["duration_min"],
                candidate_to_end["duration_min"],
            )
        )

        candidate["arrival_datetime"] = (
            calculate_candidate_arrival_time(
                resolved_datetimes["start_datetime"],
                start_to_candidate["duration_min"]
            )
        )

        # 종료시간이 있는 경우 → 전체 시간 대비 이동 비율로 점수 계산
        if time_window["time_window_minutes"] is not None:
            candidate["travel_score"] = convert_travel_ratio_to_score(
                candidate["travel_time_classification"]["travel_ratio"]
            )

        # 종료시간이 없는 경우 → 실제 이동시간으로 점수 계산
        else:
            candidate["travel_score"] = convert_travel_minutes_to_score(
                candidate["travel_time_classification"]["total_travel_minutes"]
            )

        congestion_data = get_congestion_data(
            candidate["AREA_CD"]
        )

        forecast_congestion = get_nearest_forecast_congestion(
            congestion_data,
            candidate["arrival_datetime"]
        )

        candidate["forecast_congestion"] = forecast_congestion

        candidate["congestion_score"] = convert_congestion_to_score(
            forecast_congestion["FCST_CONGEST_LVL"]
        )

        candidate["final_score"] = calculate_final_score(
            activity_score=candidate["activity_match_score"],
            travel_score=candidate["travel_score"],
            congestion_score=candidate["congestion_score"]
        )

        valid_api_candidates.append(candidate)

    api_candidates = valid_api_candidates
    recommended_candidates = []
    extended_candidates = []
    excluded_candidates = []

    for candidate in api_candidates:

        if candidate["duration_feasibility"]["is_feasible"] is False:
            excluded_candidates.append(candidate)

        elif candidate["travel_time_classification"]["travel_level"] == "extended":
            extended_candidates.append(candidate)

        else:
            recommended_candidates.append(candidate)
    # 추천 가능한 후보를 최종 추천점수가 높은 순서대로 정렬한다.
    recommended_candidates.sort(
        key=lambda candidate: candidate["final_score"],
        reverse=True
    )

    # 최종 추천지역 상위 3개를 선정한다.
    final_candidates = recommended_candidates[:3]
    
    return {
        "activity_test_results": activity_test_results,
        "api_candidates": api_candidates,
        "recommended_candidates": recommended_candidates,
        "extended_candidates": extended_candidates,
        "excluded_candidates": excluded_candidates,
        "final_candidates": final_candidates

    }