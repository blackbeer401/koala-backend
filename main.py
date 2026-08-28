from fastapi import FastAPI
from models import RecommendRequest, StructuredConditions

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
from poi import load_poi_candidates

app = FastAPI()



@app.get("/")
def root():
    return {"message": "KOALA backend"}

@app.get("/test-poi")
def test_poi():

    candidates = load_poi_candidates()

    return {
        "candidate_count": len(candidates),
        "candidates": candidates
    }

@app.post("/recommend")
def recommend(request: RecommendRequest):

    mock_conditions = StructuredConditions(
        start_location_text=None,
        end_location_text=None,
        start_time='17:00',
        end_time='21:00',
        desired_duration_minutes=120,
        activities=["cafe", "drink"],
        transport_mode="auto",
        companions=[],
        budget_max=None,
        budget_preference=None,
    )

    resolved_start_location = resolve_start_location(
        request,
        mock_conditions
    )

    resolved_start_time = resolve_start_time(mock_conditions)

    resolved_end_location = resolve_end_location(mock_conditions)

    resolved_end_time = resolve_end_time(mock_conditions)

    resolved_datetimes = resolve_datetimes(
        resolved_start_time,
        resolved_end_time
    )

    time_window = calculate_time_window(resolved_datetimes)


    mock_candidates = [
        {
            "name": "후보 A",
            "start_to_candidate_travel_minutes": 30,
            "candidate_to_end_location_travel_minutes": 30
        },
        {
            "name": "후보 B",
            "start_to_candidate_travel_minutes": 40,
            "candidate_to_end_location_travel_minutes": 40
        },
        {
            "name": "후보 C",
            "start_to_candidate_travel_minutes": 50,
            "candidate_to_end_location_travel_minutes": 50
        },
        {
        "name": "후보 D",
        "start_to_candidate_travel_minutes": 70,
        "candidate_to_end_location_travel_minutes": 70
        }
    ]
    candidate_results = []

    # 후보를 추천, 확장, 제외로 분류
    # 추천
    recommended_candidates = []
    # 확장
    extended_candidates = []
    # 제외
    excluded_candidates = []

    for candidate in mock_candidates:

        start_to_candidate_travel_minutes = (
            candidate["start_to_candidate_travel_minutes"]
        )

        candidate_to_end_location_travel_minutes = (
            candidate["candidate_to_end_location_travel_minutes"]
        )
        available_stay_minutes = calculate_available_stay_minutes(
            time_window["time_window_minutes"],
            start_to_candidate_travel_minutes,
            candidate_to_end_location_travel_minutes
        )
        duration_feasibility = check_duration_feasibility(
            available_stay_minutes,
            mock_conditions.desired_duration_minutes
        )
        travel_time_classification = classify_travel_time(
            time_window["time_window_minutes"],
            start_to_candidate_travel_minutes,
            candidate_to_end_location_travel_minutes
        )

        candidate_results.append({
            "name": candidate["name"],
            "start_to_candidate_travel_minutes": start_to_candidate_travel_minutes,
            "candidate_to_end_location_travel_minutes": candidate_to_end_location_travel_minutes,
            "available_stay_minutes": available_stay_minutes,
            "duration_feasibility": duration_feasibility,
            "travel_time_classification": travel_time_classification
        })
                # 희망 활동시간을 확보할 수 없는 후보는 제외
        if duration_feasibility["is_feasible"] is False:
            excluded_candidates.append(candidate["name"])

        # 이동시간 비율이 40%를 초과하면 확장 추천 후보
        elif travel_time_classification["travel_level"] == "extended":
            extended_candidates.append(candidate["name"])

        # normal / penalty는 기본 추천 후보
        else:
            recommended_candidates.append(candidate["name"])

    return {
        "conditions": mock_conditions,
        "start_location": resolved_start_location,
        "start_time": resolved_start_time,
        "end_location": resolved_end_location,
        "end_time": resolved_end_time,
        "resolved_datetimes": resolved_datetimes,
        "time_window": time_window,
        "candidate_results": candidate_results,
        "recommended_candidates": recommended_candidates,
        "extended_candidates": extended_candidates,
        "excluded_candidates": excluded_candidates        

    }