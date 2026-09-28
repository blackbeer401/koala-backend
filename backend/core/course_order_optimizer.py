from concurrent.futures import ThreadPoolExecutor, as_completed
from itertools import permutations

from course_time_evaluator import evaluate_course_time
import route_travel_time


MAX_OPTIMIZATION_PLACES = 6
MAX_ROUTE_LOOKUP_WORKERS = 6


def _route_key(origin, destination, transport_mode):
    return (
        float(origin["longitude"]),
        float(origin["latitude"]),
        float(destination["longitude"]),
        float(destination["latitude"]),
        transport_mode,
    )


def _prefetch_route_times(
    start_location,
    selected_places,
    end_location,
    transport_mode,
    travel_cache,
    preferred_first=None,
):
    """Fetch each directed leg once, concurrently, before evaluating permutations."""
    start_places = [preferred_first] if preferred_first else selected_places
    start_keys = [
        _route_key(start_location, place, transport_mode)
        for place in start_places
    ]

    def fetch(keys):
        missing = list(dict.fromkeys(key for key in keys if key not in travel_cache))
        if not missing:
            return
        with ThreadPoolExecutor(max_workers=MAX_ROUTE_LOOKUP_WORKERS) as executor:
            futures = {
                executor.submit(
                    route_travel_time.get_travel,
                    *key[:4],
                    transport_mode=key[4],
                ): key
                for key in missing
            }
            for future in as_completed(futures):
                key = futures[future]
                try:
                    travel_cache[key] = future.result()
                except Exception:
                    # A failed directed leg excludes routes that use it; other
                    # candidates can still produce a complete course.
                    travel_cache[key] = None

    fetch(start_keys)
    if start_keys and not any(
        isinstance(travel_cache.get(key), dict)
        and "duration_min" in travel_cache[key]
        for key in start_keys
    ):
        raise RuntimeError("모든 방문 순서에서 출발지 구간을 계산할 수 없습니다.")

    place_keys = [
        _route_key(origin, destination, transport_mode)
        for origin in selected_places
        for destination in selected_places
        if origin is not destination
    ]
    if end_location is not None:
        place_keys.extend(
            _route_key(place, end_location, transport_mode)
            for place in selected_places
        )
    fetch(place_keys)


def optimize_course_order(
    start_location: dict,
    selected_places: list[dict],
    available_time_minutes: int,
    end_location: dict | None = None,
    transport_mode: str = "auto",
) -> dict:
    # 순열 탐색 비용을 제한하기 위한 MVP 상한이며, 실제 이동시간으로 모든 허용 순서를 비교한다.
    if len(selected_places) > MAX_OPTIMIZATION_PLACES:
        raise ValueError(
            f"방문 순서 최적화는 최대 {MAX_OPTIMIZATION_PLACES}개 장소까지 지원합니다."
        )

    preferred_places = [
        place
        for place in selected_places
        if place.get("preferred_first", False)
    ]
    if len(preferred_places) > 1:
        raise ValueError(
            "preferred_first=True인 장소는 최대 1개만 허용됩니다."
        )

    # 선호 첫 방문지가 있으면 그 장소를 고정하고 나머지 장소의 순서만 최적화한다.
    if preferred_places:
        preferred_place = preferred_places[0]
        remaining_places = [
            place
            for place in selected_places
            if place is not preferred_place
        ]
        orders = (
            (preferred_place, *remaining_order)
            for remaining_order in permutations(remaining_places)
        )
    else:
        orders = (
            [tuple(selected_places)]
            if len(selected_places) <= 1
            else permutations(selected_places)
        )
    # 같은 directed 구간을 여러 순열에서 재사용하므로 요청 단위 cache로 지도 API 중복 호출을 막는다.
    travel_cache = {}
    _prefetch_route_times(
        start_location,
        selected_places,
        end_location,
        transport_mode,
        travel_cache,
        preferred_first=preferred_places[0] if preferred_places else None,
    )
    best_order = None
    best_result = None

    for order in orders:
        try:
            result = evaluate_course_time(
                start_location,
                list(order),
                available_time_minutes,
                end_location,
                transport_mode,
                travel_cache,
            )
        except RuntimeError:
            # 한 순서의 leg 조회 실패는 해당 순서만 제외하고 다른 순서는 계속 평가한다.
            continue

        if (
            best_result is None
            or result["total_travel_time_minutes"]
            < best_result["total_travel_time_minutes"]
        ):
            best_order = list(order)
            best_result = result

    if best_result is None:
        raise RuntimeError(
            "모든 방문 순서의 이동시간을 계산할 수 없습니다."
        )

    # feasible 여부는 evaluate_course_time이 계산한 시간창 결과를 그대로 함께 반환한다.
    return {
        "optimized_places": best_order,
        **best_result,
    }
