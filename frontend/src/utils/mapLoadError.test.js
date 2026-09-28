import test from "node:test";
import assert from "node:assert/strict";
import { describeMapLoadFailure } from "./mapLoadError.js";

test("지도 SDK 실패는 원인별 안내로 구분한다", () => {
  assert.equal(
    describeMapLoadFailure(new Error("카카오맵 연결 시간이 초과됐습니다.")),
    "지도 SDK 응답 시간 초과",
  );
  assert.equal(
    describeMapLoadFailure(new Error("카카오맵 초기화에 실패했습니다.")),
    "지도 SDK 초기화 실패",
  );
  assert.equal(describeMapLoadFailure(new Event("error")), "지도 SDK 스크립트 로드 실패");
});

test("SDK 요청 주소나 앱 키는 표시할 오류 문구에 포함하지 않는다", () => {
  const failure = describeMapLoadFailure(
    new Error("https://dapi.kakao.com/sdk.js?appkey=private-key failed"),
  );
  assert.equal(failure.includes("private-key"), false);
  assert.equal(failure.includes("dapi.kakao.com"), false);
});
