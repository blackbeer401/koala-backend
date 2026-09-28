import { requestCourse, validatePlaceSelection } from "../api/placesApi";
import {
  hasOrderedActivitySequence,
  orderPlacesByActivitySequence,
} from "../utils/activitySequence";

/** 시간 검증, 실제 경로 요청, 계산된 코스 상태 전환을 담당한다. */
export function useCourseCalculation({
  selectedPlaces,
  transportMode,
  availableTimeMinutes,
  startLocation,
  recommendationContext,
  mapContext,
  requestedActivitySequence,
  selectedArea,
  calculationRequest,
  setCalculationStatus,
  setCalculationError,
  setCourseResult,
  setCourseHistory,
  setCalculated,
  setCourseConfirmed,
  setGuidanceStarted,
  setGuideStep,
  setFocusedStopIndex,
  setSheetExpanded,
  setPinnedCourseArea,
  setSelectedPlaces,
  setAutoCourseMode,
}) {
  const handleCalculate = async (
    placesToCalculate = selectedPlaces,
    transportModeOverride = transportMode,
  ) => {
    if (!placesToCalculate.length) return;
    if (!availableTimeMinutes) {
      setCalculationStatus("error");
      setCalculationError(
        "사용 가능한 시간을 확인할 수 없어요. 이전 화면에서 시간을 입력해 주세요.",
      );
      return;
    }
    if (
      !Number.isFinite(Number(startLocation.latitude)) ||
      !Number.isFinite(Number(startLocation.longitude))
    ) {
      setCalculationStatus("error");
      setCalculationError(
        "시작 위치를 확인할 수 없어요. 위치를 입력하거나 현재 위치 사용을 허용해 주세요.",
      );
      return;
    }

    const requestId = ++calculationRequest.current;
    const preserveActivityOrder = hasOrderedActivitySequence(
      requestedActivitySequence,
    );
    const orderedPlacesToCalculate = preserveActivityOrder
      ? orderPlacesByActivitySequence(
          placesToCalculate,
          requestedActivitySequence,
        )
      : [...placesToCalculate];
    setCalculationStatus("loading");
    setCalculationError("");

    try {
      const validation = await validatePlaceSelection({
        startLatitude: startLocation.latitude,
        startLongitude: startLocation.longitude,
        selectedPlaces: orderedPlacesToCalculate,
        availableTimeMinutes,
      });
      if (requestId !== calculationRequest.current) return;
      setCourseResult({ validation, course: null });

      // 직선거리 검증은 참고값이며, 가능 여부는 실제 경로 결과로 결정한다.
      const course = await requestCourse({
        startLocation,
        selectedPlaces: orderedPlacesToCalculate,
        availableTimeMinutes,
        departureDatetime: recommendationContext?.departure_datetime,
        endLocation: mapContext?.end ?? recommendationContext?.end_location,
        transportMode: transportModeOverride,
        optimizeOrder: !preserveActivityOrder,
      });
      if (requestId !== calculationRequest.current) return;
      setCourseResult({ validation, course });
      if (course.status !== "FEASIBLE") {
        setCalculationStatus("warning");
        setCalculationError(
          `실제 이동을 포함하면 총 ${course.total_required_minutes ?? "확인 불가"}분이에요. 사용할 수 있는 ${availableTimeMinutes}분을 초과했어요.`,
        );
        return;
      }

      setCourseHistory((current) =>
        [
          {
            id: `${Date.now()}-${selectedArea?.name ?? "course"}`,
            areaName: selectedArea?.name,
            selectedPlaces: [...orderedPlacesToCalculate],
            validation,
            course,
          },
          ...current,
        ].slice(0, 3),
      );
      setCalculated(true);
      setCourseConfirmed(false);
      setGuidanceStarted(false);
      setGuideStep(0);
      setFocusedStopIndex(null);
      setSheetExpanded(false);
      setCalculationStatus("ready");
    } catch (error) {
      if (requestId !== calculationRequest.current) return;
      setCalculationStatus("error");
      setCalculationError(error.message);
    }
  };

  const finishCalculatedCourse = (placesToCalculate, validation, course) => {
    // 자동 코스를 종료하기 전에 계산에 사용한 지역을 고정해 표시가 바뀌지 않게 한다.
    setPinnedCourseArea(selectedArea);
    setSelectedPlaces(placesToCalculate);
    setCourseResult({ validation, course });
    setCourseHistory((current) =>
      [
        {
          id: `${Date.now()}-${selectedArea?.name ?? "course"}`,
          areaName: selectedArea?.name,
          selectedPlaces: [...placesToCalculate],
          validation,
          course,
        },
        ...current,
      ].slice(0, 3),
    );
    setCalculated(true);
    setAutoCourseMode(false);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setGuideStep(0);
    setFocusedStopIndex(null);
    setSheetExpanded(false);
    setCalculationStatus("ready");
  };

  return { handleCalculate, finishCalculatedCourse };
}
