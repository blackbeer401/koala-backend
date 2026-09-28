import iconBack from "../../assets/images/icon-back.png";

/** 추천 결과 상단 내비게이션과 이동수단 선택 영역. */
export default function RecommendationTopbar({
  account,
  placeMode,
  selectedArea,
  canReturnToAutoCourses,
  onResultsBack,
  onHome,
  onOpenAccount,
  guidanceStarted,
  selectedTransport,
  transportOptions,
  transportMode,
  transportMenuOpen,
  onToggleTransportMenu,
  onSelectTransport,
  topbarRef,
}) {
  return (
    <header className="map-topbar" ref={topbarRef}>
      <button
        className={`results-back${placeMode ? " has-label" : " is-icon-only"}`}
        type="button"
        aria-label={canReturnToAutoCourses ? "자동 코스 후보로 돌아가기" : placeMode ? "추천 경로로 돌아가기" : "이전 화면으로 돌아가기"}
        onClick={onResultsBack}
      >
        <img src={iconBack} alt="" aria-hidden="true" />
        {placeMode && <b>추천 경로</b>}
      </button>
      <button className="map-topbar-title map-home-button" type="button" onClick={onHome} aria-label="코알라 첫 화면으로 돌아가기">
        {placeMode ? (selectedArea?.name ?? "지역 코스") : "KOALA 추천 경로"}
      </button>
      <button className="result-account-button" type="button" onClick={onOpenAccount}>
        {account?.user ? account.user.nickname : "로그인"}
      </button>
      {!guidanceStarted && (
        <button
          className="transport-current-trigger"
          type="button"
          aria-label={`현재 이동수단 ${selectedTransport.label}. 변경하기`}
          aria-expanded={transportMenuOpen}
          onClick={onToggleTransportMenu}
        >
          <i aria-hidden="true"><img src={selectedTransport.icon} alt="" /></i>
          <span>{selectedTransport.label}</span><b aria-hidden="true">⌄</b>
        </button>
      )}
      {!guidanceStarted && (
        <section className={`map-transport-selector${transportMenuOpen ? " is-open" : ""}`} aria-label="이동수단 선택">
          {transportOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={transportMode === option.id ? "is-active" : ""}
              aria-pressed={transportMode === option.id}
              onClick={() => onSelectTransport(option)}
            >
              <i aria-hidden="true"><img src={option.icon} alt="" /></i>
              <span>{option.label}</span>
            </button>
          ))}
        </section>
      )}
    </header>
  );
}
