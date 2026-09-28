// A region option showing its main travel and availability signals.
import { formatMinutes } from "../../utils/recommendationFormatting";

function AreaCard({ area, selected, onSelect, onPreview }) {
  const reason =
    area.activityScore >= 0.7
      ? "원하는 활동과 잘 맞아요"
      : area.fromStartMinutes > 0 && area.fromStartMinutes <= 15
        ? "현재 위치에서 가까워요"
        : area.congestion === "여유"
          ? "비교적 여유롭게 머물 수 있어요"
          : "이동시간과 지역에서 쓸 수 있는 시간을 함께 고려했어요";
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
        {area.score && <em>{area.score}점</em>}
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
          예상 혼잡도 <b>{area.congestion}</b>
          <small className="area-congestion-source">{area.congestionSource}</small>
        </span>
        {area.arrivalTime && (
          <span>
            도착 <b>{area.arrivalTime}</b>
          </span>
        )}
      </div>
      <p className="area-reason">{reason}</p>
    </button>
  );
}

export default AreaCard;
