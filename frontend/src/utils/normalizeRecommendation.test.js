import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCandidate } from "./normalizeRecommendation.js";

test("official congestion forecasts keep their label and identify their source", () => {
  const area = normalizeCandidate({
    AREA_NM: "홍대",
    forecast_congestion: { FCST_CONGEST_LVL: "여유" },
  }, 1);

  assert.equal(area.congestion, "여유");
  assert.equal(area.congestionSource, "실시간 공식 예보");
});

test("ML congestion is shown as a historical-pattern estimate", () => {
  const area = normalizeCandidate({
    AREA_NM: "연남동",
    congestion_source: "ml_relative_population",
    congestion_status: "ok",
    congestion_score: 2.3,
  }, 1);

  assert.equal(area.congestion, "약간 붐빔");
  assert.equal(area.congestionSource, "과거 생활인구 패턴 추정");
});

test("neutral ML fallback is not presented as a congestion forecast", () => {
  const area = normalizeCandidate({
    AREA_NM: "연남동",
    congestion_source: "ml_relative_population",
    congestion_status: "insufficient_history",
    congestion_score: 3,
  }, 1);

  assert.equal(area.congestion, "알 수 없음");
  assert.equal(area.congestionSource, "예측 자료 부족");
});
