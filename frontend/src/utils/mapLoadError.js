// Translate SDK failures into a safe, actionable category for logs and the UI.
// Raw browser errors can contain request URLs, so they are never surfaced as-is.
export function describeMapLoadFailure(error) {
  const message = String(error?.message ?? "");
  if (message.includes("초과")) return "지도 SDK 응답 시간 초과";
  if (message.includes("초기화")) return "지도 SDK 초기화 실패";
  return "지도 SDK 스크립트 로드 실패";
}
