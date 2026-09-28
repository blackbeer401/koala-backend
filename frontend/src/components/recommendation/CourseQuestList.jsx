/** 코스 확정 화면에서 퀘스트 진행 상태와 장소별 미션을 보여준다. */
export default function CourseQuestList({
  plans,
  progress,
  rewardResults = {},
  completedCount,
  skippedCount,
  estimatedMinutes,
  onProgressChange,
}) {
  if (!plans.length) return null;
  const finishedCount = completedCount + skippedCount;

  return (
    <section className="course-quest-list" aria-label="오늘의 퀘스트">
      <div className="course-quest-heading">
        <div><small>오늘의 퀘스트</small><b>{completedCount} / {plans.length} 완료</b></div>
        <p>이 코스에서 랜덤 제안 · 원할 때만 참여 · 약 {estimatedMinutes}분</p>
        <p className="course-quest-honesty-note">완료 여부는 직접 체크해요. 완료로 표시하면 XP를 받아요.</p>
        <div className="course-quest-progress" aria-label={`${completedCount}개 완료`}>
          <span style={{ width: `${(completedCount / plans.length) * 100}%` }} />
        </div>
        {finishedCount === plans.length && (
          <p className="course-quest-finish" role="status">
            {completedCount === plans.length
              ? "오늘의 퀘스트를 모두 완료했어요!"
              : `완료 ${completedCount}개 · 건너뜀 ${skippedCount}개 · 오늘의 도전을 마쳤어요.`}
          </p>
        )}
      </div>
      {plans.map((quest, index) => {
        const status = progress[quest.id];
        return (
          <article key={quest.id} className={status ? `is-${status}` : ""}>
            <span className="course-quest-number">{quest.slot === "main" ? "★" : "＋"}</span>
            <p>
              <strong>{quest.slot === "main" ? "오늘의 핵심" : "선택 도전"}</strong>
              <small>추천 장소 · {quest.placeName}</small>
              <b>{quest.title}</b>
              <span className="course-quest-detail">{quest.detail}</span>
              <span className="course-quest-tags"><i>약 {quest.minutes}분</i><i>{quest.difficulty}</i><i>+{quest.rewardXp} XP</i></span>
            </p>
            <div>
              <button className={status === "done" ? "is-secondary" : ""} type="button" aria-pressed={status === "done"} disabled={status === "done" && rewardResults[quest.id] !== "error"} onClick={() => onProgressChange(quest.id, "done")}>
                {status !== "done" ? "완료했어요" : rewardResults[quest.id] === "pending" ? "보상 확인 중" : rewardResults[quest.id] === "error" ? "보상 다시 저장" : rewardResults[quest.id] === "claimed" ? "완료 · 오늘 보상 받음" : rewardResults[quest.id] === 0 ? "완료 · 오늘 보상 한도" : rewardResults[quest.id] > 0 ? `완료 · +${rewardResults[quest.id]} XP` : "완료했어요"}
              </button>
              {status !== "done" && <button className={status === "skipped" ? "is-secondary" : ""} type="button" aria-pressed={status === "skipped"} onClick={() => onProgressChange(quest.id, status === "skipped" ? null : "skipped")}>
                {status === "skipped" ? "다시 도전" : "오늘은 건너뛰기"}
              </button>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
