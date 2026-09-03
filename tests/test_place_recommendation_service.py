import unittest
from unittest.mock import patch

from place_ranking import calculate_distance_score
from seoul_culture_service import SeoulCultureAPIError
from place_recommendation_cache import (
    PLACE_PAGE_SIZE,
    PlaceCursorExpiredError,
    PlaceCursorNotFoundError,
    clear_place_recommendation_cache,
    create_place_recommendation_page,
    get_next_place_recommendation_page,
)
from place_recommendation_service import (
    SUPPORTED_PLACE_ACTIVITIES,
    finalize_recommended_places,
    recommend_places,
    resolve_place_activities,
)


def make_place(name: str, category: str, distance_m: int):
    return {
        "source": "kakao",
        "source_id": name,
        "name": name,
        "latitude": 37.5 + distance_m / 10000000,
        "longitude": 126.9 + distance_m / 10000000,
        "category": category,
        "category_detail": category,
        "address": f"{name} 주소",
        "distance_m": distance_m,
    }


def make_kakao_places(count: int, prefix: str = "카페"):
    return [
        {
            "id": f"{prefix}-{index}",
            "place_name": f"{prefix} {index}",
            "x": str(126.9 + index / 10000),
            "y": str(37.5 + index / 10000),
            "category_name": prefix,
            "address_name": f"주소 {index}",
            "distance": str(index * 100),
        }
        for index in range(count)
    ]


class ActivityPolicyTests(unittest.TestCase):

    def test_single_activity_returns_only_that_activity(self):
        result = finalize_recommended_places(
            [
                make_place("음식점", "food", 100),
                make_place("카페 1", "cafe", 200),
                make_place("카페 2", "cafe", 100),
            ],
            ["cafe"],
        )

        self.assertEqual(
            [place["name"] for place in result],
            ["카페 2", "카페 1"],
        )

    def test_multiple_activities_use_round_robin(self):
        result = finalize_recommended_places(
            [
                make_place("음식 2", "food", 200),
                make_place("카페 1", "cafe", 100),
                make_place("음식 1", "food", 100),
                make_place("카페 2", "cafe", 200),
            ],
            ["food", "cafe"],
        )

        self.assertEqual(
            [place["name"] for place in result],
            ["음식 1", "카페 1", "음식 2", "카페 2"],
        )

    def test_empty_activities_open_supported_provider_activities(self):
        self.assertEqual(
            resolve_place_activities([]),
            SUPPORTED_PLACE_ACTIVITIES,
        )

    def test_activity_without_candidates_is_skipped(self):
        result = finalize_recommended_places(
            [
                make_place("카페 1", "cafe", 100),
                make_place("카페 2", "cafe", 200),
            ],
            ["food", "cafe", "culture"],
        )

        self.assertEqual(
            [place["name"] for place in result],
            ["카페 1", "카페 2"],
        )

    def test_unsupported_activity_is_not_given_fake_mapping(self):
        self.assertEqual(resolve_place_activities(["walk", "drink"]), [])

    def test_distance_based_score_is_unchanged(self):
        result = finalize_recommended_places(
            [make_place("거리 테스트", "cafe", 1000)],
            ["cafe"],
        )

        self.assertEqual(
            result[0]["place_score"],
            calculate_distance_score(1000),
        )
        self.assertEqual(result[0]["distance_score"], 50.0)


class PlaceRecommendationCacheTests(unittest.TestCase):

    def setUp(self):
        clear_place_recommendation_cache()

    def tearDown(self):
        clear_place_recommendation_cache()

    def test_first_page_returns_at_most_six_places(self):
        places = [
            make_place(f"카페 {index}", "cafe", index * 100)
            for index in range(10)
        ]
        page = create_place_recommendation_page("지역", places)

        self.assertEqual(len(page.places), PLACE_PAGE_SIZE)
        self.assertTrue(page.has_more)
        self.assertIsNotNone(page.cursor)
        self.assertEqual(page.next_offset, PLACE_PAGE_SIZE)

    def test_round_robin_order_continues_on_next_page(self):
        places = []

        for index in range(7):
            places.extend([
                make_place(f"음식 {index}", "food", index * 100),
                make_place(f"카페 {index}", "cafe", index * 100),
            ])

        ordered = finalize_recommended_places(places, ["food", "cafe"])
        first_page = create_place_recommendation_page("지역", ordered)
        second_page = get_next_place_recommendation_page(
            first_page.cursor,
            first_page.next_offset,
        )

        self.assertEqual(
            [place["name"] for place in first_page.places],
            ["음식 0", "카페 0", "음식 1", "카페 1", "음식 2", "카페 2"],
        )
        self.assertEqual(
            [place["name"] for place in second_page.places],
            ["음식 3", "카페 3", "음식 4", "카페 4", "음식 5", "카페 5"],
        )

    def test_places_do_not_repeat_between_pages(self):
        places = [
            make_place(f"장소 {index}", "cafe", index * 100)
            for index in range(8)
        ]
        places.append(places[0].copy())
        ordered = finalize_recommended_places(places, ["cafe"])
        first_page = create_place_recommendation_page("지역", ordered)
        second_page = get_next_place_recommendation_page(
            first_page.cursor,
            first_page.next_offset,
        )
        names = [
            place["name"]
            for place in first_page.places + second_page.places
        ]

        self.assertEqual(len(names), len(set(names)))

    def test_last_page_can_have_fewer_than_six_places(self):
        places = [
            make_place(f"장소 {index}", "cafe", index * 100)
            for index in range(8)
        ]
        first_page = create_place_recommendation_page("지역", places)
        last_page = get_next_place_recommendation_page(
            first_page.cursor,
            first_page.next_offset,
        )

        self.assertEqual(len(last_page.places), 2)
        self.assertFalse(last_page.has_more)
        self.assertEqual(last_page.cursor, first_page.cursor)
        self.assertIsNone(last_page.next_offset)

    def test_same_cursor_and_offset_returns_same_page_on_retry(self):
        places = [
            make_place(f"장소 {index}", "cafe", index * 100)
            for index in range(10)
        ]
        first_page = create_place_recommendation_page("지역", places)
        first_attempt = get_next_place_recommendation_page(
            first_page.cursor,
            first_page.next_offset,
        )
        retry_attempt = get_next_place_recommendation_page(
            first_page.cursor,
            first_page.next_offset,
        )

        self.assertEqual(first_attempt.places, retry_attempt.places)
        self.assertEqual(
            first_attempt.next_offset,
            retry_attempt.next_offset,
        )

    def test_invalid_cursor_is_rejected(self):
        with self.assertRaises(PlaceCursorNotFoundError):
            get_next_place_recommendation_page(
                "invalid-cursor",
                PLACE_PAGE_SIZE,
            )

    def test_expired_cursor_is_rejected(self):
        places = [
            make_place(f"장소 {index}", "cafe", index * 100)
            for index in range(7)
        ]
        page = create_place_recommendation_page(
            "지역",
            places,
            ttl_seconds=-1,
        )

        with self.assertRaises(PlaceCursorExpiredError):
            get_next_place_recommendation_page(
                page.cursor,
                page.next_offset,
            )


class NormalAndFallbackFlowTests(unittest.TestCase):

    def setUp(self):
        clear_place_recommendation_cache()

    def tearDown(self):
        clear_place_recommendation_cache()

    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value=None,
    )
    @patch(
        "place_recommendation_service.get_nearby_current_exhibitions",
        return_value=[],
    )
    @patch("place_recommendation_service.search_places_by_category")
    def test_empty_activities_collect_all_supported_kakao_categories(
        self,
        mock_search_places,
        mock_get_exhibitions,
        mock_get_region,
    ):
        category_prefixes = {
            "FD6": "음식",
            "CE7": "카페",
            "CT1": "문화",
        }

        def search_side_effect(**kwargs):
            return make_kakao_places(
                2,
                prefix=category_prefixes[kwargs["category_code"]],
            )

        mock_search_places.side_effect = search_side_effect
        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=[],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )

        self.assertEqual(mock_search_places.call_count, 3)
        self.assertEqual(
            [place["category"] for place in ranked_places],
            ["food", "cafe", "culture", "food", "cafe", "culture"],
        )
        mock_get_region.assert_called_once()

    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value=None,
    )
    @patch(
        "place_recommendation_service.get_nearby_current_exhibitions"
    )
    @patch("place_recommendation_service.search_places_by_category")
    def test_culture_places_join_multi_activity_round_robin(
        self,
        mock_search_places,
        mock_get_exhibitions,
        mock_get_region,
    ):
        mock_search_places.side_effect = lambda **kwargs: (
            make_kakao_places(2, prefix="음식")
            if kwargs["category_code"] == "FD6"
            else []
        )
        mock_get_exhibitions.return_value = [
            make_place("전시 1", "culture", 100),
            make_place("전시 2", "culture", 200),
        ]

        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["food", "culture"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )

        self.assertEqual(
            [place["category"] for place in ranked_places],
            ["food", "culture", "food", "culture"],
        )
        mock_get_exhibitions.assert_called_once_with(
            latitude=37.5,
            longitude=126.9,
            max_distance_m=2000,
        )

    @patch("place_recommendation_service.get_hub_places")
    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value={"sigungu_name": "마포구"},
    )
    @patch(
        "place_recommendation_service.get_nearby_current_exhibitions",
        side_effect=SeoulCultureAPIError("장애"),
    )
    @patch("place_recommendation_service.search_places_by_category")
    def test_culture_api_failure_keeps_kakao_and_tour_results(
        self,
        mock_search_places,
        mock_get_exhibitions,
        mock_get_region,
        mock_get_hub_places,
    ):
        mock_search_places.return_value = make_kakao_places(1, prefix="문화")
        mock_get_hub_places.return_value = [{
            "mapX": "126.9",
            "mapY": "37.5",
            "hubTatsNm": "Tour 문화",
            "hubCtgryMclsNm": "문화관광",
            "hubRank": "1",
        }]

        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["culture"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )

        self.assertEqual(
            {place["source"] for place in ranked_places},
            {"kakao", "tour"},
        )

    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        side_effect=RuntimeError("지역 API 장애"),
    )
    @patch(
        "place_recommendation_service.get_nearby_current_exhibitions",
        return_value=[make_place("현재 전시", "culture", 100)],
    )
    @patch(
        "place_recommendation_service.search_places_by_category",
        return_value=[],
    )
    def test_tour_fallback_keeps_culture_results(
        self,
        mock_search_places,
        mock_get_exhibitions,
        mock_get_region,
    ):
        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["culture"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )

        self.assertEqual(
            [place["name"] for place in ranked_places],
            ["현재 전시"],
        )

    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value=None,
    )
    @patch("place_recommendation_service.get_nearby_current_exhibitions")
    @patch(
        "place_recommendation_service.search_places_by_category",
        return_value=[],
    )
    def test_non_culture_does_not_call_culture_api(
        self,
        mock_search_places,
        mock_get_exhibitions,
        mock_get_region,
    ):
        recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["cafe"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )

        mock_get_exhibitions.assert_not_called()

    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value=None,
    )
    @patch("place_recommendation_service.search_places_by_category")
    def test_fallback_uses_same_pagination_policy(
        self,
        mock_search_places,
        mock_get_region,
    ):
        mock_search_places.return_value = make_kakao_places(8)
        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["cafe"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )
        page = create_place_recommendation_page("테스트 지역", ranked_places)

        self.assertEqual(len(page.places), 6)
        self.assertTrue(page.has_more)
        mock_get_region.assert_called_once()

    @patch("place_recommendation_service.get_hub_places")
    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value={"sigungu_name": "마포구"},
    )
    @patch("place_recommendation_service.search_places_by_category")
    def test_normal_path_uses_same_pagination_policy(
        self,
        mock_search_places,
        mock_get_region,
        mock_get_hub_places,
    ):
        mock_search_places.return_value = make_kakao_places(8)
        mock_get_hub_places.return_value = [
            {
                "mapX": "126.9",
                "mapY": "37.5",
                "hubTatsNm": "문화 장소",
                "hubCtgryMclsNm": "문화관광",
                "hubRank": "1",
            }
        ]
        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["cafe"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )
        page = create_place_recommendation_page("테스트 지역", ranked_places)

        self.assertEqual(len(page.places), 6)
        self.assertTrue(page.has_more)
        mock_get_hub_places.assert_called_once()

    @patch(
        "place_recommendation_service.get_region_from_coordinates",
        return_value=None,
    )
    @patch("place_recommendation_service.search_places_by_category")
    def test_next_page_does_not_call_external_apis_again(
        self,
        mock_search_places,
        mock_get_region,
    ):
        mock_search_places.return_value = make_kakao_places(8)
        ranked_places = recommend_places(
            area_name="테스트 지역",
            latitude=37.5,
            longitude=126.9,
            activities=["cafe"],
            companions=[],
            budget_max=None,
            budget_preference=None,
            space_preference=None,
        )
        first_page = create_place_recommendation_page(
            "테스트 지역",
            ranked_places,
        )
        search_call_count = mock_search_places.call_count
        region_call_count = mock_get_region.call_count

        get_next_place_recommendation_page(
            first_page.cursor,
            first_page.next_offset,
        )

        self.assertEqual(mock_search_places.call_count, search_call_count)
        self.assertEqual(mock_get_region.call_count, region_call_count)


if __name__ == "__main__":
    unittest.main()
