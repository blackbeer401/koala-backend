import { recordInteraction } from "../api/accountApi";
import { placeIdentity } from "../utils/recommendationPlaces";

/** 선택 장소를 변경하고, 이전 코스 계산 결과가 재사용되지 않게 초기화한다. */
export function usePlaceSelection({
  account,
  selectedArea,
  selectedPlaces,
  preferredPlaceId,
  setSelectedPlaces,
  setPreferredPlaceId,
  setFocusedStopIndex,
  setCalculated,
  setCalculationError,
  setCalculationStatus,
  setCourseResult,
  setCourseConfirmed,
  setGuidanceStarted,
  setGuideStep,
  setProactiveDismissed,
  setLiveProactiveShown,
  calculationRequest,
}) {
  const resetCalculatedCourse = () => {
    calculationRequest.current += 1;
    setCalculated(false);
    setCalculationError("");
    setCalculationStatus("idle");
    setCourseResult(null);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setGuideStep(0);
    setProactiveDismissed(false);
    setLiveProactiveShown(false);
  };

  const togglePlace = (place) => {
    resetCalculatedCourse();
    setFocusedStopIndex(null);

    const isSelected = selectedPlaces.some((item) => item.id === place.id);
    if (isSelected) {
      const remaining = selectedPlaces.filter((item) => item.id !== place.id);
      const nextPreferredId =
        preferredPlaceId === place.id
          ? (remaining[0]?.id ?? null)
          : preferredPlaceId;
      setPreferredPlaceId(nextPreferredId);
      setSelectedPlaces(
        remaining.map((item) => ({
          ...item,
          preferredFirst: item.id === nextPreferredId,
        })),
      );
      return;
    }

    const nextPreferredId = preferredPlaceId ?? place.id;
    // 이 기록은 분석용 보조 요청이므로 실패해도 장소 선택은 유지한다.
    void recordInteraction(account?.token, {
      event_type: "place_select",
      place_key: placeIdentity(place),
      place_name: place.name,
      category: place.category,
      context_data: { area_name: selectedArea?.name ?? null },
    }).catch(() => {});

    setPreferredPlaceId(nextPreferredId);
    setFocusedStopIndex(selectedPlaces.length);
    setSelectedPlaces([
      ...selectedPlaces,
      { ...place, preferredFirst: place.id === nextPreferredId },
    ]);
  };

  const promotePlace = (place) => {
    if (preferredPlaceId === place.id) return;
    setPreferredPlaceId(place.id);
    setSelectedPlaces((current) => {
      const preferred = current.find((item) => item.id === place.id);
      if (!preferred) return current;
      return [
        { ...preferred, preferredFirst: true },
        ...current
          .filter((item) => item.id !== place.id)
          .map((item) => ({ ...item, preferredFirst: false })),
      ];
    });
    setFocusedStopIndex(0);
    setCalculated(false);
    setCourseResult(null);
  };

  return { togglePlace, promotePlace };
}
