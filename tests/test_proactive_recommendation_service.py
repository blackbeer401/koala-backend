import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock

from place_availability import SEOUL_TIMEZONE
from proactive_recommendation_service import find_proactive_suggestion


class ProactiveRecommendationServiceTests(unittest.TestCase):
    def setUp(self):
        self.departure = datetime(2026, 9, 8, 12, 0, tzinfo=SEOUL_TIMEZONE)
        self.start = {"x": 127.0, "y": 37.5}

    def place(self, name="행사", days_left=0, **overrides):
        place = {
            "source": "popup",
            "source_id": name,
            "name": name,
            "latitude": 37.501,
            "longitude": 127.0,
            "category": "culture",
            "start_at": "2026-09-01",
            "end_at": (self.departure.date() + timedelta(days=days_left)).isoformat(),
            "operation_schedule_status": "parsed",
            "operation_schedule": [{}],
        }
        place.update(overrides)
        return place

    @staticmethod
    def open_availability(remaining=120):
        return {
            "status": "open",
            "arrival_at": None,
            "opening_at": None,
            "closing_at": None,
            "remaining_minutes": remaining,
        }

    def find(self, popup_places, **overrides):
        arguments = {
            "start_location": self.start,
            "departure_datetime": self.departure,
            "end_location": None,
            "end_datetime": None,
            "transport_mode": "auto",
            "load_popup_places_fn": Mock(return_value=popup_places),
            "load_culture_places_fn": Mock(return_value=[]),
            "get_travel_fn": Mock(return_value={"mode": "walk", "duration_min": 10}),
            "evaluate_availability_fn": Mock(
                return_value=self.open_availability()
            ),
        }
        arguments.update(overrides)
        return find_proactive_suggestion(**arguments)

    def test_today_and_ending_soon_are_recommended(self):
        today = self.find([self.place()])
        soon = self.find([self.place(days_left=3)])

        self.assertEqual(today["reason"], "ending_today")
        self.assertEqual(soon["reason"], "ending_soon")

    def test_missing_or_distant_end_date_is_excluded(self):
        self.assertIsNone(self.find([self.place(days_left=4)]))
        self.assertIsNone(self.find([self.place(end_at=None)]))

    def test_place_outside_two_kilometers_is_excluded(self):
        self.assertIsNone(self.find([
            self.place(latitude=37.53),
        ]))

    def test_only_open_place_with_enough_minimum_stay_is_recommended(self):
        for status in ("closed", "unknown"):
            with self.subTest(status=status):
                self.assertIsNone(self.find(
                    [self.place()],
                    evaluate_availability_fn=Mock(return_value={
                        **self.open_availability(),
                        "status": status,
                    }),
                ))

        self.assertIsNone(self.find(
            [self.place()],
            evaluate_availability_fn=Mock(
                return_value=self.open_availability(59)
            ),
        ))

    def test_next_schedule_must_leave_minimum_stay_and_buffer(self):
        travel = Mock(side_effect=[
            {"mode": "walk", "duration_min": 10},
            {"mode": "walk", "duration_min": 30},
        ])
        result = self.find(
            [self.place()],
            end_location={"x": 127.1, "y": 37.6},
            end_datetime=self.departure + timedelta(minutes=100),
            get_travel_fn=travel,
        )

        self.assertIsNone(result)

    def test_no_next_schedule_does_not_require_onward_travel(self):
        travel = Mock(return_value={"mode": "walk", "duration_min": 10})
        result = self.find([self.place()], get_travel_fn=travel)

        self.assertIsNotNone(result)
        self.assertIsNone(result["fits_before_next_schedule"])
        self.assertEqual(travel.call_count, 1)

    def test_failed_candidate_continues_to_next_candidate(self):
        travel = Mock(side_effect=[None, {"mode": "walk", "duration_min": 10}])
        result = self.find(
            [self.place("첫째"), self.place("둘째", latitude=37.502)],
            get_travel_fn=travel,
        )

        self.assertEqual(result["place"]["name"], "둘째")

    def test_each_source_failure_isolated(self):
        culture = Mock(return_value=[self.place("문화행사")])
        result = self.find(
            [],
            load_popup_places_fn=Mock(side_effect=RuntimeError),
            load_culture_places_fn=culture,
        )
        self.assertEqual(result["place"]["name"], "문화행사")

        result = self.find(
            [self.place("팝업")],
            load_culture_places_fn=Mock(side_effect=RuntimeError),
        )
        self.assertEqual(result["place"]["name"], "팝업")

    def test_no_candidate_returns_none(self):
        self.assertIsNone(self.find([]))

    def test_candidate_category_is_not_filtered_by_requested_activity(self):
        result = self.find([self.place(category="entertainment")])
        self.assertEqual(result["place"]["category"], "entertainment")

    def test_only_three_candidates_use_actual_travel(self):
        travel = Mock(return_value={"mode": "walk", "duration_min": 10})
        result = self.find(
            [self.place(str(index), latitude=37.5 + index / 10000) for index in range(1, 5)],
            get_travel_fn=travel,
            evaluate_availability_fn=Mock(return_value={
                **self.open_availability(),
                "status": "closed",
            }),
        )

        self.assertIsNone(result)
        self.assertEqual(travel.call_count, 3)

    def test_future_departure_message_does_not_say_now(self):
        future = datetime.now(SEOUL_TIMEZONE) + timedelta(hours=2)
        result = self.find(
            [self.place(
                start_at=future.date().isoformat(),
                end_at=future.date().isoformat(),
            )],
            departure_datetime=future,
        )

        self.assertNotIn("지금 출발하면", result["message"])


if __name__ == "__main__":
    unittest.main()
