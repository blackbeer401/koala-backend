"""Layered launcher contract tests.

These tests intentionally import ``run:app`` rather than the upstream core app.
That catches the class of failure where the server starts successfully but the
extension endpoints used by the frontend were never mounted.
"""

from fastapi.testclient import TestClient
from types import SimpleNamespace

from run import app
import extension_routes
import place_routes


EXPECTED_EXTENSION_PATHS = {
    "/reverse-geocode",
    "/search-location",
    "/route-preview",
    "/recommend/adventure",
    "/recommend/adventure/course",
    "/recommend/adventure/blind",
    "/recommend/adventure/blind/reveal",
    "/recommend/adventure/blind/course",
    "/recommend/adventure/blind/course/reveal",
    "/recommend/adventure/quest",
    "/recommend/adventure/seoul",
    "/users/me/favorite-places",
    "/users/me/interactions",
    "/users/me/personalization",
}


def test_launcher_identifies_integrated_backend():
    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.json()["version"] == "mvp2-integrated-extensions"
    assert response.json()["entrypoint"] == "run:app"


def test_frontend_extension_contract_is_mounted():
    paths = set(app.openapi()["paths"])

    assert EXPECTED_EXTENSION_PATHS <= paths


def test_manual_start_location_search_is_available(monkeypatch):
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

    response = TestClient(app).get("/search-location", params={"query": "홍대역"})

    assert response.status_code == 200
    assert response.json()["latitude"] == 37.5563
    assert response.json()["longitude"] == 126.9236


def test_personalization_preferences_reach_place_recommendation(monkeypatch):
    received = {}

    def recommend_places(**kwargs):
        received.update(kwargs)
        return []

    monkeypatch.setattr(place_routes, "recommend_places", recommend_places)
    monkeypatch.setattr(
        place_routes,
        "create_place_recommendation_page",
        lambda **kwargs: SimpleNamespace(
            area_name=kwargs["area_name"], places=[], cursor="test", has_more=False,
            next_offset=None,
        ),
    )

    response = TestClient(app).post(
        "/recommend/places",
        json={
            "area_name": "홍대",
            "latitude": 37.5563,
            "longitude": 126.9236,
            "activities": ["cafe", "culture"],
            "activity_preferences": {"cafe": 5, "culture": 2},
        },
    )

    assert response.status_code == 200
    assert received["activity_preferences"] == {"cafe": 5, "culture": 2}
