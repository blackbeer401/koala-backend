import json
import tempfile
import unittest

from pathlib import Path
from unittest.mock import patch

from popup_service import (
    PopupDataError,
    load_popup_places,
    normalize_popup_place,
)


def make_popup(**overrides):
    popup = {
        "source": "popup",
        "source_id": "popup_1",
        "name": "테스트 팝업",
        "latitude": 37.55,
        "longitude": 126.98,
        "category": "shopping",
        "category_detail": "패션",
        "start_date": "2026-09-01",
        "end_date": "2026-09-30",
        "status": "ACTIVE",
        "opening_time": "10:00",
        "closing_time": "20:00",
        "operation_schedule": [
            {
                "days": ["MON", "TUE", "WED", "THU", "FRI"],
                "opening_time": "10:00",
                "closing_time": "20:00",
                "closed": False,
                "special_days": ["PUBLIC_HOLIDAY"],
            }
        ],
        "confidence": 0.95,
    }
    popup.update(overrides)
    return popup


class PopupServiceTests(unittest.TestCase):
    def write_json(self, directory, data, name="popups.json"):
        path = Path(directory) / name
        path.write_text(
            json.dumps(data, ensure_ascii=False),
            encoding="utf-8",
        )
        return path

    def test_loads_and_normalizes_popup_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, [make_popup()])

            places = load_popup_places(path)

        self.assertEqual(len(places), 1)
        place = places[0]
        self.assertEqual(place["start_at"], "2026-09-01")
        self.assertEqual(place["end_at"], "2026-09-30")
        self.assertNotIn("start_date", place)
        self.assertNotIn("end_date", place)
        self.assertEqual(place["category"], "shopping")
        self.assertEqual(place["confidence"], 0.95)

    def test_reuses_cached_file_data_and_returns_independent_results(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, [make_popup()])

            with patch("popup_service.json.load", wraps=json.load) as mock_load:
                first = load_popup_places(path)
                first[0]["name"] = "변경된 이름"
                second = load_popup_places(path)

        mock_load.assert_called_once()
        self.assertEqual(second[0]["name"], "테스트 팝업")

    def test_preserves_missing_end_date(self):
        place = normalize_popup_place(make_popup(end_date=None))

        self.assertIsNone(place["end_at"])

    def test_preserves_special_days_and_normal_hours(self):
        place = normalize_popup_place(make_popup())
        schedule = place["operation_schedule"][0]

        self.assertEqual(schedule["special_days"], ["PUBLIC_HOLIDAY"])
        self.assertFalse(schedule["closes_next_day"])

    def test_marks_overnight_closing_time(self):
        popup = make_popup(
            opening_time="11:00",
            closing_time="02:00",
            operation_schedule=[
                {
                    "days": ["FRI", "SAT"],
                    "opening_time": "11:00",
                    "closing_time": "02:00",
                    "closed": False,
                }
            ],
        )

        place = normalize_popup_place(popup)

        self.assertTrue(
            place["operation_schedule"][0]["closes_next_day"]
        )

    def test_does_not_mark_24_hour_notation_as_next_day(self):
        popup = make_popup(
            opening_time="00:00",
            closing_time="24:00",
            operation_schedule=[
                {
                    "days": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
                    "opening_time": "00:00",
                    "closing_time": "24:00",
                    "closed": False,
                }
            ],
        )

        place = normalize_popup_place(popup)

        schedule = place["operation_schedule"][0]
        self.assertEqual(schedule["closing_time"], "24:00")
        self.assertFalse(schedule["closes_next_day"])

    def test_missing_operation_schedule_becomes_empty_list(self):
        place = normalize_popup_place(
            make_popup(operation_schedule=None)
        )

        self.assertEqual(place["operation_schedule"], [])

    def test_skips_invalid_records_without_breaking_valid_records(self):
        invalid_records = [
            "not-a-dict",
            make_popup(source_id=""),
            make_popup(source_id="bad-coordinate", latitude="invalid"),
            make_popup(source_id="out-of-range", longitude=200),
        ]
        valid_popup = make_popup(source_id="valid")

        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(
                directory,
                [*invalid_records, valid_popup],
            )

            places = load_popup_places(path)

        self.assertEqual(
            [place["source_id"] for place in places],
            ["valid"],
        )

    def test_missing_file_raises_popup_data_error(self):
        with tempfile.TemporaryDirectory() as directory:
            missing_path = Path(directory) / "missing.json"

            with self.assertRaises(PopupDataError):
                load_popup_places(missing_path)

    def test_malformed_json_raises_popup_data_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "malformed.json"
            path.write_text("{not-json", encoding="utf-8")

            with self.assertRaises(PopupDataError):
                load_popup_places(path)

    def test_non_list_root_raises_popup_data_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, {"places": []})

            with self.assertRaises(PopupDataError):
                load_popup_places(path)


if __name__ == "__main__":
    unittest.main()
