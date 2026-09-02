import unittest
from unittest.mock import patch

from pydantic import ValidationError

from main import validate_place_selection
from models import PlaceSelectionValidationRequest


def request(selected_places, available_time_minutes):
    return PlaceSelectionValidationRequest(
        selected_places=selected_places,
        available_time_minutes=available_time_minutes,
    )


class PlaceSelectionValidationTest(unittest.TestCase):
    def test_returns_pending_for_normal_selection(self):
        result = validate_place_selection(
            request([{"name": "A", "category": "food"}], 60)
        )

        self.assertEqual(result["status"], "PENDING_TRAVEL_TIME_VALIDATION")
        self.assertEqual(result["selected_places"][0]["name"], "A")

    def test_returns_tight_when_only_planned_total_exceeds(self):
        result = validate_place_selection(
            request(
                [{"category": "food"}, {"category": "cafe"}],
                90,
            )
        )

        self.assertEqual(result["status"], "TIGHT_BY_STAY_TIME")

    def test_returns_impossible_when_minimum_total_exceeds(self):
        result = validate_place_selection(
            request(
                [{"category": "food"}, {"category": "cafe"}],
                79,
            )
        )

        self.assertEqual(result["status"], "IMPOSSIBLE_BY_STAY_TIME")

    def test_returns_mixed_explicit_and_default_totals(self):
        result = validate_place_selection(
            request(
                [
                    {"category": "food", "specified_duration_minutes": 70},
                    {"category": "cafe"},
                ],
                105,
            )
        )

        validation = result["stay_time_validation"]
        self.assertEqual(validation["total_stay_duration_minutes"], 115)
        self.assertEqual(validation["total_minimum_stay_duration_minutes"], 100)
        self.assertEqual(result["status"], "TIGHT_BY_STAY_TIME")

    def test_exact_boundary_remains_pending(self):
        result = validate_place_selection(
            request([{"category": "shopping"}], 60)
        )

        self.assertEqual(result["status"], "PENDING_TRAVEL_TIME_VALIDATION")

    def test_rejects_invalid_requests(self):
        invalid_requests = [
            {"selected_places": [], "available_time_minutes": 60},
            {
                "selected_places": [{"category": "invalid"}],
                "available_time_minutes": 60,
            },
            {
                "selected_places": [{"category": "food"}],
                "available_time_minutes": 0,
            },
            {
                "selected_places": [
                    {"category": "food", "specified_duration_minutes": 0}
                ],
                "available_time_minutes": 60,
            },
        ]

        for payload in invalid_requests:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    PlaceSelectionValidationRequest(**payload)

    @patch("map_service.get_travel")
    def test_does_not_call_travel_api(self, mock_get_travel):
        validate_place_selection(
            request([{"category": "food"}], 60)
        )

        mock_get_travel.assert_not_called()


if __name__ == "__main__":
    unittest.main()
