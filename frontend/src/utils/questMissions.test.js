import test from "node:test";
import assert from "node:assert/strict";
import {
  createDailyCourseQuestPlan,
  getCourseQuestSignature,
  getDailyQuestStorageKeys,
  getQuestProgressKey,
  questForPlace,
  readQuestProgress,
  writeQuestProgress,
} from "./questMissions.js";

const place = (name, category) => ({
  id: name,
  name,
  category,
  latitude: 37.5,
  longitude: 127,
});

test("각 장소 유형은 실행 가능한 시간·난이도와 구체적인 미션을 제공한다", () => {
  for (const category of ["food", "cafe", "walk", "culture", "entertainment", "shopping", "drink"]) {
    const quest = questForPlace(place("오늘의 장소", category), "2026-09-27");
    assert.ok(quest.title.length > 5);
    assert.ok(quest.detail.length > 10);
    assert.ok(quest.minutes > 0 && quest.minutes <= 10);
    assert.ok(["가벼움", "보통", "도전"].includes(quest.difficulty));
  }
});

test("같은 장소와 날짜에는 같은 미션을 주고 날짜가 바뀌면 선택을 바꾼다", () => {
  const target = place("홍대 산책로", "walk");
  assert.deepEqual(
    questForPlace(target, "2026-09-27"),
    questForPlace(target, "2026-09-27"),
  );
  assert.notDeepEqual(
    questForPlace(target, "2026-09-27"),
    questForPlace(target, "2026-09-28"),
  );
});

test("확정 코스에서 하루 최대 두 개의 미션을 다른 방문지에 배정한다", () => {
  const places = [
    place("식당", "food"),
    place("카페", "cafe"),
    place("산책로", "walk"),
  ];
  const first = createDailyCourseQuestPlan(places, "2026-09-27", "user-7");
  const refreshed = createDailyCourseQuestPlan(places, "2026-09-27", "user-7");

  assert.equal(first.length, 2);
  assert.deepEqual(first, refreshed);
  assert.notEqual(first[0].placeIndex, first[1].placeIndex);
  assert.deepEqual(first.map((quest) => quest.slot), ["main", "bonus"]);
  assert.deepEqual(first.map((quest) => quest.rewardXp), [10, 5]);
  assert.ok(first.every((quest) => quest.placeName && quest.title && quest.detail));
});

test("한 곳 코스는 보너스 없이 메인 미션 하나만 만든다", () => {
  const plan = createDailyCourseQuestPlan([place("카페", "cafe")], "2026-09-27");
  assert.equal(plan.length, 1);
  assert.equal(plan[0].slot, "main");
  assert.equal(plan[0].placeIndex, 0);
});

test("퀘스트 계획은 확정 코스의 장소 구성이 바뀌면 다른 코스 서명을 갖는다", () => {
  const firstCourse = [place("식당", "food"), place("카페", "cafe")];
  const nextCourse = [place("전시관", "culture"), place("산책로", "walk")];
  assert.notEqual(getCourseQuestSignature(firstCourse), getCourseQuestSignature(nextCourse));
  assert.equal(
    createDailyCourseQuestPlan(firstCourse, "2026-09-27")[0].courseSignature,
    getCourseQuestSignature(firstCourse),
  );
});

test("퀘스트 저장 키는 사용자·날짜별로 분리되고 이전 버전 저장값과 격리된다", () => {
  const first = getDailyQuestStorageKeys("user-7", "2026-09-27");
  assert.notEqual(first.plan, getDailyQuestStorageKeys("user-8", "2026-09-27").plan);
  assert.notEqual(first.progress, getDailyQuestStorageKeys("user-7", "2026-09-28").progress);
  assert.match(first.plan, /:v2:/);
  assert.match(first.progress, /:v2:/);
});

test("퀘스트 진행은 날짜와 코스 단위로 저장하고 유효한 상태만 복원한다", () => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); },
  };
  const places = [place("카페", "cafe"), place("산책로", "walk")];
  const key = getQuestProgressKey(places, "2026-09-27");
  const reversedKey = getQuestProgressKey([...places].reverse(), "2026-09-27");
  assert.equal(key, reversedKey);
  assert.notEqual(key, getQuestProgressKey(places, "2026-09-28"));

  assert.equal(writeQuestProgress(key, { cafe: "done", walk: "skipped", invalid: "other" }, storage), true);
  assert.deepEqual(readQuestProgress(key, storage), { cafe: "done", walk: "skipped" });
});
