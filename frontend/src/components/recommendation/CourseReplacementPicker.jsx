import { recommendationReason } from "../../utils/recommendationPresentation";

/** 코스의 특정 장소를 대체 후보로 바꾸는 선택 UI. */
export default function CourseReplacementPicker({
  places,
  target,
  replacement,
  previewOpen,
  onSelectTarget,
  onTogglePreview,
  onConfirm,
}) {
  if (!replacement) return null;
  return (
    <div className="course-replacement">
      <div className="replacement-target-picker">
        <strong>어느 장소를 바꿀까요?</strong>
        <div>
          {places.map((place, index) => (
            <button key={place.id} type="button" className={target?.id === place.id ? "is-active" : ""} onClick={() => onSelectTarget(place, index)}>
              {index + 1}. {place.name}
            </button>
          ))}
        </div>
      </div>
      {target && (
        <>
          <button type="button" onClick={onTogglePreview}>
            <b>{target.name}</b> 바꾸기 <span>{previewOpen ? "접기" : "후보 보기"}</span>
          </button>
          {previewOpen && (
            <div>
              <span className={`place-category-icon${replacement.imageUrl ? " has-image" : ""}`}>
                {replacement.categoryIcon}
                {replacement.imageUrl && <img src={replacement.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
              </span>
              <p>
                <small>{target.name} 대신 추천</small>
                <b>{replacement.name}</b>
                <em>{recommendationReason(replacement)}</em>
              </p>
              <button type="button" onClick={onConfirm}>이 장소로 교체</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
