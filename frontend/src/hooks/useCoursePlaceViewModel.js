import { useMemo } from "react";
import { findSelectedPlace } from "../utils/recommendationPlaces";

/** 계산된 경로와 장소 선택 상태를 화면·교체 UI에 필요한 형태로 만든다. */
export function useCoursePlaceViewModel({
  courseResult,
  selectedPlaces,
  calculated,
  focusedStopIndex,
  places,
  placeSourceFilter,
}) {
  const orderedPlaces = useMemo(() => {
    const remaining = [...selectedPlaces];
    return (courseResult?.course?.optimized_places ?? [])
      .map((place) => {
        const match = findSelectedPlace(place, remaining);
        if (match) remaining.splice(remaining.indexOf(match), 1);
        return match
          ? {
              ...match,
              stayMinutes: place.stay_duration_minutes ?? match.stayMinutes,
              availability: place.availability,
            }
          : null;
      })
      .filter(Boolean);
  }, [courseResult, selectedPlaces]);

  const visiblePlaces =
    calculated && orderedPlaces.length ? orderedPlaces : selectedPlaces;
  const replacementTarget =
    visiblePlaces[focusedStopIndex ?? Math.max(0, visiblePlaces.length - 1)] ??
    null;
  const replacementPlace = useMemo(() => {
    if (!replacementTarget) return null;
    const selectedIds = new Set(selectedPlaces.map((place) => place.id));
    return (
      [...places]
        .filter((place) => !selectedIds.has(place.id))
        .sort((left, right) => {
          const leftSameCategory =
            left.category === replacementTarget.category ? 1 : 0;
          const rightSameCategory =
            right.category === replacementTarget.category ? 1 : 0;
          return (
            rightSameCategory - leftSameCategory ||
            left.distanceMeters - right.distanceMeters
          );
        })[0] ?? null
    );
  }, [places, selectedPlaces, replacementTarget]);

  const filteredPlaces =
    placeSourceFilter === "events"
      ? places.filter((place) => place.sourceKind !== "general")
      : placeSourceFilter === "general"
        ? places.filter((place) => place.sourceKind === "general")
        : places;
  const hasEventPlaces = places.some((place) => place.sourceKind !== "general");

  return {
    orderedPlaces,
    visiblePlaces,
    replacementTarget,
    replacementPlace,
    filteredPlaces,
    hasEventPlaces,
  };
}
