// Compares route time and stop duration with the user's available time.
import { formatMinutes } from "../../utils/recommendationFormatting";

const SEGMENT_META = {
  travel: { icon: "🚶", label: "이동" },
  food: { icon: "🍽️", label: "식사" },
  cafe: { icon: "☕", label: "카페" },
  walk: { icon: "🚶", label: "산책" },
  culture: { icon: "🎭", label: "문화" },
  entertainment: { icon: "🎡", label: "놀이" },
  shopping: { icon: "🛍️", label: "쇼핑" },
  drink: { icon: "🥤", label: "음료" },
};

export default function TimeBudgetSummary({
  selectedPlaces,
  availableTimeMinutes,
  timeCalculationLabel,
  timeGaugeOver,
  displayedTotal,
  displayedTravel,
  hasActualTime,
  travelEstimate,
}) {
  if (!selectedPlaces.length) {
    return (
      <div className="time-budget-empty">
        <span>사용 가능한 시간</span>
        <b>{formatMinutes(availableTimeMinutes)}</b>
      </div>
    );
  }

  const scaleMinutes = Math.max(displayedTotal ?? 0, availableTimeMinutes);
  const segments = [
    ...(displayedTravel > 0
      ? [{ id: "travel", category: "travel", minutes: displayedTravel }]
      : []),
    ...selectedPlaces.map((place) => ({
      id: place.id,
      category: SEGMENT_META[place.category] ? place.category : "culture",
      minutes: place.stayMinutes,
      name: place.name,
    })),
  ];
  const activityTotals = segments.reduce((totals, segment) => {
    totals[segment.category] = (totals[segment.category] ?? 0) + segment.minutes;
    return totals;
  }, {});

  return (
    <section
      className={`time-budget${timeGaugeOver ? " is-over" : ""}`}
      aria-label={`사용 가능 ${availableTimeMinutes}분 중 ${timeCalculationLabel}`}
    >
      <div>
        <b>
          {displayedTotal == null
            ? travelEstimate.status === "loading"
              ? "이동시간 계산 중"
              : "이동시간 확인 불가"
            : timeGaugeOver
              ? `${displayedTotal - availableTimeMinutes}분 초과`
              : `${displayedTotal}분 사용`}
        </b>
        <span>총 {availableTimeMinutes}분</span>
      </div>
      <div className="time-budget-track">
        {segments.map((segment) => {
          const percentage = Math.min(100, (segment.minutes / scaleMinutes) * 100);
          const meta = SEGMENT_META[segment.category];
          return (
            <i
              key={segment.id}
              className={`is-${segment.category}`}
              style={{ width: `${percentage}%` }}
              title={`${meta.label}${segment.name ? ` · ${segment.name}` : ""} ${segment.minutes}분`}
            >
              {percentage >= 9 && <span aria-hidden="true">{meta.icon}</span>}
            </i>
          );
        })}
      </div>
      <div className="time-budget-legend" aria-label="시간 막대 범례">
        {Object.entries(activityTotals).map(([category, minutes]) => {
          const meta = SEGMENT_META[category];
          return (
            <span key={category}>
              <i className={`is-${category}`} aria-hidden="true">{meta.icon}</i>
              {meta.label} {formatMinutes(minutes)}
            </span>
          );
        })}
      </div>
      <small>
        {hasActualTime
          ? "파랑은 실제 경로 이동 · 나머지는 장소에서 보내는 시간"
          : travelEstimate.status === "ready"
            ? "선택한 교통수단의 실제 경로로 미리 계산했어요"
            : travelEstimate.status === "loading"
              ? "선택한 교통수단의 실제 경로를 계산하고 있어요"
              : "이동 경로를 확인할 수 있어야 총시간을 표시해요"}
      </small>
    </section>
  );
}
