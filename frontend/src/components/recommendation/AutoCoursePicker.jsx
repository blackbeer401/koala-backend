// Presents generated course options and keeps page state behind explicit callbacks.
import koalaSearching from "../../assets/images/koala-searching.png";

export default function AutoCoursePicker({
  placeStatus,
  placeError,
  autoCourseCalculating,
  verifiedAutoCourses,
  selectedAutoCourseId,
  setHoveredCoursePlaces,
  chooseAutoCourse,
  autoCourseNotice,
  calculationError,
  setAutoCourseMode,
}) {
  return (
    <div className="auto-course-picker">
      {(placeStatus === "idle" || placeStatus === "loading") && (
        <div className="auto-course-loading" role="status">
          <img src={koalaSearching} alt="장소를 찾는 코알라" />
          <strong>코알라가 장소를 고르고 있어요</strong>
          <p>지도와 별개로 주변 장소를 먼저 준비하고 있어요.</p>
          <span>
            <b />
          </span>
        </div>
      )}
      {placeStatus === "error" && (
        <p className="place-status is-error">{placeError}</p>
      )}
      {autoCourseCalculating &&
        verifiedAutoCourses.length > 0 && (
          <p
            className="auto-course-background-status"
            role="status"
          >
            실제 이동시간을 확인하고 있어요
          </p>
        )}
      {placeStatus === "ready" &&
        verifiedAutoCourses.map((candidate, candidateIndex) => (
          <button
            className={`auto-course-card is-${candidate.id}${selectedAutoCourseId === candidate.id ? " is-selected" : ""}`}
            key={candidate.id}
            type="button"
            disabled={
              selectedAutoCourseId === candidate.id &&
              autoCourseCalculating
            }
            onMouseEnter={() =>
              setHoveredCoursePlaces(candidate.places)
            }
            onMouseLeave={() => setHoveredCoursePlaces([])}
            onFocus={() =>
              setHoveredCoursePlaces(candidate.places)
            }
            onBlur={() => setHoveredCoursePlaces([])}
            onClick={() => chooseAutoCourse(candidate)}
          >
            <i aria-hidden="true">
              <small>{candidateIndex + 1}</small>
              {candidate.icon}
              {candidate.places.find(
                (place) => place.imageUrl,
              ) && (
                <img
                  src={
                    candidate.places.find(
                      (place) => place.imageUrl,
                    ).imageUrl
                  }
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </i>
            <span>
              <strong>{candidate.title}</strong>
              <small>{candidate.description}</small>
              <span className="auto-course-badges">
                {candidate.places.some(
                  (place) => place.sourceKind === "popup",
                ) && <b>팝업 포함</b>}
                {candidate.places.some(
                  (place) => place.sourceKind === "culture",
                ) && <b>문화행사</b>}
              </span>
              <b>
                {candidate.places.map((place, placeIndex) => (
                  <span key={place.id}>
                    <em>{placeIndex + 1}</em>
                    {place.name}
                  </span>
                ))}
              </b>
              <span className="auto-course-time">
                예상 이동 {candidate.estimatedTravelMinutes}분 ·
                체류 {candidate.estimatedStayMinutes}분
              </span>
            </span>
            <em>선택해서 실제 경로 확인</em>
          </button>
        ))}
      {!autoCourseCalculating && autoCourseNotice && (
        <div className="auto-course-adjustment">
          {autoCourseNotice}
        </div>
      )}
      {placeStatus === "ready" &&
        !autoCourseCalculating &&
        !verifiedAutoCourses.length && (
          <p className="place-status">
            코스를 만들 장소가 부족해요. 장소를 직접 골라주세요.
          </p>
        )}
      {calculationError && (
        <p className="place-status is-error">
          {calculationError}
        </p>
      )}
      <button
        className="auto-course-manual"
        type="button"
        onClick={() => setAutoCourseMode(false)}
      >
        장소를 직접 고를게요
      </button>
    </div>
  );
}
