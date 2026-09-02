import unittest

from stay_time_validation import (
    IMPOSSIBLE_BY_STAY_TIME,
    PENDING_TRAVEL_TIME_VALIDATION,
    validate_selected_places_stay_time,
)


class StayTimeValidationTest(unittest.TestCase):
    def test_impossible_when_stay_time_exceeds_available_time(self):
        result = validate_selected_places_stay_time(
            [
                {"activity": "food"},
                {"activity": "cafe", "specified_duration_minutes": 50},
            ],
            available_time_minutes=100,
        )

        self.assertEqual(result["stay_durations_minutes"], [60, 50])
        self.assertEqual(result["total_stay_duration_minutes"], 110)
        self.assertEqual(result["status"], IMPOSSIBLE_BY_STAY_TIME)

    def test_pending_when_stay_time_is_less_than_available_time(self):
        result = validate_selected_places_stay_time(
            [{"activity": "walk"}],
            available_time_minutes=60,
        )

        self.assertEqual(result["status"], PENDING_TRAVEL_TIME_VALIDATION)

    def test_pending_when_stay_time_equals_available_time(self):
        result = validate_selected_places_stay_time(
            [{"activity": "shopping"}],
            available_time_minutes=60,
        )

        self.assertEqual(result["status"], PENDING_TRAVEL_TIME_VALIDATION)


if __name__ == "__main__":
    unittest.main()
