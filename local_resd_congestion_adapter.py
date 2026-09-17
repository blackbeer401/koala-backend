"""D-4 Direct congestion adapter for future non-121 recommendation candidates."""

from __future__ import annotations

import importlib
import math
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Callable, Protocol

import pandas as pd

from population_history import PopulationHistoryError, load_population_history


ML_CONGESTION_SOURCE = "ml_relative_population"
NEUTRAL_CONGESTION_SCORE = 3.0
DEFAULT_D4_DIRECT_ARTIFACT_DIR = Path(__file__).resolve().parent / "ml" / "d4_direct"


class D4Provider(Protocol):
    def predict(self, local_resd: object, issue_time: object, population: pd.DataFrame) -> dict:
        ...


@lru_cache(maxsize=1)
def _load_configured_provider(artifact_dir: str) -> D4Provider:
    path = Path(artifact_dir)
    if not path.is_dir():
        raise FileNotFoundError("D-4 Direct artifact directory를 찾을 수 없습니다.")
    path_text = str(path.resolve())
    if path_text not in sys.path:
        sys.path.insert(0, path_text)
    module = importlib.import_module("d4_direct_provider")
    return module.D4DirectProvider(artifact_dir=path)


def _select_d4_horizon(issue_time: object, expected_arrival_time: object) -> tuple[int | None, str | None]:
    try:
        delta_seconds = (
            pd.Timestamp(expected_arrival_time) - pd.Timestamp(issue_time)
        ).total_seconds()
    except (TypeError, ValueError, OverflowError):
        return None, "invalid_arrival_time"
    if not math.isfinite(delta_seconds):
        return None, "invalid_arrival_time"
    if delta_seconds <= 0:
        return None, "arrival_not_after_issue_time"
    if delta_seconds > 360 * 60:
        return None, "arrival_beyond_supported_horizon"
    return math.ceil(delta_seconds / 3600), None


def select_d4_horizon(issue_time: object, expected_arrival_time: object) -> int | None:
    """Choose one of the D-4 +1h..+6h forecasts using ceiling boundaries."""
    return _select_d4_horizon(issue_time, expected_arrival_time)[0]


def _fallback(status: str) -> dict:
    return {
        "congestion_source": ML_CONGESTION_SOURCE,
        "congestion_status": status,
        "congestion_score": NEUTRAL_CONGESTION_SCORE,
    }


class D4DirectCongestionAdapter:
    """Keep D-4 provider details and fallback policy outside recommendation code."""

    def __init__(
        self,
        provider: D4Provider | None = None,
        population_loader: Callable[..., pd.DataFrame] = load_population_history,
        artifact_dir: str | Path | None = None,
    ) -> None:
        self._provider = provider
        self._population_loader = population_loader
        self._artifact_dir = artifact_dir

    def _provider_or_fallback(self) -> D4Provider | None:
        if self._provider is not None:
            return self._provider
        artifact_dir = (
            self._artifact_dir
            or os.getenv("D4_DIRECT_ARTIFACT_DIR")
            or DEFAULT_D4_DIRECT_ARTIFACT_DIR
        )
        try:
            return _load_configured_provider(str(Path(artifact_dir).resolve()))
        except (ImportError, OSError, RuntimeError, ValueError):
            return None

    def predict(
        self,
        local_resd: str,
        issue_time: object,
        expected_arrival_time: object,
        population: pd.DataFrame | None = None,
    ) -> dict:
        horizon, horizon_error = _select_d4_horizon(issue_time, expected_arrival_time)
        if horizon is None:
            return _fallback(horizon_error or "invalid_arrival_time")
        model_issue_time = pd.Timestamp(issue_time)
        if model_issue_time.tzinfo is not None:
            model_issue_time = model_issue_time.tz_localize(None)
        model_issue_time = model_issue_time.floor("h")

        provider = self._provider_or_fallback()
        if provider is None:
            return _fallback("provider_unavailable")

        if population is None:
            try:
                population = self._population_loader(model_issue_time)
            except (PopulationHistoryError, OSError, ValueError):
                return _fallback("population_source_failure")

        try:
            result = provider.predict(local_resd, model_issue_time, population)
        except (OSError, RuntimeError, TypeError, ValueError):
            return _fallback("inference_failure")
        if not isinstance(result, dict):
            return _fallback("malformed_provider_output")
        status = result.get("status")
        if status != "ok":
            return _fallback(str(status) if status else "malformed_provider_output")

        forecasts = result.get("forecasts")
        if not isinstance(forecasts, list):
            return _fallback("malformed_provider_output")
        forecast = next(
            (
                item
                for item in forecasts
                if isinstance(item, dict) and item.get("horizon_hours") == horizon
            ),
            None,
        )
        if forecast is None:
            return _fallback("malformed_provider_output")

        try:
            probabilities = {key: float(forecast[key]) for key in ("p0", "p1", "p2", "p3")}
            relative_index = float(forecast["relative_congestion_index"])
        except (KeyError, TypeError, ValueError):
            return _fallback("malformed_provider_output")
        if (
            not all(math.isfinite(value) and 0 <= value <= 1 for value in probabilities.values())
            or not math.isfinite(relative_index)
            or not math.isclose(sum(probabilities.values()), 1.0, abs_tol=1e-6)
        ):
            return _fallback("malformed_provider_output")

        congestion_score = (
            probabilities["p0"] * 5
            + probabilities["p1"] * 4
            + probabilities["p2"] * 2
            + probabilities["p3"]
        )
        return {
            "congestion_source": ML_CONGESTION_SOURCE,
            "congestion_status": "ok",
            "LOCAL_RESD_CODE": str(local_resd),
            "horizon": horizon,
            **probabilities,
            "relative_congestion_index": relative_index,
            "congestion_score": congestion_score,
        }
