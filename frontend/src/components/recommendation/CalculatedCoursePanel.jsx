import { formatCalculatedMinutes } from "../../utils/recommendationFormatting";
import CourseTimeline from "./CourseTimeline";
import CourseReplacementPicker from "./CourseReplacementPicker";
import CourseQuestToggle from "./CourseQuestToggle";

/** 계산된 코스의 요약, 퀘스트, 이동 구간, 교체 및 확정 동작을 표시한다. */
export default function CalculatedCoursePanel({
  courseResult,
  courseConfirmed,
  places,
  mysteryName,
  sheetExpanded,
  onToggleRoute,
  focusedStopIndex,
  onFocusStop,
  adventureMode,
  questPlans,
  questsEnabled,
  onToggleQuests,
  onResetSelection,
  isAutoCourse,
  onReturnToAutoCourses,
  onReturnToRegions,
  hasEndDestination,
  calculationError,
  autoCourseNotice,
  replacementPlace,
  replacementTarget,
  replacementPreviewOpen,
  onSelectReplacementTarget,
  onToggleReplacementPreview,
  onConfirmReplacement,
  calculationStatus,
  onConfirmCourse,
  onStartGuidance,
  account,
  serverSaveStatus,
}) {
  const course = courseResult?.course;
  return (
    <div className="place-result">
      <div className="course-total">
        <b>
          {courseConfirmed ? "이 코스를 저장했어요" : course?.status === "FEASIBLE" ? "시간 안에 방문 가능해요" : "예정 시간보다 여유가 부족해요"}
        </b>
        <span>이동 {formatCalculatedMinutes(course?.total_travel_time_minutes)} · 체류 {formatCalculatedMinutes(course?.total_stay_time_minutes)}</span>
      </div>
      <div className="course-compact-route">
        <b>{places.map((place, index) => mysteryName(place, index)).join(" → ")}</b>
        <button type="button" aria-expanded={sheetExpanded} onClick={onToggleRoute}>전체 코스 보기</button>
      </div>

      {course?.status === "FEASIBLE" && (
        <CourseQuestToggle enabled={questsEnabled} onChange={onToggleQuests} account={account} />
      )}

      {courseConfirmed && questsEnabled && questPlans.length > 0 && (
        <section className="course-quest-ready" aria-label="오늘의 선택 미션">
          <span aria-hidden="true">✦</span>
          <div><b>오늘의 선택 미션 {questPlans.length}개</b><small>장소에 도착하면 하나씩 제안해요. 원하지 않으면 건너뛰어도 괜찮아요.</small></div>
        </section>
      )}

      <div className="course-edit-actions">
        <button className="place-calc-button is-active course-reset-button" type="button" onClick={onResetSelection}>장소 조정 <span>↺</span></button>
        {isAutoCourse && !courseConfirmed && <button className="auto-course-return" type="button" onClick={onReturnToAutoCourses}>새 코스 추천</button>}
        {adventureMode === "course" && courseConfirmed && <button className="auto-course-return" type="button" onClick={onReturnToRegions}>한 번 더 뽑기</button>}
      </div>

      <CourseTimeline
        places={places}
        course={course}
        hasEndDestination={hasEndDestination}
        mysteryName={mysteryName}
        focusedStopIndex={focusedStopIndex}
        onFocusStop={onFocusStop}
      />

      <div className={`place-warning${course?.status === "INFEASIBLE" || calculationError ? " is-warning" : ""}`}>
        {calculationError || (course
          ? `총 ${course.total_required_minutes}분 · ${Math.abs(course.remaining_time_minutes)}분 ${course.remaining_time_minutes >= 0 ? "여유" : "초과"}`
          : "실제 경로 시간 계산 불가")}
      </div>
      {autoCourseNotice && <div className="auto-course-adjustment">✓ {autoCourseNotice}</div>}
      {courseResult?.validation?.travel_time_precheck?.warning && (
        <div className="place-warning is-warning">이동시간을 포함하면 일정이 빠듯해요. 최적 경로를 확인하거나 장소 수를 줄여주세요.</div>
      )}
      {places.some((place) => ["closed", "event_ended"].includes(place.availability?.status)) && (
        <div className="place-warning is-warning">도착할 때 운영이 끝난 장소가 있어요. 확정 전에 다른 장소를 권장해요.</div>
      )}

      {!courseConfirmed && replacementPlace && (
        <CourseReplacementPicker
          places={places}
          target={replacementTarget}
          replacement={replacementPlace}
          previewOpen={replacementPreviewOpen}
          onSelectTarget={onSelectReplacementTarget}
          onTogglePreview={onToggleReplacementPreview}
          onConfirm={onConfirmReplacement}
        />
      )}

      {course?.status === "FEASIBLE" && !courseConfirmed && (
        <button className="place-calc-button is-active course-finalize-button" type="button" disabled={calculationStatus === "loading"} onClick={onConfirmCourse}>
          {calculationStatus === "loading" ? "최적 경로 확인 중…" : "이 코스로 확정하기"} {calculationStatus !== "loading" && <span>→</span>}
        </button>
      )}
      {courseConfirmed && <button className="place-calc-button is-active course-finalize-button" type="button" onClick={onStartGuidance}>안내 시작 <span>→</span></button>}
      {courseConfirmed && account?.token && (
        <p className="server-save-status">
          {serverSaveStatus === "saving" ? "계정에 코스를 저장하는 중…"
            : serverSaveStatus === "saved" ? "계정에 코스를 저장했어요."
              : serverSaveStatus === "error" ? "기기에는 남겼지만 서버 저장은 실패했어요." : ""}
        </p>
      )}
    </div>
  );
}
