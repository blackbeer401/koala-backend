import { timeHourOptions, timeMinuteOptions } from "../../config/recommendationDisplay";
import TimeWheelColumn from "../common/TimeWheelColumn";

/** 추천 결과 화면에서 사용하는 시간 선택, 장소 추가, 사진 미리보기 대화상자. */
export default function RecommendationDialogs({
  timeBudgetOpen,
  timeBudgetDraft,
  onTimeBudgetPartChange,
  onApplyTimeBudget,
  onCloseTimeBudget,
  proactiveMode,
  proactiveOffer,
  proactiveExtraMinutes,
  onAcceptProactive,
  onDismissProactive,
  photoPreview,
  onClosePhotoPreview,
}) {
  return (
    <>
      {timeBudgetOpen && (
        <div className="time-budget-prompt-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onCloseTimeBudget();
        }}>
          <section className="time-budget-prompt" role="dialog" aria-modal="true" aria-labelledby="time-budget-prompt-title">
            <small>코스를 계산하려면 시간이 필요해요</small>
            <h2 id="time-budget-prompt-title">얼마나 여유가 있나요?</h2>
            <p>선택한 시간 안에 식사·카페와 실제 이동을 맞춰드릴게요.</p>
            <div className="time-budget-quick-options">
              {[60, 120, 180].map((minutes) => (
                <button key={minutes} type="button" onClick={() => onApplyTimeBudget(minutes)}>{minutes / 60}시간</button>
              ))}
            </div>
            <div className="time-wheel-picker" aria-label="여유 시간 선택">
              <div className="time-wheel-selection" aria-hidden="true" />
              <TimeWheelColumn label="시간" options={timeHourOptions} value={Math.floor(timeBudgetDraft / 60)} onChange={(value) => onTimeBudgetPartChange("hours", value)} />
              <TimeWheelColumn label="분" options={timeMinuteOptions} value={timeBudgetDraft % 60} onChange={(value) => onTimeBudgetPartChange("minutes", value)} />
            </div>
            <strong className="time-wheel-summary">
              선택한 시간 {Math.floor(timeBudgetDraft / 60)}시간
              {timeBudgetDraft % 60 > 0 ? ` ${timeBudgetDraft % 60}분` : ""}
            </strong>
            <button className="time-budget-apply" type="button" onClick={() => onApplyTimeBudget(timeBudgetDraft)}>이 시간으로 장소 보기 <span>→</span></button>
            <button className="time-budget-cancel" type="button" onClick={onCloseTimeBudget}>취소</button>
          </section>
        </div>
      )}

      {proactiveMode && proactiveOffer?.place && (
        <div className="proactive-prompt-backdrop" role="presentation">
          <section className="proactive-prompt" role="dialog" aria-modal="true" aria-labelledby="proactive-prompt-title">
            <small>{proactiveOffer.reason === "ending_today" ? "오늘이 마지막 날" : "이번 주 종료 예정"}</small>
            <div>
              {proactiveOffer.place.imageUrl && (
                <img src={proactiveOffer.place.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              )}
              <span>
                <strong id="proactive-prompt-title">{proactiveOffer.place.name}</strong>
                <p>
                  {proactiveMode === "live"
                    ? `현재 위치에서 가까워요. 약 ${proactiveExtraMinutes}분을 사용해 코스에 추가할까요?`
                    : `현재 코스의 남는 시간 안에 들를 수 있어요. 약 ${proactiveExtraMinutes}분을 추가할까요?`}
                </p>
              </span>
            </div>
            <button className="is-accept" type="button" onClick={onAcceptProactive}>
              {proactiveMode === "live" ? "추가하고 경로 다시 계산" : "코스에 추가하기"}
            </button>
            <button className="is-dismiss" type="button" onClick={onDismissProactive}>
              {proactiveMode === "live" ? "지금 코스 유지" : "괜찮아요, 이대로 확정"}
            </button>
          </section>
        </div>
      )}

      {photoPreview && (
        <div className="place-photo-preview-backdrop" role="presentation" onClick={onClosePhotoPreview}>
          <section className="place-photo-preview" role="dialog" aria-modal="true" aria-label={`${photoPreview.name} 사진`} onClick={(event) => event.stopPropagation()}>
            <button className="place-photo-preview-close" type="button" onClick={onClosePhotoPreview} aria-label="사진 닫기">×</button>
            <img src={photoPreview.imageUrl} alt={`${photoPreview.name} 검색 사진`} />
            <strong>{photoPreview.name}</strong>
            <small>{photoPreview.address ?? photoPreview.categoryLabel}</small>
            <div className="place-photo-preview-source">
              <span>이미지 검색 결과</span>
              {photoPreview.imageAttributionUrl && <>
                <span aria-hidden="true"> · </span>
                <a href={photoPreview.imageAttributionUrl} target="_blank" rel="noreferrer">원본 보기</a>
              </>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
