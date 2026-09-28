import { useState } from "react";
// Displays step-by-step course guidance and completion actions.
import koalaComplete from "../../assets/images/koala-complete.png";
import { formatMinutes, formatCalculatedMinutes } from "../../utils/recommendationFormatting";
import { formatLegTransport } from "../../utils/courseNavigation";
import { courseStopColors } from "../../config/recommendationDisplay";
import { questForPlace } from "../../utils/questMissions";
import { placeIdentity } from "../../utils/recommendationPlaces";
import CourseQuestToggle from "./CourseQuestToggle";

export default function CourseGuidancePanel({
  guideIsComplete,
  visiblePlaces,
  courseResult,
  account,
  serverSaveStatus,
  onBack,
  setGuidanceStarted,
  setGuideStep,
  setSheetExpanded,
  guideRouteStatus,
  arrivalSeconds,
  arrivalDwellSeconds,
  liveLocationStatus,
  guideStep,
  guideStopCount,
  guidePlace,
  mysteryMode,
  mysteryRevealed,
  mysteryName,
  guideTravel,
  sheetExpanded,
  guideInstruction,
  guideBoarding,
  guidePreviousPlace,
  arrivalQuest,
  arrivalQuestStatus,
  arrivalQuestReward,
  onQuestProgressChange,
  questsEnabled,
  onToggleQuests,
  hasEndDestination,
  setMysteryRevealed,
  resetCourseSelection,
  placeFeedback,
  onFeedback,
  onExclude,
  gamificationNotice,
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <div className="course-guide">
      {guideIsComplete ? (
        <div className="guide-complete">
          <img
            className="guide-complete-koala"
            src={koalaComplete}
            alt="추천 완료를 알리는 코알라"
          />
          <b>오늘 코스를 마쳤어요</b>
          <p className="guide-complete-caption">코스 안내를 마쳤어요. 오늘의 시간을 이렇게 채웠어요.</p>
          <div className="guide-complete-stats" aria-label="코스 요약">
            <span><b>{visiblePlaces.length}</b><small>코스 장소</small></span>
            <span><b>{formatCalculatedMinutes(courseResult?.course?.total_travel_time_minutes)}</b><small>이동 시간</small></span>
            <span><b>{formatCalculatedMinutes(courseResult?.course?.total_stay_time_minutes)}</b><small>머문 시간</small></span>
          </div>
          <strong>
            {account?.token
              ? serverSaveStatus === "saved"
                ? "내 코스에 저장됐어요"
                : "코스 저장을 확인하고 있어요"
              : "로그인하면 오늘 코스를 보관할 수 있어요"}
          </strong>
          {gamificationNotice && <div className="guide-reward-notice" role="status"><span aria-hidden="true">✦</span>{gamificationNotice}</div>}
          {account?.token && (
            <section className="course-completion-feedback" aria-label="코스 추천 피드백">
              <button
                className="course-completion-feedback-toggle"
                type="button"
                aria-expanded={feedbackOpen}
                onClick={() => setFeedbackOpen((open) => !open)}
              >
                {feedbackOpen ? "의견 접기" : "추천에 의견 남기기"}
              </button>
              {feedbackOpen && (
                <div className="course-completion-feedback-list">
                  <p>코스를 마친 지금, 장소별로 짧게 알려주세요.</p>
                  {visiblePlaces.map((place) => (
                    <div className="course-completion-feedback-item" key={placeIdentity(place)}>
                      <b>{place.name}</b>
                      {placeFeedback?.[placeIdentity(place)] && (
                        <span className="course-completion-feedback-saved">의견을 반영했어요</span>
                      )}
                      <div>
                        <button
                          type="button"
                          className={placeFeedback?.[placeIdentity(place)] === "like" ? "is-active" : ""}
                          aria-pressed={placeFeedback?.[placeIdentity(place)] === "like"}
                          onClick={() => onFeedback(place, "like")}
                        >좋았어요</button>
                        <button
                          type="button"
                          className={placeFeedback?.[placeIdentity(place)] === "dislike" ? "is-active" : ""}
                          aria-pressed={placeFeedback?.[placeIdentity(place)] === "dislike"}
                          onClick={() => onFeedback(place, "dislike")}
                        >아쉬웠어요</button>
                        <button
                          type="button"
                          onClick={() => onExclude(place, { preserveCourse: true })}
                        >다시 추천하지 않기</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          <button type="button" onClick={onBack}>
            새 코스 추천받기
          </button>
          <button
            className="guide-complete-secondary"
            type="button"
            onClick={() => {
              setGuidanceStarted(false);
              setGuideStep(0);
              setSheetExpanded(true);
            }}
          >
            완료한 코스 다시 보기
          </button>
        </div>
      ) : (
        <>
          <div className="guide-progress">
            <span>
              {guideRouteStatus === "rerouting"
                ? "경로를 벗어나 다시 찾는 중"
                : arrivalSeconds > 0
                  ? `도착 확인 중 · ${arrivalDwellSeconds - arrivalSeconds}초`
                  : liveLocationStatus === "ready"
                    ? "현재 위치로 안내 중"
                    : liveLocationStatus === "low_accuracy"
                      ? "현재 위치 신호가 약해 확인 중"
                      : liveLocationStatus === "unavailable"
                        ? "기존 경로로 안내 중"
                        : "현재 위치 확인 중"}
            </span>
            <b>
              {guideStep + 1} / {guideStopCount}
            </b>
          </div>
          <section
            className="guide-current"
            style={{
              "--place-color": guidePlace
                ? courseStopColors[
                    guideStep % courseStopColors.length
                  ]
                : "#ef6259",
            }}
          >
            <small>
              {guidePlace
                ? mysteryMode && !mysteryRevealed
                  ? "다음 행동"
                  : "다음 장소"
                : "다음 일정"}
            </small>
            <h3>
              {guidePlace
                ? mysteryName(guidePlace, guideStep)
                : "다음 일정 장소"}
            </h3>
            <strong>{formatLegTransport(guideTravel)}</strong>
            <div
              className={`guide-next-action${sheetExpanded ? "" : " is-compact"}`}
            >
              {sheetExpanded && <small>다음 행동</small>}
              <b>{guideInstruction}</b>
            </div>
            {sheetExpanded && guideBoarding.length > 0 && (
              <div
                className="guide-boarding"
                aria-label="탑승할 대중교통"
              >
                {guideBoarding.map((boarding) => (
                  <span
                    key={`${boarding.type}-${boarding.vehicle}`}
                  >
                    <i aria-hidden="true">
                      {boarding.type === "SUBWAY" ? "🚇" : "🚌"}
                    </i>
                    <b>{boarding.vehicle}</b>
                    {boarding.minutes && (
                      <small>약 {boarding.minutes}분</small>
                    )}
                  </span>
                ))}
              </div>
            )}
            {sheetExpanded && (
              <p>
                {guidePlace
                  ? `도착 후 약 ${formatMinutes(guidePlace.stayMinutes)} 머무르기`
                  : "약속 장소까지 이동해요"}
              </p>
            )}
          </section>
          <CourseQuestToggle enabled={questsEnabled} onChange={onToggleQuests} account={account} />
          {mysteryMode && guidePreviousPlace && (
            <div className="mystery-arrival-card" role="status">
              <small>방금 도착한 장소</small>
              <b>{guidePreviousPlace.name}</b>
              <span>
                {questForPlace(guidePreviousPlace).detail}
              </span>
            </div>
          )}
          {arrivalQuest && (
            <section className={`course-arrival-quest${arrivalQuestStatus ? ` is-${arrivalQuestStatus}` : ""}`} aria-label="장소 도착 퀘스트">
              <div>
                <small>방금 도착 · 오늘의 선택 미션</small>
                <b>{arrivalQuest.title}</b>
                <p>{arrivalQuest.detail}</p>
                <span>약 {arrivalQuest.minutes}분 · {arrivalQuest.slot === "main" ? "+10" : "+5"} XP</span>
                <small className="course-quest-self-report">완료 여부는 직접 체크해 주세요.</small>
              </div>
              {arrivalQuestStatus === "done" ? (
                <div className="course-arrival-quest-result" role="status">
                  <span>
                    {arrivalQuestReward === "pending" ? "완료했어요 · 경험치를 확인하고 있어요."
                      : arrivalQuestReward === "error" ? "완료 기록을 저장하지 못했어요."
                        : arrivalQuestReward === 0 ? "완료했어요 · 오늘 받을 수 있는 경험치 한도에 도달했어요."
                          : arrivalQuestReward === "claimed" ? "오늘의 보상을 이미 받았어요."
                            : arrivalQuestReward > 0 ? `완료했어요 · +${arrivalQuestReward} XP`
                              : "완료했어요."}
                  </span>
                  {arrivalQuestReward === "error" && <button type="button" onClick={() => onQuestProgressChange(arrivalQuest.id, "done")}>다시 저장</button>}
                </div>
              ) : arrivalQuestStatus === "skipped" ? (
                <div className="course-arrival-quest-actions">
                  <span>건너뛰어도 괜찮아요.</span>
                  <button type="button" onClick={() => onQuestProgressChange(arrivalQuest.id, null)}>다시 해보기</button>
                </div>
              ) : (
                <div className="course-arrival-quest-actions">
                  <button type="button" onClick={() => onQuestProgressChange(arrivalQuest.id, "done")}>완료 체크</button>
                  <button type="button" onClick={() => onQuestProgressChange(arrivalQuest.id, "skipped")}>건너뛰기</button>
                </div>
              )}
            </section>
          )}
          <div className="guide-stops">
            {visiblePlaces.map((place, index) => (
              <button
                key={place.id}
                type="button"
                className={guideStep === index ? "is-active" : ""}
                style={{
                  "--place-color":
                    courseStopColors[
                      index % courseStopColors.length
                    ],
                }}
                onClick={() => setGuideStep(index)}
              >
                <i>{index + 1}</i>
                <span>{mysteryName(place, index)}</span>
              </button>
            ))}
            {hasEndDestination && (
              <button
                type="button"
                className={
                  guideStep === visiblePlaces.length
                    ? "is-active is-end"
                    : "is-end"
                }
                onClick={() => setGuideStep(visiblePlaces.length)}
              >
                <i>✓</i>
                <span>다음 일정</span>
              </button>
            )}
          </div>
          <button
            className="guide-next-button"
            type="button"
            onClick={() =>
              setGuideStep((current) =>
                Math.min(current + 1, guideStopCount),
              )
            }
          >
            {mysteryMode && guideBoarding.length
              ? "내렸어요"
              : "도착했어요"}{" "}
            <span>→</span>
          </button>
          {mysteryMode && !mysteryRevealed && (
            <button
              className="mystery-reveal-button"
              type="button"
              onClick={() => setMysteryRevealed(true)}
            >
              길을 잃었어요 · 목적지 확인
            </button>
          )}
          <button
            className="guide-reset-button"
            type="button"
            onClick={resetCourseSelection}
          >
            코스 다시 설정하기
          </button>
        </>
      )}
    </div>
  );
}
