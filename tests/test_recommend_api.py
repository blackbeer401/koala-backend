import unittest
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

from main import app


def intent(**overrides):
    result = {
        "start_location_text": None,
        "target_location_text": None,
        "target_location_scope": None,
        "end_location_text": None,
        "start_time": "12:00",
        "end_time": None,
        "activities": ["cafe"],
        "transport_mode": "auto",
    }
    result.update(overrides)
    return result


def candidate(code, name, latitude, longitude):
    return {
        "AREA_CD": code,
        "AREA_NM": name,
        "CATEGORY": "발달상권",
        "latitude": latitude,
        "longitude": longitude,
    }


def activity_scores(candidates):
    return pd.DataFrame([
        {
            **place,
            "food_score": 1,
            "cafe_score": index,
            "drink_score": 1,
            "entertainment_score": 1,
            "walk_score": 1,
            "culture_score": 1,
            "shopping_score": 1,
        }
        for index, place in enumerate(candidates, start=3)
    ])


class RecommendAPITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.candidates = [
            candidate("A", "지역 A", 37.50, 127.00),
            candidate("B", "지역 B", 37.51, 127.01),
            candidate("C", "지역 C", 37.52, 127.02),
        ]

    @patch("main.generate_recommendation_message", return_value="추천 설명")
    @patch("main.get_congestion_data", return_value=None)
    @patch("main.get_travel", return_value={"duration_min": 20})
    @patch("main.load_poi_activity_scores")
    @patch("main.load_poi_candidates")
    @patch("main.parse_user_intent")
    def test_gps_normal_flow_preserves_response_contract(
        self,
        mock_parse,
        mock_load_candidates,
        mock_load_scores,
        mock_get_travel,
        mock_get_congestion,
        mock_generate_message,
    ):
        mock_parse.return_value = intent()
        mock_load_candidates.return_value = self.candidates
        mock_load_scores.return_value = activity_scores(self.candidates)

        response = self.client.post(
            "/recommend",
            json={
                "user_message": "근처 카페 추천해줘",
                "gps_latitude": 37.4765,
                "gps_longitude": 126.9816,
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            set(body),
            {
                "recommendation_message",
                "target_area",
                "current_area",
                "other_areas",
                "extended_areas",
            },
        )
        self.assertEqual(body["recommendation_message"], "추천 설명")
        self.assertIsNone(body["target_area"])
        self.assertIsNone(body["current_area"])
        self.assertEqual(len(body["other_areas"]), 3)
        self.assertEqual(body["extended_areas"], [])
        mock_get_travel.assert_called()
        mock_generate_message.assert_called_once()

    @patch("main.generate_recommendation_message", return_value="목적지 추천")
    @patch("main.get_congestion_data", return_value=None)
    @patch("main.get_travel", return_value={"duration_min": 20})
    @patch("main.search_location")
    @patch("main.load_poi_activity_scores")
    @patch("main.load_poi_candidates")
    @patch("main.parse_user_intent")
    def test_text_target_place_and_end_location_return_target_area_only(
        self,
        mock_parse,
        mock_load_candidates,
        mock_load_scores,
        mock_search_location,
        mock_get_travel,
        mock_get_congestion,
        mock_generate_message,
    ):
        mock_parse.return_value = intent(
            start_location_text="서울역",
            target_location_text="강남역",
            target_location_scope="place",
            end_location_text="잠실역",
            end_time="15:00",
            transport_mode="public_transit",
        )
        mock_load_candidates.return_value = self.candidates
        mock_load_scores.return_value = activity_scores(self.candidates)
        mock_search_location.side_effect = [
            {"name": "서울역", "x": 126.97, "y": 37.55},
            {"name": "강남역", "x": 127.01, "y": 37.51},
            {"name": "잠실역", "x": 127.10, "y": 37.51},
        ]

        response = self.client.post(
            "/recommend",
            json={"user_message": "서울역에서 강남역에 들렀다가 잠실로 가"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["target_area"]["AREA_CD"], "B")
        self.assertIsNone(body["current_area"])
        self.assertEqual(body["other_areas"], [])
        self.assertEqual(mock_search_location.call_count, 3)
        self.assertTrue(all(
            call.kwargs["transport_mode"] == "public_transit"
            for call in mock_get_travel.call_args_list
        ))

    @patch("main.generate_recommendation_message", return_value="일부 후보 추천")
    @patch("main.get_congestion_data", return_value=None)
    @patch("main.load_poi_activity_scores")
    @patch("main.load_poi_candidates")
    @patch("main.parse_user_intent")
    def test_failed_travel_candidate_is_skipped_without_losing_valid_candidates(
        self,
        mock_parse,
        mock_load_candidates,
        mock_load_scores,
        mock_get_congestion,
        mock_generate_message,
    ):
        candidates = self.candidates[:2]
        mock_parse.return_value = intent()
        mock_load_candidates.return_value = candidates
        mock_load_scores.return_value = activity_scores(candidates)

        def travel(_, __, end_x, ___, transport_mode="auto"):
            return None if end_x == 127.00 else {"duration_min": 20}

        with patch("main.get_travel", side_effect=travel):
            response = self.client.post(
                "/recommend",
                json={
                    "user_message": "근처 카페 추천해줘",
                    "gps_latitude": 37.4765,
                    "gps_longitude": 126.9816,
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            [place["AREA_CD"] for place in body["other_areas"]],
            ["B"],
        )
        self.assertEqual(body["other_areas"][0]["congestion_score"], 3)

    @patch("main.generate_recommendation_message")
    @patch("main.load_poi_candidates", return_value=[])
    @patch("main.parse_user_intent", return_value=intent())
    def test_missing_start_location_preserves_error_contract(
        self,
        mock_parse,
        mock_load_candidates,
        mock_generate_message,
    ):
        response = self.client.post(
            "/recommend",
            json={"user_message": "카페 추천해줘"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "error": "start_location_missing",
                "message": "시작 위치 정보가 필요합니다.",
            },
        )
        mock_generate_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
