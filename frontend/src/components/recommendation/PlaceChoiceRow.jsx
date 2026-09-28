// A selectable place row with preference and account actions kept behind callbacks.
import { formatDistance } from "../../utils/recommendationFormatting";

export default function PlaceChoiceRow({
  place,
  selected,
  favorite,
  hasRequestedActivity,
  hasPreferenceReason,
  spaceLabel,
  isAuthenticated,
  isPreferred,
  onToggle,
  onOpenPhoto,
  onToggleFavorite,
  onMakePreferred,
}) {
  return (
    <div
      className={`place-card-row${selected ? " is-selected" : ""}`}
    >
      <button
        className={`place-card${selected ? " is-selected" : ""}`}
        type="button"
        onClick={onToggle}
      >
        <span className="place-check">
          {selected ? "✓" : ""}
        </span>
        <span
          className={`place-category-icon${place.imageUrl ? " has-image" : ""}${place.imageStatus === "available" ? " has-actual-image" : " is-fallback-image"}`}
          onClick={place.imageStatus === "available" ? (event) => {
            event.stopPropagation();
            onOpenPhoto(place);
          } : undefined}
        >
          {place.categoryIcon}
          {place.imageUrl && (
            <img
              src={place.imageUrl}
              alt={
                place.imageStatus === "available"
                  ? `${place.name} 대표 사진`
                  : `${place.categoryLabel} 카테고리 이미지`
              }
              loading="lazy"
              onLoad={(event) => {
                event.currentTarget.style.display = "";
                event.currentTarget.parentElement?.classList.remove(
                  "is-image-error",
                );
              }}
              onError={(event) => {
                event.currentTarget.style.display =
                  "none";
                event.currentTarget.parentElement?.classList.remove(
                  "has-actual-image",
                );
                event.currentTarget.parentElement?.classList.add(
                  "is-image-error",
                );
              }}
            />
          )}
        </span>
        <div>
          {place.sourceLabel && (
            <span
              className={`place-source-badge is-${place.sourceKind}`}
            >
              {place.sourceLabel}
              {place.eventUrgency && (
                <b>{place.eventUrgency}</b>
              )}
            </span>
          )}
          <strong>{place.name}</strong>
          <small>
            {place.address ?? place.categoryLabel}
          </small>
          {place.eventPeriod && (
            <small className="place-event-period">
              운영 {place.eventPeriod}
            </small>
          )}
          <span className="place-badge-row">
            {hasRequestedActivity && (
              <span className="personalized-reason">
                요청한 활동 · {place.categoryLabel}
              </span>
            )}
            {hasPreferenceReason && (
              <span className="personalized-reason">
                내 {place.categoryLabel} 취향 반영
              </span>
            )}
            {spaceLabel &&
              place.space_type_confidence !==
                "unknown" && (
                <span
                  className={`space-badge is-${place.space_type}`}
                >
                  {spaceLabel}
                </span>
              )}
          </span>
        </div>
        <em>{formatDistance(place.distanceMeters)}</em>
        <span
          className="place-corner-icon"
          aria-label={place.categoryLabel}
        >
          {place.categoryIcon}
        </span>
      </button>
      <button
        className={`place-favorite-button${favorite ? " is-active" : ""}`}
        type="button"
        onClick={onToggleFavorite}
        aria-label={
          favorite
            ? `${place.name} 즐겨찾기 해제`
            : `${place.name} 즐겨찾기`
        }
        title={
          isAuthenticated
            ? favorite
              ? "즐겨찾기 해제"
              : "즐겨찾기에 저장"
            : "로그인하면 장소를 저장할 수 있어요"
        }
      >
        {favorite ? "★" : "☆"}
      </button>
      {selected && (
        <button
          className={`preferred-first${isPreferred ? " is-active" : ""}`}
          type="button"
          onClick={onMakePreferred}
        >
          {isPreferred
            ? "1번 장소"
            : "1번으로 변경"}
        </button>
      )}
    </div>
  );
}
