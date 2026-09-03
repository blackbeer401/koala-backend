import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from main import calculate_course
from models import CourseCalculationRequest


def course_request(
    selected_places,
    end_location=None,
    available_time_minutes=180,
    transport_mode="auto",
):
    return CourseCalculationRequest(
        start_location={"latitude": 37.0, "longitude": 127.0},
        selected_places=selected_places,
        available_time_minutes=available_time_minutes,
        end_location=end_location,
        transport_mode=transport_mode,
    )


def place(name, longitude):
    return {
        "name": name,
        "category": "cafe",
        "latitude": 37.0,
        "longitude": longitude,
    }


def course_result(status="FEASIBLE"):
    return {
        "optimized_places": [],
        "legs": [],
        "total_travel_time_minutes": 20,
        "total_stay_time_minutes": 45,
        "total_required_minutes": 65,
        "available_time_minutes": 180,
        "remaining_time_minutes": 115,
        "status": status,
    }


class CourseApiTest(unittest.TestCase):
    @patch("main.optimize_course_order")
    def test_single_place_without_end_location(self, mock_optimize):
        mocked_result = course_result()
        mocked_result["optimized_places"] = [
            {
                "name": "A",
                "category": "cafe",
                "activity": "cafe",
                "latitude": 37.0,
                "longitude": 127.1,
            }
        ]
        mock_optimize.return_value = mocked_result

        result = calculate_course(course_request([place("A", 127.1)]))

        self.assertEqual(result["status"], "FEASIBLE")

        # optimizer 내부에는 체류시간 계산용 activity가 전달된다.
        kwargs = mock_optimize.call_args.kwargs
        self.assertEqual(len(kwargs["selected_places"]), 1)
        self.assertEqual(kwargs["selected_places"][0]["activity"], "cafe")
        self.assertIsNone(kwargs["end_location"])

        # 최종 API 응답에서는 내부 계산용 activity를 제거한다.
        self.assertNotIn("activity", result["optimized_places"][0])
        self.assertEqual(result["optimized_places"][0]["category"], "cafe")

    @patch("main.optimize_course_order")
    def test_multiple_places_with_fixed_end_location(self, mock_optimize):
        expected = course_result()
        expected["optimized_places"] = [place("B", 127.2), place("A", 127.1)]
        mock_optimize.return_value = expected
        end = {"latitude": 37.5, "longitude": 127.5}

        result = calculate_course(
            course_request(
                [place("A", 127.1), place("B", 127.2)],
                end_location=end,
                transport_mode="public_transit",
            )
        )

        self.assertEqual(result, expected)
        kwargs = mock_optimize.call_args.kwargs
        self.assertEqual(kwargs["end_location"], end)
        self.assertEqual(kwargs["transport_mode"], "public_transit")

    @patch("main.optimize_course_order")
    def test_returns_infeasible_result_unchanged(self, mock_optimize):
        expected = course_result("INFEASIBLE")
        expected["remaining_time_minutes"] = -10
        mock_optimize.return_value = expected

        result = calculate_course(course_request([place("A", 127.1)]))

        self.assertEqual(result["status"], "INFEASIBLE")
        self.assertEqual(result["remaining_time_minutes"], -10)

    def test_rejects_more_than_six_places_in_request_model(self):
        with self.assertRaises(ValidationError):
            course_request(
                [place(str(index), 127.0 + index / 100) for index in range(7)]
            )

    @patch("main.optimize_course_order", side_effect=RuntimeError("이동시간 실패"))
    def test_returns_bad_gateway_when_travel_calculation_fails(
        self,
        mock_optimize,
    ):
        with self.assertRaises(HTTPException) as context:
            calculate_course(course_request([place("A", 127.1)]))

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(context.exception.detail, "이동시간 실패")

    def test_request_model_rejects_invalid_input(self):
        invalid_payloads = [
            {"selected_places": []},
            {
                "selected_places": [place("A", 127.1)],
                "start_location": {"latitude": 91, "longitude": 127.0},
            },
            {"selected_places": [place("A", 127.1)], "available_time_minutes": 0},
            {"selected_places": [place("A", 127.1)], "transport_mode": "bike"},
        ]

        for changes in invalid_payloads:
            payload = {
                "start_location": {"latitude": 37.0, "longitude": 127.0},
                "selected_places": [place("A", 127.1)],
                "available_time_minutes": 180,
            } | changes
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    CourseCalculationRequest(**payload)


if __name__ == "__main__":
    unittest.main()
