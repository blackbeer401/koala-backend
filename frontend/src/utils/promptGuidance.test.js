import test from "node:test";
import assert from "node:assert/strict";
import {
  PROMPT_EXAMPLES,
  RECOMMENDATION_GUIDES,
} from "./promptGuidance.js";

test("질문 도움말은 서로 다른 상황의 예시 세 개를 제공한다", () => {
  assert.equal(PROMPT_EXAMPLES.length, 3);
  assert.deepEqual(
    PROMPT_EXAMPLES.map((example) => example.id),
    ["time-and-activity", "ordered-activities", "next-appointment"],
  );
});

test("예시에는 추천에 필요한 지역·시간·활동 단서가 포함된다", () => {
  const combined = PROMPT_EXAMPLES.map((example) => example.text).join(" ");
  assert.match(combined, /홍대역|성수역|신림역/);
  assert.match(combined, /2시간|7시/);
  assert.match(combined, /카페|산책|전시/);
});

test("도움말은 자동 코스와 색다른 추천의 차이를 설명한다", () => {
  assert.deepEqual(
    RECOMMENDATION_GUIDES.map(({ id }) => id),
    ["free-request", "auto-course", "blind-course", "random-course"],
  );
  RECOMMENDATION_GUIDES.forEach((guide) => {
    assert.ok(guide.summary.length > 0);
    assert.ok(guide.description.length > 0);
  });
});

test("미스터리 가이드와 랜덤 코스는 현재 동작을 도움말에 설명한다", () => {
  const mystery = RECOMMENDATION_GUIDES.find(({ id }) => id === "blind-course");
  const random = RECOMMENDATION_GUIDES.find(({ id }) => id === "random-course");

  assert.match(mystery.description, /목적지를 감춘 채/);
  assert.match(mystery.description, /한 구간씩 이동/);
  assert.match(random.description, /실제 이동·체류 시간/);
});
