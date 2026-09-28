import { requestCourse } from "../api/placesApi";
import { orderPlacesByActivitySequence } from "../utils/activitySequence";

/** 후보 자동 코스를 실제 경로로 확인한 뒤 결과 화면으로 확정한다. */
export function useAutoCourseSelection({
  autoCourseCalculating,
  availableTimeMinutes,
  calculationRequest,
  requestedActivitySequence,
  startLocation,
  recommendationContext,
  mapContext,
  transportMode,
  setSelectedPlaces,
  setPreferredPlaceId,
  setSelectedAutoCourseId,
  setAutoCourseNotice,
  setAutoCourseCalculating,
  setCalculationError,
  finishCalculatedCourse,
}) {
  const chooseAutoCourse = async (candidate) => {
    if (autoCourseCalculating) return;
    if (!availableTimeMinutes) {
      setCalculationError(
        "사용 가능한 시간이 없어요. 이전 화면에서 종료 시각이나 여유 시간을 다시 입력해 주세요.",
      );
      return;
    }

    const requestId = ++calculationRequest.current;
    const orderedPlaces = orderPlacesByActivitySequence(
      candidate.places,
      requestedActivitySequence,
    );
    setSelectedPlaces(orderedPlaces);
    setPreferredPlaceId(orderedPlaces[0]?.id ?? null);
    setSelectedAutoCourseId(candidate.id);
    setAutoCourseNotice("");
    if (candidate.course?.status === "FEASIBLE") {
      finishCalculatedCourse(orderedPlaces, null, candidate.course);
      return;
    }

    setAutoCourseCalculating(true);
    try {
      const course = await requestCourse({
        startLocation,
        selectedPlaces: orderedPlaces,
        availableTimeMinutes,
        departureDatetime: recommendationContext?.departure_datetime,
        endLocation: mapContext?.end ?? recommendationContext?.end_location,
        transportMode,
        optimizeOrder: false,
      });
      if (requestId !== calculationRequest.current) return;
      if (course.status !== "FEASIBLE") {
        setCalculationError(
          "이 코스는 실제 이동시간을 포함하면 여유가 부족해요. 다른 코스를 골라주세요.",
        );
        return;
      }
      finishCalculatedCourse(orderedPlaces, null, course);
    } catch (error) {
      if (requestId !== calculationRequest.current) return;
      setCalculationError(
        error.message ?? "실제 이동경로를 확인하지 못했어요.",
      );
    } finally {
      setAutoCourseCalculating(false);
    }
  };

  return { chooseAutoCourse };
}
