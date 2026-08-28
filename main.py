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

    real_candidates = load_poi_candidates()[:5]

    test_start = search_location("사당역")
    test_end = search_location("잠실역")

    real_candidate_results = []

    recommended_candidates = []
    extended_candidates = []
    excluded_candidates = []

    for candidate in real_candidates:

        start_to_candidate = get_transit(
            test_start["x"],
            test_start["y"],
            candidate["longitude"],
            candidate["latitude"]
        )

        candidate_to_end = get_transit(
            candidate["longitude"],
            candidate["latitude"],
            test_end["x"],
            test_end["y"]
        )

        available_stay_minutes = calculate_available_stay_minutes(
            time_window["time_window_minutes"],
            start_to_candidate["duration_min"],
            candidate_to_end["duration_min"]
        )

        duration_feasibility = check_duration_feasibility(
            available_stay_minutes,
            mock_conditions.desired_duration_minutes
        )

        travel_time_classification = classify_travel_time(
            time_window["time_window_minutes"],
            start_to_candidate["duration_min"],
            candidate_to_end["duration_min"]
        )

        real_candidate_results.append({
            "AREA_CD": candidate["AREA_CD"],
            "AREA_NM": candidate["AREA_NM"],
            "CATEGORY": candidate["CATEGORY"],
            "start_to_candidate_travel_minutes": start_to_candidate["duration_min"],
            "candidate_to_end_location_travel_minutes": candidate_to_end["duration_min"],
            "available_stay_minutes": available_stay_minutes,
            "duration_feasibility": duration_feasibility,
            "travel_time_classification": travel_time_classification
        })

        if duration_feasibility["is_feasible"] is False:
            excluded_candidates.append(candidate["AREA_NM"])

        elif travel_time_classification["travel_level"] == "extended":
            extended_candidates.append(candidate["AREA_NM"])

        else:
            recommended_candidates.append(candidate["AREA_NM"])



    
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