def convert_congestion_to_score(
    congestion_level: str
):
    """
    서울시 혼잡도 등급을
    추천 계산용 1~5점으로 변환한다.
    """

    score_map = {
        "여유": 5,
        "보통": 4,
        "약간 붐빔": 2,
        "붐빔": 1,
    }

    return score_map.get(
        congestion_level,
        3
    )


def convert_travel_ratio_to_score(
    travel_ratio: float
):
    """
    전체 사용 가능 시간 중 이동시간이 차지하는 비율을
    추천 계산용 1~5점으로 변환한다.
    이동 비율이 낮을수록 높은 점수를 준다.

    0%  -> 5점
    30% -> 1점
    """

    score = 5 - (travel_ratio / 0.30) * 4

    return max(1, score)

def calculate_final_score(
    activity_score: float,
    congestion_score: float,
    travel_score: float
):
    """
    활동 적합도, 혼잡도, 이동 부담 점수를
    가중합하여 최종 추천 점수를 계산한다.

    활동 적합도: 50%
    혼잡도: 30%
    이동 부담: 20%
    """

    final_score = (
        activity_score * 0.5
        + congestion_score * 0.3
        + travel_score * 0.2
    )

    return final_score