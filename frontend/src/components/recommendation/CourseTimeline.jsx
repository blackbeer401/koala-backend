import { courseStopColors } from "../../config/recommendationDisplay";
import { availabilityLabel } from "../../utils/recommendationFormatting";
import { formatLegTransport } from "../../utils/courseNavigation";

/** 확정된 코스의 장소 순서와 각 이동 구간을 표시한다. */
export default function CourseTimeline({ places, course, hasEndDestination, mysteryName, focusedStopIndex, onFocusStop }) {
  return (
    <div className="course-timeline">
      <b>지도에 표시된 실제 이동 동선</b>
      {places.map((place, index) => (
        <div className="course-timeline-stop" key={place.id} style={{ "--place-color": courseStopColors[index % courseStopColors.length] }}>
          <div className="course-timeline-leg">
            <span>
              {index === 0 ? "현재 위치" : mysteryName(places[index - 1], index - 1)} → {mysteryName(place, index)}
            </span>
            <small>{formatLegTransport(course?.legs?.[index]?.travel)}</small>
          </div>
          <button className={`place-result-route${focusedStopIndex === index ? " is-focused" : ""}`} type="button" onClick={() => onFocusStop(index)}>
            <span>{index + 1}</span>
            <strong>{mysteryName(place, index)}</strong>
            <small>
              {place.categoryLabel} · {place.stayMinutes}분 머무르기
              {availabilityLabel(place.availability) && ` · ${availabilityLabel(place.availability)}`}
            </small>
          </button>
        </div>
      ))}
      {hasEndDestination && course?.legs?.[places.length] && (
        <div className="course-timeline-leg is-final">
          <span>{places.at(-1)?.name} → 다음 일정</span>
          <small>{formatLegTransport(course.legs[places.length].travel)}</small>
        </div>
      )}
    </div>
  );
}
