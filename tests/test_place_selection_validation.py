import unittest
from unittest.mock import patch

from pydantic import ValidationError

from main import validate_place_selection
from models import PlaceSelectionValidationRequest


# 테스트에서 반복해서 사용할 요청 객체 생성 함수
def request(selected_places, available_time_minutes):
    return PlaceSelectionValidationRequest(
        selected_places=selected_places,
        available_time_minutes=available_time_minutes,
    )


class PlaceSelectionValidationTest(unittest.TestCase):

    # 일반적인 장소 선택:
    # 기본 체류시간이 사용 가능시간 안에 들어오면
    # 실제 이동시간 검증 단계로 넘어갈 수 있어야 한다.
    def test_returns_pending_for_normal_selection(self):
        result = validate_place_selection(
            request([{"name": "A", "category": "food"}], 60)
        )

        self.assertEqual(
            result["status"],
            "PENDING_TRAVEL_TIME_VALIDATION"
        )
        self.assertEqual(
            result["selected_places"][0]["name"],
            "A"
        )

    # 기본 체류시간으로는 시간이 부족하지만
    # 최소 체류시간까지 줄이면 가능한 경우 TIGHT 상태가 되어야 한다.
    def test_returns_tight_when_only_planned_total_exceeds(self):
        result = validate_place_selection(
            request(
                [
                    {"category": "food"},
                    {"category": "cafe"},
                ],
                90,
            )
        )

        self.assertEqual(
            result["status"],
            "TIGHT_BY_STAY_TIME"
        )

    # 최소 체류시간을 적용해도 사용 가능시간을 초과한다면
    # 체류시간만으로 이미 불가능한 상태가 되어야 한다.
    def test_returns_impossible_when_minimum_total_exceeds(self):
        result = validate_place_selection(
            request(
                [
                    {"category": "food"},
                    {"category": "cafe"},
                ],
                79,
            )
        )

        self.assertEqual(
            result["status"],
            "IMPOSSIBLE_BY_STAY_TIME"
        )

    # 사용자가 직접 체류시간을 지정한 장소와
    # 기본 체류시간을 사용하는 장소가 섞여 있어도
    # 각각의 시간을 올바르게 합산해야 한다.
    def test_returns_mixed_explicit_and_default_totals(self):
        result = validate_place_selection(
            request(
                [
                    {
                        "category": "food",
                        "specified_duration_minutes": 70,
                    },
                    {
                        "category": "cafe",
                    },
                ],
                105,
            )
        )

        validation = result["stay_time_validation"]

        self.assertEqual(
            validation["total_stay_duration_minutes"],
            115,
        )
        self.assertEqual(
            validation["total_minimum_stay_duration_minutes"],
            100,
        )
        self.assertEqual(
            result["status"],
            "TIGHT_BY_STAY_TIME",
        )

    # 기본 체류시간과 사용 가능시간이 정확히 같으면
    # 시간 초과가 아니므로 실제 이동시간 검증 단계로 넘어가야 한다.
    def test_exact_boundary_remains_pending(self):
        result = validate_place_selection(
            request(
                [{"category": "shopping"}],
                60,
            )
        )

        self.assertEqual(
            result["status"],
            "PENDING_TRAVEL_TIME_VALIDATION"
        )

    # 잘못된 요청값들은 Pydantic 단계에서 거부되어야 한다.
    #
    # - 선택 장소가 없는 경우
    # - 지원하지 않는 activity
    # - 사용 가능시간이 0 이하인 경우
    # - 직접 지정한 체류시간이 0 이하인 경우
    def test_rejects_invalid_requests(self):
        invalid_requests = [
            {
                "selected_places": [],
                "available_time_minutes": 60,
            },
            {
                "selected_places": [
                    {"category": "invalid"}
                ],
                "available_time_minutes": 60,
            },
            {
                "selected_places": [
                    {"category": "food"}
                ],
                "available_time_minutes": 0,
            },
            {
                "selected_places": [
                    {
                        "category": "food",
                        "specified_duration_minutes": 0,
                    }
                ],
                "available_time_minutes": 60,
            },
        ]

        for payload in invalid_requests:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    PlaceSelectionValidationRequest(**payload)

    # KOALA MVP에서는 한 코스에 최대 6곳까지만 선택할 수 있다.
    #
    # 따라서 사용자가 7곳 이상을 선택하면
    # 최종 코스 계산까지 넘어가기 전에
    # 사전검증 요청 단계에서 바로 거부해야 한다.
    def test_rejects_more_than_six_selected_places(self):
        payload = {
            "selected_places": [
                {"category": "cafe"}
                for _ in range(7)
            ],
            "available_time_minutes": 300,
        }

        with self.assertRaises(ValidationError):
            PlaceSelectionValidationRequest(**payload)

    # 장소 선택 중 사용하는 사전검증에서는
    # 실제 이동시간 API를 호출하면 안 된다.
    #
    # 실제 이동시간 계산은 사용자가 장소 선택을 완료한 뒤
    # 최종 코스를 계산할 때 수행한다.
    @patch("map_service.get_travel")
    def test_does_not_call_travel_api(self, mock_get_travel):
        validate_place_selection(
            request(
                [{"category": "food"}],
                60,
            )
        )

        mock_get_travel.assert_not_called()


if __name__ == "__main__":
    unittest.main()