import test from "node:test";
import assert from "node:assert/strict";
import { districtForPlace, SEOUL_DISTRICTS } from "./seoulDistricts.js";

test("서울 25개 자치구 주소를 지도 경계 코드로 연결한다", () => {
  assert.equal(SEOUL_DISTRICTS.length, 25);
  assert.deepEqual(districtForPlace({ address: "서울특별시 마포구 양화로 1" }), { code: "11440", name: "마포구" });
});

test("서울이 아닌 주소나 구를 확인할 수 없는 주소는 기록하지 않는다", () => {
  assert.equal(districtForPlace({ address: "경기도 부천시 안곡로 16" }), null);
  assert.equal(districtForPlace({ address: "서울특별시" }), null);
});
