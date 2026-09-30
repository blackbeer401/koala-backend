// A region option showing its main travel and availability signals.
import { formatMinutes } from "../../utils/recommendationFormatting";

function AreaCard({ area, selected, onSelect, onPreview }) {
  const reasons = [
    area.activityScore >= 0.7 ? "원하는 활동 반영" : null,
    area.fromStartMinutes > 0 ? `출발지에서 ${formatMinutes(area.fromStartMinutes)}` : null,
    area.stayMinutes != null ? `머물 수 있는 시간 ${formatMinutes(area.stayMinutes)}` : null,
    area.congestion === "여유" ? "혼잡도 여유" : null,
  ].filter(Boolean);
  return (
    <button
      className={`area-card${selected ? " is-selected" : ""}`}
      type="button"
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onTouchStart={onPreview}
      onClick={onSelect}
    >
      <div className="area-card-top">
        <span>{area.rank}위</span>
        <strong>{area.name}</strong>
        {area.score && <em aria-label={`추천 점수 ${area.score}점`}>{area.score}점</em>}
      </div>
      <div className="area-route">
        {area.fromStartMinutes > 0 && (
          <span>
            이동 시간{" "}
            <b>
              {formatMinutes(area.fromStartMinutes)}
              {area.fromStartTransport && ` · ${area.fromStartTransport}`}
            </b>
          </span>
        )}
        {area.stayMinutes !== null && (
          <span>
            도착 후 여유시간 <b>{formatMinutes(area.stayMinutes)}</b>
          </span>
        )}
        {area.toNextMinutes > 0 && (
          <span>
            다음 일정까지{" "}
            <b>
              {formatMinutes(area.toNextMinutes)}
              {area.toNextTransport && ` · ${area.toNextTransport}`}
            </b>
          </span>
        )}
      </div>
      <div className="area-metrics">
        <span>
          {area.congestion === "알 수 없음" ? "혼잡 정보" : "예상 혼잡도"} <b>{area.congestion === "알 수 없음" ? "없음" : area.congestion}</b>
          <small className="area-congestion-source">{area.congestion === "알 수 없음" ? "이동시간과 활동 조건으로 추천했어요" : area.congestionSource}</small>
        </span>
        {area.arrivalTime && (
          <span>
            도착 <b>{area.arrivalTime}</b>
          </span>
        )}
      </div>
      <p className="area-reason">추천 이유: {reasons.length ? reasons.join(" · ") : "입력한 지역과 이동 조건 반영"}</p>
    </button>
  );
}

export default AreaCard;
