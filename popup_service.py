import json
import math
import re

from copy import deepcopy
from functools import lru_cache
from pathlib import Path


_OPERATION_TIME_PATTERN = re.compile(
    r"^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$"
)


class PopupDataError(RuntimeError):
    """팝업 JSON 파일을 정상적으로 읽을 수 없는 경우."""


def _parse_coordinate(value, minimum: float, maximum: float):
    try:
        coordinate = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(coordinate):
        return None

    if coordinate < minimum or coordinate > maximum:
        return None

    return coordinate


def _time_to_minutes(value):
    if not isinstance(value, str) or not _OPERATION_TIME_PATTERN.fullmatch(value):
        return None

    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def _normalize_operation_schedule(schedule):
    if not isinstance(schedule, list):
        return []

    normalized_schedule = []

    for item in schedule:
        if not isinstance(item, dict):
            continue

        normalized_item = dict(item)
        opening_minutes = _time_to_minutes(
            normalized_item.get("opening_time")
        )
        closing_minutes = _time_to_minutes(
            normalized_item.get("closing_time")
        )

        normalized_item["closes_next_day"] = (
            opening_minutes is not None
            and closing_minutes is not None
            and closing_minutes != 24 * 60
            and closing_minutes < opening_minutes
        )
        normalized_schedule.append(normalized_item)

    return normalized_schedule


def normalize_popup_place(popup: dict):
    """팝업 한 건을 KOALA의 공통 place dict로 정규화한다."""

    if not isinstance(popup, dict):
        return None

    source_id = popup.get("source_id")
    name = popup.get("name")
    category = popup.get("category")
    latitude = _parse_coordinate(popup.get("latitude"), -90, 90)
    longitude = _parse_coordinate(popup.get("longitude"), -180, 180)

    if (
        not isinstance(source_id, str)
        or not source_id.strip()
        or not isinstance(name, str)
        or not name.strip()
        or not isinstance(category, str)
        or not category.strip()
        or latitude is None
        or longitude is None
    ):
        return None

    normalized = dict(popup)
    normalized.update({
        "source": popup.get("source") or "popup",
        "source_id": source_id.strip(),
        "name": name.strip(),
        "latitude": latitude,
        "longitude": longitude,
        "category": category,
        "start_at": popup.get("start_date"),
        "end_at": popup.get("end_date"),
        "operation_schedule": _normalize_operation_schedule(
            popup.get("operation_schedule")
        ),
    })
    normalized.pop("start_date", None)
    normalized.pop("end_date", None)

    return normalized


@lru_cache(maxsize=1)
def _load_popup_places_cached(file_path: str):
    path = Path(file_path)

    try:
        with path.open(encoding="utf-8-sig") as popup_file:
            data = json.load(popup_file)
    except FileNotFoundError as error:
        raise PopupDataError(
            f"팝업 JSON 파일을 찾을 수 없습니다: {path}"
        ) from error
    except (OSError, json.JSONDecodeError) as error:
        raise PopupDataError(
            f"팝업 JSON 파일을 읽을 수 없습니다: {path}"
        ) from error

    if not isinstance(data, list):
        raise PopupDataError("팝업 JSON의 최상위 데이터는 list여야 합니다.")

    return tuple(
        place
        for popup in data
        if (place := normalize_popup_place(popup)) is not None
    )


def load_popup_places(file_path: str | Path):
    """팝업 JSON을 한 번 읽고 정규화된 장소 목록을 반환한다."""

    resolved_path = str(Path(file_path).resolve())
    return deepcopy(list(_load_popup_places_cached(resolved_path)))
