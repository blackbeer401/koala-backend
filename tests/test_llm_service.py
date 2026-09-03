import unittest
from unittest.mock import patch

from llm_service import parse_user_intent
from models import StructuredConditions


class LlmServiceTest(unittest.TestCase):
    @patch("llm_service.parse_intent")
    def test_parse_user_intent_delegates_to_freeze_parser(self, mock_parse_intent):
        intent = {
            "start_location_text": "사당",
            "target_location_text": "잠실",
            "target_location_scope": "place",
            "end_location_text": None,
            "start_time": None,
            "end_time": "19:00",
            "start_time_period": None,
            "end_time_period": None,
            "desired_duration_min_minutes": 30,
            "desired_duration_max_minutes": 60,
            "activities": ["cafe"],
            "transport_mode": "auto",
            "companions": [],
            "budget_max": None,
            "budget_preference": None,
            "space_preference": None,
        }
        mock_parse_intent.return_value = intent

        result = parse_user_intent("7시 전에 카페", "2026-09-03T12:00:00+09:00")

        self.assertEqual(result, intent)
        mock_parse_intent.assert_called_once_with(
            "7시 전에 카페",
            runtime_context={
                "current_datetime": "2026-09-03T12:00:00+09:00",
                "timezone": "Asia/Seoul",
            },
        )
        self.assertEqual(StructuredConditions(**result).activities, ["cafe"])


if __name__ == "__main__":
    unittest.main()
