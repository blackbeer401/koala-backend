import PlaceChoiceRow from "./PlaceChoiceRow";
import { ACTIVITY_CATEGORY_LABELS, placeIdentity } from "../../utils/recommendationPlaces";

/** 장소 카드 목록, 선호 표시와 추가 로딩 상태를 렌더링한다. */
export default function PlaceCatalogList({
  places,
  allPlaces,
  selectedPlaces,
  favoritePlaceKeys,
  account,
  requestedActivitySequence,
  mentionedActivities,
  preferredPlaceId,
  placeStatus,
  moreLoadError,
  hasMorePlaces,
  scrollRef,
  onLoadMore,
  onToggle,
  onOpenPhoto,
  onToggleFavorite,
  onMakePreferred,
}) {
  return (
    <>
      <div className="ranking-scroll place-scroll" ref={scrollRef} onScroll={(event) => {
        const target = event.currentTarget;
        const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (distanceToBottom <= 180) void onLoadMore();
      }}>
        {places.map((place) => {
          const key = placeIdentity(place);
          const explicitPreference = account?.preferences?.activity_preferences?.[place.category] ?? 0;
          const learnedPreference = account?.personalization?.activity_preferences?.[place.category] ?? 0;
          const hasPreferenceReason = explicitPreference >= 4 || (!explicitPreference && learnedPreference >= 4);
          const hasRequestedActivity = requestedActivitySequence.includes(place.category) ||
            mentionedActivities.some((activity) => activity === place.category || ACTIVITY_CATEGORY_LABELS[activity]?.includes(place.categoryLabel));
          const spaceLabel = place.space_type === "indoor" ? "실내"
            : place.space_type === "outdoor" ? "야외"
              : place.space_type === "mixed" ? "실내·야외" : null;
          return (
            <PlaceChoiceRow
              key={place.id}
              place={place}
              selected={selectedPlaces.some((item) => item.id === place.id)}
              favorite={favoritePlaceKeys.has(key)}
              hasRequestedActivity={hasRequestedActivity}
              hasPreferenceReason={hasPreferenceReason}
              spaceLabel={spaceLabel}
              isAuthenticated={Boolean(account?.token)}
              isPreferred={preferredPlaceId === place.id}
              onToggle={() => onToggle(place)}
              onOpenPhoto={onOpenPhoto}
              onToggleFavorite={() => onToggleFavorite(place)}
              onMakePreferred={() => onMakePreferred(place)}
            />
          );
        })}
        {places.length === 0 && <p className="place-status">이 종류의 추천 장소가 아직 없어요.</p>}
      </div>
      <div className="place-auto-load-status" role="status" aria-live="polite" aria-atomic="true">
        {placeStatus === "more-loading" && <span>새로운 장소를 찾고 있어요</span>}
        {moreLoadError && placeStatus !== "more-loading" && (
          <span className="is-error">
            장소를 불러오지 못했어요
            <button type="button" onClick={() => void onLoadMore({ force: true })}>다시 불러오기</button>
          </span>
        )}
        {!hasMorePlaces && allPlaces.length > 0 && !moreLoadError && <span>추천 가능한 장소를 모두 확인했어요</span>}
      </div>
    </>
  );
}
