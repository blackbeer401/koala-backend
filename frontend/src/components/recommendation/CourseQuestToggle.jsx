/** 코스별로 중간 미션을 켜거나 끄는 선택 스위치. */
export default function CourseQuestToggle({ enabled, onChange, account }) {
  return (
    <section className={`course-quest-toggle${enabled ? " is-enabled" : ""}`} aria-label="오늘의 선택 미션 설정">
      <div>
        <b>오늘의 선택 미션</b>
        <small>켜면 코스 중간에 장소에 맞는 미션을 보여드려요.</small>
        <small>완료 여부는 직접 체크하며, 앱이 미션 수행 자체를 자동 확인하지는 않아요.</small>
        {!account?.token && enabled && <small>로그인하면 완료 경험치를 계정에 저장할 수 있어요.</small>}
      </div>
      <button
        className="course-quest-toggle-button"
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
      >
        {enabled ? "켜짐" : "꺼짐"}
      </button>
    </section>
  );
}
