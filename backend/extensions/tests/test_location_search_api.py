import pytest
from fastapi import HTTPException

import extension_routes


def test_search_location_returns_coordinates_for_manual_start(monkeypatch):
    monkeypatch.setattr(
        extension_routes,
        "search_location",
        lambda query: {
            "name": "홍대입구역",
            "address": "서울 마포구 양화로 160",
            "x": 126.9236,
            "y": 37.5563,
        },
    )

    result = extension_routes.search_location_api("홍대역")

    assert result == {
        "name": "홍대입구역",
        "address": "서울 마포구 양화로 160",
        "latitude": 37.5563,
        "longitude": 126.9236,
    }


def test_search_location_reports_unknown_region(monkeypatch):
    monkeypatch.setattr(extension_routes, "search_location", lambda query: None)

    with pytest.raises(HTTPException) as error:
        extension_routes.search_location_api("없는지역")

    assert error.value.status_code == 404
