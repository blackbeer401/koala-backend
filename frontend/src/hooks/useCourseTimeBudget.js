import { useState } from "react";
import { useCourseTravelEstimate } from "./useCourseTravelEstimate";

/** 선택한 코스의 시간 예산, 이동 예상, 수동 시간 변경을 관리한다. */
export function useCourseTimeBudget({
  selectedPlaces,
  startLocation,
  endLocation,
  transportMode,
  mapAvailableTime,
  contextAvailableTime,
  autoCourseDuration,
  selectedArea,
  courseResult,
  setSelectedPlaces,
  setPreferredPlaceId,
  setCalculated,
  setCourseResult,
  setCalculationError,
  setPlaceMode,
  setSheetExpanded,
}) {
  const [manualAvailableTimeMinutes, setManualAvailableTimeMinutes] = useState(null);
  const [timeBudgetPromptOpen, setTimeBudgetPromptOpen] = useState(false);
  const [timeBudgetDraft, setTimeBudgetDraft] = useState(120);
  const estimatedStay = selectedPlaces.reduce((sum, place) => sum + place.stayMinutes, 0);
  const travelEstimate = useCourseTravelEstimate({
    startLocation,
    selectedPlaces,
    endLocation,
    transportMode,
  });
  const estimatedTravel = travelEstimate.travelMinutes;
  const rawAvailableTimeMinutes =
    manualAvailableTimeMinutes ?? mapAvailableTime ?? contextAvailableTime ??
    autoCourseDuration ??
    (selectedArea?.stayMinutes != null
      ? selectedArea.stayMinutes + selectedArea.fromStartMinutes + selectedArea.toNextMinutes
      : null);
  const availableTimeMinutes = Number.isFinite(Number(rawAvailableTimeMinutes)) && Number(rawAvailableTimeMinutes) > 0
    ? Number(rawAvailableTimeMinutes)
    : null;

  const applyManualTimeBudget = (minutes) => {
    const normalizedMinutes = Math.max(30, Math.min(480, Math.round(Number(minutes) / 10) * 10));
    setManualAvailableTimeMinutes(normalizedMinutes);
    setTimeBudgetDraft(normalizedMinutes);
    setTimeBudgetPromptOpen(false);
    setSelectedPlaces([]);
    setPreferredPlaceId(null);
    setCalculated(false);
    setCourseResult(null);
    setCalculationError("");
    setPlaceMode(true);
    setSheetExpanded(true);
  };

  const setTimeBudgetPart = (part, value) => {
    const currentHours = Math.floor(timeBudgetDraft / 60);
    const currentMinutes = timeBudgetDraft % 60;
    const nextMinutes = part === "hours"
      ? Number(value) * 60 + currentMinutes
      : currentHours * 60 + Number(value);
    setTimeBudgetDraft(Math.max(30, Math.min(480, nextMinutes)));
  };

  const actualTravel = courseResult?.course?.total_travel_time_minutes;
  const displayedTravel = actualTravel ?? estimatedTravel ?? 0;
  const displayedStay = courseResult?.course?.total_stay_time_minutes ?? estimatedStay;
  const estimatedTotal = estimatedTravel == null ? null : estimatedTravel + estimatedStay;
  const displayedTotal = courseResult?.course?.total_required_minutes ?? estimatedTotal;
  const hasActualTime = courseResult?.course?.total_required_minutes != null;
  const calculationIsEstimated = courseResult?.course?.calculation_status === "estimated" ||
    (!hasActualTime && travelEstimate.status === "estimated");
  const timeGaugeOver = displayedTotal != null && displayedTotal > availableTimeMinutes;
  const timeCalculationLabel = hasActualTime
    ? `${calculationIsEstimated ? "일부 예상" : "실제 계산"} ${displayedTotal}분`
    : displayedTotal != null
      ? `사전 계산 ${displayedTotal}분`
      : travelEstimate.status === "loading"
        ? "실제 경로 계산 중"
        : "이동시간 계산 불가";

  return {
    timeBudgetPromptOpen,
    setTimeBudgetPromptOpen,
    timeBudgetDraft,
    setTimeBudgetPart,
    applyManualTimeBudget,
    estimatedStay,
    travelEstimate,
    estimatedTravel,
    availableTimeMinutes,
    displayedTravel,
    displayedStay,
    displayedTotal,
    hasActualTime,
    calculationIsEstimated,
    timeGaugeOver,
    timeCalculationLabel,
  };
}
